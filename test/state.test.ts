/**
 * state.json 单元测试
 *
 * 测试覆盖：
 * - 读取正常 state.json
 * - 原子写入四步法验证
 * - Schema 校验（必需字段 / 类型检查）
 * - .bak 自动恢复
 * - 损坏文件处理
 * - 并发写入冲突
 *
 * @module state.test
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";

// 待测试模块（M1 阶段——验证模块加载与接口完整性）
// 注意：M1 测试验证 state.ts 的导出接口与逻辑正确性

/** 测试用临时目录 */
let testDir: string;

beforeEach(() => {
  testDir = join(os.tmpdir(), `loop-opencode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  // 创建 .loop-opencode/ 目录
  mkdirSync(join(testDir, ".loop-opencode"), { recursive: true });
  mkdirSync(join(testDir, ".loop-opencode", "artifacts"), { recursive: true });
});

afterEach(() => {
  // 清理测试目录
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
});

/**
 * 创建最小可用的 state.json 测试文件
 */
function createTestStateFile(dir: string, overrides: Record<string, unknown> = {}): void {
  const state = {
    schema_version: 1,
    progress: {
      phase: "init",
      cycle: 1,
      convergence_counter: 0,
      part1_round: 0,
      verification_pass_count: 0,
      repair_context: null,
      budget: {
        phase_budget: 10000,
        phase_budget_consumed: 0,
        phase_budget_warning_issued: false,
        phase_budget_exhausted: false,
        phase_budget_exhaustion_count: 0,
        cycle_total_budget: 100000,
        cycle_total_consumed: 0,
        estimated_tokens_this_session: 0,
        context_usage_pct: 0,
        budget_overrun_action: "warn",
      },
      bubble_state: {
        bubble_id: "",
        split_index: 0,
        max_splits: 3,
        sub_phase_progress: { part_1_1: 0, part_1_2: 0, part_1_3: 0 },
        checkpoint_file: null,
        degraded: false,
        degraded_reason: null,
        assumptions_count: 0,
        quality_signals: { semantic_repetition_count: 0, contradiction_count: 0 },
      },
      phase_transitions: [],
      retry_count_this_phase: 0,
    },
    config: {
      mode: "auto",
      tdd: false,
      skip_testing: false,
      max_cycles: 5,
      max_part1_rounds: 10,
      convergence_rounds: 2,
      route_repeat_max: 3,
      part1_timeout_minutes: 30,
      pending_confirmation_timeout_minutes: 30,
      user_request: "test request",
      auto_mode: true,
      impl_engine: "direct",
      version: "0.1.0",
    },
    issues: {
      active: { p0: [], p1: [], p2: [] },
      all_time: { p0_total: 0, p1_total: 0, p2_total: 0 },
    },
    routing_history: [],
    p0_history: [],
    phase_contracts: {},
    pending_confirmation: null,
    watchdog: {
      pid: null,
      running: false,
      last_heartbeat_at: null,
      last_marker_at: null,
      alerts: [],
      started_at: null,
    },
    termination: {
      status: "active",
      exit_reason: null,
      completed_at: null,
      paused_at: null,
      failed_at: null,
    },
    artifacts: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  writeFileSync(
    join(dir, ".loop-opencode", "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

// ============================================================
// 测试套件
// ============================================================

describe("state.json 读写", () => {
  test("读取有效的 state.json", async () => {
    createTestStateFile(testDir);

    // 动态导入待测模块
    const { readState } = await import("../src/state");
    const state = readState(testDir);

    expect(state.schema_version).toBe(1);
    expect(state.progress.phase).toBe("init");
    expect(state.progress.cycle).toBe(1);
    expect(state.config.mode).toBe("auto");
    expect(state.termination.status).toBe("active");
  });

  test("读取不存在的 state.json 应抛出", async () => {
    const { readState } = await import("../src/state");

    // 删除 state.json
    const statePath = join(testDir, ".loop-opencode", "state.json");
    if (existsSync(statePath)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(statePath);
    }

    expect(() => readState(testDir)).toThrow();
  });

  test("state.json 不存在但 .bak 存在时应恢复", async () => {
    // 创建 .bak 但不创建主文件
    const state = {
      schema_version: 1,
      progress: {
        phase: "part_1_1",
        cycle: 2,
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
        phase_transitions: [],
        retry_count_this_phase: 0,
      },
      config: {
        mode: "safe", tdd: false, skip_testing: false, max_cycles: 5,
        max_part1_rounds: 10, convergence_rounds: 2, route_repeat_max: 3,
        part1_timeout_minutes: 30, pending_confirmation_timeout_minutes: 30,
        user_request: "from backup", auto_mode: false, impl_engine: "direct",
        version: "0.1.0",
      },
      issues: {
        active: { p0: [], p1: [], p2: [] },
        all_time: { p0_total: 0, p1_total: 0, p2_total: 0 },
      },
      routing_history: [],
      p0_history: [],
      phase_contracts: {},
      pending_confirmation: null,
      watchdog: {
        pid: null, running: false, last_heartbeat_at: null,
        last_marker_at: null, alerts: [], started_at: null,
      },
      termination: {
        status: "active", exit_reason: null, completed_at: null,
        paused_at: null, failed_at: null,
      },
      artifacts: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    writeFileSync(
      join(testDir, ".loop-opencode", "state.json.bak"),
      JSON.stringify(state, null, 2),
      "utf-8",
    );

    const { readState } = await import("../src/state");
    const restored = readState(testDir);

    expect(restored.config.user_request).toBe("from backup");
    expect(restored.config.mode).toBe("safe");
    expect(restored.progress.cycle).toBe(2);

    // 应已回写到主文件
    expect(existsSync(join(testDir, ".loop-opencode", "state.json"))).toBe(true);
  });

  test("原子写入：写入后文件内容完整一致", async () => {
    createTestStateFile(testDir);
    const { readState, writeState } = await import("../src/state");

    // 读取
    const state = readState(testDir);

    // 修改
    state.progress.phase = "part_2_1";
    state.progress.cycle = 3;
    state.issues.active.p0.push({
      issue_id: "test-001",
      title: "test issue",
      description: "test",
      severity: "P0",
      source: "code_review",
      affected_files: ["src/test.ts"],
      affected_modules: ["src"],
      status: "open",
      found_in_phase: "part_2_1",
      found_in_cycle: 3,
      found_at: new Date().toISOString(),
    });

    // 写入
    writeState(testDir, state);

    // 重新读取验证
    const reloaded = readState(testDir);
    expect(reloaded.progress.phase).toBe("part_2_1");
    expect(reloaded.progress.cycle).toBe(3);
    expect(reloaded.issues.active.p0).toHaveLength(1);
    expect(reloaded.issues.active.p0[0]!.issue_id).toBe("test-001");

    // .bak 应已创建
    expect(existsSync(join(testDir, ".loop-opencode", "state.json.bak"))).toBe(true);
  });

  test("Schema 校验：缺少必需字段应抛出", async () => {
    const { readState } = await import("../src/state");

    // 先创建有效文件
    createTestStateFile(testDir);
    const state = readState(testDir);

    // 删除必需字段
    const invalid = { ...state } as Record<string, unknown>;
    delete invalid["progress"];

    expect(() => {
      // writeState 内部调用 validateState
      // 通过直接写入无效 JSON 再读取来测试校验
      writeFileSync(
        join(testDir, ".loop-opencode", "state.json"),
        JSON.stringify(invalid),
        "utf-8",
      );
      readState(testDir);
    }).toThrow();
  });

  test("Schema 校验：progress.phase 类型错误应抛出", async () => {
    createTestStateFile(testDir, {
      progress: {
        phase: 123, // 应为 string
        cycle: 1,
      },
    });

    const { readState } = await import("../src/state");
    expect(() => readState(testDir)).toThrow();
  });

  test("损坏的 state.json（无效 JSON）应触发恢复", async () => {
    // 创建有效的 .bak
    createTestStateFile(testDir);
    const bakPath = join(testDir, ".loop-opencode", "state.json.bak");
    writeFileSync(bakPath, readFileSync(join(testDir, ".loop-opencode", "state.json")), "utf-8");

    // 损坏主文件
    writeFileSync(
      join(testDir, ".loop-opencode", "state.json"),
      "this is not valid json {{{",
      "utf-8",
    );

    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.schema_version).toBe(1); // 应从 .bak 恢复
  });

  test("并发写入——多次写入后数据保持一致", async () => {
    createTestStateFile(testDir);
    const { readState, writeState } = await import("../src/state");

    // 模拟多次写入
    for (let i = 0; i < 5; i++) {
      const state = readState(testDir);
      state.progress.cycle = i + 1;
      state.config.user_request = `request-${i}`;
      writeState(testDir, state);
    }

    const final = readState(testDir);
    expect(final.progress.cycle).toBe(5);
    expect(final.config.user_request).toBe("request-4");
  });
});

describe("state.json 初始化", () => {
  test("initState 创建新的 state.json", async () => {
    const { initState } = await import("../src/state");

    const state = initState(testDir, "测试需求");

    expect(state.config.user_request).toBe("测试需求");
    expect(state.progress.phase).toBe("init");
    expect(state.schema_version).toBe(1);
    expect(existsSync(join(testDir, ".loop-opencode", "state.json"))).toBe(true);
  });

  test("initState 不强制覆盖时已存在文件应抛出", async () => {
    createTestStateFile(testDir);
    const { initState } = await import("../src/state");

    expect(() => initState(testDir, "new request", {}, false)).toThrow();
  });

  test("initState 强制覆盖时成功", async () => {
    createTestStateFile(testDir);
    const { initState } = await import("../src/state");

    const state = initState(testDir, "强制覆盖", {}, true);

    expect(state.config.user_request).toBe("强制覆盖");
    expect(state.progress.phase).toBe("init");
  });
});
