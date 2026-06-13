/**
 * watchdog.ts —— Watchdog 独立子进程监控模块（M4 完整实现）
 *
 * 核心功能：独立子进程每 5s 对父进程执行六项健康检查，
 * 检测异常时写入 gate_state.json 告警并发送信号给父进程。
 *
 * 六项检查：
 * 1. 心跳检测 —— 父进程存活 + 心跳未超时（90s）
 * 2. 卡住检测 —— 同一 phase 超过 60s 无进展
 * 3. 闸门违规升级 —— 未处理闸门拦截块累积 > 10
 * 4. 预算耗尽 —— phase 预算消耗 >= 95%
 * 5. 输出停滞 —— state 关键字段哈希 30s 无变化
 * 6. 会话超时 —— 总 session 时长超过 max_cycles * 10min
 *
 * @module watchdog
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readState, writeState } from "./state";
import { readGateState, writeGateState } from "../plugin/gate-state-guard";
import type { WatchdogAlert, HeartbeatEntry, LoopState, PhaseEnum } from "./types";

// ── 配置常量 ──
const CHECK_INTERVAL_MS = 5_000;
const MARKER_FILE = ".loop-opencode/.watchdog_marker";
const HEARTBEAT_FILE = ".loop-opencode/.watchdog_heartbeat";
const MAX_HEARTBEAT_AGE_MS = 90_000;
const MAX_SAME_PHASE_CHECKS = 12;   // 12 * 5s = 60s
const GATE_BLOCK_THRESHOLD = 10;
const BUDGET_EXHAUSTION_RATIO = 0.95;
const MAX_STAGNANT_CHECKS = 6;       // 6 * 5s = 30s
const MAX_ALERTS = 100;

// ── 跨周期状态追踪 ──
let lastPhase: PhaseEnum | null = null;
let stuckCheckCount = 0;
let lastCycle = -1;
let stuckCycleCount = 0;
let lastOutputHash: string | null = null;
let stagnantOutputCount = 0;
let lastGateBlockCounts: Record<string, number> = {};
let gateEscalationWarned = false;
const emittedAlertTypes = new Set<string>();
let checkTimer: ReturnType<typeof setInterval> | null = null;
let orphanTimer: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════════
// 公开 API
// ═══════════════════════════════════════════════════

/** 启动 Watchdog 监控循环（独立子进程入口） */
export function startWatchdog(projectRoot: string): void {
  console.log(`[watchdog] 已启动 (PID: ${process.pid}, 间隔: ${CHECK_INTERVAL_MS / 1000}s)`);
  const dir = join(projectRoot, ".loop-opencode");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  initializeTracking(projectRoot);
  runAllChecks(projectRoot);
  checkTimer = setInterval(() => runAllChecks(projectRoot), CHECK_INTERVAL_MS);

  // 孤儿检测——父进程退出时自动清理
  orphanTimer = setInterval(() => {
    try { process.kill(process.ppid, 0); } catch { shutdown(); }
  }, CHECK_INTERVAL_MS);

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());
  if (process.stdin && typeof process.stdin.resume === "function") process.stdin.resume();
}

/** 检查 watchdog 是否存活（供父进程调用） */
export function isWatchdogAlive(projectRoot: string, maxAgeMs = 30_000): boolean {
  const path = join(projectRoot, MARKER_FILE);
  if (!existsSync(path)) return false;
  try {
    const marker = JSON.parse(readFileSync(path, "utf-8"));
    return Date.now() - new Date(marker.timestamp).getTime() <= maxAgeMs;
  } catch { return false; }
}

/** 获取 watchdog 告警统计 */
export function getWatchdogStats(projectRoot: string) {
  try {
    const gs = readGateState(projectRoot);
    const alerts = gs.watchdog_alerts;
    return {
      totalAlerts: alerts.length,
      unresolved: alerts.filter((a) => !a.resolved).length,
      latestType: alerts.length > 0 ? alerts[alerts.length - 1]!.type : null,
    };
  } catch { return { totalAlerts: 0, unresolved: 0, latestType: null }; }
}

// ═══════════════════════════════════════════════════
// 内部：初始化与主循环
// ═══════════════════════════════════════════════════

function initializeTracking(projectRoot: string): void {
  try {
    const s = readState(projectRoot);
    lastPhase = s.progress.phase as PhaseEnum;
    lastCycle = s.progress.cycle;
    lastOutputHash = hashStateOutput(s);
  } catch { /* state 尚不可用 */ }
  try {
    const gs = readGateState(projectRoot);
    for (const [id, r] of Object.entries(gs.gates)) lastGateBlockCounts[id] = r.block_count;
  } catch { /* gate_state 尚不可用 */ }
}

function runAllChecks(projectRoot: string): void {
  writeMarker(projectRoot);
  try { process.kill(process.ppid, 0); } catch { process.exit(0); }

  checkHeartbeat(projectRoot);
  checkStuck(projectRoot);
  checkGateViolations(projectRoot);
  checkBudget(projectRoot);
  checkStagnantOutput(projectRoot);
  checkTimeout(projectRoot);

  emittedAlertTypes.clear();
}

// ═══════════════════════════════════════════════════
// 检查 1: 父进程心跳
// ═══════════════════════════════════════════════════

function checkHeartbeat(projectRoot: string): void {
  const hbPath = join(projectRoot, HEARTBEAT_FILE);
  if (!existsSync(hbPath)) return;
  try {
    const raw = readFileSync(hbPath, "utf-8").trim();
    if (!raw) return;
    const entry: HeartbeatEntry = JSON.parse(raw);
    const age = Date.now() - new Date(entry.timestamp).getTime();
    if (age > MAX_HEARTBEAT_AGE_MS) {
      const s = Math.round(age / 1000);
      console.error(`[watchdog] 心跳停滞 ${s}s (PID: ${entry.pid})`);
      injectAlert(projectRoot, "stale_heartbeat",
        `父进程心跳停滞 ${s}s (PID: ${entry.pid}, phase: ${entry.phase}, cycle: ${entry.cycle})`);
      escalateToParent("SIGUSR1", "stale_heartbeat");
      pauseLoop(projectRoot, "stale_heartbeat");
    }
  } catch { /* 心跳文件损坏 */ }
}

// ═══════════════════════════════════════════════════
// 检查 2: 卡住检测
// ═══════════════════════════════════════════════════

function checkStuck(projectRoot: string): void {
  try {
    const s = readState(projectRoot);
    const phase = s.progress.phase;
    if (phase === "complete" || phase === "paused" || phase === "failed") {
      stuckCheckCount = 0; stuckCycleCount = 0; return;
    }
    stuckCheckCount = phase === lastPhase ? stuckCheckCount + 1 : 0;
    stuckCycleCount = s.progress.cycle === lastCycle ? stuckCycleCount + 1 : 0;
    lastPhase = phase as PhaseEnum;
    lastCycle = s.progress.cycle;

    if (stuckCheckCount >= MAX_SAME_PHASE_CHECKS && !emittedAlertTypes.has("agent_stuck")) {
      const sec = stuckCheckCount * (CHECK_INTERVAL_MS / 1000);
      console.warn(`[watchdog] Agent 卡在 "${phase}" ${sec}s`);
      injectAlert(projectRoot, "agent_stuck",
        `Agent 卡在 phase "${phase}" ${sec}s (cycle: ${s.progress.cycle}, convergence: ${s.progress.convergence_counter})`);
      escalateToParent("SIGUSR1", "agent_stuck");
      stuckCheckCount = 0;
    }
  } catch { /* state 不可用 */ }
}

// ═══════════════════════════════════════════════════
// 检查 3: 闸门违规升级
// ═══════════════════════════════════════════════════

function checkGateViolations(projectRoot: string): void {
  try {
    const gs = readGateState(projectRoot);
    let escalating: string | null = null;
    let total = 0;
    for (const [id, r] of Object.entries(gs.gates)) {
      total += r.block_count;
      if (r.block_count - (lastGateBlockCounts[id] || 0) > GATE_BLOCK_THRESHOLD) escalating = id;
      lastGateBlockCounts[id] = r.block_count;
    }
    if (escalating && !gateEscalationWarned && !emittedAlertTypes.has("gate_violation_escalation")) {
      console.warn(`[watchdog] 闸门 "${escalating}" 拦截异常 (总计: ${total})`);
      injectAlert(projectRoot, "gate_violation_escalation",
        `闸门 "${escalating}" 拦截块激增 (增量 > ${GATE_BLOCK_THRESHOLD}, 总拦截: ${total})`);
      escalateToParent("SIGUSR1", "gate_violation_escalation");
      gateEscalationWarned = true;
    }
    if (!escalating) gateEscalationWarned = false;
  } catch { /* gate_state 不可用 */ }
}

// ═══════════════════════════════════════════════════
// 检查 4: 预算耗尽
// ═══════════════════════════════════════════════════

function checkBudget(projectRoot: string): void {
  try {
    const s = readState(projectRoot);
    const b = s.progress.budget;
    if (!b || b.phase_budget <= 0) return;
    const ratio = b.phase_budget_consumed / b.phase_budget;
    if ((ratio >= BUDGET_EXHAUSTION_RATIO || b.phase_budget_exhausted)
        && !emittedAlertTypes.has("budget_exhaustion")) {
      const pct = Math.round(ratio * 100);
      console.warn(`[watchdog] 预算耗尽: ${pct}% (${b.phase_budget_consumed}/${b.phase_budget})`);
      injectAlert(projectRoot, "budget_exhaustion",
        `Phase 预算消耗 ${pct}% (${b.phase_budget_consumed}/${b.phase_budget}, ` +
        `耗尽计数: ${b.phase_budget_exhaustion_count}, overrun: ${b.budget_overrun_action})`);
      escalateToParent("SIGUSR2", "budget_exhaustion");
    }
  } catch { /* state 不可用 */ }
}

// ═══════════════════════════════════════════════════
// 检查 5: 输出停滞
// ═══════════════════════════════════════════════════

function checkStagnantOutput(projectRoot: string): void {
  try {
    const s = readState(projectRoot);
    const hash = hashStateOutput(s);
    stagnantOutputCount = hash === lastOutputHash ? stagnantOutputCount + 1 : 0;
    lastOutputHash = hash;
    if (stagnantOutputCount >= MAX_STAGNANT_CHECKS && !emittedAlertTypes.has("stagnant_output")) {
      const sec = stagnantOutputCount * (CHECK_INTERVAL_MS / 1000);
      console.warn(`[watchdog] 输出停滞 ${sec}s (${stagnantOutputCount} 轮)`);
      injectAlert(projectRoot, "stagnant_output",
        `State 关键字段无变化 ${sec}s (${stagnantOutputCount} 轮检查, phase: ${s.progress.phase}, cycle: ${s.progress.cycle})`);
      escalateToParent("SIGUSR1", "stagnant_output");
      stagnantOutputCount = 0;
    }
  } catch { /* state 不可用 */ }
}

// ═══════════════════════════════════════════════════
// 检查 6: 会话超时
// ═══════════════════════════════════════════════════

function checkTimeout(projectRoot: string): void {
  try {
    const s = readState(projectRoot);
    if (s.termination.status !== "active") return;
    const elapsed = Date.now() - new Date(s.created_at).getTime();
    const maxMs = (s.config.max_cycles || 5) * 600_000; // 每 cycle 估算 10min
    if (elapsed > maxMs && !emittedAlertTypes.has("session_timeout")) {
      const min = Math.round(elapsed / 60_000);
      console.warn(`[watchdog] 会话超时: ${min}min (max_cycles: ${s.config.max_cycles})`);
      injectAlert(projectRoot, "session_timeout",
        `Session 超时 ${min}min (max_cycles: ${s.config.max_cycles}, ` +
        `phase: ${s.progress.phase}, cycle: ${s.progress.cycle})`);
      escalateToParent("SIGUSR2", "session_timeout");
      pauseLoop(projectRoot, "session_timeout");
    }
  } catch { /* state 不可用 */ }
}

// ═══════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════

function writeMarker(projectRoot: string): void {
  try {
    writeFileSync(join(projectRoot, MARKER_FILE),
      JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }), "utf-8");
  } catch { /* 非关键 */ }
}

/** 计算 state 关键字段哈希（排除时间戳等易变字段） */
function hashStateOutput(state: LoopState): string {
  const snapshot = {
    phase: state.progress.phase,
    cycle: state.progress.cycle,
    convergence_counter: state.progress.convergence_counter,
    p0: state.issues.active.p0.length, p1: state.issues.active.p1.length,
    p2: state.issues.active.p2.length, p0t: state.issues.all_time.p0_total,
    p1t: state.issues.all_time.p1_total, p2t: state.issues.all_time.p2_total,
    term: state.termination.status,
    ver: state.progress.verification_pass_count,
    retries: state.progress.retry_count_this_phase,
    done: Object.entries(state.phase_contracts)
      .filter(([, v]) => v.completed).map(([k]) => k).sort(),
    bw: state.progress.budget?.phase_budget_warning_issued,
    be: state.progress.budget?.phase_budget_exhausted,
    bec: state.progress.budget?.phase_budget_exhaustion_count,
    pc: state.pending_confirmation?.status ?? null,
  };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

/** 注入告警到 gate_state.json（仅 watchdog / 二进制可写） */
function injectAlert(projectRoot: string, type: WatchdogAlert["type"], details: string): void {
  try {
    const gs = readGateState(projectRoot);
    gs.watchdog_alerts.push({
      alert_id: `wd_${type}_${Date.now()}`, type, details,
      alerted_at: new Date().toISOString(), resolved: false,
    });
    if (gs.watchdog_alerts.length > MAX_ALERTS) gs.watchdog_alerts = gs.watchdog_alerts.slice(-MAX_ALERTS);
    writeGateState(projectRoot, gs);
    console.log(`[watchdog] 告警已注入: ${type}`);
  } catch (err) { console.warn(`[watchdog] 注入告警失败: ${err}`); }
}

/** 发送信号给父进程（Windows 下信号不可用时告警仅写入 gate_state） */
function escalateToParent(signal: string, reason: string): void {
  try {
    process.kill(process.ppid, signal as NodeJS.Signals);
    console.log(`[watchdog] 升级 "${reason}" → 父进程 (via ${signal})`);
  } catch (err) { console.warn(`[watchdog] 信号发送失败 (${signal}): ${err}`); }
}

/** 暂停主循环——写入 state.json 设置 termination.status = "paused" */
function pauseLoop(projectRoot: string, reason: string): void {
  try {
    const state = readState(projectRoot);
    if (state.termination.status === "active") {
      state.termination.status = "paused";
      state.termination.exit_reason = "user_interrupt";
      state.termination.paused_at = new Date().toISOString();
      writeState(projectRoot, state);
      console.log(`[watchdog] 主循环已暂停 (${reason})`);
    }
  } catch (err) { console.warn(`[watchdog] 暂停主循环失败: ${err}`); }
}

/** 干净关闭 watchdog */
function shutdown(): void {
  console.log("[watchdog] 正在关闭...");
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  if (orphanTimer) { clearInterval(orphanTimer); orphanTimer = null; }
  process.exit(0);
}
