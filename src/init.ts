/**
 * loop-opencode 初始化模块
 *
 * 提供 --init 命令的完整实现：创建 .loop-opencode/ 运行时目录树，
 * 从模板复制 state.json、AGENTS.md、opencode.json，初始化 gate_state.json
 * 与 artfacts/ 空目录。支持 --force 强制覆盖模式。
 *
 * 安全规则：
 * - 已存在 .loop-opencode/ 且非 --force 模式 → 拒绝操作
 * - --force 模式下先备份 state.json → .bak 再覆盖
 * - gate_state.json 仅在不存在时创建，保护闸门拦截历史
 *
 * @module init
 * @version 0.1.0
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { GateState } from "./types";

/** 运行时目录名 */
const RT = ".loop-opencode";

/**
 * --init 初始化流程
 *
 * 在 projectRoot 下创建完整的 .loop-opencode/ 运行时目录结构，
 * 复制模板文件，初始化闸门状态。
 *
 * @param projectRoot - 项目根目录（绝对路径）
 * @param force - 是否强制覆盖已存在的运行时目录
 */
export function initProject(projectRoot: string, force: boolean): void {
  const rd = join(projectRoot, RT); // 运行时目录完整路径

  // ---- 步骤 1: 冲突检测 ----
  if (existsSync(rd) && !force) {
    console.error(
      "[init] 错误: .loop-opencode/ 已存在。使用 --init --force 强制重新初始化。"
    );
    process.exit(1);
  }

  if (existsSync(rd) && force) {
    console.log("[init] --force: 检测到已存在的 .loop-opencode/，将覆盖。");
    // 备份现有 state.json
    const sp = join(rd, "state.json");
    if (existsSync(sp)) {
      copyFileSync(sp, join(rd, "state.json.bak"));
      console.log("[init] 已备份 state.json → state.json.bak");
    }
  }

  // ---- 步骤 2: 创建目录树 ----
  console.log("[init] 创建 .loop-opencode/ 目录...");
  mkdirSync(rd, { recursive: true });
  mkdirSync(join(rd, "artifacts"), { recursive: true });

  // ---- 步骤 3: 复制模板 state.json ----
  copytmpl(projectRoot, "state.json", join(rd, "state.json"), "state.json");

  // ---- 步骤 4: 复制 AGENTS.md → CLAUDE.md（Claude Code 入口） ----
  copytmpl(projectRoot, "AGENTS.md", join(projectRoot, "CLAUDE.md"), "CLAUDE.md");

  // ---- 步骤 5: 复制 opencode.json（若不存在） ----
  const opDest = join(projectRoot, "opencode.json");
  if (!existsSync(opDest)) {
    copytmpl(projectRoot, "opencode.json", opDest, "opencode.json 权限配置");
  } else {
    console.log("[init] opencode.json 已存在，跳过复制。");
  }

  // ---- 步骤 6: 初始化 gate_state.json ----
  initGate(projectRoot);

  // ---- 步骤 7: 创建 runs.log ----
  const logPath = join(rd, "runs.log");
  if (!existsSync(logPath)) {
    writeFileSync(
      logPath,
      `# loop-opencode 运行日志\n# 创建于: ${new Date().toISOString()}\n`,
      "utf-8"
    );
    console.log("[init] runs.log 日志文件已创建");
  }

  // ---- 步骤 8: 打印完成摘要 ----
  printSummary(projectRoot);
}

/**
 * 复制模板文件到目标路径
 *
 * 按优先级搜索模板源：
 * 1. projectRoot/templates/<name>（项目安装目录）
 * 2. <二进制所在目录>/templates/<name>（编译二进制场景）
 *
 * @param root   - 项目根目录
 * @param name   - 模板文件名
 * @param dest   - 目标完整路径
 * @param label  - 用于日志输出的标签
 */
function copytmpl(
  root: string,
  name: string,
  dest: string,
  label: string
): void {
  const candidates = [
    join(root, "templates", name),
    join(dirname(Bun.main), "templates", name),
  ];

  for (const src of candidates) {
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`[init] 复制 ${label}`);
      return;
    }
  }

  console.warn(`[init] 警告: 模板文件 ${name} 未找到，跳过 ${label}。`);
}

/**
 * 初始化 gate_state.json（独立闸门文件）
 *
 * 声明全部 8 个闸门（G1-G6 + gate_state_guard + permission_block），
 * 初始化拦截计数器为零。watchdog_alerts 空数组，termination 为 active。
 *
 * 规则：仅 plugin / 二进制可写入 gate_state.json；agent 不可写。
 * 若 gate_state.json 已存在则跳过（保护闸门历史记录）。
 *
 * @param root - 项目根目录
 */
function initGate(root: string): void {
  const path = join(root, RT, "gate_state.json");

  if (existsSync(path)) {
    console.log("[init] gate_state.json 已存在，保留现有闸门记录。");
    return;
  }

  const gs: GateState = {
    schema_version: 1,
    gates: {
      G1: {
        gate_id: "G1", name: "内容安全检查",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      G2: {
        gate_id: "G2", name: "方案确认闸门",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      G3: {
        gate_id: "G3", name: "依赖安装闸门",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      G4: {
        gate_id: "G4", name: "危险操作闸门",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      G5: {
        gate_id: "G5", name: "文件变更闸门",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      G6: {
        gate_id: "G6", name: "完成声明闸门",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      gate_state_guard: {
        gate_id: "gate_state_guard", name: "门禁文件写入保护",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
      permission_block: {
        gate_id: "permission_block", name: "权限变更拦截",
        block_count: 0, last_blocked_at: null, last_block_reason: null,
      },
    },
    watchdog_alerts: [],
    termination: { status: "active", exit_reason: null },
  };

  writeFileSync(path, JSON.stringify(gs, null, 2), "utf-8");
  console.log("[init] gate_state.json 初始化完成（8 闸门就绪）。");
}

/**
 * 输出初始化完成摘要
 *
 * 打印已创建的文件/目录清单与下一步操作提示。
 *
 * @param root - 项目根目录
 */
function printSummary(root: string): void {
  console.log("\n========================================");
  console.log("  loop-opencode 初始化完成");
  console.log("========================================");
  console.log(`\n项目根目录: ${root}\n`);
  console.log("已创建:");
  console.log("  .loop-opencode/state.json       — 文件状态机");
  console.log("  .loop-opencode/gate_state.json  — 闸门状态文件");
  console.log("  .loop-opencode/artifacts/       — 产出物目录");
  console.log("  .loop-opencode/runs.log         — 运行日志");
  console.log("  CLAUDE.md                       — Claude Code 入口指令");
  console.log("  opencode.json                   — OpenCode 权限配置");
  console.log("\n下一步操作:");
  console.log("  loop-opencode --safe \"<你的需求描述>\"   安全模式启动");
  console.log("  loop-opencode --interactive \"<需求>\"   协作模式启动");
  console.log("========================================\n");
}
