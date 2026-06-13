/**
 * guard-g5.ts —— 危险操作闸门（M3）
 *
 * 五层危险操作匹配器（L0-L4）：
 * - L0: 灾难级——全模式硬拦截（rm -rf /、mkfs、:(){:|:&};:）
 * - L1: 不可逆——仅 safe/auto 拦截（chmod 777、docker rm）
 * - L2: 高影响——超阈值拦截（git push --force、多文件删除）
 * - L3: 逃逸——全模式拦截（chroot、容器逃逸、提权）
 * - L4: 路径保护——全模式拦截（写入系统目录）
 *
 * @module guard-g5
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** L0 灾难级操作关键词——全模式永久拦截 */
const L0_DISASTER = [
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "mkfs.",
  "dd if=",
  ":(){ :|:& };:",
  "> /dev/sda",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
];

/** L1 不可逆操作关键词——safe/auto 模式拦截 */
const L1_IRREVERSIBLE = [
  "chmod 777",
  "chmod -R 777",
  "docker rm -f",
  "docker system prune",
  "git reset --hard",
  "git clean -fdx",
  "dropdb",
  "DROP DATABASE",
  "TRUNCATE",
];

/** L2 高影响操作——超阈值时拦截 */
const L2_HIGH_IMPACT = [
  "git push --force",
  "git push -f",
  "npm unpublish",
  "gh pr close",
  "gh repo delete",
];

/** L3 逃逸操作——全模式拦截 */
const L3_ESCAPE = [
  "chroot",
  "nsenter",
  "docker exec --privileged",
  "mount --bind",
  "/proc/sys/",
];

/** L4 路径保护——全模式拦截 */
const L4_PATH = ["/etc/", "/boot/", "/sys/", "/proc/", "~/.ssh/"];

/**
 * G5 危险操作闸门入口
 *
 * 五层匹配器逐级检查命令，命中即阻断。
 * L0/L3/L4 全模式拦截，L1 仅 safe+auto 拦截，L2 超阈值拦截。
 *
 * @param ctx - tool.execute.before 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  const shellTools = ["execute_command", "bash", "run_shell_command"];
  if (!shellTools.includes(ctx.toolName)) return { allow: true };

  const cmd = getCmd(ctx).toLowerCase();
  if (!cmd) return { allow: true };

  // L0: 灾难级——全模式硬拦截
  for (const p of L0_DISASTER) {
    if (cmd.includes(p.toLowerCase())) {
      console.error(`[G5-L0] 灾难级操作拦截: ${p}`);
      return {
        allow: false,
        reason: `L0 灾难级操作: ${p}`,
        message: `永久拒绝: 操作 "${p}" 为灾难级危险操作，在任何模式下均不可执行。`,
      };
    }
  }

  // L3: 逃逸——全模式拦截
  for (const p of L3_ESCAPE) {
    if (cmd.includes(p.toLowerCase())) {
      console.error(`[G5-L3] 逃逸操作拦截: ${p}`);
      return {
        allow: false,
        reason: `L3 逃逸操作: ${p}`,
        message: `永久拒绝: 操作涉及沙箱逃逸 "${p}"。`,
      };
    }
  }

  // L4: 路径保护——全模式拦截
  for (const p of L4_PATH) {
    if (cmd.includes(p.toLowerCase())) {
      console.error(`[G5-L4] 路径保护拦截: ${p}`);
      return {
        allow: false,
        reason: `L4 系统路径写入: ${p}`,
        message: `永久拒绝: 禁止操作系统目录 "${p}"。`,
      };
    }
  }

  // 读取运行模式
  const mode = getMode(projectRoot);

  // L1: 不可逆——safe/auto/collaborative 拦截
  if (mode !== "unsafe") {
    for (const p of L1_IRREVERSIBLE) {
      if (cmd.includes(p.toLowerCase())) {
        console.warn(`[G5-L1] 不可逆操作拦截: ${p}（模式: ${mode}）`);
        return {
          allow: false,
          reason: `L1 不可逆操作: ${p}`,
          message: `${mode} 模式下禁止执行不可逆操作 "${p}"。请使用 --unsafe 模式或用户确认。`,
          requireConfirmation: true,
        };
      }
    }
  }

  // L2: 高影响——超阈值时拦截
  for (const p of L2_HIGH_IMPACT) {
    if (cmd.includes(p.toLowerCase())) {
      console.warn(`[G5-L2] 高影响操作: ${p}（模式: ${mode}）`);
      if (mode !== "unsafe") {
        return {
          allow: false,
          reason: `L2 高影响操作: ${p}`,
          message: `${mode} 模式禁止高影响操作 "${p}"。需用户确认。`,
          requireConfirmation: true,
        };
      }
    }
  }

  return { allow: true };
}

/** 从 toolInput 提取命令字符串 */
function getCmd(ctx: ToolExecuteBeforeContext): string {
  const input = ctx.toolInput;
  if (typeof input.command === "string") return input.command;
  if (typeof input.cmd === "string") return input.cmd;
  if (Array.isArray(input.args)) return input.args.join(" ");
  return "";
}

/** 从 state.json 读取运行模式 */
function getMode(projectRoot: string): string {
  const statePath = join(projectRoot, ".loop-opencode", "state.json");
  if (!existsSync(statePath)) return "auto";
  try {
    const raw = readFileSync(statePath, "utf-8");
    return JSON.parse(raw)?.config?.mode ?? "auto";
  } catch {
    return "auto";
  }
}

export { L0_DISASTER, L1_IRREVERSIBLE, L2_HIGH_IMPACT, L3_ESCAPE, L4_PATH };
