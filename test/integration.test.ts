/**
 * 集成测试 —— 跨模块协作验证
 *
 * 导入并测试 src/ 下核心模块：types, state, lock, bubble, post-hoc
 * 验证模块间接口一致性和状态机行为正确性。
 *
 * @module integration.test
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";
import {
  PHASE_ENUM, PART1_PHASES, PART2_PHASES, TERMINAL_PHASES,
  PHASE_BUDGET_PRESETS, CAPABILITIES,
} from "../src/types";
import type { PhaseEnum, LoopState, Issue, RoutingEntry, PostHocFinding, LockFileContent } from "../src/types";

let testDir: string;

function baseState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    progress: { phase: "init", cycle: 1, convergence_counter: 0, part1_round: 0, verification_pass_count: 0, repair_context: null, budget: { phase_budget: 10000, phase_budget_consumed: 0, phase_budget_warning_issued: false, phase_budget_exhausted: false, phase_budget_exhaustion_count: 0, cycle_total_budget: 100000, cycle_total_consumed: 0, estimated_tokens_this_session: 0, context_usage_pct: 0, budget_overrun_action: "warn" }, bubble_state: { bubble_id: "", split_index: 0, max_splits: 3, sub_phase_progress: { part_1_1: 0, part_1_2: 0, part_1_3: 0 }, checkpoint_file: null, degraded: false, degraded_reason: null, assumptions_count: 0, quality_signals: { semantic_repetition_count: 0, contradiction_count: 0 } }, phase_transitions: [], retry_count_this_phase: 0 },
    config: { mode: "auto", tdd: false, skip_testing: false, max_cycles: 5, max_part1_rounds: 10, convergence_rounds: 2, route_repeat_max: 3, part1_timeout_minutes: 30, pending_confirmation_timeout_minutes: 30, user_request: "integration test", auto_mode: true, impl_engine: "direct", version: "0.1.0" },
    issues: { active: { p0: [], p1: [], p2: [] }, all_time: { p0_total: 0, p1_total: 0, p2_total: 0 } },
    routing_history: [], p0_history: [], phase_contracts: {}, pending_confirmation: null,
    watchdog: { pid: null, running: false, last_heartbeat_at: null, last_marker_at: null, alerts: [], started_at: null },
    termination: { status: "active", exit_reason: null, completed_at: null, paused_at: null, failed_at: null },
    artifacts: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  testDir = join(os.tmpdir(), `integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  mkdirSync(join(testDir, ".loop-opencode"), { recursive: true });
  mkdirSync(join(testDir, ".loop-opencode", "artifacts"), { recursive: true });
});

afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ } });

// ── types.ts: Phase 枚举体系 ──

describe("types.ts — Phase 枚举体系", () => {
  test("PHASE_ENUM 包含 17 个 phase", () => {
    const values = Object.values(PHASE_ENUM);
    expect(values.length).toBe(17);
    expect(PHASE_ENUM.INIT).toBe("init");
    expect(PHASE_ENUM.COMPLETE).toBe("complete");
    expect(PHASE_ENUM.FAILED).toBe("failed");
  });

  test("PART1_PHASES 包含三个子 phase", () => {
    expect(PART1_PHASES).toContain("part_1_1");
    expect(PART1_PHASES).toContain("part_1_2");
    expect(PART1_PHASES).toContain("part_1_3");
    expect(PART1_PHASES.length).toBe(3);
  });

  test("PART2_PHASES 包含 8 个子 phase", () => {
    expect(PART2_PHASES.length).toBe(8);
    expect(PART2_PHASES).toContain("part_2_1");
    expect(PART2_PHASES).toContain("part_2_8");
  });

  test("TERMINAL_PHASES 包含 3 个终态", () => {
    expect(TERMINAL_PHASES.length).toBe(3);
    expect(TERMINAL_PHASES).toContain("complete");
  });

  test("PHASE_BUDGET_PRESETS 为各 phase 定义了预算", () => {
    expect(PHASE_BUDGET_PRESETS["part_1_1"]).toBe(15000);
    expect(PHASE_BUDGET_PRESETS["part_2_2"]).toBe(25000);
    expect(PHASE_BUDGET_PRESETS["part_2_8"]).toBe(8000);
  });

  test("CAPABILITIES 包含 17 个能力代号", () => {
    const values = Object.values(CAPABILITIES);
    expect(values.length).toBe(17);
    expect(CAPABILITIES.CAP_BRAINSTORM).toBe("cap_brainstorm");
    expect(CAPABILITIES.CAP_IMPLEMENT).toBe("cap_implement");
    expect(CAPABILITIES.CAP_TERMINATE).toBe("cap_terminate");
  });
});

// ── state.ts: 状态读写 ──

describe("state.ts — 状态读写与校验", () => {
  test("readState 读取有效 state.json", async () => {
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(baseState(), null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.schema_version).toBe(1);
    expect(state.progress.phase).toBe("init");
    expect(state.config.mode).toBe("auto");
  });

  test("writeState + readState 往返一致", async () => {
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(baseState(), null, 2), "utf-8");
    const { readState, writeState } = await import("../src/state");
    const state = readState(testDir);
    state.progress.cycle = 5;
    state.config.user_request = "往返测试";
    writeState(testDir, state);
    const reloaded = readState(testDir);
    expect(reloaded.progress.cycle).toBe(5);
    expect(reloaded.config.user_request).toBe("往返测试");
  });

  test("initState 创建新状态文件", async () => {
    const { initState } = await import("../src/state");
    const s = initState(testDir, "集成测试需求");
    expect(s.config.user_request).toBe("集成测试需求");
    expect(s.progress.phase).toBe("init");
    expect(existsSync(join(testDir, ".loop-opencode", "state.json"))).toBe(true);
  });

  test("readState 缺失文件应抛出", async () => {
    const { readState } = await import("../src/state");
    expect(() => readState(testDir)).toThrow();
  });
});

// ── lock.ts: 并发锁协议 ──

describe("lock.ts — 并发锁协议", () => {
  test("tryAcquireLock 获取锁成功", async () => {
    const { tryAcquireLock } = await import("../src/lock");
    const handle = tryAcquireLock(testDir, ".loop-opencode/.test_lock", "main", 60000);
    expect(handle).not.toBeNull();
    expect(handle!.path).toContain(".test_lock");
    expect(handle!.acquiredAt).toBeDefined();
    // 清理
    const { releaseLock } = await import("../src/lock");
    releaseLock(handle!);
  });

  test("tryAcquireLock 重复获取返回 null", async () => {
    const { tryAcquireLock, releaseLock } = await import("../src/lock");
    const handle1 = tryAcquireLock(testDir, ".loop-opencode/.test_lock2", "main", 60000);
    expect(handle1).not.toBeNull();
    const handle2 = tryAcquireLock(testDir, ".loop-opencode/.test_lock2", "main", 60000);
    expect(handle2).toBeNull();
    releaseLock(handle1!);
  });

  test("checkLock 查询锁状态", async () => {
    const { tryAcquireLock, checkLock, releaseLock } = await import("../src/lock");
    const handle = tryAcquireLock(testDir, ".loop-opencode/.test_lock3", "main", 60000);
    expect(handle).not.toBeNull();
    const content = checkLock(testDir, ".loop-opencode/.test_lock3");
    expect(content).not.toBeNull();
    expect(content!.role).toBe("main");
    releaseLock(handle!);
    expect(checkLock(testDir, ".loop-opencode/.test_lock3")).toBeNull();
  });

  test("cleanupLocks 清理当前进程锁", async () => {
    const { tryAcquireLock, checkLock, cleanupLocks } = await import("../src/lock");
    tryAcquireLock(testDir, ".loop-opencode/.lock", "main", 60000);
    tryAcquireLock(testDir, ".loop-opencode/.gate_lock", "main", 60000);
    cleanupLocks(testDir);
    expect(checkLock(testDir, ".loop-opencode/.lock")).toBeNull();
    expect(checkLock(testDir, ".loop-opencode/.gate_lock")).toBeNull();
  });
});

// ── 跨模块：state + types 联合验证 ──

describe("跨模块：state 写入 + types 读取", () => {
  test("写入包含 P0 issue 的 state 并验证 round-trip", async () => {
    const issue: Issue = {
      issue_id: "int-p0-001",
      title: "集成测试 P0 问题",
      description: "跨模块测试发现的严重问题",
      severity: "P0",
      source: "code_review",
      affected_files: ["src/test.ts"],
      affected_modules: ["src"],
      status: "open",
      found_in_phase: "part_2_3" as PhaseEnum,
      found_in_cycle: 2,
      found_at: new Date().toISOString(),
    };
    const st = baseState();
    (st.issues as Record<string, unknown>).active = { p0: [issue], p1: [], p2: [] };
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.issues.active.p0.length).toBe(1);
    expect(loaded.issues.active.p0[0]!.issue_id).toBe("int-p0-001");
    expect(loaded.issues.active.p0[0]!.severity).toBe("P0");
  });
});

// ── 跨模块：P1/P2 综合 Round-trip ──

describe("跨模块：多严重度 issue 综合 Round-trip", () => {
  test("写入 P1 issue 并验证 round-trip", async () => {
    const issue: import("../src/types").Issue = {
      issue_id: "int-p1-001",
      title: "集成测试 P1 问题",
      description: "跨模块测试发现的设计级问题",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/module.ts"],
      affected_modules: ["src"],
      status: "open",
      found_in_phase: "part_2_2" as import("../src/types").PhaseEnum,
      found_in_cycle: 3,
      found_at: new Date().toISOString(),
      p1_classification: "design_level",
    };
    const st = baseState();
    (st.issues as Record<string, unknown>).active = { p0: [], p1: [issue], p2: [] };
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.issues.active.p1.length).toBe(1);
    expect(loaded.issues.active.p1[0]!.issue_id).toBe("int-p1-001");
    expect(loaded.issues.active.p1[0]!.p1_classification).toBe("design_level");
  });

  test("写入 P2 issue 并验证 round-trip", async () => {
    const issue: import("../src/types").Issue = {
      issue_id: "int-p2-001",
      title: "边界问题",
      description: "轻微边界条件遗漏",
      severity: "P2",
      source: "lint_warning",
      affected_files: ["src/edge.ts"],
      affected_modules: ["src"],
      status: "open",
      found_in_phase: "part_2_3" as import("../src/types").PhaseEnum,
      found_in_cycle: 4,
      found_at: new Date().toISOString(),
    };
    const st = baseState();
    (st.issues as Record<string, unknown>).active = { p0: [], p1: [], p2: [issue] };
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.issues.active.p2.length).toBe(1);
    expect(loaded.issues.active.p2[0]!.severity).toBe("P2");
  });

  test("同时写入 P0/P1/P2 三种严重度", async () => {
    const p0 = makeIssue("p0", "P0");
    const p1 = makeIssue("p1", "P1");
    const p2 = makeIssue("p2", "P2");
    const st = baseState();
    (st.issues as Record<string, unknown>).active = { p0: [p0], p1: [p1], p2: [p2] };
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.issues.active.p0.length).toBe(1);
    expect(loaded.issues.active.p1.length).toBe(1);
    expect(loaded.issues.active.p2.length).toBe(1);
  });

  test("issue 包含 route_target 字段", async () => {
    const issue = { ...makeIssue("rt", "P1"), route_target: "part_1_3", p1_classification: "design_level" };
    const st = baseState();
    (st.issues as Record<string, unknown>).active = { p0: [], p1: [issue], p2: [] };
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.issues.active.p1[0]!).toHaveProperty("route_target");
  });
});

// ── 跨模块：phase_contracts 合约 Round-trip ──

describe("跨模块：phase_contracts 合约管理", () => {
  test("写入 phase_contracts 并验证", async () => {
    const st = baseState();
    st.phase_contracts = {
      part_1_1: { completed: true, completed_at: new Date().toISOString(), retry_count: 0 },
      part_2_7: { completed: true, completed_at: new Date().toISOString(), retry_count: 1 },
    };
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.phase_contracts["part_1_1"]?.completed).toBe(true);
    expect(loaded.phase_contracts["part_2_7"]?.completed).toBe(true);
    expect(loaded.phase_contracts["part_2_7"]?.retry_count).toBe(1);
  });

  test("空 phase_contracts 初始化正确", async () => {
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(baseState(), null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.phase_contracts).toBeDefined();
    expect(typeof loaded.phase_contracts).toBe("object");
  });
});

// ── 跨模块：终止状态转换 ──

describe("跨模块：termination 状态转换", () => {
  test("active → complete 转换正确", async () => {
    const st = baseState({ termination: { status: "complete", exit_reason: "convergence_reached", completed_at: new Date().toISOString(), paused_at: null, failed_at: null } });
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.termination.status).toBe("complete");
    expect(loaded.termination.exit_reason).toBe("convergence_reached");
  });

  test("active → failed 转换正确", async () => {
    const st = baseState({ termination: { status: "failed", exit_reason: "budget_exhausted", completed_at: null, paused_at: null, failed_at: new Date().toISOString() } });
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.termination.status).toBe("failed");
  });

  test("active → paused 转换正确", async () => {
    const st = baseState({ termination: { status: "paused", exit_reason: "user_interrupt", completed_at: null, paused_at: new Date().toISOString(), failed_at: null } });
    writeFileSync(join(testDir, ".loop-opencode", "state.json"), JSON.stringify(st, null, 2), "utf-8");
    const { readState } = await import("../src/state");
    const loaded = readState(testDir);
    expect(loaded.termination.status).toBe("paused");
  });
});

/**
 * 创建最小 Issue 对象的工厂函数
 */
function makeIssue(id: string, severity: "P0" | "P1" | "P2"): Record<string, unknown> {
  return {
    issue_id: `int-${id}-001`,
    title: `${id} test issue`,
    description: `test ${severity} issue`,
    severity,
    source: "code_review",
    affected_files: ["src/test.ts"],
    affected_modules: ["src"],
    status: "open",
    found_in_phase: "part_2_3",
    found_in_cycle: 1,
    found_at: new Date().toISOString(),
  };
}
