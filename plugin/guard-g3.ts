/**
 * guard-g3.ts —— 依赖安装安全性闸门（M3）
 *
 * 核心功能：拦截 npm/pip/cargo 等包管理器的安装命令，
 * 检查安装源是否在白名单内，阻止非安全来源的依赖安装。
 *
 * 白名单：默认注册源（npmjs.com、PyPI、crates.io）；
 * 已审批的自定义源也可通过 state.json pending_confirmation 放行。
 *
 * @module guard-g3
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** 可信注册源白名单 */
const REGISTRY_WHITELIST = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "pypi.org",
  "files.pythonhosted.org",
  "crates.io",
  "static.crates.io",
];

/** 危险安装标志——需额外审查 */
const DANGEROUS_FLAGS = ["--force", "-f", "--unsafe-perm", "--allow-root"];

/** 可疑安装模式 */
const SUSPICIOUS_PATTERNS = ["curl", "wget", "| sh", "| bash", "eval", "$("];

/**
 * G3 依赖安装闸门入口
 *
 * 拦截包含 install/add/update 的 shell 命令，验证安装源安全性。
 * 仅对包管理命令（npm/pip/cargo）进行检查。
 *
 * @param ctx - tool.execute.before 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  // 仅检查 shell 执行类工具
  const shellTools = ["execute_command", "bash", "run_shell_command", "shell"];
  if (!shellTools.includes(ctx.toolName)) {
    return { allow: true };
  }

  const cmd = getCommandString(ctx);
  if (!cmd) return { allow: true };

  const cmdLower = cmd.toLowerCase();

  // 检查是否为包安装命令
  const isInstallCmd =
    /\b(npm|yarn|pnpm|pip|pip3|cargo|gem|composer)\s+(install|add|i|update)\b/.test(
      cmdLower
    );
  if (!isInstallCmd) return { allow: true };

  // 检查危险标志
  const dangerousFlags = DANGEROUS_FLAGS.filter((f) => cmdLower.includes(f));
  if (dangerousFlags.length > 0) {
    console.warn(
      `[G3] 安装命令包含危险标志: ${dangerousFlags.join(", ")}`
    );
    return {
      allow: false,
      reason: `安装命令包含危险标志: ${dangerousFlags.join(", ")}`,
      message: `拒绝执行: 依赖安装命令 "${cmd}" 包含危险标志。`,
      requireConfirmation: true,
    };
  }

  // 检查可疑模式（管道安装）
  const suspicious = SUSPICIOUS_PATTERNS.filter((p) => cmdLower.includes(p));
  if (suspicious.length > 0) {
    console.warn(`[G3] 安装命令含可疑模式: ${suspicious.join(", ")}`);
    return {
      allow: false,
      reason: `安装命令包含可疑模式: ${suspicious.join(", ")}`,
      message: `拒绝执行: 请使用标准包管理器安装。`,
      requireConfirmation: true,
    };
  }

  // 检查注册源
  const sourceCheck = checkRegistrySource(cmdLower);
  if (!sourceCheck.allowed) {
    return {
      allow: false,
      reason: sourceCheck.reason || "非白名单安装源",
      message: `依赖安装源不在白名单中。请使用可信注册源（npmjs/PyPI/crates.io）。`,
      requireConfirmation: true,
    };
  }

  return { allow: true };
}

/**
 * 从 toolInput 中提取命令字符串
 */
function getCommandString(ctx: ToolExecuteBeforeContext): string {
  const input = ctx.toolInput;
  if (typeof input.command === "string") return input.command;
  if (typeof input.cmd === "string") return input.cmd;
  if (typeof input.args === "string") return input.args;
  if (Array.isArray(input.args)) return input.args.join(" ");
  return "";
}

/**
 * 检查命令中的注册源是否在白名单内
 */
function checkRegistrySource(cmd: string): {
  allowed: boolean;
  reason?: string;
} {
  // 提取 --registry 参数或 URL
  const registryMatch = cmd.match(
    /--registry\s+(\S+)|(https?:\/\/[^\s]+)/
  );
  if (!registryMatch) return { allowed: true }; // 无显式注册源——默认源

  const source = (registryMatch[1] || registryMatch[2] || "").toLowerCase();
  const inWhitelist = REGISTRY_WHITELIST.some((w) => source.includes(w));
  if (!inWhitelist) {
    return { allowed: false, reason: `非白名单安装源: ${source}` };
  }
  return { allowed: true };
}

export { REGISTRY_WHITELIST, DANGEROUS_FLAGS, SUSPICIOUS_PATTERNS };
