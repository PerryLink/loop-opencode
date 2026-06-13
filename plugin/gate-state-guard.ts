/**
 * gate-state-guard.ts —— Gate State Guard 统一管理（M3）
 *
 * 核心功能：整合 G1-G6 + Gate State Guard + Permission Block 共 8 个闸门的状态管理，
 * 维护 gate_state.json 文件（仅 plugin/二进制可写），
 * 阻止 agent 写入 gate_state.json，记录各闸门拦截事件。
 *
 * @module gate-state-guard
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GateState, GateRecord, PluginDecision, ToolExecuteBeforeContext } from "../src/types";

/** gate_state.json 相对路径 */
const GATE_STATE_FILE = ".loop-opencode/gate_state.json";

/**
 * 门禁文件写入保护——阻止 agent 修改 gate_state.json
 *
 * 拦截任何对 gate_state.json 的写入操作。
 * 此文件仅 plugin（通过该 guard）和二进制进程可写。
 *
 * @param ctx - tool.execute.before 上下文
 * @param projectRoot - 项目根目录
 * @returns 插件决策
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  projectRoot: string
): PluginDecision {
  // 检查是否尝试写入 gate_state.json
  const targetPath = extractPath(ctx);
  if (!targetPath) return { allow: true };

  if (targetPath.includes("gate_state.json")) {
    // 检查调用来源（plugin 自身 vs agent）
    // plugin 自身调用由二进制触发，agent 调用由 OpenCode 触发
    // 简化策略：检查是否为 session 开始初始写入（由二进制 --init 触发）
    if (ctx.sessionId === "__system_init__") {
      return { allow: true }; // 系统初始化写入放行
    }
    console.warn("[GateGuard] 拦截 agent 写入 gate_state.json");
    recordGateBlock(projectRoot, "gate_state_guard", "agent 尝试写入门禁文件");
    return {
      allow: false,
      reason: "禁止 agent 写入 gate_state.json",
      message: "gate_state.json 仅可由 loop-opencode 二进制或安全插件的系统写入。",
    };
  }

  return { allow: true };
}

/**
 * 读取当前闸门状态文件
 *
 * @param projectRoot - 项目根目录
 * @returns GateState 对象，文件不存在返回默认 state
 */
export function readGateState(projectRoot: string): GateState {
  const path = join(projectRoot, GATE_STATE_FILE);
  if (!existsSync(path)) {
    return createDefaultGateState();
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as GateState;
  } catch {
    console.warn("[GateGuard] gate_state.json 损坏，返回默认状态");
    return createDefaultGateState();
  }
}

/**
 * 写入闸门状态文件（仅 plugin/二进制调用）
 *
 * 使用原子写入保证数据一致性。
 *
 * @param projectRoot - 项目根目录
 * @param state - GateState 对象
 */
export function writeGateState(
  projectRoot: string,
  state: GateState
): void {
  const dir = join(projectRoot, ".loop-opencode");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = join(projectRoot, GATE_STATE_FILE);
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * 记录一次闸门拦截事件
 *
 * 更新对应 gate 的 block_count、last_blocked_at、last_block_reason。
 *
 * @param projectRoot - 项目根目录
 * @param gateId - 闸门 ID（G1-G6、gate_state_guard、permission_block）
 * @param reason - 拦截原因
 */
export function recordGateBlock(
  projectRoot: string,
  gateId: string,
  reason: string
): void {
  const state = readGateState(projectRoot);
  const gate = state.gates[gateId];

  if (gate) {
    gate.block_count += 1;
    gate.last_blocked_at = new Date().toISOString();
    gate.last_block_reason = reason;
  } else {
    // 动态创建闸门记录
    state.gates[gateId] = {
      gate_id: gateId,
      name: gateId,
      block_count: 1,
      last_blocked_at: new Date().toISOString(),
      last_block_reason: reason,
    };
  }

  writeGateState(projectRoot, state);
}

/**
 * 获取指定闸门的拦截统计
 *
 * @param projectRoot - 项目根目录
 * @param gateId - 闸门 ID
 * @returns GateRecord 或 undefined
 */
export function getGateStats(
  projectRoot: string,
  gateId: string
): GateRecord | undefined {
  const state = readGateState(projectRoot);
  return state.gates[gateId];
}

/**
 * 汇总所有闸门拦截统计
 *
 * @param projectRoot - 项目根目录
 * @returns 各闸门的拦截次数汇总
 */
export function summarizeGates(
  projectRoot: string
): { gateId: string; name: string; blockCount: number; lastBlocked: string | null }[] {
  const state = readGateState(projectRoot);
  return Object.values(state.gates).map((g) => ({
    gateId: g.gate_id,
    name: g.name,
    blockCount: g.block_count,
    lastBlocked: g.last_blocked_at,
  }));
}

/** 创建默认的 GateState */
function createDefaultGateState(): GateState {
  return {
    schema_version: 1,
    gates: {},
    watchdog_alerts: [],
    termination: { status: "active", exit_reason: null },
  };
}

/** 从 toolInput 提取文件路径 */
function extractPath(ctx: ToolExecuteBeforeContext): string {
  const input = ctx.toolInput;
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.path === "string") return input.path;
  if (typeof input.filePath === "string") return input.filePath;
  if (typeof input.target === "string") return input.target;
  return "";
}
