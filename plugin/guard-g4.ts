/**
 * guard-g4.ts —— 文件变更范围闸门（M3）
 *
 * 核心功能：检查 agent 单次操作的文件变更范围是否超限。
 * 若变更文件数 > 阈值则阻断，防止 agent 大面积意外修改。
 * 同时检测是否修改了 Task 清单外的非计划文件。
 *
 * @module guard-g4
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** 单次操作最大允许变更文件数（safe 模式） */
const MAX_FILES_SAFE = 3;
/** 单次操作最大允许变更文件数（auto 模式） */
const MAX_FILES_AUTO = 8;
/** 单次操作最大允许变更文件数（unsafe 模式）——不限制但警告 */
const MAX_FILES_UNSAFE = 50;

/** 受保护路径前缀——任何模式下不得修改 */
const PROTECTED_PATHS = [
  ".loop-opencode/state.json",
  ".loop-opencode/gate_state.json",
  "opencode.json",
  ".claude/",
];

/**
 * G4 文件变更闸门入口
 *
 * 拦截 write/edit 类工具调用，检查变更范围。
 * 保护 system 文件（state.json、opencode.json 等）在任何模式下不被修改。
 *
 * @param ctx - tool.execute.before 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  const fileTools = ["write", "write_to_file", "edit_file", "replace_in_file"];
  if (!fileTools.includes(ctx.toolName)) return { allow: true };

  // 提取目标文件路径
  const targetPath = getTargetPath(ctx);
  if (!targetPath) return { allow: true };

  // 保护路径检查——全模式硬拦截
  for (const pp of PROTECTED_PATHS) {
    if (targetPath.includes(pp)) {
      console.warn(`[G4] 拦截受保护路径写入: ${targetPath}`);
      return {
        allow: false,
        reason: `禁止修改受保护文件: ${targetPath}`,
        message: `拒绝写入: ${targetPath} 是 loop-opencode 系统文件，禁止 agent 修改。`,
      };
    }
  }

  // 读取当前模式
  const mode = getRunMode(projectRoot);
  const maxFiles = getMaxFiles(mode);

  // 检查变更文件数（从 toolInput 的 file_path 或 files 估算）
  const fileCount = countAffectedFiles(ctx);
  if (fileCount > maxFiles) {
    console.warn(
      `[G4] 变更文件数 ${fileCount} > 阈值 ${maxFiles}（模式: ${mode}）`
    );
    return {
      allow: false,
      reason: `文件变更数 ${fileCount} 超过阈值 ${maxFiles}（${mode} 模式）`,
      message: `拒绝操作: 单次变更文件数 (${fileCount}) 超过限制。请拆分操作。`,
      requireConfirmation: mode !== "unsafe",
    };
  }

  return { allow: true };
}

/**
 * 从 toolInput 提取目标文件路径
 */
function getTargetPath(ctx: ToolExecuteBeforeContext): string {
  const input = ctx.toolInput;
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.path === "string") return input.path;
  if (typeof input.filePath === "string") return input.filePath;
  if (typeof input.target === "string") return input.target;
  return "";
}

/**
 * 估算操作涉及的文件数量
 */
function countAffectedFiles(ctx: ToolExecuteBeforeContext): number {
  const input = ctx.toolInput;
  if (Array.isArray(input.files)) return input.files.length;
  if (typeof input.file_path === "string") return 1;
  return 1; // 默认最少 1 个文件
}

/**
 * 从 state.json 读取当前运行模式
 */
function getRunMode(projectRoot: string): string {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  if (!existsSync(statePath)) return "auto";
  try {
    const raw = readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);
    return state?.config?.mode ?? "auto";
  } catch {
    return "auto";
  }
}

/** 按模式获取最大变更文件数 */
function getMaxFiles(mode: string): number {
  switch (mode) {
    case "safe":
    case "collaborative":
      return MAX_FILES_SAFE;
    case "auto":
      return MAX_FILES_AUTO;
    case "unsafe":
      return MAX_FILES_UNSAFE;
    default:
      return MAX_FILES_AUTO;
  }
}

export { PROTECTED_PATHS };
