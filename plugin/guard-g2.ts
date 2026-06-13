/**
 * guard-g2.ts —— Token 预算消耗闸门（M3）
 *
 * 核心功能：检查 agent 在当前 phase 的 token 预算消耗是否超限。
 * 读取 state.json 的 progress.budget 字段，比对 phase_budget 与
 * phase_budget_consumed，>= 100% 阻断，>= 80% 发出软警告。
 *
 * @module guard-g2
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** Token 预算硬阈值——消耗率 >= 100% 阻断 */
const HARD_PCT = 100;
/** Token 预算软警告阈值——消耗率 >= 80% */
const SOFT_PCT = 80;

/**
 * G2 Token 预算闸门入口
 *
 * 对比当前 phase 的已消耗 token 与总预算，
 * 超过阈值时阻断高风险操作（如 write、execute_command）。
 *
 * @param ctx - tool.execute.before 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  let budget = 0, consumed = 0, exhausted = false;

  if (existsSync(statePath)) {
    try {
      const raw = readFileSync(statePath, "utf-8");
      const state = JSON.parse(raw);
      const b = state?.progress?.budget;
      if (b) {
        budget = b.phase_budget ?? 0;
        consumed = b.phase_budget_consumed ?? 0;
        exhausted = b.phase_budget_exhausted ?? false;
      }
    } catch {
      console.warn("[G2] 无法读取 state.json，放行操作");
      return { allow: true };
    }
  }

  if (budget <= 0) return { allow: true }; // 无预算限制则放行

  const pct = Math.round((consumed / budget) * 100);

  // 已标记耗尽 → 阻断高风险操作
  if (exhausted || pct >= HARD_PCT) {
    console.warn(`[G2] 预算耗尽 (${pct}%)，阻断: ${ctx.toolName}`);
    return {
      allow: false,
      reason: `当前 phase token 预算已耗尽 (${consumed}/${budget})`,
      message: `预算耗尽，当前操作 ${ctx.toolName} 已阻断。请输出 checkpoint 并退出。`,
      requireConfirmation: true,
    };
  }

  // >= 80% → 软警告
  if (pct >= SOFT_PCT) {
    console.log(`[G2] 预算消耗 ${pct}%（软警告）`);
    return {
      allow: true,
      reason: `预算消耗率 ${pct}%，已超过 ${SOFT_PCT}%`,
      message: `注意: token 预算已消耗 ${pct}%。请精简输出。`,
    };
  }

  return { allow: true };
}

/**
 * 计算当前 phase 预算消耗百分比
 *
 * @param projectRoot - 项目根目录
 * @returns 消耗百分比（0-100），读取失败返回 -1
 */
export function getBudgetPct(projectRoot: string): number {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  if (!existsSync(statePath)) return -1;
  try {
    const raw = readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);
    const b = state?.progress?.budget;
    if (!b || b.phase_budget <= 0) return 0;
    return Math.round((b.phase_budget_consumed / b.phase_budget) * 100);
  } catch {
    return -1;
  }
}
