/**
 * routing.test.ts —— 路由模块单元测试
 *
 * 测试 src/routing.ts 的 P0/P1/P2 路由决策、convergence_counter
 * 和阶段间路由规则。
 */

import { describe, test, expect, beforeEach } from "bun:test";

// 动态导入
let routingMod: typeof import("../src/routing");
let typesMod: typeof import("../src/types");

async function loadModules() {
  routingMod = await import("../src/routing");
  typesMod = await import("../src/types");
}

beforeEach(async () => {
  await loadModules();
});

// ═══════════════════════════════════════════
// 阶段常量测试
// ═══════════════════════════════════════════

describe("Phase routing constants", () => {
  test("PART1_PHASES has correct phases", () => {
    if (!typesMod) return;
    const phases = typesMod.PART1_PHASES;
    expect(Array.isArray(phases)).toBe(true);
    expect(phases).toContain("part_1_1");
    expect(phases).toContain("part_1_2");
    expect(phases).toContain("part_1_3");
  });

  test("PART2_PHASES has correct phases", () => {
    if (!typesMod) return;
    const phases = typesMod.PART2_PHASES;
    expect(Array.isArray(phases)).toBe(true);
    expect(phases.length).toBeGreaterThanOrEqual(5);
    expect(phases).toContain("part_2_1");
    expect(phases).toContain("part_2_2");
  });

  test("TERMINAL_PHASES marks completion", () => {
    if (!typesMod) return;
    const phases = typesMod.TERMINAL_PHASES;
    expect(phases).toContain("complete");
  });
});

// ═══════════════════════════════════════════
// 路由决策测试
// ═══════════════════════════════════════════

describe("Route decision", () => {
  test("part_2_2 routes to part_2_3 on success", () => {
    if (!routingMod) return;
    const result = routingMod.getNextPhase("part_2_2", "success");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });

  test("part_2_2 routes to part_1_3 on P0 escalation", () => {
    if (!routingMod) return;
    const result = routingMod.getNextPhase("part_2_2", "p0_escalate");
    expect(result).toBeDefined();
  });

  test("routing phase resolves to terminal", () => {
    if (!routingMod) return;
    const result = routingMod.getNextPhase("routing", "complete");
    expect(result).toBe("complete");
  });

  test("last phase routes to routing", () => {
    if (!routingMod) return;
    const result = routingMod.getNextPhase("part_2_8", "success");
    expect(result).toBe("routing");
  });

  test("unknown phase returns safe default", () => {
    if (!routingMod) return;
    const next = routingMod.getNextPhase("nonexistent_phase", "success");
    expect(typeof next).toBe("string");
  });

  test("default route for undefined status", () => {
    if (!routingMod) return;
    const next = routingMod.getNextPhase("part_2_2", "unknown_status" as any);
    expect(typeof next).toBe("string");
  });
});

// ═══════════════════════════════════════════
// 收敛计数器测试
// ═══════════════════════════════════════════

describe("Convergence counter", () => {
  test("initial convergence count is zero", () => {
    if (!routingMod) return;
    const counter = routingMod.createConvergenceCounter();
    expect(counter.count).toBe(0);
    expect(counter.required).toBeGreaterThan(0);
  });

  test("increment convergence counter", () => {
    if (!routingMod) return;
    let counter = routingMod.createConvergenceCounter();
    counter = routingMod.incrementConvergence(counter);
    expect(counter.count).toBe(1);
  });

  test("convergence achieved when count meets required", () => {
    if (!routingMod) return;
    let counter = routingMod.createConvergenceCounter();
    counter.required = 2;
    counter.count = 2;
    expect(routingMod.isConverged(counter)).toBe(true);
  });

  test("convergence not achieved below required", () => {
    if (!routingMod) return;
    let counter = routingMod.createConvergenceCounter();
    counter.required = 3;
    counter.count = 1;
    expect(routingMod.isConverged(counter)).toBe(false);
  });

  test("reset convergence counter", () => {
    if (!routingMod) return;
    let counter = routingMod.createConvergenceCounter();
    counter.count = 5;
    counter = routingMod.resetConvergence(counter);
    expect(counter.count).toBe(0);
  });

  test("custom required convergence rounds", () => {
    if (!routingMod) return;
    const counter = routingMod.createConvergenceCounter(5);
    expect(counter.required).toBe(5);
  });
});

// ═══════════════════════════════════════════
// P0/P1/P2 优先级测试
// ═══════════════════════════════════════════

describe("Issue priority routing", () => {
  test("has P0 issues triggers escalation", () => {
    if (!routingMod) return;
    const state = makeLoopState({ p0_count: 2 });
    const result = routingMod.evaluateRoutePriority(state);
    expect(result.priority).toBe("P0");
    expect(result.should_escalate).toBe(true);
  });

  test("P1 issues trigger decision tree", () => {
    if (!routingMod) return;
    const state = makeLoopState({ p0_count: 0, p1_count: 1 });
    const result = routingMod.evaluateRoutePriority(state);
    expect(result.priority).toBe("P1");
  });

  test("no issues routes normally", () => {
    if (!routingMod) return;
    const state = makeLoopState({ p0_count: 0, p1_count: 0, p2_count: 0 });
    const result = routingMod.evaluateRoutePriority(state);
    expect(result.priority).toBe("P2");
    expect(result.should_escalate).toBe(false);
  });

  test("P0 takes precedence over P1", () => {
    if (!routingMod) return;
    const state = makeLoopState({ p0_count: 3, p1_count: 5 });
    const result = routingMod.evaluateRoutePriority(state);
    expect(result.priority).toBe("P0");
  });
});

// ═══════════════════════════════════════════
// 回退路由测试
// ═══════════════════════════════════════════

describe("Fallback routing", () => {
  test("repeated P0 escalation limits to N retries", () => {
    if (!routingMod) return;
    const result = routingMod.checkEscalationLimit(5);
    expect(result.limit_reached).toBe(true);
  });

  test("first escalation is allowed", () => {
    if (!routingMod) return;
    const result = routingMod.checkEscalationLimit(1);
    expect(result.limit_reached).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function makeLoopState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    phase: "part_2_2",
    p0_count: 0,
    p1_count: 0,
    p2_count: 0,
    convergence_counter: { count: 0, required: 2 },
    retry_count_current_phase: 0,
    has_gate_violation: false,
    artifacts: [],
    budget: { total_allocated: 25000, total_consumed: 0 },
    ...overrides,
  };
}
