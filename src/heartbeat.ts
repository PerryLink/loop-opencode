/**
 * heartbeat.ts —— 父进程心跳写入模块（M4）
 *
 * 核心功能：父进程（二进制主循环）每 30s 写入心跳文件
 * .watchdog_heartbeat，供 Watchdog 子进程监控存活状态。
 *
 * 心跳格式：单行 JSON { pid, timestamp, cycle, phase, agent_running }
 *
 * @module heartbeat
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { HeartbeatEntry, PhaseEnum } from "./types";

/** 心跳文件路径 */
const HEARTBEAT_FILE = ".loop-opencode/.watchdog_heartbeat";
/** 心跳间隔（毫秒） */
const INTERVAL_MS = 30_000; // 30s

/** 心跳定时器引用 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动心跳写入定时器
 *
 * 每 30s 写入一次心跳文件，记录当前主循环状态。
 * 启动时立即写入首次心跳。
 *
 * @param projectRoot - 项目根目录
 * @param getCurrentPhase - 获取当前 phase 的回调
 * @param getCurrentCycle - 获取当前 cycle 的回调
 * @param isAgentRunning - 检查 agent 是否在运行的函数
 */
export function startHeartbeat(
  projectRoot: string,
  getCurrentPhase: () => string,
  getCurrentCycle: () => number,
  isAgentRunning: () => boolean
): void {
  // 确保目录存在
  const dir = join(projectRoot, ".loop-opencode");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // 立即写入首条心跳
  writeHeartbeat(
    projectRoot,
    getCurrentPhase(),
    getCurrentCycle(),
    isAgentRunning()
  );

  // 定时写入
  heartbeatTimer = setInterval(() => {
    writeHeartbeat(
      projectRoot,
      getCurrentPhase(),
      getCurrentCycle(),
      isAgentRunning()
    );
  }, INTERVAL_MS);

  console.log(`[heartbeat] 心跳已启动 (间隔: ${INTERVAL_MS / 1000}s, PID: ${process.pid})`);
}

/**
 * 停止心跳定时器
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log("[heartbeat] 心跳已停止");
  }
}

/**
 * 写入单条心跳记录
 *
 * 格式：单行 JSON，覆盖写入（非追加）。
 *
 * @param projectRoot - 项目根目录
 * @param phase - 当前 phase
 * @param cycle - 当前 cycle
 * @param agentRunning - agent 是否在运行
 */
function writeHeartbeat(
  projectRoot: string,
  phase: string,
  cycle: number,
  agentRunning: boolean
): void {
  const entry: HeartbeatEntry = {
    pid: process.pid,
    timestamp: new Date().toISOString(),
    cycle,
    phase: phase as PhaseEnum,
    agent_running: agentRunning,
  };

  const path = join(projectRoot, HEARTBEAT_FILE);
  try {
    writeFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.warn(`[heartbeat] 写入心跳失败: ${err}`);
  }
}

/**
 * 读取最新心跳记录
 *
 * @param projectRoot - 项目根目录
 * @returns HeartbeatEntry 或 null
 */
export function readHeartbeat(projectRoot: string): HeartbeatEntry | null {
  const path = join(projectRoot, HEARTBEAT_FILE);
  if (!existsSync(path)) return null;

  try {
    const raw = require("node:fs").readFileSync(path, "utf-8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as HeartbeatEntry;
  } catch {
    return null;
  }
}

/**
 * 检查父进程心跳是否在正常范围内
 *
 * @param projectRoot - 项目根目录
 * @param maxAgeMs - 心跳最大允许年龄（默认 90s）
 * @returns true 表示心跳正常
 */
export function isHeartbeatHealthy(
  projectRoot: string,
  maxAgeMs: number = 90_000
): boolean {
  const entry = readHeartbeat(projectRoot);
  if (!entry) return false;

  const age = Date.now() - new Date(entry.timestamp).getTime();
  return age <= maxAgeMs;
}

/**
 * 获取心跳状态摘要
 *
 * @param projectRoot - 项目根目录
 * @returns 状态摘要字符串
 */
export function getHeartbeatSummary(projectRoot: string): string {
  const entry = readHeartbeat(projectRoot);
  if (!entry) return "无心跳记录";

  const age = Math.round(
    (Date.now() - new Date(entry.timestamp).getTime()) / 1000
  );
  return `PID=${entry.pid}, phase=${entry.phase}, cycle=${entry.cycle}, agent=${entry.agent_running}, age=${age}s`;
}
