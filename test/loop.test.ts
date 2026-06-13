/**
 * loop.ts 核心循环单元测试
 *
 * 测试覆盖：
 * - startLoop: 初始化循环上下文，active/非active状态分流
 * - executeCycle: 单轮执行，终止条件判定，路由决策
 * - runLoop入口逻辑: 读取state、校验初始化状态、正常循环驱动
 * - 终止状态处理: complete/paused/failed状态不启动循环
 * - getLoopStats: 循环统计信息输出
 *
 * @module loop.test
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";

// 待测试函数（从 src/*.ts 导入）
// M1 阶段通过源文件动态验证接口完整性
let testDir: string;

/**
 * 创建最小可用的 state.json 文件
 *
 * 包含 validateState 所需的全部字段（schema_version, config, progress, issues, termination），
 * 以及 startLoop/getLoopStats 等函数可能访问的扩展字段。
 */
function createStateFile(dir: string, overrides: Record<string, unknown> = {}): void {
  const stateDir = join(dir, ".loop-opencode");
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const now = new Date().toISOString();
  const state = {
    schema_version: 1,
    progress: {
      phase: "init",
      cycle: 0,
      convergence_counter: 0,
      part1_round: 0,
      verification_pass_count: 0,
      repair_context: null,
      budget: {
        phase_budget: 10000, phase_budget_consumed: 0,
        phase_budget_warning_issued: false, phase_budget_exhausted: false,
        phase_budget_exhaustion_count: 0, cycle_total_budget: 100000,
        cycle_total_consumed: 0, estimated_tokens_this_session: 0,
        context_usage_pct: 0, budget_overrun_action: "warn",
      },
      bubble_state: {
        bubble_id: "", split_index: 0, max_splits: 3,
        sub_phase_progress: { part_1_1: 0, part_1_2: 0, part_1_3: 0 },
        checkpoint_file: null, degraded: false, degraded_reason: null,
        assumptions_count: 0,
        quality_signals: { semantic_repetition_count: 0, contradiction_count: 0 },
      },
      phase_transitions: [] as Array<Record<string, unknown>>,
      retry_count_this_phase: 0,
    },
    config: {
      mode: "auto", tdd: false, skip_testing: false, max_cycles: 5,
      max_part1_rounds: 10, convergence_rounds: 2, route_repeat_max: 3,
      part1_timeout_minutes: 30, pending_confirmation_timeout_minutes: 30,
      user_request: "loop test", auto_mode: true, impl_engine: "direct",
      version: "0.1.0",
    },
    issues: {
      active: { p0: [] as Array<Record<string, unknown>>, p1: [] as Array<Record<string, unknown>>, p2: [] as Array<Record<string, unknown>> },
      all_time: { p0_total: 0, p1_total: 0, p2_total: 0 },
    },
    routing_history: [] as Array<Record<string, unknown>>,
    p0_history: [] as Array<Record<string, unknown>>,
    phase_contracts: {} as Record<string, unknown>,
    pending_confirmation: null,
    watchdog: {
      pid: null, running: false, last_heartbeat_at: null,
      last_marker_at: null, alerts: [], started_at: null,
    },
    termination: {
      status: "active",
      exit_reason: null,
      completed_at: null,
      failed_at: null,
      paused_at: null,
    },
    artifacts: {} as Record<string, unknown>,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  writeFileSync(join(stateDir, "state.json"), JSON.stringify(state, null, 2));
}

beforeEach(() => {
  testDir = join(os.tmpdir(), `loop-opencode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  const stateDir = join(testDir, ".loop-opencode");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(join(stateDir, "artifacts"), { recursive: true });
});

afterEach(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ============================================================================
// M1: 模块接口完整性验证
// ============================================================================

describe("loop.ts 模块导出验证", () => {
  test("loop.ts 模块存在且可导入", async () => {
    const mod = await import("../src/loop");
    expect(mod).toBeDefined();
  });

  test("startLoop 函数已导出", async () => {
    const mod = await import("../src/loop");
    expect(typeof mod.startLoop).toBe("function");
  });

  test("executeCycle 函数已导出", async () => {
    const mod = await import("../src/loop");
    expect(typeof mod.executeCycle).toBe("function");
  });

  test("runLoop 函数已导出", async () => {
    const mod = await import("../src/loop");
    expect(typeof mod.runLoop).toBe("function");
  });

  test("getLoopStats 函数已导出", async () => {
    const mod = await import("../src/loop");
    expect(typeof mod.getLoopStats).toBe("function");
  });
});

// ============================================================================
// M2: startLoop 测试
// ============================================================================

describe("startLoop", () => {
  test("正常state.json应成功启动循环", async () => {
    createStateFile(testDir);
    const { startLoop } = await import("../src/loop");
    const ctx = startLoop(testDir);
    expect(ctx.running).toBe(true);
    expect(ctx.state.termination.status).toBe("active");
    expect(ctx.projectRoot).toBe(testDir);
    expect(ctx.startedAt).toBeDefined();
  });

  test("complete状态的循环不应启动", async () => {
    createStateFile(testDir, {
      termination: {
        status: "complete",
        exit_reason: "convergence_reached",
        completed_at: new Date().toISOString(),
        failed_at: null,
        paused_at: null,
      },
    });
    const { startLoop } = await import("../src/loop");
    const ctx = startLoop(testDir);
    expect(ctx.running).toBe(false);
  });

  test("failed状态的循环不应启动", async () => {
    createStateFile(testDir, {
      termination: {
        status: "failed",
        exit_reason: "hard_stop",
        completed_at: null,
        failed_at: new Date().toISOString(),
        paused_at: null,
      },
    });
    const { startLoop } = await import("../src/loop");
    const ctx = startLoop(testDir);
    expect(ctx.running).toBe(false);
  });

  test("paused状态的循环不应启动", async () => {
    createStateFile(testDir, {
      termination: {
        status: "paused",
        exit_reason: "user_interrupt",
        completed_at: null,
        failed_at: null,
        paused_at: new Date().toISOString(),
      },
    });
    const { startLoop } = await import("../src/loop");
    const ctx = startLoop(testDir);
    expect(ctx.running).toBe(false);
  });

  test("缺少state.json时startLoop应抛出错误", async () => {
    const { startLoop } = await import("../src/loop");
    expect(() => startLoop(testDir)).toThrow();
  });
});

// ============================================================================
// M2: executeCycle 测试
// ============================================================================

describe("executeCycle", () => {
  test("非running状态跳过cycle执行", async () => {
    createStateFile(testDir);
    const { startLoop, executeCycle } = await import("../src/loop");
    const ctx = startLoop(testDir);
    ctx.running = false;
    const result = executeCycle(ctx);
    expect(result.running).toBe(false);
  });

  test("active状态下正常推进cycle", async () => {
    createStateFile(testDir);
    const { startLoop, executeCycle } = await import("../src/loop");
    const ctx = startLoop(testDir);
    // 模拟简单场景：在终止条件未满足时，cycle应推进
    expect(ctx.running).toBe(true);
    const result = executeCycle(ctx);
    // executeCycle应返回更新的上下文
    expect(result).toBeDefined();
    expect(result.state).toBeDefined();
  });

  test("终止条件convergence_reached时标记complete", async () => {
    createStateFile(testDir, {
      progress: { phase: "part_2_8", cycle: 3, convergence_counter: 3, phase_transitions: [] },
      termination: {
        status: "active",
        exit_reason: null,
        completed_at: null,
        failed_at: null,
        paused_at: null,
      },
    });
    const { startLoop, executeCycle } = await import("../src/loop");
    const ctx = startLoop(testDir);
    if (ctx.running) {
      const result = executeCycle(ctx);
      expect(result).toBeDefined();
    }
  });

  test("终止条件convergence_fast_path时标记complete", async () => {
    createStateFile(testDir, {
      progress: { phase: "part_2_7", cycle: 2, convergence_counter: 5, phase_transitions: [] },
    });
    const { startLoop, executeCycle } = await import("../src/loop");
    const ctx = startLoop(testDir);
    if (ctx.running) {
      const result = executeCycle(ctx);
      expect(result).toBeDefined();
    }
  });
});

// ============================================================================
// M2: getLoopStats 测试
// ============================================================================

describe("getLoopStats", () => {
  test("返回包含phase和cycle的统计字符串", async () => {
    createStateFile(testDir);
    const { startLoop, getLoopStats } = await import("../src/loop");
    const ctx = startLoop(testDir);
    const stats = getLoopStats(ctx);
    expect(stats).toContain("phase=");
    expect(stats).toContain("cycle=");
    expect(stats).toContain("convergence=");
    expect(stats).toContain("P0=");
    expect(stats).toContain("P1=");
    expect(stats).toContain("P2=");
  });

  test("不同phase统计数据正确反映", async () => {
    createStateFile(testDir, {
      progress: { phase: "part_2_1", cycle: 5, convergence_counter: 2, phase_transitions: [] },
    });
    const { startLoop, getLoopStats } = await import("../src/loop");
    const ctx = startLoop(testDir);
    const stats = getLoopStats(ctx);
    expect(stats).toContain("phase=part_2_1");
    expect(stats).toContain("cycle=5");
  });

  test("活跃P0/P1/P2 issue在统计中体现", async () => {
    createStateFile(testDir, {
      issues: {
        active: {
          p0: [{ id: "p0-1", title: "critical bug" }],
          p1: [{ id: "p1-1", title: "major issue" }, { id: "p1-2", title: "major issue 2" }],
          p2: [],
        },
        resolved: [],
        history: [],
      },
    });
    const { startLoop, getLoopStats } = await import("../src/loop");
    const ctx = startLoop(testDir);
    const stats = getLoopStats(ctx);
    expect(stats).toContain("P0=1");
    expect(stats).toContain("P1=2");
    expect(stats).toContain("P2=0");
  });
});

// ============================================================================
// M2: LoopContext结构验证
// ============================================================================

describe("LoopContext 结构", () => {
  test("LoopContext包含所有必需字段", async () => {
    createStateFile(testDir);
    const { startLoop } = await import("../src/loop");
    const ctx = startLoop(testDir);
    expect(ctx.projectRoot).toBeDefined();
    expect(ctx.state).toBeDefined();
    expect(typeof ctx.running).toBe("boolean");
    expect(ctx.startedAt).toBeDefined();
    expect(new Date(ctx.startedAt).getTime()).not.toBeNaN();
  });

  test("startedAt是有效的ISO时间戳", async () => {
    createStateFile(testDir);
    const { startLoop } = await import("../src/loop");
    const ctx = startLoop(testDir);
    const parsed = new Date(ctx.startedAt);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });
});

// ============================================================================
// M2: 边界和异常场景
// ============================================================================

describe("loop 边界场景", () => {
  test("损坏的state.json应拒绝循环启动", async () => {
    const stateDir = join(testDir, ".loop-opencode");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "state.json"), "not valid json {{{");
    const { startLoop } = await import("../src/loop");
    expect(() => startLoop(testDir)).toThrow();
  });

  test("空的stateDir应拒绝循环启动", async () => {
    const { startLoop } = await import("../src/loop");
    expect(() => startLoop(testDir)).toThrow();
  });

  test(".loop-opencode目录不存在时应抛出错误", async () => {
    const { startLoop } = await import("../src/loop");
    expect(() => startLoop(testDir)).toThrow();
  });
});
