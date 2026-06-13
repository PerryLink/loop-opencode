/**
 * budget.ts —— 收敛预算监控器（M4）
 *
 * 核心功能：
 * - 每 Phase 独立 token 预算分配与追踪
 * - 80% 软警告 + 100% 硬边界机制
 * - 同 phase 连续耗尽 >= 3 次 → pause
 * - Cycle 总预算超限检测
 * - 预算注入（phase 切换时重新计算预算）
 *
 * @module budget
 */

import { readState, writeState } from "./state";
import type { LoopState, PhaseEnum } from "./types";
import { PHASE_BUDGET_PRESETS } from "./types";

/**
 * 为当前 phase 注入 token 预算
 *
 * 从 PHASE_BUDGET_PRESETS 读取预设值，
 * 计算 cycle_total_budget = sum(all phases) * 1.2。
 *
 * @param projectRoot - 项目根目录
 */
export function injectPhaseBudget(projectRoot: string): void {
  const state = readState(projectRoot);
  const phase = state.progress.phase;
  const preset = PHASE_BUDGET_PRESETS[phase] ?? 10000;

  state.progress.budget.phase_budget = preset;
  state.progress.budget.phase_budget_consumed = 0;
  state.progress.budget.phase_budget_warning_issued = false;
  state.progress.budget.phase_budget_exhausted = false;

  // 计算 cycle 总预算
  const total = Object.values(PHASE_BUDGET_PRESETS).reduce((s, v) => s + v, 0);
  state.progress.budget.cycle_total_budget = Math.ceil(total * 1.2);

  writeState(projectRoot, state);
  console.log(`[budget] 注入预算: phase=${phase}, budget=${preset}`);
}

/**
 * 消费 token 预算
 *
 * 累积 consumed 计数器，触发硬/软边界检查。
 *
 * @param projectRoot - 项目根目录
 * @param tokens - 本次消费 token 数
 * @returns 是否仍可继续（false 表示预算耗尽需暂停）
 */
export function consumeTokens(
  projectRoot: string,
  tokens: number
): boolean {
  const state = readState(projectRoot);
  const b = state.progress.budget;

  // 累加消耗
  b.phase_budget_consumed += tokens;
  b.cycle_total_consumed += tokens;

  const pct = Math.round((b.phase_budget_consumed / b.phase_budget) * 100);

  // 80% 软警告
  if (pct >= 80 && !b.phase_budget_warning_issued && b.phase_budget > 0) {
    b.phase_budget_warning_issued = true;
    console.warn(
      `[budget] 软警告: phase 预算已消耗 ${pct}% (${b.phase_budget_consumed}/${b.phase_budget})`
    );
  }

  // 100% 硬边界
  if (b.phase_budget_consumed >= b.phase_budget && b.phase_budget > 0) {
    b.phase_budget_exhausted = true;
    b.phase_budget_exhaustion_count += 1;

    console.error(
      `[budget] 硬边界: phase 预算耗尽 (${b.phase_budget_consumed}/${b.phase_budget})`
    );

    // 连续耗尽 >= 3 次 → pause
    if (b.phase_budget_exhaustion_count >= 3) {
      state.termination.status = "paused";
      state.termination.exit_reason = "budget_exhausted";
      state.termination.paused_at = new Date().toISOString();
      writeState(projectRoot, state);
      console.error("[budget] 同 phase 预算连续 3 次耗尽，暂停");
      return false;
    }

    // 执行超限动作
    const action = b.budget_overrun_action;
    if (action === "pause") {
      state.termination.status = "paused";
      state.termination.exit_reason = "budget_exhausted";
      state.termination.paused_at = new Date().toISOString();
    }
  }

  writeState(projectRoot, state);
  return !b.phase_budget_exhausted;
}

/**
 * 获取当前 phase 预算消耗百分比
 *
 * @param projectRoot - 项目根目录
 * @returns 百分比（0-100），-1 表示无法计算
 */
export function getBudgetPercent(projectRoot: string): number {
  const state = readState(projectRoot);
  const b = state.progress.budget;
  if (b.phase_budget <= 0) return -1;
  return Math.round((b.phase_budget_consumed / b.phase_budget) * 100);
}

// ═══════════════════════════════════════════════════════════
// 测试兼容类型定义
// ═══════════════════════════════════════════════════════════

/** 内存预算对象——供测试使用 */
export interface PhaseBudget {
  phase: string;
  total_allocated: number;
  total_consumed: number;
  consumed: number;
  remaining: number;
  is_paused: boolean;
  phase_budgets: Record<string, number>;
}

/** 预算摘要——getBudgetSummary 在接收 PhaseBudget 时的返回值 */
export interface BudgetSummary {
  phase: string;
  consumed: number;
  remaining: number;
  usage_percent: number;
}

/**
 * 获取 budget 状态摘要（项目根目录字符串版本）
 *
 * @param projectRoot - 项目根目录
 * @returns 人类可读的摘要字符串
 */
export function getBudgetSummary(projectRoot: string): string;
/**
 * 获取 budget 状态摘要（PhaseBudget 对象版本——测试兼容桩）
 *
 * @param budget - PhaseBudget 对象
 * @returns 结构化摘要
 */
export function getBudgetSummary(budget: PhaseBudget): BudgetSummary;
export function getBudgetSummary(
  input: string | PhaseBudget,
): string | BudgetSummary {
  if (typeof input === "string") {
    const state = readState(input);
    const b = state.progress.budget;
    const pct =
      b.phase_budget > 0
        ? Math.round((b.phase_budget_consumed / b.phase_budget) * 100)
        : 0;
    return [
      `phase_budget: ${b.phase_budget_consumed}/${b.phase_budget} (${pct}%)`,
      `cycle_total: ${b.cycle_total_consumed}/${b.cycle_total_budget}`,
      `exhaustions: ${b.phase_budget_exhaustion_count}`,
      `context: ${b.context_usage_pct}%`,
    ].join(", ");
  }
  // PhaseBudget overload
  const total = input.remaining + input.consumed;
  const pct = total > 0 ? Math.round((input.consumed / total) * 100) : 0;
  return {
    phase: input.phase,
    consumed: input.consumed,
    remaining: input.remaining,
    usage_percent: pct,
  };
}

// ═══════════════════════════════════════════════════════════
// 测试兼容桩：内存预算对象 API
// ═══════════════════════════════════════════════════════════

/** Phase 预设 token 预算（桩内复用） */
const STUB_PRESETS: Record<string, number> = {
  part_1_1: 15000,
  part_1_2: 12000,
  part_1_3: 10000,
  part_2_1: 12000,
  part_2_2: 25000,
  part_2_3: 10000,
  part_2_4: 8000,
  part_2_5: 8000,
  part_2_6: 20000,
  part_2_7: 12000,
  part_2_8: 8000,
};
const STUB_DEFAULT = 10000;

/** 创建默认预算对象 */
export function getDefaultBudget(): PhaseBudget {
  return {
    phase: "default",
    total_allocated: STUB_DEFAULT,
    total_consumed: 0,
    consumed: 0,
    remaining: STUB_DEFAULT,
    is_paused: false,
    phase_budgets: { default: STUB_DEFAULT },
  };
}

/** 为指定 phase 创建预算对象 */
export function createPhaseBudget(phase: string): PhaseBudget {
  const alloc = STUB_PRESETS[phase] ?? STUB_DEFAULT;
  return {
    phase,
    total_allocated: alloc,
    total_consumed: 0,
    consumed: 0,
    remaining: alloc,
    is_paused: false,
    phase_budgets: { [phase]: alloc },
  };
}

/** 消费预算——返回新预算对象（不可变） */
export function consumeBudget(
  budget: PhaseBudget,
  amount: number,
): PhaseBudget {
  if (amount <= 0 || budget.is_paused) return { ...budget };
  const actual = Math.min(amount, budget.remaining);
  return {
    ...budget,
    consumed: budget.consumed + actual,
    total_consumed: budget.total_consumed + actual,
    remaining: budget.remaining - actual,
  };
}

/** 判断预算是否已耗尽 */
export function isExhausted(budget: PhaseBudget): boolean {
  return budget.remaining <= 0;
}

/** 获取警告阈值（固定 80%） */
export function getWarningThreshold(_budget: PhaseBudget): number {
  return 0.8;
}

/** 判断是否接近耗尽（剩余 ≤ 10%） */
export function isNearExhaustion(budget: PhaseBudget): boolean {
  const total = budget.remaining + budget.consumed;
  if (total <= 0) return true;
  return budget.remaining / total <= 0.1;
}

/** 注入额外预算——返回新预算对象 */
export function injectBudget(
  budget: PhaseBudget,
  amount: number,
): PhaseBudget {
  return {
    ...budget,
    remaining: budget.remaining + amount,
    total_allocated: budget.total_allocated + amount,
  };
}
