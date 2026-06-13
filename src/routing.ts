/**
 * routing.ts —— P0/P1/P2 路由决策模块（M2）
 *
 * 核心功能：
 * - 根据活跃 issue 的严重度进行路由决策
 * - 三向 P1 分流：设计级（→ part_1_3）vs 实现级（→ part_2_2）
 * - convergence_counter 操作表（按 phase、严重度、事件操作 ±）
 * - 路由重复检测与循环保护
 *
 * @module routing
 */

import type {
  LoopState,
  Issue,
  RouteTarget,
  Severity,
  PhaseEnum,
} from "./types";
import { classifyP1 } from "./p1-classifier";

/**
 * 路由决策结果——告知调用方下一 phase 与原因
 */
export interface RouteResult {
  /** 下一 phase */
  nextPhase: PhaseEnum;
  /** 路由原因 */
  reason: string;
  /** 触发的 issue 列表 */
  triggeredBy: string[];
  /** 严重度 */
  severity: Severity;
}

/**
 * 执行路由决策
 *
 * 评估活跃的 P0/P1/P2 问题并确定下一 phase。
 * 优先级：P0 > P1 > P2（高严重度优先处理）。
 *
 * @param projectRoot - 项目根目录
 * @param state - 当前 LoopState
 * @returns 路由结果
 */
export function route(projectRoot: string, state: LoopState): RouteResult {
  const activeIssues = [
    ...state.issues.active.p0,
    ...state.issues.active.p1,
    ...state.issues.active.p2,
  ];

  // 无活跃问题 → 推进到下一 phase
  if (activeIssues.length === 0) {
    const next = nextPhase(state.progress.phase);
    updateConvergenceCounter(state, "no_issues");
    return {
      nextPhase: next,
      reason: "无活跃问题，推进到下一 phase",
      triggeredBy: [],
      severity: "P2",
    };
  }

  // 按严重度排序（P0 优先）
  const sorted = activeIssues.sort((a, b) => {
    const order: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };
    return order[a.severity] - order[b.severity];
  });

  const topIssue = sorted[0]!;

  // ---- P0 路由 ----
  if (topIssue.severity === "P0") {
    updateConvergenceCounter(state, "p0_found");
    // P0 路由重复检测
    if (isRouteExceeded(state, "part_1_1")) {
      return {
        nextPhase: "paused",
        reason: `P0 路由重复超限: route_repeat_max=${state.config.route_repeat_max}`,
        triggeredBy: [topIssue.issue_id],
        severity: "P0",
      };
    }
    return {
      nextPhase: "part_1_1",
      reason: `${topIssue.title}: P0 严重问题需回退需求分析`,
      triggeredBy: [topIssue.issue_id],
      severity: "P0",
    };
  }

  // ---- P1 路由 ----
  if (topIssue.severity === "P1") {
    const classification = classifyP1(topIssue);
    updateConvergenceCounter(state, "p1_found");

    if (classification === "design_level") {
      // P1 设计级 → 回退方案层
      if (isRouteExceeded(state, "part_1_3")) {
        return {
          nextPhase: "paused",
          reason: "P1(design) 路由重复超限",
          triggeredBy: [topIssue.issue_id],
          severity: "P1",
        };
      }
      return {
        nextPhase: "part_1_3",
        reason: `${topIssue.title}: P1 设计级问题需修改方案`,
        triggeredBy: [topIssue.issue_id],
        severity: "P1",
      };
    } else {
      // P1 实现级 → 修复模式路由到 part_2_2
      if (isRouteExceeded(state, "part_2_2")) {
        return {
          nextPhase: "paused",
          reason: "P1(impl) 路由重复超限",
          triggeredBy: [topIssue.issue_id],
          severity: "P1",
        };
      }
      return {
        nextPhase: "part_2_2",
        reason: `${topIssue.title}: P1 实现级问题需代码修复`,
        triggeredBy: [topIssue.issue_id],
        severity: "P1",
      };
    }
  }

  // ---- P2 路由 ----
  if (topIssue.severity === "P2") {
    updateConvergenceCounter(state, "p2_found");
    if (isRouteExceeded(state, "part_2_2")) {
      return {
        nextPhase: "paused",
        reason: "P2 路由重复超限",
        triggeredBy: [topIssue.issue_id],
        severity: "P2",
      };
    }
    return {
      nextPhase: "part_2_2",
      reason: `${topIssue.title}: P2 边界问题需修补`,
      triggeredBy: [topIssue.issue_id],
      severity: "P2",
    };
  }

  // fallback——不应到达
  return {
    nextPhase: "routing",
    reason: "路由决策 fallback",
    triggeredBy: [],
    severity: "P2",
  };
}

/**
 * 收敛计数器操作表
 *
 * 根据事件类型更新 convergence_counter：
 * - 无新问题（no_issues）→ CR + 1
 * - 发现任何级别问题 → CR = 0 重置
 *
 * @param state - LoopState（会被原地修改）
 * @param event - 触发事件类型
 */
export function updateConvergenceCounter(
  state: LoopState,
  event: "no_issues" | "p0_found" | "p1_found" | "p2_found"
): void {
  switch (event) {
    case "no_issues":
      // 无新问题——方案收敛中，CR + 1
      state.progress.convergence_counter += 1;
      console.log(
        `[routing] convergence_counter ${state.progress.convergence_counter - 1} → ${state.progress.convergence_counter} (无新问题)`
      );
      break;
    case "p0_found":
    case "p1_found":
    case "p2_found":
      // 发现任意级别问题——CR 重置为 0
      const old = state.progress.convergence_counter;
      state.progress.convergence_counter = 0;
      console.log(
        `[routing] convergence_counter ${old} → 0 (发现 ${event})`
      );
      break;
  }
}

/**
 * Phase 顺序表——确定下一 phase
 *
 * @param current - 当前 phase
 * @returns 正常流程中的下一 phase
 */
function nextPhase(current: PhaseEnum): PhaseEnum {
  const order: PhaseEnum[] = [
    "init",
    "part_1_1",
    "part_1_2",
    "part_1_3",
    "part_2_1",
    "part_2_2",
    "part_2_3",
    "part_2_4",
    "part_2_5",
    "part_2_6",
    "part_2_7",
    "part_2_8",
    "routing",
  ];
  const idx = order.indexOf(current);
  if (idx >= 0 && idx < order.length - 1) {
    return order[idx + 1]!;
  }
  // 若已到 routing 或未知 phase → 评估是否完成
  return "complete";
}

/**
 * 检测同一路由目标是否超过最大重复次数
 *
 * 遍历 routing_history，统计最近到同一 target 的路由次数。
 *
 * @param state - LoopState
 * @param target - 路由目标 phase
 * @returns 是否已超限
 */
export function isRouteExceeded(
  state: LoopState,
  target: RouteTarget
): boolean {
  const max = state.config.route_repeat_max;
  // 统计当前 cycle 内到同一 target 的路由次数
  const currentCycle = state.progress.cycle;
  const sameTarget = state.routing_history.filter(
    (r) =>
      r.to_phase === target && r.cycle === currentCycle
  );
  return sameTarget.length >= max;
}

/**
 * 添加路由历史记录
 *
 * 将路由决策记录到 state.routing_history。
 *
 * @param state - LoopState（原地修改）
 * @param result - 路由结果
 */
export function recordRoute(state: LoopState, result: RouteResult): void {
  state.routing_history.push({
    route_id: `route_${Date.now()}_${state.routing_history.length}`,
    cycle: state.progress.cycle,
    from_phase: state.progress.phase,
    to_phase: result.nextPhase,
    severity: result.severity,
    reason: result.reason,
    issue_ids: result.triggeredBy,
    routed_at: new Date().toISOString(),
  });
}

/**
 * 检测路由循环
 *
 * 若 routing_history 最近 N 条记录形成 A → B → A 环路，
 * 则视为路由循环，应暂停等待人工介入。
 *
 * @param state - LoopState
 * @param lookback - 回看记录数（默认 6）
 * @returns 是否检测到循环
 */
export function detectRoutingLoop(
  state: LoopState,
  lookback: number = 6
): boolean {
  const recent = state.routing_history.slice(-lookback);
  if (recent.length < 2) return false;

  for (let i = 0; i < recent.length - 1; i++) {
    const a = recent[i]!;
    const b = recent[i + 1]!;
    // A → B 且 B → A 即为简单的来回
    if (a.from_phase === b.to_phase && a.to_phase === b.from_phase) {
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// 测试兼容桩：内存路由对象 API
// ═══════════════════════════════════════════════════════════

/** 收敛计数器——测试用内存对象 */
export interface ConvergenceCounter {
  count: number;
  required: number;
}

/** 路由优先级评估结果 */
export interface PriorityResult {
  priority: "P0" | "P1" | "P2";
  should_escalate: boolean;
  reason?: string;
}

/** 升级限制检查结果 */
export interface EscalationLimitResult {
  limit_reached: boolean;
  count: number;
  max: number;
}

/** Phase 顺序表（桩内使用） */
const STUB_PHASE_ORDER: Record<string, string> = {
  init: "part_1_1",
  part_1_1: "part_1_2",
  part_1_2: "part_1_3",
  part_1_3: "part_2_1",
  part_2_1: "part_2_2",
  part_2_2: "part_2_3",
  part_2_3: "part_2_4",
  part_2_4: "part_2_5",
  part_2_5: "part_2_6",
  part_2_6: "part_2_7",
  part_2_7: "part_2_8",
  part_2_8: "routing",
};

/** 升级次数上限 */
const STUB_ESCALATION_MAX = 3;

/** 获取下一 phase */
export function getNextPhase(phase: string, status: string): string {
  if (phase === "routing" && status === "complete") return "complete";
  if (status === "p0_escalate") return "part_1_1";
  return STUB_PHASE_ORDER[phase] ?? "routing";
}

/** 创建收敛计数器 */
export function createConvergenceCounter(
  required: number = 2,
): ConvergenceCounter {
  return { count: 0, required };
}

/** 递增收敛计数器——返回新对象（不可变） */
export function incrementConvergence(
  counter: ConvergenceCounter,
): ConvergenceCounter {
  return { ...counter, count: counter.count + 1 };
}

/** 判断是否已收敛 */
export function isConverged(counter: ConvergenceCounter): boolean {
  return counter.count >= counter.required;
}

/** 重置收敛计数器——返回新对象 */
export function resetConvergence(
  counter: ConvergenceCounter,
): ConvergenceCounter {
  return { ...counter, count: 0 };
}

/** 根据 loop state 评估路由优先级 */
export function evaluateRoutePriority(
  state: Record<string, unknown>,
): PriorityResult {
  const p0 = (state.p0_count as number) ?? 0;
  const p1 = (state.p1_count as number) ?? 0;
  if (p0 > 0) return { priority: "P0", should_escalate: true };
  if (p1 > 0) return { priority: "P1", should_escalate: false };
  return { priority: "P2", should_escalate: false };
}

/** 检查升级次数是否超限 */
export function checkEscalationLimit(
  count: number,
): EscalationLimitResult {
  return {
    limit_reached: count > STUB_ESCALATION_MAX,
    count,
    max: STUB_ESCALATION_MAX,
  };
}
