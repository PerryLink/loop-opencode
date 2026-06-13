/**
 * bubble.ts —— Part 1 气泽拆分管理（M4）
 *
 * 核心功能：
 * - C1: 上下文自动 checkpoint（context_usage_pct >= 70% 触发）
 * - C2: 强制降级路径（split_index >= 3 或预算耗尽 + 3 次拆分）
 * - C3: 质量退化警告（语义重复 + 矛盾声明计数）
 * - bubble_checkpoint.json 读写协议
 * - 上下文恢复与降级假设注入
 *
 * @module bubble
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readState, writeState } from "./state";
import type { BubbleCheckpoint, QualitySignals } from "./types";

/** 上下文使用率阈值——触发 checkpoint */
const CHECKPOINT_THRESHOLD = 70;
/** 最大拆分次数——超过则强制降级 */
const MAX_SPLITS = 3;

/**
 * 检查是否需要创建气泡 checkpoint
 *
 * C1: context_usage_pct >= 70% 时自动触发。
 *
 * @param projectRoot - 项目根目录
 * @returns 是否已创建 checkpoint
 */
export function maybeCheckpoint(projectRoot: string): boolean {
  const state = readState(projectRoot);
  const ctxPct = state.progress.budget.context_usage_pct;

  if (ctxPct < CHECKPOINT_THRESHOLD) return false;

  const bs = state.progress.bubble_state;
  const newIdx = bs.split_index + 1;

  // C2: 超过最大拆分次数 → 强制降级
  if (newIdx >= MAX_SPLITS) {
    forceDegrade(projectRoot, `拆分次数 ${newIdx} >= ${MAX_SPLITS}`);
    return true;
  }

  // 创建 checkpoint
  bs.split_index = newIdx;
  const checkpoint: BubbleCheckpoint = {
    schema_version: 1,
    bubble_id: bs.bubble_id || `bubble_${Date.now()}`,
    split_index: newIdx,
    split_reason: `上下文使用率 ${ctxPct}% >= ${CHECKPOINT_THRESHOLD}%`,
    split_at_phase: state.progress.phase,
    completed_sub_phases: getCompletedSubPhases(state),
    current_sub_phase: state.progress.phase,
    pending_decisions: [],
    unresolved_ambiguities: [],
    assumptions_made: [],
    next_agent_action: "从 checkpoint 恢复后继续当前子 phase",
    created_at: new Date().toISOString(),
    estimated_remaining_tokens_needed: state.progress.budget.phase_budget -
      state.progress.budget.phase_budget_consumed,
  };

  writeCheckpoint(projectRoot, checkpoint);
  bs.checkpoint_file = "bubble_checkpoint.json";

  writeState(projectRoot, state);
  console.log(
    `[bubble] checkpoint 已创建: split=${newIdx}, 上下文=${ctxPct}%`
  );
  return true;
}

/**
 * C2: 强制降级路径
 *
 * - degraded = true
 * - pending_decisions 全选默认值
 * - 强制推进到 part_2_1
 *
 * @param projectRoot - 项目根目录
 * @param reason - 降级原因
 */
export function forceDegrade(projectRoot: string, reason: string): void {
  const state = readState(projectRoot);
  const bs = state.progress.bubble_state;

  bs.degraded = true;
  bs.degraded_reason = reason;
  bs.max_splits = MAX_SPLITS;

  // 推进到 part_2_1
  state.progress.phase = "part_2_1";
  state.progress.phase_transitions.push({
    from: state.progress.phase,
    to: "part_2_1",
    at: new Date().toISOString(),
    reason: `气泡强制降级: ${reason}`,
  });

  writeState(projectRoot, state);
  console.warn(`[bubble] 强制降级: ${reason}`);
}

/**
 * C3: 记录质量退化信号
 *
 * 检测语义重复和矛盾声明，累积退化计数。
 *
 * @param projectRoot - 项目根目录
 * @param signal - 检测到的质量信号
 */
export function recordQualitySignal(
  projectRoot: string,
  signal: "semantic_repetition" | "contradiction"
): void {
  const state = readState(projectRoot);
  const qs = state.progress.bubble_state.quality_signals;

  if (signal === "semantic_repetition") {
    qs.semantic_repetition_count += 1;
  } else {
    qs.contradiction_count += 1;
  }

  const total = qs.semantic_repetition_count + qs.contradiction_count;
  if (total >= 3) {
    console.warn(
      `[bubble] C3 质量退化警告: 语义重复=${qs.semantic_repetition_count}, 矛盾=${qs.contradiction_count}`
    );
  }

  writeState(projectRoot, state);
}

/**
 * 读取气泡 checkpoint 文件
 *
 * @param projectRoot - 项目根目录
 * @returns BubbleCheckpoint 或 null
 */
export function readCheckpoint(
  projectRoot: string
): BubbleCheckpoint | null {
  const path = join(
    projectRoot,
    ".loop-opencode",
    "artifacts",
    "bubble_checkpoint.json"
  );
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as BubbleCheckpoint;
  } catch {
    console.warn("[bubble] checkpoint 文件损坏");
    return null;
  }
}

/**
 * 写入气泡 checkpoint 文件
 */
function writeCheckpoint(
  projectRoot: string,
  cp: BubbleCheckpoint
): void {
  const dir = join(projectRoot, ".loop-opencode", "artifacts");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "bubble_checkpoint.json"),
    JSON.stringify(cp, null, 2),
    "utf-8"
  );
}

/** 获取已完成的 Part 1 子 phase 列表 */
function getCompletedSubPhases(state: {
  progress: { phase: string };
}): ("part_1_1" | "part_1_2" | "part_1_3")[] {
  const phase = state.progress.phase;
  const completed: ("part_1_1" | "part_1_2" | "part_1_3")[] = [];
  const order: ("part_1_1" | "part_1_2" | "part_1_3")[] = [
    "part_1_1", "part_1_2", "part_1_3",
  ];
  for (const p of order) {
    if (p === phase) break;
    completed.push(p);
  }
  return completed;
}

/**
 * 获取气泡拆分摘要
 *
 * @param projectRoot - 项目根目录
 * @returns 摘要字符串
 */
export function getBubbleSummary(projectRoot: string): string {
  const state = readState(projectRoot);
  const bs = state.progress.bubble_state;
  return [
    `split=${bs.split_index}/${bs.max_splits}`,
    `degraded=${bs.degraded}`,
    `assumptions=${bs.assumptions_count}`,
    `repetitions=${bs.quality_signals.semantic_repetition_count}`,
    `contradictions=${bs.quality_signals.contradiction_count}`,
  ].join(", ");
}
