/**
 * terminate.ts —— 终止条件判定模块（M2）
 *
 * 6 个终止条件的评估逻辑 + 收敛快速路径检测。
 * should_terminate() 检查当前 state.json 是否满足停止条件，
 * 返回 TerminationResult 告知调用方是否应退出主循环。
 *
 * @module terminate
 */

import { readState, getStatePath } from "./state";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LoopState, TerminationResult, TerminationReason } from "./types";

/**
 * 检查所有 6 个终止条件
 *
 * 评估顺序（短路求值）：
 * 1. 收敛快速路径（最优路径——无需继续）
 * 2. max_cycles 超限
 * 3. 活跃问题未清零
 * 4. 验证链不完整
 * 5. P0 复发恶性循环
 * 6. 预算耗尽
 *
 * @param projectRoot - 项目根目录
 * @returns 终止评估结果
 */
export function shouldTerminate(projectRoot: string): TerminationResult {
  const state = readState(projectRoot);

  if (state.termination.status !== "active") {
    return {
      shouldTerminate: false,
      reason: "conditions_not_met",
      detail: `项目已处于终态: ${state.termination.status}`,
    };
  }

  // ---- 条件 1: 收敛快速路径 ----
  const fastPath = checkConvergenceFastPath(state);
  if (fastPath.shouldTerminate) return fastPath;

  // ---- 条件 2: max_cycles 超限 ----
  const maxCycles = checkMaxCycles(state);
  if (maxCycles.shouldTerminate) return maxCycles;

  // ---- 条件 3: 活跃问题未清零 ----
  const activeIssues = checkActiveIssues(state);
  if (activeIssues.shouldTerminate) return activeIssues;

  // ---- 条件 4: 验证链不完整 ----
  const verification = checkVerificationMissing(state);
  if (verification.shouldTerminate) return verification;

  // ---- 条件 5: P0 复发恶性循环 ----
  const p0Recurrence = checkP0Recurrence(state);
  if (p0Recurrence.shouldTerminate) return p0Recurrence;

  // ---- 条件 6: 预算耗尽 ----
  const budget = checkBudgetExhausted(state);
  if (budget.shouldTerminate) return budget;

  // 不满足任何终止条件——继续执行
  return {
    shouldTerminate: false,
    reason: "conditions_not_met",
    detail: "继续执行下一 cycle",
  };
}

/**
 * 条件 1: 收敛快速路径
 *
 * CR >= config.convergence_rounds（默认 2）且无活跃 P0/P1 + verification_pass_count >= 1
 * 时触发。意为连续 N 轮无新问题 + 至少一次验证通过。
 *
 * @param state - LoopState
 */
function checkConvergenceFastPath(state: LoopState): TerminationResult {
  const cr = state.progress.convergence_counter;
  const required = state.config.convergence_rounds;
  const hasActiveCritical =
    state.issues.active.p0.length > 0 ||
    state.issues.active.p1.length > 0;
  const vp = state.progress.verification_pass_count;

  if (cr >= required && !hasActiveCritical && vp >= 1) {
    return {
      shouldTerminate: true,
      reason: "convergence_fast_path",
      detail: `CR=${cr}/${required}, verification_pass=${vp}`,
    };
  }

  // 标准收敛（CR 达标但无验证通过也视为收敛）
  if (cr >= required && !hasActiveCritical) {
    return {
      shouldTerminate: true,
      reason: "convergence_reached",
      detail: `CR=${cr}/${required}, 无活跃严重问题`,
    };
  }

  return { shouldTerminate: false, reason: "conditions_not_met" };
}

/**
 * 条件 2: max_cycles 超限
 *
 * cycle 达到 config.max_cycles 时触发（默认 5，上限 50）。
 * 超限后不可继续，输出未解决问题清单。
 *
 * @param state - LoopState
 */
function checkMaxCycles(state: LoopState): TerminationResult {
  if (state.progress.cycle >= state.config.max_cycles) {
    return {
      shouldTerminate: true,
      reason: "max_cycles_exceeded",
      detail: `cycle=${state.progress.cycle} >= max=${state.config.max_cycles}`,
    };
  }
  return { shouldTerminate: false, reason: "conditions_not_met" };
}

/**
 * 条件 3: 活跃问题未清零
 *
 * 若存在 open/in_progress 状态的 P0 问题，则不应终止（需处理或 pause）。
 * P1 存在时输出警告但不强制终止（允许降级推进）。
 *
 * @param state - LoopState
 */
function checkActiveIssues(state: LoopState): TerminationResult {
  const openP0 = state.issues.active.p0.filter(
    (i) => i.status === "open" || i.status === "in_progress"
  );
  if (openP0.length > 0) {
    return {
      shouldTerminate: false,
      reason: "active_issues_remaining",
      warning: true,
      detail: `存在 ${openP0.length} 个活跃 P0 问题`,
    };
  }
  return { shouldTerminate: false, reason: "conditions_not_met" };
}

/**
 * 条件 4: 验证链不完整
 *
 * 检查关键 phase 合约是否完成（part_2_8 硬验证闸门）。
 * 若 verification_pass_count === 0 且 phase !== "complete"，
 * 则缺乏验证证据，终止条件不满足。
 *
 * @param state - LoopState
 */
function checkVerificationMissing(state: LoopState): TerminationResult {
  const phase = state.progress.phase;
  if (phase !== "complete" && phase !== "failed" && phase !== "paused") {
    // 非终态——正常场景，不触发终止
    return { shouldTerminate: false, reason: "conditions_not_met" };
  }
  // 若处于终态且无验证通过记录
  if (state.progress.verification_pass_count === 0 && phase === "complete") {
    return {
      shouldTerminate: false,
      reason: "verification_missing",
      warning: true,
      detail: "声明 complete 但缺乏验证证据",
    };
  }
  return { shouldTerminate: false, reason: "conditions_not_met" };
}

/**
 * 条件 5: P0 复发恶性循环
 *
 * 遍历 p0_history，若任一 P0 的 escalation_level="failed"，
 * 标记为恶性复发，强制终止。
 *
 * @param state - LoopState
 */
function checkP0Recurrence(state: LoopState): TerminationResult {
  const malignant = state.p0_history.filter(
    (entry) => entry.escalation_level === "failed"
  );
  if (malignant.length > 0) {
    return {
      shouldTerminate: true,
      reason: "p0_malignant_recurrence",
      detail: `${malignant.length} 个 P0 已标记为恶性复发`,
    };
  }
  const recurring = state.p0_history.filter(
    (entry) => entry.occurrence_count >= 2
  );
  if (recurring.length > 0) {
    return {
      shouldTerminate: true,
      reason: "p0_recurrence",
      detail: `${recurring.length} 个 P0 跨 cycle 复发`,
    };
  }
  return { shouldTerminate: false, reason: "conditions_not_met" };
}

/**
 * 条件 6: 预算耗尽
 *
 * phase_budget_exhausted && phase_budget_exhaustion_count >= 3
 * 或 cycle_total_consumed >= cycle_total_budget 时触发。
 *
 * @param state - LoopState
 */
function checkBudgetExhausted(state: LoopState): TerminationResult {
  const b = state.progress.budget;
  if (b.phase_budget_exhaustion_count >= 3) {
    return {
      shouldTerminate: true,
      reason: "budget_exhausted",
      detail: `同 phase 预算耗尽 ${b.phase_budget_exhaustion_count} 次`,
    };
  }
  if (
    b.cycle_total_budget > 0 &&
    b.cycle_total_consumed >= b.cycle_total_budget
  ) {
    return {
      shouldTerminate: true,
      reason: "budget_exhausted",
      detail: `cycle 总预算耗尽 (${b.cycle_total_consumed}/${b.cycle_total_budget})`,
    };
  }
  return { shouldTerminate: false, reason: "conditions_not_met" };
}

/**
 * 检查当前 phase 的 artifact 文件是否存在
 *
 * 用于验证 phase 是否有对应产出物。
 *
 * @param projectRoot - 项目根目录
 * @param phase - phase 名称
 * @returns 是否存在对应 artifact
 */
export function checkArtifactExists(
  projectRoot: string,
  phase: string
): boolean {
  const artifactMap: Record<string, string> = {
    part_1_1: "01-requirements.md",
    part_1_2: "02-direction.md",
    part_1_3: "03-solution.md",
    part_2_1: "04-task-list.md",
    part_2_2: "05b-implementation-diff.patch",
    part_2_3: "06a-code-review.md",
    part_2_4: "06b-test-strategy.md",
    part_2_5: "07a-test-plan.md",
  };
  const file = artifactMap[phase];
  if (!file) return false;
  const artifactPath = join(
    projectRoot,
    ".loop-opencode",
    "artifacts",
    file
  );
  return existsSync(artifactPath);
}
