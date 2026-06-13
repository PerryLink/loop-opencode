/**
 * guard-g1.ts —— 上下文使用率闸门（M3）
 *
 * 核心功能：检查 agent 会话上下文使用率是否超出安全阈值。
 * 读取 state.json 的 progress.budget.context_usage_pct 字段，
 * >= 85% 阻断当前操作 + 警告 agent 收敛上下文，
 * >= 70% 发出软警告但放行。
 *
 * 集成：作为 OpenCode tool.execute.before 插件运行。
 *
 * @module guard-g1
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** 硬阻断阈值——上下文使用率超过此值则阻断 */
const HARD_THRESHOLD = 85;
/** 软警告阈值——超过此值发出警告但放行 */
const SOFT_THRESHOLD = 70;

/**
 * G1 上下文大小闸门入口
 *
 * 检查当前 agent 会话的上下文使用率，防止上下文爆满
 * 导致 agent 输出质量下降或截断。
 *
 * @param ctx - OpenCode tool.execute.before 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策（允许/拒绝/需确认）
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  let contextPct = 0;

  if (existsSync(statePath)) {
    try {
      const raw = readFileSync(statePath, "utf-8");
      const state = JSON.parse(raw);
      contextPct = state?.progress?.budget?.context_usage_pct ?? 0;
    } catch {
      // 无法读取 state.json——放行（不阻塞主流程）
      console.warn("[G1] 无法读取 state.json，放行操作");
      return { allow: true };
    }
  }

  // >= 85% → 硬阻断
  if (contextPct >= HARD_THRESHOLD) {
    console.warn(
      `[G1] 上下文使用率 ${contextPct}% >= ${HARD_THRESHOLD}%，阻断操作: ${ctx.toolName}`
    );
    return {
      allow: false,
      reason: `上下文使用率 ${contextPct}% 超过硬阈值 ${HARD_THRESHOLD}%`,
      message: `上下文即将耗尽。请加速收敛并输出 checkpoint。当前操作 ${ctx.toolName} 已阻断。`,
      requireConfirmation: true,
    };
  }

  // >= 70% → 软警告
  if (contextPct >= SOFT_THRESHOLD) {
    console.log(
      `[G1] 上下文使用率 ${contextPct}% >= ${SOFT_THRESHOLD}%（软警告）`
    );
    return {
      allow: true,
      reason: `上下文使用率 ${contextPct}%，已超过 ${SOFT_THRESHOLD}% 软阈值`,
      message: `警告: 上下文使用率已达 ${contextPct}%。请考虑拆分上下文。`,
    };
  }

  // 正常范围
  return { allow: true };
}

/**
 * 获取当前上下文使用率——供其他模块查询
 *
 * @param projectRoot - 项目根目录
 * @returns 上下文使用率百分比（0-100），读取失败返回 -1
 */
export function getContextUsage(projectRoot: string): number {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  if (!existsSync(statePath)) return -1;
  try {
    const raw = readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);
    return state?.progress?.budget?.context_usage_pct ?? -1;
  } catch {
    return -1;
  }
}
