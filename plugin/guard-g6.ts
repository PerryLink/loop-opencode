/**
 * guard-g6.ts —— 完成信号闸门（M3）
 *
 * 核心功能：在 agent 声明完成任务时进行最终验证。
 * 检查 session.stop 事件，验证 completion 声明是否满足终止条件：
 * 1. 活跃 P0 是否清零（open/in_progress 状态少于 1 个方可放行）
 * 2. convergence_counter 是否达标（CR >= config.convergence_rounds）
 * 3. 关键 phase 合约是否完成（part_2_7、part_2_8 的合约标记）
 *
 * 适用工具：session.stop、stop_session、complete、finish
 * 触发时机：M3 阶段（实施阶段结束后、验收阶段入口处）
 *
 * 失败模式：任一维度不满足 → 返回 allow:false + requireConfirmation:true，
 * 告知 agent 缺失条件详情，引导继续修缮直至满足全部终止条件。
 *
 * @module guard-g6
 * @see {@link ../DESIGN.md|DESIGN.md} 第 3.2 节：闸门体系设计
 * @license Apache-2.0
 * @copyright 2026 Perry Link
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** 完成声明类工具名称集合——这些工具触发完成终止验证 */
const COMPLETE_TOOLS = ["session.stop", "stop_session", "complete", "finish"];

/** 必须完成的关键 phase 合约——任一未完成则拒绝终止 */
const KEY_PHASES = ["part_2_7", "part_2_8"];

/**
 * G6 完成声明闸门入口——多维验证 agent 完成声明是否合法
 *
 * 验证流程（三步）：
 * 1. 检查 state.json 是否存在且可解析
 * 2. 解析 progress、issues、phase_contracts 三个关键字段
 * 3. 汇总判定：全绿则放行，任一红则拒绝并告知缺失条件
 *
 * 仅拦截完成声明类工具（COMPLETE_TOOLS 中定义的 4 个工具名），
 * 其他所有工具直接放行，不阻塞正常执行流程。
 *
 * @param ctx - tool.execute.before 上下文，包含 toolName、toolInput、sessionId
 * @param projectRoot - 项目根目录（绝对路径），用于定位 .loop-opencode/state.json
 * @returns PluginDecision——allow:true 放行，allow:false 拒绝（附带原因、消息、确认标记）
 * @throws 不抛出——所有异常均在内部捕获并转换为拒绝决策
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  // 仅检查 session.stop 或完成声明类工具
  if (!COMPLETE_TOOLS.includes(ctx.toolName)) return { allow: true };

  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  if (!existsSync(statePath)) {
    return {
      allow: false,
      reason: "state.json 不存在",
      message: "拒绝完成声明: state.json 不存在，无法验证。",
    };
  }

  /** 从 state.json 解析出的运行时状态快照 */
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return {
      allow: false,
      reason: "state.json 损坏",
      message: "拒绝完成声明: state.json 解析失败。",
    };
  }

  /** 累计收集的所有未通过条件 */
  const failures: string[] = [];

  // ── 验证 1: 活跃 P0 清零 ──
  // 遍历 issues.active.p0 数组，检查是否仍存在 open 或 in_progress 状态的 P0
  // 若存在任何活跃 P0，说明核心问题尚未修复，不应允许终止
  const progress = state.progress as Record<string, unknown> | undefined;
  const issues = state.issues as Record<string, unknown> | undefined;
  const active = issues?.active as Record<string, unknown> | undefined;
  const p0List = (active?.p0 as unknown[]) ?? [];
  const p1List = (active?.p1 as unknown[]) ?? [];

  const openP0 = p0List.filter(
    (i) =>
      typeof i === "object" &&
      i !== null &&
      ((i as Record<string, unknown>).status === "open" ||
        (i as Record<string, unknown>).status === "in_progress")
  );

  if (openP0.length > 0) {
    failures.push(`存在 ${openP0.length} 个活跃 P0 问题`);
  }

  // ── 验证 2: convergence_counter 达标 ──
  // 对比当前 CR 值与配置的 convergence_rounds（默认 2）
  // 仅当仍存在活跃 P0/P1 时才检查 CR 达标性——若已无活跃问题则不阻
  const cr = (progress?.convergence_counter as number) ?? 0;
  const config = state.config as Record<string, unknown> | undefined;
  const required = (config?.convergence_rounds as number) ?? 2;
  const hasActiveP0P1 = p0List.length > 0 || p1List.length > 0;

  if (cr < required && hasActiveP0P1) {
    failures.push(
      `收敛不足: CR=${cr}（需 >= ${required}，且仍有活跃 P0/P1）`
    );
  }

  // ── 验证 3: 关键 phase 合约完成 ──
  // 检查 part_2_7（审计查漏）和 part_2_8（硬验证闸门）的合约是否已标记为 completed
  // 这两个 phase 是质量保证的核心防线，任一未完成则不可终止
  const contracts = state.phase_contracts as
    | Record<string, { completed: boolean }>
    | undefined;
  for (const ph of KEY_PHASES) {
    if (!contracts?.[ph]?.completed) {
      failures.push(`关键 phase 合约未完成: ${ph}`);
    }
  }

  // ── 汇总判定 ──
  if (failures.length > 0) {
    console.warn(
      `[G6] 完成声明验证失败: ${failures.join("; ")}`
    );
    return {
      allow: false,
      reason: failures.join("; "),
      message: `完成声明验证失败:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
      requireConfirmation: true,
    };
  }

  console.log("[G6] 完成声明验证通过");
  return { allow: true };
}

/**
 * 只读检查——查询当前状态下是否满足所有终止条件
 *
 * 与 evaluate() 不同，此函数不修改任何状态，仅返回布尔判定与缺失条件列表。
 * 可用于外部监控、仪表板、或 agent 自检（在正式声明完成前预检）。
 *
 * 检查维度：
 * 1. state.json 是否存在且可读
 * 2. 活跃 P0 是否已全部解决
 * 3. convergence_counter 是否 >= config.convergence_rounds
 *
 * @param projectRoot - 项目根目录（绝对路径）
 * @returns 包含 allowed（是否可终止）和 missingConditions（缺失条件列表）的结果对象
 *         若 state.json 不存在或损坏，allowed 为 false 并返回对应错误条件
 * @throws 不抛出——所有异常均内部捕获并返回 false
 */
export function checkCompletion(
  projectRoot: string
): { allowed: boolean; missingConditions: string[] } {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  if (!existsSync(statePath)) {
    return { allowed: false, missingConditions: ["state.json 不存在"] };
  }
  try {
    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    /** 收集所有未通过的终止条件 */
    const missing: string[] = [];

    // 检查活跃 P0
    const p0 = state?.issues?.active?.p0 ?? [];
    const openP0 = p0.filter(
      (i: Record<string, unknown>) =>
        i.status === "open" || i.status === "in_progress"
    );
    if (openP0.length > 0) missing.push("存在活跃 P0 问题");

    // 检查收敛计数器
    const cr = state?.progress?.convergence_counter ?? 0;
    const req = state?.config?.convergence_rounds ?? 2;
    if (cr < req) missing.push(`CR=${cr}<${req}`);

    return { allowed: missing.length === 0, missingConditions: missing };
  } catch {
    return { allowed: false, missingConditions: ["state.json 解析失败"] };
  }
}
