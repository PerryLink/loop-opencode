/**
 * loop.ts —— 主循环驱动模块（M2）
 *
 * 核心流程：spawn agent → 等待 agent 完成 → 评估结果 → 路由决策 → 重复
 * 读取 .loop-opencode/state.json 文件状态机，驱动整个闭环开发工作流。
 *
 * @module loop
 */

import type { LoopState } from "./types";
import { readState, writeState } from "./state";
import { shouldTerminate } from "./terminate";
import { route } from "./routing";

/** 主循环上下文——承载所有运行时状态 */
export interface LoopContext {
  /** 项目根目录（绝对路径） */
  projectRoot: string;
  /** 文件状态机数据 */
  state: LoopState;
  /** 是否正在运行 */
  running: boolean;
  /** 当前循环起始时间（ISO 8601） */
  startedAt: string;
}

/**
 * 启动主循环
 *
 * 前置条件：state.json 已通过 --init 初始化且 termination.status="active"。
 * 循环在 should_terminate() 返回 true 或遇到致命错误时退出。
 *
 * @param projectRoot - 项目根目录（绝对路径）
 */
export function startLoop(projectRoot: string): LoopContext {
  console.log("[loop] 读取 state.json...");
  const state = readState(projectRoot);

  // 校验初始状态
  if (state.termination.status !== "active") {
    console.log(
      `[loop] 项目处于终态 (${state.termination.status})，跳过主循环。`
    );
    return {
      projectRoot,
      state,
      running: false,
      startedAt: new Date().toISOString(),
    };
  }

  const ctx: LoopContext = {
    projectRoot,
    state,
    running: true,
    startedAt: new Date().toISOString(),
  };

  console.log(
    `[loop] 主循环启动 | phase=${ctx.state.progress.phase} cycle=${ctx.state.progress.cycle}`
  );

  return ctx;
}

/**
 * 执行单个循环轮次
 *
 * 每个 cycle 包含三个步骤：
 * 1. 派发 agent——输出指令让 agent 执行当前 phase
 * 2. 等待——agent 执行完毕并更新 state.json
 * 3. 评估——路由决策，确定下一 phase
 *
 * @param ctx - 循环上下文
 * @returns 更新后的循环上下文
 */
export function executeCycle(ctx: LoopContext): LoopContext {
  if (!ctx.running) return ctx;

  // 重新读取 state.json（agent 可能已更新）
  const fresh = readState(ctx.projectRoot);
  ctx.state = fresh;

  // 步骤 1：分析当前 phase
  const currentPhase = fresh.progress.phase;
  console.log(
    `[loop] Cycle ${fresh.progress.cycle} | phase=${currentPhase}`
  );

  // 步骤 2：评估终止条件
  const term = shouldTerminate(ctx.projectRoot);
  if (term.shouldTerminate) {
    console.log(
      `[loop] 终止条件满足: ${term.reason}${term.detail ? " | " + term.detail : ""}`
    );
    ctx.state.termination.status =
      term.reason === "convergence_reached" ||
      term.reason === "convergence_fast_path"
        ? "complete"
        : term.reason === "user_interrupt"
          ? "paused"
          : "failed";
    ctx.state.termination.exit_reason = term.reason;
    ctx.state.termination.completed_at =
      ctx.state.termination.status === "complete"
        ? new Date().toISOString()
        : ctx.state.termination.completed_at;
    ctx.state.termination.failed_at =
      ctx.state.termination.status === "failed"
        ? new Date().toISOString()
        : ctx.state.termination.failed_at;
    writeState(ctx.projectRoot, ctx.state);
    ctx.running = false;
    return ctx;
  }

  // 步骤 3：路由决策
  const routeResult = route(ctx.projectRoot, ctx.state);
  if (routeResult.nextPhase !== currentPhase) {
    console.log(
      `[loop] 路由: ${currentPhase} → ${routeResult.nextPhase} (理由: ${routeResult.reason})`
    );
    ctx.state.progress.phase = routeResult.nextPhase;
    ctx.state.progress.phase_transitions.push({
      from: currentPhase,
      to: routeResult.nextPhase,
      at: new Date().toISOString(),
      reason: routeResult.reason,
    });
    ctx.state.progress.cycle += 1;
    writeState(ctx.projectRoot, ctx.state);
  }

  // 步骤 4：输出当前 phase 的指令提示
  logPhaseInstruction(ctx);

  return ctx;
}

/**
 * 运行完整主循环（阻塞直到终止）
 *
 * @param projectRoot - 项目根目录
 */
export function runLoop(projectRoot: string): void {
  const ctx = startLoop(projectRoot);
  if (!ctx.running) return;

  // 持续循环直到终止
  while (ctx.running) {
    executeCycle(ctx);
    // 若仍未终止，输出下一轮指令
    if (ctx.running) {
      console.log("[loop] 等待 agent 执行下一轮...");
    }
  }

  // 输出最终状态
  console.log(
    `[loop] 主循环结束 | status=${ctx.state.termination.status} reason=${ctx.state.termination.exit_reason}`
  );
}

/**
 * 输出当前 phase 对应的 agent 指令提示
 *
 * 将 phase 映射为人类可读的 agent 任务描述。
 *
 * @param ctx - 循环上下文
 */
function logPhaseInstruction(ctx: LoopContext): void {
  const phase = ctx.state.progress.phase;
  const map: Record<string, string> = {
    init: "请确保 state.json 已初始化（执行 --init）",
    part_1_1: "执行 Part 1.1: 多轮头脑风暴，明确需求、消除歧义。产出 01-requirements.md",
    part_1_2: "执行 Part 1.2: 方向研究与技术选型。产出 02-direction.md",
    part_1_3: "执行 Part 1.3: 方案形成，输出完整可实施方案。产出 03-solution.md",
    part_2_1: "执行 Part 2.1: 实施规划——方案分解为 Task 列表",
    part_2_2: "执行 Part 2.2: 代码实施——按 Task 执行并生成 diff",
    part_2_3: "执行 Part 2.3: Code Review——结构化代码审查",
    part_2_4: "执行 Part 2.4: E2E 测试策略研究",
    part_2_5: "执行 Part 2.5: 测试规划——产出可执行测试 Task",
    part_2_6: "执行 Part 2.6: 测试执行——编写并运行测试",
    part_2_7: "执行 Part 2.7: 验证查漏——全量 artifact 审计",
    part_2_8: "执行 Part 2.8: 硬验证闸门——运行验证命令并输出证据",
    routing: "执行路由决策——评估 P0/P1/P2 问题并确定下一 phase",
  };
  const instruction = map[phase] || `执行 phase: ${phase}`;
  console.log(`[loop] 当前 phase 指令: ${instruction}`);
}

/**
 * 获取循环统计信息
 *
 * @param ctx - 循环上下文
 * @returns 统计摘要
 */
export function getLoopStats(ctx: LoopContext): string {
  const s = ctx.state.progress;
  return [
    `phase=${s.phase}`,
    `cycle=${s.cycle}`,
    `convergence=${s.convergence_counter}`,
    `P0=${ctx.state.issues.active.p0.length}`,
    `P1=${ctx.state.issues.active.p1.length}`,
    `P2=${ctx.state.issues.active.p2.length}`,
  ].join(", ");
}
