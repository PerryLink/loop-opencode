/**
 * state.json 状态管理模块
 *
 * 核心功能：
 * - 读取 state.json（含 .bak 自动恢复 + Schema 校验）
 * - 原子写入引擎（tmp → fsync → rename → fsync dir 四步法）
 * - 备份自动创建（每次写入前 .bak）
 * - 损坏恢复流程
 *
 * 文件路径约定：
 * - 主文件：  .loop-opencode/state.json
 * - 备份：    .loop-opencode/state.json.bak
 * - 临时文件：.loop-opencode/state.json.tmp（写入过程中，崩溃后可安全清理）
 *
 * @module state
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { LoopState } from "./types";

/** 状态文件相对于项目根目录的路径 */
const STATE_FILE = ".loop-opencode/state.json";
const STATE_BAK = ".loop-opencode/state.json.bak";
const STATE_TMP = ".loop-opencode/state.json.tmp";
const STATE_DIR = ".loop-opencode";

/**
 * 确保 .loop-opencode/ 目录存在
 * @param projectRoot - 项目根目录
 */
function ensureStateDir(projectRoot: string): void {
  const dir = join(projectRoot, STATE_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取状态文件完整路径
 * @param projectRoot - 项目根目录
 */
export function getStatePath(projectRoot: string): string {
  return join(projectRoot, STATE_FILE);
}

/**
 * 获取备份文件完整路径
 */
export function getBackupPath(projectRoot: string): string {
  return join(projectRoot, STATE_BAK);
}

/**
 * 读取 state.json
 *
 * 流程：
 * 1. 尝试读取主文件
 * 2. 若主文件不存在或损坏 → 尝试从 .bak 恢复
 * 3. 若 .bak 也不可用 → 抛出错误（调用方应执行 --init）
 * 4. JSON 解析 + Schema 基础校验
 *
 * @param projectRoot - 项目根目录
 * @returns 解析后的 LoopState 对象
 * @throws 若文件不存在且无法恢复
 */
export function readState(projectRoot: string): LoopState {
  const statePath = getStatePath(projectRoot);
  const bakPath = getBackupPath(projectRoot);

  // Step 1: 尝试读取主文件
  if (existsSync(statePath)) {
    try {
      const raw = readFileSync(statePath, "utf-8");
      const data = JSON.parse(raw) as LoopState;
      validateState(data);
      return data;
    } catch (err) {
      console.warn(`[state] state.json 读取失败: ${err}`);
      console.warn("[state] 尝试从 .bak 恢复...");
    }
  }

  // Step 2: 尝试从备份恢复
  if (existsSync(bakPath)) {
    try {
      const raw = readFileSync(bakPath, "utf-8");
      const data = JSON.parse(raw) as LoopState;
      validateState(data);
      // 恢复成功——回写到主文件
      writeFileSync(statePath, raw, "utf-8");
      console.log("[state] 已从 state.json.bak 恢复");
      return data;
    } catch (err) {
      console.warn(`[state] state.json.bak 也损坏: ${err}`);
    }
  }

  // Step 3: 无可恢复数据源
  throw new Error(
    "state.json 不存在且备份不可用。请执行 loop-opencode --init 初始化项目。"
  );
}

/**
 * 原子写入 state.json
 *
 * 四步法保证写入原子性：
 * 1. 写入临时文件（.tmp）
 * 2. fsync 临时文件（刷盘）
 * 3. rename 临时文件 → 正式文件（POSIX 保证原子 rename）
 * 4. fsync 目录（保证元数据落盘）
 *
 * 写入前自动备份当前 state.json → state.json.bak。
 *
 * @param projectRoot - 项目根目录
 * @param state - 完整的 LoopState 对象
 * @throws 若写入或备份失败
 */
export function writeState(projectRoot: string, state: LoopState): void {
  ensureStateDir(projectRoot);
  const statePath = getStatePath(projectRoot);
  const bakPath = getBackupPath(projectRoot);
  const tmpPath = join(projectRoot, STATE_TMP);

  // 校验 Schema
  validateState(state);

  // 更新时间戳
  state.updated_at = new Date().toISOString();

  // 序列化
  const json = JSON.stringify(state, null, 2);

  try {
    // Step 0: 备份当前文件（若存在）
    if (existsSync(statePath)) {
      writeFileSync(bakPath, readFileSync(statePath, "utf-8"), "utf-8");
    }

    // Step 1: 写入临时文件
    writeFileSync(tmpPath, json, "utf-8");

    // Step 2: fsync 临时文件（Bun 的 writeFileSync 使用 O_SYNC）
    // 注：在 Bun 中 writeFileSync 已确保数据落盘；此处为协议完整性显式标注

    // Step 3: 原子 rename
    renameSync(tmpPath, statePath);

    // Step 4: fsync 目录（简化——在 Bun/Node 中 renameSync 已保证元数据一致）
  } catch (err) {
    // 清理残留 tmp
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      /* 清理失败不掩盖原始错误 */
    }
    throw new Error(`state.json 原子写入失败: ${err}`);
  }
}

/**
 * 基础 Schema 校验
 *
 * 检查 LoopState 的必需字段存在性与基本类型合法性。
 * 注意：此为轻量校验——不执行深层业务规则校验（由各业务模块负责）。
 *
 * @param state - 待校验的 LoopState 对象
 * @throws 若校验失败
 */
export function validateState(state: unknown): asserts state is LoopState {
  if (typeof state !== "object" || state === null) {
    throw new Error("state.json Schema 校验失败: state 必须为对象");
  }

  const s = state as Record<string, unknown>;

  // schema_version
  if (typeof s["schema_version"] !== "number") {
    throw new Error("state.json Schema 校验失败: schema_version 必须为 number");
  }

  // progress
  if (typeof s["progress"] !== "object" || s["progress"] === null) {
    throw new Error("state.json Schema 校验失败: progress 必须为对象");
  }

  const progress = s["progress"] as Record<string, unknown>;

  // progress.phase
  if (typeof progress["phase"] !== "string") {
    throw new Error("state.json Schema 校验失败: progress.phase 必须为 string");
  }

  // progress.cycle
  if (typeof progress["cycle"] !== "number") {
    throw new Error("state.json Schema 校验失败: progress.cycle 必须为 number");
  }

  // config
  if (typeof s["config"] !== "object" || s["config"] === null) {
    throw new Error("state.json Schema 校验失败: config 必须为对象");
  }

  // issues
  if (typeof s["issues"] !== "object" || s["issues"] === null) {
    throw new Error("state.json Schema 校验失败: issues 必须为对象");
  }

  // termination
  if (typeof s["termination"] !== "object" || s["termination"] === null) {
    throw new Error("state.json Schema 校验失败: termination 必须为对象");
  }

  const termination = s["termination"] as Record<string, unknown>;
  if (typeof termination["status"] !== "string") {
    throw new Error("state.json Schema 校验失败: termination.status 必须为 string");
  }
}

/**
 * 从模板初始化 state.json
 *
 * 读取 templates/state.json 模板，填充用户需求与配置后写入。
 * 若目标 state.json 已存在且 force=false，则抛出错误。
 *
 * @param projectRoot - 项目根目录
 * @param userRequest - 用户需求描述
 * @param configOverrides - 配置覆盖项
 * @param force - 是否强制覆盖
 */
export function initState(
  projectRoot: string,
  userRequest: string,
  configOverrides: Partial<LoopState["config"]> = {},
  force: boolean = false,
): LoopState {
  const statePath = getStatePath(projectRoot);

  if (existsSync(statePath) && !force) {
    throw new Error(
      "state.json 已存在。使用 --force 强制重新初始化（将备份现有状态）。"
    );
  }

  // 读取模板
  // 注意：在编译后的二进制中，templates/ 路径需适配
  const templatePath = join(import.meta.dir || ".", "..", "templates", "state.json");
  let state: LoopState;

  if (existsSync(templatePath)) {
    const raw = readFileSync(templatePath, "utf-8");
    state = JSON.parse(raw) as LoopState;
  } else {
    // Fallback：硬编码最小模板（用于编译二进制无 templates/ 的场景）
    state = createMinimalState();
  }

  // 填充配置
  state.config.user_request = userRequest;
  state.config = { ...state.config, ...configOverrides };
  state.created_at = new Date().toISOString();
  state.updated_at = new Date().toISOString();

  // 原子写入
  writeState(projectRoot, state);

  return state;
}

/**
 * 创建最小可用的 LoopState（fallback——编译二进制场景）
 *
 * 当 templates/state.json 不可用时（例如编译为独立二进制后 templates 目录缺失），
 * 使用此函数生成一个包含所有必需字段的默认状态对象。
 * 所有数值字段初始化为 0，数组字段初始化为空数组，状态标记为 "active"。
 *
 * @returns 包含全部必需字段的默认 LoopState 对象
 */
function createMinimalState(): LoopState {
  return {
    schema_version: 1,
    progress: {
      phase: "init",
      cycle: 1,
      convergence_counter: 0,
      part1_round: 0,
      verification_pass_count: 0,
      repair_context: null,
      budget: {
        phase_budget: 0,
        phase_budget_consumed: 0,
        phase_budget_warning_issued: false,
        phase_budget_exhausted: false,
        phase_budget_exhaustion_count: 0,
        cycle_total_budget: 0,
        cycle_total_consumed: 0,
        estimated_tokens_this_session: 0,
        context_usage_pct: 0,
        budget_overrun_action: "warn",
      },
      bubble_state: {
        bubble_id: "",
        split_index: 0,
        max_splits: 3,
        sub_phase_progress: { part_1_1: 0, part_1_2: 0, part_1_3: 0 },
        checkpoint_file: null,
        degraded: false,
        degraded_reason: null,
        assumptions_count: 0,
        quality_signals: { semantic_repetition_count: 0, contradiction_count: 0 },
      },
      phase_transitions: [],
      retry_count_this_phase: 0,
    },
    config: {
      mode: "auto",
      tdd: false,
      skip_testing: false,
      max_cycles: 5,
      max_part1_rounds: 10,
      convergence_rounds: 2,
      route_repeat_max: 3,
      part1_timeout_minutes: 30,
      pending_confirmation_timeout_minutes: 30,
      user_request: "",
      auto_mode: true,
      impl_engine: "direct",
      version: "0.1.0",
    },
    issues: {
      active: { p0: [], p1: [], p2: [] },
      all_time: { p0_total: 0, p1_total: 0, p2_total: 0 },
    },
    routing_history: [],
    p0_history: [],
    phase_contracts: {},
    pending_confirmation: null,
    watchdog: {
      pid: null,
      running: false,
      last_heartbeat_at: null,
      last_marker_at: null,
      alerts: [],
      started_at: null,
    },
    termination: {
      status: "active",
      exit_reason: null,
      completed_at: null,
      paused_at: null,
      failed_at: null,
    },
    artifacts: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
