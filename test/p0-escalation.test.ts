/**
 * P0 复发升级模块单元测试 —— 验证 detectAndEscalateP0、detectP0Batch、
 * shouldPauseForP0、getP0HistorySummary 及收敛计数器联动等核心功能。
 *
 * 每个测试使用 tmpdir + state.json fixture 模拟运行时环境，
 * 遵循与 guard.test.ts 一致的 fixture 写入模式。
 *
 * @module p0-escalation.test
 * @license Apache-2.0
 * @copyright 2026 Perry Link
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";
import type { Issue } from "../src/types";

// ── Fixture helpers ──────────────────────────────────────────

let testDir: string;

/**
 * 写入最小可用 state.json fixture。
 *
 * 仅包含 validateState 强制校验字段与 detectAndEscalateP0 所需字段，
 * 保持 fixture 精简以减少跨字段干扰。
 */
function writeFixture(
  dir: string,
  opts: {
    p0_history?: Record<string, unknown>[];
    cycle?: number;
    convergence_counter?: number;
    phase?: string;
  } = {}
): void {
  const state = {
    schema_version: 1,
    progress: {
      phase: opts.phase ?? "part_2_2",
      cycle: opts.cycle ?? 2,
      convergence_counter: opts.convergence_counter ?? 0,
    },
    config: { mode: "auto" },
    issues: { active: { p0: [], p1: [], p2: [] } },
    termination: { status: "active" },
    p0_history: opts.p0_history ?? [],
  };
  mkdirSync(join(dir, ".loop-opencode"), { recursive: true });
  writeFileSync(
    join(dir, ".loop-opencode", "state.json"),
    JSON.stringify(state),
    "utf-8"
  );
}

/**
 * 构造 Issue 对象（默认 P0 严重度）。
 */
function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    issue_id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: "Test P0 issue",
    description: "A test P0 issue description for unit testing",
    severity: "P0",
    source: "manual_inspection",
    affected_files: ["src/test.ts"],
    affected_modules: ["test"],
    status: "open",
    found_in_phase: "part_2_6",
    found_in_cycle: 2,
    found_at: new Date().toISOString(),
    ...overrides,
  };
}

/** 登录 500 错误——基准 P0（首次检测用） */
const authIssueBase: Issue = {
  issue_id: "p0-auth-login-500",
  title: "Login page returns 500 internal server error",
  description:
    "When user attempts to login with valid credentials the server returns HTTP 500 due to unhandled exception in authentication middleware",
  severity: "P0",
  source: "test_failure",
  affected_files: ["src/auth/login.ts", "src/auth/middleware.ts"],
  affected_modules: ["auth", "api"],
  status: "open",
  found_in_phase: "part_2_6",
  found_in_cycle: 2,
  found_at: new Date().toISOString(),
};

/** 与 authIssueBase 高度相似——应触发复发 */
const authIssueRecurrence: Issue = {
  ...authIssueBase,
  issue_id: "p0-auth-login-500-v2",
  title: "Login page still returns 500 internal server error",
  description:
    "When user attempts to login with valid credentials the server continues to return HTTP 500 due to unhandled exception in authentication middleware",
  found_in_cycle: 3,
  found_at: new Date().toISOString(),
};

/** 数据库超时——完全不同的 P0 主题 */
const dbIssue: Issue = {
  issue_id: "p0-db-timeout",
  title: "Database connection pool exhausts under load",
  description:
    "The database connection pool exhausts after 100 concurrent requests causing timeout errors in the data access layer",
  severity: "P0",
  source: "build_error",
  affected_files: ["src/db/pool.ts", "src/data/repo.ts"],
  affected_modules: ["db", "data"],
  status: "open",
  found_in_phase: "part_2_6",
  found_in_cycle: 3,
  found_at: new Date().toISOString(),
};

/** 中文文本 P0——验证中文语义处理（标题仅换词序保证语义一致） */
const chineseIssue: Issue = {
  issue_id: "p0-cn-login",
  title: "登录页面返回500服务器内部错误",
  description:
    "用户使用有效凭据登录时服务器返回HTTP 500内部服务器错误，认证中间件存在未处理异常",
  severity: "P0",
  source: "manual_inspection",
  affected_files: ["src/auth/login.ts"],
  affected_modules: ["auth"],
  status: "open",
  found_in_phase: "part_1_1",
  found_in_cycle: 1,
  found_at: new Date().toISOString(),
};

const chineseIssueSimilar: Issue = {
  ...chineseIssue,
  issue_id: "p0-cn-login-v2",
  found_in_cycle: 2,
  found_at: new Date().toISOString(),
};

// ── 生命周期 ────────────────────────────────────────────────

beforeEach(() => {
  testDir = join(
    os.tmpdir(),
    `p0esc-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* 清理失败不阻塞后续测试 */
  }
});

// ══════════════════════════════════════════════════════════════
// detectAndEscalateP0
// ══════════════════════════════════════════════════════════════

describe("detectAndEscalateP0 — first-time detection", () => {
  test("1. 首次检测 P0 → isRecurrence=false，p0_history 新增 entry，escalation_level=active", async () => {
    writeFixture(testDir);

    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    const result = detectAndEscalateP0(testDir, authIssueBase);

    expect(result.isRecurrence).toBe(false);
    expect(result.recurrenceScore).toBeLessThan(0.6);
    expect(result.recurrenceCount).toBe(0);
    expect(result.matchedSignature).toBeUndefined();

    // 验证 state.json 已更新——p0_history 新增一条记录
    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history.length).toBe(1);

    const entry = state.p0_history[0]!;
    expect(entry.occurrence_count).toBe(1);
    expect(entry.escalation_level).toBe("active");
    expect(entry.signature.affected_modules).toContain("api");
    expect(entry.signature.affected_modules).toContain("auth");
  });

  test("2. 同一 P0 再次检测（第二次）→ isRecurrence=true，occurrence_count=2，escalation_level=paused", async () => {
    writeFixture(testDir);

    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );

    // 第一次检测
    const first = detectAndEscalateP0(testDir, authIssueBase);
    expect(first.isRecurrence).toBe(false);

    // 第二次检测——使用高度相似的 issue
    const second = detectAndEscalateP0(testDir, authIssueRecurrence);
    expect(second.isRecurrence).toBe(true);
    expect(second.recurrenceCount).toBe(2);
    expect(second.matchedSignature).toBeDefined();
    // 相似度评分为合法数值
    expect(second.recurrenceScore).toBeGreaterThanOrEqual(0);
    expect(second.recurrenceScore).toBeLessThanOrEqual(1);

    // escalation 应升级到 paused
    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history.length).toBe(1);
    expect(state.p0_history[0]!.occurrence_count).toBe(2);
    expect(state.p0_history[0]!.escalation_level).toBe("paused");
  });

  test("3. 第三次复发（已 paused）→ isRecurrence=true，occurrence_count=3，escalation_level=failed", async () => {
    // 预构建已 paused 的 p0_history 条目
    const existingSig = {
      description_normalized: "login page still returns 500 internal server error when user attempts to login with valid credentials the server continues to return http 500 due to unhandled exception in authentication middleware",
      root_cause_tag: "未分类",
      affected_modules: ["api", "auth"],
      route_target: "part_1_1",
      first_seen_cycle: 1,
      first_seen_at: new Date().toISOString(),
    };
    writeFixture(testDir, {
      p0_history: [
        {
          p0_id: "p0sig_existing_1",
          signature: existingSig,
          occurrence_count: 2,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 2,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "paused",
        },
      ],
    });

    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    const result = detectAndEscalateP0(testDir, authIssueRecurrence);

    expect(result.isRecurrence).toBe(true);
    expect(result.recurrenceCount).toBe(3);

    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history[0]!.occurrence_count).toBe(3);
    expect(state.p0_history[0]!.escalation_level).toBe("failed");
  });

  test("4. 第四次复发（已 failed）→ 维持 escalation_level=failed", async () => {
    const existingSig = {
      description_normalized: "login page still returns 500 internal server error when user attempts to login with valid credentials the server continues to return http 500 due to unhandled exception in authentication middleware",
      root_cause_tag: "未分类",
      affected_modules: ["api", "auth"],
      route_target: "part_1_1",
      first_seen_cycle: 1,
      first_seen_at: new Date().toISOString(),
    };
    writeFixture(testDir, {
      p0_history: [
        {
          p0_id: "p0sig_existing_2",
          signature: existingSig,
          occurrence_count: 3,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 3,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "failed",
        },
      ],
    });

    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    const result = detectAndEscalateP0(testDir, authIssueRecurrence);

    expect(result.isRecurrence).toBe(true);
    expect(result.recurrenceCount).toBe(4);

    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history[0]!.occurrence_count).toBe(4);
    expect(state.p0_history[0]!.escalation_level).toBe("failed");
  });

  test("5. 不同 P0 主题 → isRecurrence=false，p0_history 新增独立条目", async () => {
    // 先添加一个 auth P0
    writeFixture(testDir);
    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    detectAndEscalateP0(testDir, authIssueBase);

    // 再检测完全不同的 DB P0
    const result = detectAndEscalateP0(testDir, dbIssue);
    expect(result.isRecurrence).toBe(false);
    expect(result.matchedSignature).toBeUndefined();

    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history.length).toBe(2);
    // 两个条目的 escalation_level 均应为 active（互不干扰）
    expect(state.p0_history[0]!.escalation_level).toBe("active");
    expect(state.p0_history[1]!.escalation_level).toBe("active");
  });
});

// ══════════════════════════════════════════════════════════════
// detectP0Batch
// ══════════════════════════════════════════════════════════════

describe("detectP0Batch", () => {
  test("6. 批量检测 3 个 P0 → 返回等长数组，各自独立判定", async () => {
    writeFixture(testDir);
    const { detectP0Batch } = await import("../src/p0-escalation");

    const p0List = [authIssueBase, dbIssue, chineseIssue];
    const results = detectP0Batch(testDir, p0List);

    expect(results).toHaveLength(3);
    // 均应为首次检测（无复发）
    for (const r of results) {
      expect(r.isRecurrence).toBe(false);
    }

    // 验证 p0_history 有 3 条独立记录
    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history.length).toBe(3);
  });

  test("7. 批量检测含复发 → 混合结果", async () => {
    writeFixture(testDir);
    const { detectP0Batch } = await import("../src/p0-escalation");

    // 第一轮——3 个新 P0
    detectP0Batch(testDir, [authIssueBase, dbIssue]);

    // 第二轮——auth 复发 + 另一个新的
    const results = detectP0Batch(testDir, [authIssueRecurrence, makeIssue({
      title: "Memory leak in websocket handler",
      description: "Websocket connections are not properly closed causing gradual memory increase over time",
      affected_modules: ["ws", "net"],
      affected_files: ["src/ws/handler.ts"],
    })]);

    expect(results).toHaveLength(2);
    // 第一个是复发
    expect(results[0]!.isRecurrence).toBe(true);
    expect(results[0]!.recurrenceCount).toBe(2);
    // 第二个是新 P0
    expect(results[1]!.isRecurrence).toBe(false);

    // p0_history 应有 3 条（auth、db、ws）
    const { readState } = await import("../src/state");
    expect(readState(testDir).p0_history.length).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// shouldPauseForP0
// ══════════════════════════════════════════════════════════════

describe("shouldPauseForP0", () => {
  test("8. 存在 paused 级别 P0 → 返回 true", async () => {
    writeFixture(testDir, {
      p0_history: [
        {
          p0_id: "sig_paused",
          signature: {
            description_normalized: "test",
            root_cause_tag: "test",
            affected_modules: [],
            route_target: "part_1_1",
            first_seen_cycle: 1,
            first_seen_at: new Date().toISOString(),
          },
          occurrence_count: 2,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 2,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "paused",
        },
      ],
    });

    const { shouldPauseForP0 } = await import("../src/p0-escalation");
    expect(shouldPauseForP0(testDir)).toBe(true);
  });

  test("9. 存在 failed 级别 P0 → 返回 true", async () => {
    writeFixture(testDir, {
      p0_history: [
        {
          p0_id: "sig_failed",
          signature: {
            description_normalized: "test",
            root_cause_tag: "test",
            affected_modules: [],
            route_target: "part_1_1",
            first_seen_cycle: 1,
            first_seen_at: new Date().toISOString(),
          },
          occurrence_count: 3,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 3,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "failed",
        },
      ],
    });

    const { shouldPauseForP0 } = await import("../src/p0-escalation");
    expect(shouldPauseForP0(testDir)).toBe(true);
  });

  test("10. 全部 P0 为 active → 返回 false", async () => {
    writeFixture(testDir, {
      p0_history: [
        {
          p0_id: "sig_active_1",
          signature: {
            description_normalized: "test one",
            root_cause_tag: "test",
            affected_modules: [],
            route_target: "part_1_1",
            first_seen_cycle: 1,
            first_seen_at: new Date().toISOString(),
          },
          occurrence_count: 1,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 1,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "active",
        },
        {
          p0_id: "sig_active_2",
          signature: {
            description_normalized: "test two",
            root_cause_tag: "test",
            affected_modules: [],
            route_target: "part_1_1",
            first_seen_cycle: 2,
            first_seen_at: new Date().toISOString(),
          },
          occurrence_count: 1,
          first_seen_cycle: 2,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 2,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "active",
        },
      ],
    });

    const { shouldPauseForP0 } = await import("../src/p0-escalation");
    expect(shouldPauseForP0(testDir)).toBe(false);
  });

  test("11. p0_history 为空 → 返回 false", async () => {
    writeFixture(testDir, { p0_history: [] });
    const { shouldPauseForP0 } = await import("../src/p0-escalation");
    expect(shouldPauseForP0(testDir)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// getP0HistorySummary
// ══════════════════════════════════════════════════════════════

describe("getP0HistorySummary", () => {
  test("12. 返回格式正确——包含级别、根因标签、次数、cycle 信息", async () => {
    writeFixture(testDir, {
      p0_history: [
        {
          p0_id: "sig_summary_1",
          signature: {
            description_normalized: "summary test",
            root_cause_tag: "架构设计缺陷",
            affected_modules: ["core"],
            route_target: "part_1_1",
            first_seen_cycle: 1,
            first_seen_at: new Date().toISOString(),
          },
          occurrence_count: 1,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 1,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "active",
        },
      ],
    });

    const { getP0HistorySummary } = await import("../src/p0-escalation");
    const summary = getP0HistorySummary(testDir);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toContain("[active]");
    expect(summary[0]).toContain("架构设计缺陷");
    expect(summary[0]).toContain("1 次");
    expect(summary[0]).toContain("cycle 1");
  });

  test("13. p0_history 为空 → 返回空数组", async () => {
    writeFixture(testDir, { p0_history: [] });
    const { getP0HistorySummary } = await import("../src/p0-escalation");
    expect(getP0HistorySummary(testDir)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// convergence_counter 联动
// ══════════════════════════════════════════════════════════════

describe("convergence_counter 联动", () => {
  test("14. P0 复发时 convergence_counter 重置为 0", async () => {
    // 初始 convergence_counter = 5（模拟已收敛状态）
    writeFixture(testDir, {
      convergence_counter: 5,
      p0_history: [
        {
          p0_id: "sig_conv",
          signature: {
            description_normalized: "login page returns 500 internal server error when user attempts to login with valid credentials the server returns http 500 due to unhandled exception in authentication middleware",
            root_cause_tag: "未分类",
            affected_modules: ["api", "auth"],
            route_target: "part_1_1",
            first_seen_cycle: 1,
            first_seen_at: new Date().toISOString(),
          },
          occurrence_count: 1,
          first_seen_cycle: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_cycle: 1,
          last_seen_at: new Date().toISOString(),
          fix_history: [],
          escalation_level: "active",
        },
      ],
    });

    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    detectAndEscalateP0(testDir, authIssueRecurrence);

    const { readState } = await import("../src/state");
    expect(readState(testDir).progress.convergence_counter).toBe(0);
  });

  test("15. 首次检测（非复发）时 convergence_counter 不受影响", async () => {
    writeFixture(testDir, { convergence_counter: 3 });
    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    detectAndEscalateP0(testDir, authIssueBase);

    const { readState } = await import("../src/state");
    // 非复发不重置 convergence_counter
    expect(readState(testDir).progress.convergence_counter).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════
// 中文文本支持
// ══════════════════════════════════════════════════════════════

describe("中文字符支持", () => {
  test("16. 中文 P0 可正常检测并写入 p0_history", async () => {
    writeFixture(testDir, { cycle: 1 });
    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    const result = detectAndEscalateP0(testDir, chineseIssue);

    expect(result.isRecurrence).toBe(false);

    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history.length).toBe(1);
    expect(state.p0_history[0]!.occurrence_count).toBe(1);
    expect(state.p0_history[0]!.escalation_level).toBe("active");
  });

  test("17. 中文 P0 复发 → isRecurrence=true，正常升级", async () => {
    writeFixture(testDir, { cycle: 1 });
    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );

    // 首次
    detectAndEscalateP0(testDir, chineseIssue);
    // 复发——相似中文描述
    const result = detectAndEscalateP0(testDir, chineseIssueSimilar);

    expect(result.isRecurrence).toBe(true);

    const { readState } = await import("../src/state");
    const state = readState(testDir);
    expect(state.p0_history[0]!.occurrence_count).toBe(2);
    expect(state.p0_history[0]!.escalation_level).toBe("paused");
  });
});

// ══════════════════════════════════════════════════════════════
// 重新导出验证（extractIssueText、buildP0Signature）
// ══════════════════════════════════════════════════════════════

describe("semantic-similarity 重新导出", () => {
  test("18. extractIssueText 拼接 title 与 description", async () => {
    const { extractIssueText } = await import("../src/p0-escalation");
    const issue = makeIssue({
      title: "Title here",
      description: "Description here",
    });
    const text = extractIssueText(issue);
    expect(text).toBe("Title here. Description here");
  });

  test("19. buildP0Signature 构建正确签名，含模块排序与根因标签", async () => {
    const { buildP0Signature } = await import("../src/p0-escalation");
    const issue = makeIssue({
      title: "Build signature test",
      description: "Verifying buildP0Signature output structure",
      affected_modules: ["core", "api"],
      found_in_cycle: 5,
      found_at: "2026-06-01T00:00:00.000Z",
      route_target: "part_2_2",
    });
    const sig = buildP0Signature(issue);

    expect(sig.affected_modules).toEqual(["api", "core"]); // 去重排序
    expect(sig.first_seen_cycle).toBe(5);
    expect(sig.first_seen_at).toBe("2026-06-01T00:00:00.000Z");
    expect(sig.route_target).toBe("part_2_2");
    expect(sig.root_cause_tag).toBeDefined();
    expect(typeof sig.description_normalized).toBe("string");
  });
});

// ══════════════════════════════════════════════════════════════
// 边界情况
// ══════════════════════════════════════════════════════════════

describe("边界情况", () => {
  test("20. 空 p0_history 时 detectAndEscalateP0 正常运行", async () => {
    writeFixture(testDir, { p0_history: [] });
    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );
    const result = detectAndEscalateP0(testDir, authIssueBase);

    expect(result.isRecurrence).toBe(false);
    expect(result.recurrenceCount).toBe(0);

    const { readState } = await import("../src/state");
    expect(readState(testDir).p0_history.length).toBe(1);
  });

  test("21. fix_history 在每次复发时追加修复记录", async () => {
    writeFixture(testDir);
    const { detectAndEscalateP0 } = await import(
      "../src/p0-escalation"
    );

    // 第一次——无修复记录
    detectAndEscalateP0(testDir, authIssueBase);
    // 第二次——复发，应追加 fix_history
    detectAndEscalateP0(testDir, authIssueRecurrence);

    const { readState } = await import("../src/state");
    const entry = readState(testDir).p0_history[0]!;
    expect(entry.fix_history.length).toBe(1);
    expect(entry.fix_history[0]!.cycle).toBe(2);
    expect(entry.fix_history[0]!.fix_description).toContain(
      authIssueRecurrence.title
    );
  });
});
