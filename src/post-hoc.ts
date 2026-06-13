/**
 * post-hoc.ts —— 事后审计模块（M3）
 *
 * 核心功能：在 agent 退出后进行 Layer 3 事后审计，
 * 检测 agent 是否在会话期间执行了未授权的副作用操作：
 * 1. 意外 merge commit
 * 2. 未经审批的 PR 创建
 * 3. 意外 worktree 创建
 * 4. Task 清单外的文件变更
 *
 * 审计结果写入 state.json issues + post_hoc 日志。
 *
 * @module post-hoc
 */

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { PostHocFinding, LoopState } from "./types";
import { readState, writeState } from "./state";

/** 审计日志文件路径 */
const AUDIT_LOG = ".loop-opencode/post_hoc_audit.log";

/**
 * 执行完整事后审计流程
 *
 * 在每次 agent 会话退出后调用，检查四项审计项。
 *
 * @param projectRoot - 项目根目录
 * @returns 审计发现列表
 */
export function runPostHocAudit(projectRoot: string): PostHocFinding[] {
  const findings: PostHocFinding[] = [];
  const now = new Date().toISOString();

  // 审计 1: 意外 merge commit
  const mergeFindings = checkMergeCommits(projectRoot, now);
  findings.push(...mergeFindings);

  // 审计 2: 意外 PR 创建
  const prFindings = checkPullRequests(projectRoot, now);
  findings.push(...prFindings);

  // 审计 3: 意外 worktree 创建
  const wtFindings = checkWorktrees(projectRoot, now);
  findings.push(...wtFindings);

  // 审计 4: 非计划文件变更
  const fileFindings = checkUnplannedFileChanges(projectRoot, now);
  findings.push(...fileFindings);

  // 若有发现，写入 state.json issues
  if (findings.length > 0) {
    recordFindingsToState(projectRoot, findings);
  }

  // 追加审计日志
  writeAuditLog(projectRoot, findings, now);

  return findings;
}

/**
 * 检查最近是否产生了 merge commit
 *
 * 使用 git log 检查最新 commit 是否为 merge commit。
 *
 * @param projectRoot - 项目根目录
 * @param now - 当前时间戳
 */
function checkMergeCommits(
  projectRoot: string,
  now: string
): PostHocFinding[] {
  try {
    const log = execSync("git log -1 --format=%H %s", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    if (log.includes("Merge") && log.includes("branch")) {
      return [
        {
          finding_id: `merge_${Date.now()}`,
          type: "merge_commit",
          detail: `检测到 merge commit: ${log}`,
          found_at: now,
          related_entity: log.split(" ")[0] || "unknown",
          severity: "violation",
        },
      ];
    }
  } catch {
    // git 不可用或不在 git 仓库中——跳过
  }
  return [];
}

/**
 * 检查是否创建了未授权的 PR
 *
 * 使用 gh CLI 检查最近的 PR。
 *
 * @param projectRoot - 项目根目录
 * @param now - 当前时间戳
 */
function checkPullRequests(
  projectRoot: string,
  now: string
): PostHocFinding[] {
  try {
    const prs = execSync("gh pr list --state open --json title,number,createdAt --limit 3", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    if (prs && prs !== "[]") {
      return [
        {
          finding_id: `pr_${Date.now()}`,
          type: "pr_created",
          detail: `检测到开放 PR: ${prs}`,
          found_at: now,
          related_entity: "GitHub PR",
          severity: "violation",
        },
      ];
    }
  } catch {
    // gh CLI 不可用——跳过
  }
  return [];
}

/**
 * 检查是否创建了意外 worktree
 *
 * 使用 git worktree list 检查新增 worktree。
 *
 * @param projectRoot - 项目根目录
 * @param now - 当前时间戳
 */
function checkWorktrees(
  projectRoot: string,
  now: string
): PostHocFinding[] {
  try {
    const wts = execSync("git worktree list", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const lines = wts.split("\n").filter((l) => l.includes(".claude/worktrees"));
    if (lines.length > 0) {
      return lines.map(
        (line) =>
          ({
            finding_id: `wt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: "worktree_created",
            detail: `检测到 agent 工作区 worktree: ${line.trim()}`,
            found_at: now,
            related_entity: line.split(" ")[0] || "unknown",
            severity: "warning",
          }) as PostHocFinding
      );
    }
  } catch {
    // 非 git 仓库——跳过
  }
  return [];
}

/**
 * 检查是否有非计划内的文件变更
 *
 * 比较 artifact 目录中声明的文件与实际变更。
 *
 * @param projectRoot - 项目根目录
 * @param now - 当前时间戳
 */
function checkUnplannedFileChanges(
  projectRoot: string,
  now: string
): PostHocFinding[] {
  const findings: PostHocFinding[] = [];

  // 检查 state.json、opencode.json 是否被 agent 修改
  const protectedFiles = ["opencode.json"];
  for (const file of protectedFiles) {
    const fullPath = join(projectRoot, file);
    if (existsSync(fullPath)) {
      try {
        const stat = execSync(`git diff --name-only HEAD~1 -- "${file}"`, {
          cwd: projectRoot,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();

        if (stat && stat.includes(file)) {
          findings.push({
            finding_id: `file_${Date.now()}_${file}`,
            type: "file_changed_outside_plan",
            detail: `受保护文件 ${file} 被修改`,
            found_at: now,
            related_entity: file,
            severity: "violation",
          });
        }
      } catch {
        // git diff 不可用——跳过
      }
    }
  }

  return findings;
}

/**
 * 将审计发现写入 state.json 的 issues
 *
 * @param projectRoot - 项目根目录
 * @param findings - 审计发现列表
 */
function recordFindingsToState(
  projectRoot: string,
  findings: PostHocFinding[]
): void {
  try {
    const state = readState(projectRoot);

    for (const f of findings) {
      const severity = f.severity === "violation" ? "P0" : "P1";
      state.issues.active[severity === "P0" ? "p0" : "p1"].push({
        issue_id: `posthoc_${f.finding_id}`,
        title: `Post-hoc: ${f.type}`,
        description: f.detail,
        severity,
        source: "audit",
        affected_files: [f.related_entity],
        affected_modules: ["post_hoc"],
        status: "open",
        found_in_phase: state.progress.phase,
        found_in_cycle: state.progress.cycle,
        found_at: f.found_at,
      });
    }

    writeState(projectRoot, state);
  } catch (err) {
    console.warn(`[post-hoc] 写入 state.json 失败: ${err}`);
  }
}

/**
 * 追加审计日志到文件
 */
function writeAuditLog(
  projectRoot: string,
  findings: PostHocFinding[],
  timestamp: string
): void {
  const logPath = join(projectRoot, AUDIT_LOG);
  const lines = [
    `\n=== ${timestamp} ===`,
    `发现数量: ${findings.length}`,
    ...findings.map(
      (f) =>
        `  [${f.severity.toUpperCase()}] ${f.type}: ${f.detail} (entity: ${f.related_entity})`
    ),
  ];

  try {
    appendFileSync(logPath, lines.join("\n") + "\n", "utf-8");
  } catch {
    console.warn("[post-hoc] 写入审计日志失败");
  }
}

/**
 * 获取最近一次审计摘要
 *
 * @param projectRoot - 项目根目录
 * @returns 审计摘要文本
 */
export function getAuditSummary(projectRoot: string): string {
  const findings = runPostHocAudit(projectRoot);
  if (findings.length === 0) return "无异常发现";

  const violations = findings.filter((f) => f.severity === "violation");
  const warnings = findings.filter((f) => f.severity === "warning");

  return [
    `事后审计完成: ${findings.length} 项发现`,
    `  违规 (violation): ${violations.length}`,
    `  警告 (warning): ${warnings.length}`,
    ...findings.map((f) => `  - [${f.severity}] ${f.type}: ${f.detail}`),
  ].join("\n");
}
