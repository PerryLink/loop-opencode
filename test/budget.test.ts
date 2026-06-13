/**
 * budget.test.ts —— 收敛预算模块单元测试
 *
 * 测试 src/budget.ts 的预算注入、消耗追踪、耗尽判定和暂停/恢复机制。
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

// 动态导入被测模块
let budgetMod: typeof import("../src/budget");
let typesMod: typeof import("../src/types");

async function loadModules() {
  budgetMod = await import("../src/budget");
  typesMod = await import("../src/types");
}

let testDir: string;

beforeEach(async () => {
  testDir = mkdtempSync(join(tmpdir(), "budget-test-"));
  await loadModules();
});

function cleanup() {
  try { rmSync(testDir, { recursive: true, force: true }); } catch {}
}

// ═══════════════════════════════════════════
// 测试：预算初始化
// ═══════════════════════════════════════════

describe("Budget initialization", () => {
  test("creates budget with default values", () => {
    if (!budgetMod) return;
    const budget = budgetMod.getDefaultBudget();
    expect(budget).toBeDefined();
    expect(budget.total_allocated).toBeGreaterThan(0);
    expect(budget.total_consumed).toBe(0);
    expect(budget.phase_budgets).toBeDefined();
  });

  test("creates budget for specific phase", () => {
    if (!budgetMod || !typesMod) return;
    const budget = budgetMod.createPhaseBudget("part_2_2");
    expect(budget.phase).toBe("part_2_2");
    expect(budget.remaining).toBeGreaterThan(0);
    expect(budget.consumed).toBe(0);
    expect(budget.is_paused).toBe(false);
  });

  test("different phases have different allocations", () => {
    if (!budgetMod) return;
    const b1 = budgetMod.createPhaseBudget("part_1_1");
    const b2 = budgetMod.createPhaseBudget("part_2_2");
    const b3 = budgetMod.createPhaseBudget("part_2_8");
    // part_2_2 应该有最大预算（执行阶段）
    expect(b2.remaining).toBeGreaterThanOrEqual(b1.remaining);
    expect(b2.remaining).toBeGreaterThanOrEqual(b3.remaining);
  });

  test("unknown phase gets default allocation", () => {
    if (!budgetMod) return;
    const budget = budgetMod.createPhaseBudget("routing");
    expect(budget.remaining).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// 测试：预算消耗
// ═══════════════════════════════════════════

describe("Budget consumption", () => {
  test("consumes budget correctly", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const initial = budget.remaining;

    budget = budgetMod.consumeBudget(budget, 500);
    expect(budget.consumed).toBe(500);
    expect(budget.remaining).toBe(initial - 500);
  });

  test("consume exact remaining amount", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_1_1");
    const remaining = budget.remaining;

    budget = budgetMod.consumeBudget(budget, remaining);
    expect(budget.remaining).toBe(0);
    expect(budget.consumed).toBe(remaining);
  });

  test("consume more than remaining yields zero", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_1_1");
    const remaining = budget.remaining;

    budget = budgetMod.consumeBudget(budget, remaining + 5000);
    expect(budget.remaining).toBe(0);
  });

  test("zero consumption is no-op", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const initial = budget.remaining;
    budget = budgetMod.consumeBudget(budget, 0);
    expect(budget.remaining).toBe(initial);
  });

  test("negative consumption is rejected", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const initial = budget.remaining;
    budget = budgetMod.consumeBudget(budget, -100);
    expect(budget.remaining).toBe(initial); // no-op for negative
  });
});

// ═══════════════════════════════════════════
// 测试：耗尽判定
// ═══════════════════════════════════════════

describe("Budget exhaustion", () => {
  test("detects exhaustion when remaining is zero", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_8");
    budget.remaining = 0;
    expect(budgetMod.isExhausted(budget)).toBe(true);
  });

  test("not exhausted with remaining budget", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    expect(budgetMod.isExhausted(budget)).toBe(false);
  });

  test("exhausted budget triggers warning threshold", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const threshold = budgetMod.getWarningThreshold(budget);
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThanOrEqual(1.0);
  });

  test("near-exhaustion detected", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const total = budget.remaining + budget.consumed;
    // 消耗到仅剩 10%
    budget = budgetMod.consumeBudget(budget, Math.floor(total * 0.9));
    expect(budgetMod.isNearExhaustion(budget)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// 测试：暂停/恢复
// ═══════════════════════════════════════════

describe("Budget pause/resume", () => {
  test("pause prevents consumption", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    budget.is_paused = true;
    const initial = budget.remaining;
    budget = budgetMod.consumeBudget(budget, 500);
    expect(budget.remaining).toBe(initial); // should not change
  });

  test("resume allows consumption again", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    budget.is_paused = true;
    budget.is_paused = false;
    const initial = budget.remaining;
    budget = budgetMod.consumeBudget(budget, 500);
    expect(budget.remaining).toBe(initial - 500);
  });
});

// ═══════════════════════════════════════════
// 测试：预算注入
// ═══════════════════════════════════════════

describe("Budget injection", () => {
  test("injectBudget increases remaining", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const initial = budget.remaining;
    budget = budgetMod.injectBudget(budget, 1000);
    expect(budget.remaining).toBe(initial + 1000);
    expect(budget.total_allocated).toBe(budget.consumed + budget.remaining);
  });

  test("injectBudget on paused budget is allowed", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    budget.is_paused = true;
    const initial = budget.remaining;
    budget = budgetMod.injectBudget(budget, 500);
    expect(budget.remaining).toBe(initial + 500);
  });
});

// ═══════════════════════════════════════════
// 测试：预算摘要
// ═══════════════════════════════════════════

describe("Budget summary", () => {
  test("getBudgetSummary returns correct structure", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    budget = budgetMod.consumeBudget(budget, 3000);

    const summary = budgetMod.getBudgetSummary(budget);
    expect(summary.phase).toBe("part_2_2");
    expect(summary.consumed).toBe(3000);
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
    expect(summary.usage_percent).toBeGreaterThan(0);
    expect(summary.usage_percent).toBeLessThanOrEqual(100);
  });

  test("fully consumed budget has 100% usage", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_1_1");
    budget = budgetMod.consumeBudget(budget, budget.remaining);
    const summary = budgetMod.getBudgetSummary(budget);
    expect(summary.usage_percent).toBeCloseTo(100, 0);
  });

  test("fresh budget has 0% usage", () => {
    if (!budgetMod) return;
    const budget = budgetMod.createPhaseBudget("part_2_2");
    const summary = budgetMod.getBudgetSummary(budget);
    expect(summary.consumed).toBe(0);
    expect(summary.usage_percent).toBe(0);
  });

  test("getDefaultBudget creates valid budget", () => {
    if (!budgetMod) return;
    const budget = budgetMod.getDefaultBudget();
    expect(budget.phase).toBe("default");
    expect(budget.remaining).toBe(10000);
    expect(budget.is_paused).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 测试：Phase 预算预设
// ═══════════════════════════════════════════

describe("Phase budget presets", () => {
  test("all known phases have budget > 0", () => {
    if (!budgetMod) return;
    const phases = ["part_1_1", "part_1_2", "part_1_3", "part_2_1", "part_2_2", "part_2_3",
      "part_2_4", "part_2_5", "part_2_6", "part_2_7", "part_2_8"];
    for (const p of phases) {
      const b = budgetMod.createPhaseBudget(p);
      expect(b.remaining).toBeGreaterThan(0);
      expect(b.phase).toBe(p);
    }
  });

  test("part_2_2 implementation has highest budget", () => {
    if (!budgetMod) return;
    const b22 = budgetMod.createPhaseBudget("part_2_2");
    const b21 = budgetMod.createPhaseBudget("part_2_1");
    const b28 = budgetMod.createPhaseBudget("part_2_8");
    expect(b22.remaining).toBeGreaterThanOrEqual(b21.remaining);
    expect(b22.remaining).toBeGreaterThanOrEqual(b28.remaining);
  });

  test("reset budget with injectBudget", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const initial = budget.remaining;
    budget = budgetMod.consumeBudget(budget, initial);
    expect(budget.remaining).toBe(0);
    budget = budgetMod.injectBudget(budget, 5000);
    expect(budget.remaining).toBe(5000);
    expect(budget.total_allocated).toBe(initial + 5000);
  });

  test("consumed + remaining = total_allocated", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    budget = budgetMod.consumeBudget(budget, 3500);
    expect(budget.consumed + budget.remaining).toBe(budget.total_allocated);
  });
});

// ═══════════════════════════════════════════
// 测试：边界条件
// ═══════════════════════════════════════════

describe("Budget edge cases", () => {
  test("exact exhaustion border", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_8");
    const remaining = budget.remaining;
    budget = budgetMod.consumeBudget(budget, remaining);
    expect(budget.remaining).toBe(0);
    expect(budgetMod.isExhausted(budget)).toBe(true);
  });

  test("near-exhaustion at 90% detected", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const total = budget.remaining + budget.consumed;
    budget = budgetMod.consumeBudget(budget, Math.floor(total * 0.91));
    expect(budgetMod.isNearExhaustion(budget)).toBe(true);
  });

  test("not near-exhaustion at 50%", () => {
    if (!budgetMod) return;
    let budget = budgetMod.createPhaseBudget("part_2_2");
    const total = budget.remaining + budget.consumed;
    budget = budgetMod.consumeBudget(budget, Math.floor(total * 0.5));
    expect(budgetMod.isNearExhaustion(budget)).toBe(false);
  });

  test("getWarningThreshold always returns 0.8", () => {
    if (!budgetMod) return;
    const budget = budgetMod.createPhaseBudget("part_2_2");
    expect(budgetMod.getWarningThreshold(budget)).toBe(0.8);
  });

  test("phase_budgets record is set on creation", () => {
    if (!budgetMod) return;
    const budget = budgetMod.createPhaseBudget("part_1_1");
    expect(budget.phase_budgets["part_1_1"]).toBe(15000);
    expect(typeof budget.phase_budgets["part_1_1"]).toBe("number");
  });
});
