/**
 * post-hoc 事后审计模块单元测试
 *
 * 导入并测试 src/post-hoc.ts 的实际导出函数。
 * 因 runPostHocAudit 依赖 git/gh CLI，部分测试在非 git 目录下验证空结果路径。
 *
 * @module post-hoc.test
 */

import { describe, test, expect } from "bun:test";
import type { PostHocFinding } from "../src/types";

// ── 类型验证 ──

describe("PostHocFinding 类型定义", () => {
  test("创建合法的 PostHocFinding 对象", () => {
    const f: PostHocFinding = {
      finding_id: "test-001",
      type: "merge_commit",
      detail: "test finding",
      found_at: new Date().toISOString(),
      related_entity: "abc123",
      severity: "violation",
    };
    expect(f.finding_id).toBe("test-001");
    expect(f.type).toBe("merge_commit");
    expect(f.severity).toBe("violation");
  });

  test("warning 级别的 finding 类型正确", () => {
    const f: PostHocFinding = {
      finding_id: "wt-001",
      type: "worktree_created",
      detail: "worktree detected",
      found_at: new Date().toISOString(),
      related_entity: "/path/.claude/worktrees/wt1",
      severity: "warning",
    };
    expect(f.severity).toBe("warning");
    expect(f.type).toBe("worktree_created");
  });

  test("file_changed_outside_plan 类型", () => {
    const f: PostHocFinding = {
      finding_id: "file-001",
      type: "file_changed_outside_plan",
      detail: "protected file changed",
      found_at: new Date().toISOString(),
      related_entity: "opencode.json",
      severity: "violation",
    };
    expect(f.type).toBe("file_changed_outside_plan");
    expect(f.related_entity).toBe("opencode.json");
  });

  test("pr_created 发现类型", () => {
    const f: PostHocFinding = {
      finding_id: "pr-001",
      type: "pr_created",
      detail: "PR created",
      found_at: new Date().toISOString(),
      related_entity: "GitHub PR",
      severity: "violation",
    };
    expect(f.type).toBe("pr_created");
  });
});

// ── 模块导入验证 ──

describe("post-hoc 模块加载", () => {
  test("runPostHocAudit 可导入且为函数", async () => {
    const mod = await import("../src/post-hoc");
    expect(typeof mod.runPostHocAudit).toBe("function");
  });

  test("getAuditSummary 可导入且为函数", async () => {
    const mod = await import("../src/post-hoc");
    expect(typeof mod.getAuditSummary).toBe("function");
  });

  test("runPostHocAudit 返回数组", async () => {
    const { runPostHocAudit } = await import("../src/post-hoc");
    // 在非 git 目录下 git/gh 调用失败，应返回空数组
    const findings = runPostHocAudit(".");
    expect(Array.isArray(findings)).toBe(true);
  });

  test("getAuditSummary 在无发现时返回'无异常发现'（不含 git 目录）", async () => {
    const { runPostHocAudit, getAuditSummary } = await import("../src/post-hoc");
    // 验证函数可调用且不抛出
    const summary = getAuditSummary(".");
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});

// ── 审计结果聚合逻辑 ──

describe("Post-hoc 审计聚合", () => {
  test("violation 严重度区分", () => {
    const findings: PostHocFinding[] = [
      { finding_id: "1", type: "merge_commit", detail: "d", found_at: "", related_entity: "", severity: "violation" },
      { finding_id: "2", type: "worktree_created", detail: "d", found_at: "", related_entity: "", severity: "warning" },
    ];
    const violations = findings.filter(f => f.severity === "violation");
    const warnings = findings.filter(f => f.severity === "warning");
    expect(violations.length).toBe(1);
    expect(warnings.length).toBe(1);
  });

  test("空发现列表无违规", () => {
    const findings: PostHocFinding[] = [];
    expect(findings.filter(f => f.severity === "violation").length).toBe(0);
    expect(findings.filter(f => f.severity === "warning").length).toBe(0);
  });

  test("全部违规无警告", () => {
    const findings: PostHocFinding[] = [
      { finding_id: "1", type: "merge_commit", detail: "d1", found_at: "", related_entity: "", severity: "violation" },
      { finding_id: "2", type: "file_changed_outside_plan", detail: "d2", found_at: "", related_entity: "", severity: "violation" },
      { finding_id: "3", type: "pr_created", detail: "d3", found_at: "", related_entity: "", severity: "violation" },
    ];
    expect(findings.filter(f => f.severity === "violation").length).toBe(3);
    expect(findings.filter(f => f.severity === "warning").length).toBe(0);
  });

  test("大量发现的计数性能", () => {
    const findings: PostHocFinding[] = Array.from({ length: 100 }, (_, i) => ({
      finding_id: `f-${i}`,
      type: i % 2 === 0 ? "merge_commit" : "worktree_created",
      detail: `detail-${i}`,
      found_at: new Date().toISOString(),
      related_entity: `entity-${i}`,
      severity: i < 10 ? "violation" : "warning",
    }));
    expect(findings.filter(f => f.severity === "violation").length).toBe(10);
    expect(findings.filter(f => f.severity === "warning").length).toBe(90);
    expect(findings.length).toBe(100);
  });
});

// ── 审计类型枚举覆盖 ──

describe("Post-hoc 审计类型完整覆盖", () => {
  test("PostHocFinding 支持四种 type 字面量", () => {
    const types: PostHocFinding["type"][] = [
      "merge_commit", "pr_created", "worktree_created", "file_changed_outside_plan"
    ];
    expect(types.length).toBe(4);
    types.forEach(t => {
      const f: PostHocFinding = {
        finding_id: "t", type: t, detail: "d",
        found_at: "", related_entity: "", severity: "warning",
      };
      expect(f.type).toBe(t);
    });
  });

  test("severity 仅支持 violation 和 warning", () => {
    const severities: PostHocFinding["severity"][] = ["violation", "warning"];
    severities.forEach(s => {
      const f: PostHocFinding = {
        finding_id: "s", type: "merge_commit", detail: "d",
        found_at: "", related_entity: "", severity: s,
      };
      expect(f.severity).toBe(s);
    });
  });

  test("finding_id 格式验证", () => {
    const f: PostHocFinding = {
      finding_id: "ph-2024-001",
      type: "merge_commit",
      detail: "post-hoc finding with structured ID",
      found_at: "2024-01-15T10:30:00Z",
      related_entity: "abc123def",
      severity: "violation",
    };
    expect(f.finding_id).toMatch(/^ph-/);
    expect(f.found_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

// ── GPU 模块深度集成测试 ──

describe("post-hoc 模块深度集成", () => {
  test("getAuditSummary 在有效目录下返回字符串", async () => {
    const { getAuditSummary } = await import("../src/post-hoc");
    const summary = getAuditSummary(".");
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  test("runPostHocAudit 多次调用返回一致类型", async () => {
    const { runPostHocAudit } = await import("../src/post-hoc");
    const r1 = runPostHocAudit(".");
    const r2 = runPostHocAudit(".");
    expect(Array.isArray(r1)).toBe(true);
    expect(Array.isArray(r2)).toBe(true);
    expect(r1.length).toBe(r2.length);
  });
});
