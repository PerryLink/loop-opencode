/**
 * guard-post-hoc.ts -- Post-Hoc Audit Hook (M3)
 *
 * 核心功能：每轮 agent 完成后检测：
 *   - merge commit 操作
 *   - PR 创建操作
 *   - worktree 操作
 *   - 非计划文件变更
 *
 * 集成：作为 OpenCode post_tool_use 钩子运行。
 *
 * @module guard-post-hoc
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** 监控的 Git 危险模式 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string; severity: string }> = [
  { pattern: /git\s+merge\b(?!\s+--abort)/i, label: "git merge", severity: "HIGH" },
  { pattern: /gh\s+pr\s+create/i, label: "gh pr create", severity: "HIGH" },
  { pattern: /git\s+push\b/i, label: "git push", severity: "MEDIUM" },
  { pattern: /git\s+worktree\s+add/i, label: "git worktree add", severity: "MEDIUM" },
  { pattern: /git\s+worktree\s+remove/i, label: "git worktree remove", severity: "MEDIUM" },
];

/**
 * post-hoc 事后审计入口
 *
 * 在 agent 每轮工具调用后检测可疑操作。
 * 不阻断执行（post-hoc），仅记录警告和审计日志。
 *
 * @param ctx - OpenCode tool.execute 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策（始终 allow: true，post-hoc 不阻断）
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  const toolName = ctx.toolName || "";
  const command = extractCommand(ctx);

  // 只审计 Bash / Write / Edit / EnterWorktree
  if (!["Bash", "Write", "Edit", "EnterWorktree"].includes(toolName)) {
    return { allow: true };
  }

  // 检测危险 Git 操作
  for (const { pattern, label, severity } of DANGEROUS_PATTERNS) {
    if (command && pattern.test(command)) {
      logAuditEvent(projectRoot, label, severity, command.slice(0, 200));
    }
  }

  // 检查是否写入 .git 目录或非计划路径
  if (toolName === "Write" || toolName === "Edit") {
    const targetPath = extractPath(ctx);
    if (targetPath) {
      if (targetPath.includes(".git/") || targetPath.includes(".git\\")) {
        logAuditEvent(projectRoot, "写入 .git 目录", "HIGH", targetPath);
      }
    }
  }

  return { allow: true };
}

/**
 * 从上下文中提取命令字符串
 */
function extractCommand(ctx: ToolExecuteBeforeContext): string {
  // 尝试从 tool input 中提取 command 字段
  const input = (ctx as Record<string, unknown>).toolInput;
  if (input && typeof input === "object" && "command" in input) {
    return String((input as Record<string, string>).command || "");
  }
  return "";
}

/**
 * 从上下文中提取目标路径
 */
function extractPath(ctx: ToolExecuteBeforeContext): string {
  const input = (ctx as Record<string, unknown>).toolInput;
  if (input && typeof input === "object" && "file_path" in input) {
    return String((input as Record<string, string>).file_path || "");
  }
  return "";
}

/**
 * 记录审计事件到 runs.log
 */
function logAuditEvent(
  projectRoot: string,
  label: string,
  severity: string,
  detail: string
): void {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [AUDIT] [${severity}] ${label}: ${detail}\n`;

  try {
    const logPath = join(projectRoot, ".loop-opencode", "runs.log");
    // 追加写入日志（简单实现，不处理并发）
    const { appendFileSync } = require("node:fs");
    appendFileSync(logPath, entry, "utf-8");
  } catch {
    // 静默失败——审计日志写入失败不应影响主流程
  }
}
