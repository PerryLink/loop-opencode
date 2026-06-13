/**
 * loop-opencode 全局 TypeScript 类型系统
 *
 * 本文件定义所有核心类型，涵盖：Phase 枚举体系、LoopState 状态机、安全闸门、
 * 路由决策、终止条件、收敛预算、气泡拆分、P0 复发升级、Watchdog 监控等全部领域。
 *
 * @module types
 * @version 0.1.0
 */

// ============================================================
// Phase 枚举体系 —— 19 个 phase（与 loop-claudecode 共享语义）
// ============================================================

/** 工作流 Phase 枚举——完整 11 phase + 路由 + 终端状态 */
export const PHASE_ENUM = {
  /** 初始状态（--init 后、首次运行前） */
  INIT: "init",
  /** Part 1.1：多轮头脑风暴，明确需求、消除歧义 */
  PART_1_1: "part_1_1",
  /** Part 1.2：方向研究与技术选型可行性分析 */
  PART_1_2: "part_1_2",
  /** Part 1.3：方案形成，输出完整可实施方案 */
  PART_1_3: "part_1_3",
  /** Part 2.1：实施规划——方案到 Plan + Task 列表 */
  PART_2_1: "part_2_1",
  /** Part 2.2：代码实施——按 Plan 执行且生成 diff */
  PART_2_2: "part_2_2",
  /** Part 2.3：Code Review——结构化代码审查 */
  PART_2_3: "part_2_3",
  /** Part 2.4：E2E 测试策略研究 */
  PART_2_4: "part_2_4",
  /** Part 2.5：测试规划——策略转化为可执行 Task */
  PART_2_5: "part_2_5",
  /** Part 2.6：测试执行——编写 + 运行测试 */
  PART_2_6: "part_2_6",
  /** Part 2.7：验证查漏——全量 artifact 审计 */
  PART_2_7: "part_2_7",
  /** Part 2.8：硬验证闸门——运行验证命令 + 输出证据 */
  PART_2_8: "part_2_8",
  /** 路由决策门 */
  ROUTING: "routing",
  /** 终态：任务完成 */
  COMPLETE: "complete",
  /** 终态：用户暂停 */
  PAUSED: "paused",
  /** 终态：任务失败 */
  FAILED: "failed",
  /** 等待用户审批 */
  AWAITING_APPROVAL: "awaiting_approval",
} as const;

/** Phase 字面量联合类型 */
export type PhaseEnum = (typeof PHASE_ENUM)[keyof typeof PHASE_ENUM];

/** Part 1 设计气泡子 phase 列表 */
export const PART1_PHASES = [
  PHASE_ENUM.PART_1_1,
  PHASE_ENUM.PART_1_2,
  PHASE_ENUM.PART_1_3,
] as const;

/** Part 2 实施/测试/验证子 phase 列表 */
export const PART2_PHASES = [
  PHASE_ENUM.PART_2_1,
  PHASE_ENUM.PART_2_2,
  PHASE_ENUM.PART_2_3,
  PHASE_ENUM.PART_2_4,
  PHASE_ENUM.PART_2_5,
  PHASE_ENUM.PART_2_6,
  PHASE_ENUM.PART_2_7,
  PHASE_ENUM.PART_2_8,
] as const;

/** 终端状态 phase 列表 */
export const TERMINAL_PHASES = [
  PHASE_ENUM.COMPLETE,
  PHASE_ENUM.PAUSED,
  PHASE_ENUM.FAILED,
] as const;

// ============================================================
// 严重度与路由基础类型
// ============================================================

/** 问题严重度——P0/P1/P2 三级 */
export type Severity = "P0" | "P1" | "P2";

/** 运行模式 */
export type RunMode = "safe" | "auto" | "unsafe" | "collaborative";

/** 路由目标 */
export type RouteTarget =
  | "part_1_1"
  | "part_1_3"
  | "part_2_2"
  | "routing"
  | "complete"
  | "paused"
  | "failed";

/** P1 路由决策结果 */
export type P1Classification = "design_level" | "implementation_level";

/** 终止原因 */
export type TerminationReason =
  | "convergence_reached"
  | "convergence_fast_path"
  | "max_cycles_exceeded"
  | "active_issues_remaining"
  | "verification_missing"
  | "conditions_not_met"
  | "p0_recurrence"
  | "p0_malignant_recurrence"
  | "budget_exhausted"
  | "user_interrupt"
  | "verification_gate_failed_after_retries"
  | "route_repeat_max_exceeded";

// ============================================================
// Issue（问题）类型
// ============================================================

/** 单个问题条目——P0/P1/P2 三级严重度 */
export interface Issue {
  /** 问题唯一 ID */
  issue_id: string;
  /** 问题标题 */
  title: string;
  /** 问题详细描述 */
  description: string;
  /** 严重度 */
  severity: Severity;
  /** 问题来源 */
  source:
    | "manual_inspection"
    | "lint_warning"
    | "build_error"
    | "test_failure"
    | "code_review"
    | "audit";
  /** 受影响文件列表 */
  affected_files: string[];
  /** 受影响模块（按目录第一级分组去重） */
  affected_modules: string[];
  /** 问题状态 */
  status: "open" | "in_progress" | "resolved" | "verified" | "wont_fix";
  /** P1 分类（仅当 severity="P1" 时有效） */
  p1_classification?: P1Classification;
  /** 发现阶段 */
  found_in_phase: PhaseEnum;
  /** 发现时的 cycle */
  found_in_cycle: number;
  /** 发现时间（ISO 8601） */
  found_at: string;
  /** 解决阶段 */
  resolved_in_phase?: PhaseEnum;
  /** 解决时间 */
  resolved_at?: string;
  /** 验证阶段 */
  verified_in_phase?: PhaseEnum;
  /** 验证时间 */
  verified_at?: string;
  /** 路由目标（若触发回退） */
  route_target?: RouteTarget;
  /** 修复描述 */
  fix_description?: string;
  /** 验证结果 */
  verification_result?: "pass" | "fail" | "blocked";
}

// ============================================================
// Routing 路由类型
// ============================================================

/** 路由历史条目 */
export interface RoutingEntry {
  /** 路由编号 */
  route_id: string;
  /** 路由发生的 cycle */
  cycle: number;
  /** 路由来源 phase */
  from_phase: PhaseEnum;
  /** 路由目标 phase */
  to_phase: PhaseEnum;
  /** 触发路由的问题严重度 */
  severity: Severity;
  /** 触发路由的原因 */
  reason: string;
  /** 关联的 issue ID 列表 */
  issue_ids: string[];
  /** P1 分类（若 severity=P1） */
  p1_classification?: P1Classification;
  /** 路由时间（ISO 8601） */
  routed_at: string;
}

// ============================================================
// Phase 间合约类型
// ============================================================

/** Phase 间合约——记录各 phase 的完成状态与重试次数 */
export interface PhaseContracts {
  [phase: string]: {
    /** 是否已完成 */
    completed: boolean;
    /** 完成时间（ISO 8601） */
    completed_at?: string;
    /** 该 phase 重试次数 */
    retry_count: number;
    /** 该 phase 跳过原因 */
    skip_reason?: string;
    /** Phase 产出 artifact 路径 */
    artifact_path?: string;
    /** Artifact 生成时间 */
    artifact_generated_at?: string;
  };
}

/** Phase 跳转记录 */
export interface PhaseTransition {
  /** 来源 phase */
  from: PhaseEnum;
  /** 目标 phase */
  to: PhaseEnum;
  /** 跳转时间（ISO 8601） */
  at: string;
  /** 跳转原因 */
  reason?: string;
}

// ============================================================
// PendingConfirmation / 用户确认类型
// ============================================================

/** 待用户确认条目 */
export interface PendingConfirmation {
  /** 确认 ID */
  confirmation_id: string;
  /** 确认状态 */
  status: "awaiting_user" | "timed_out" | "resolved" | "auto_degraded";
  /** 创建时间（ISO 8601） */
  created_at: string;
  /** 超时分钟数 */
  timeout_minutes: number;
  /** 触发确认的 phase */
  triggered_in_phase: PhaseEnum;
  /** 确认问题描述 */
  question: string;
  /** 选项列表 */
  options: ConfirmationOption[];
  /** 默认选项索引 */
  default_option_index: number;
  /** 用户选择的选项（若已选择） */
  selected_option_index?: number;
  /** 解决时间 */
  resolved_at?: string;
}

/** 确认选项 */
export interface ConfirmationOption {
  /** 选项标签 */
  label: string;
  /** 选项描述 */
  description: string;
  /** 是否为默认选项 */
  is_default: boolean;
}

// ============================================================
// RepairContext 修复上下文
// ============================================================

/** 修复上下文——当 P1(impl)/P2 路由到 part_2_2 修复模式时设置 */
export interface RepairContext {
  /** 是否处于修复模式 */
  active: boolean;
  /** 触发修复的 issue ID */
  source_issue_id: string;
  /** 修复原因 */
  reason: string;
  /** 修复目标 phase */
  target_phase: PhaseEnum;
  /** 修复预算（额外 token 分配） */
  repair_budget: number;
  /** 修复预算已消耗量 */
  repair_budget_consumed: number;
  /** 修复创建时间（ISO 8601） */
  created_at: string;
  /** 修复是否已消耗 */
  consumed: boolean;
  /** 修复消耗时间 */
  consumed_at?: string;
}

// ============================================================
// BudgetState 收敛预算
// ============================================================

/** 收敛预算状态 */
export interface BudgetState {
  /** 当前 phase 预算（tokens） */
  phase_budget: number;
  /** 当前 phase 已消耗预算 */
  phase_budget_consumed: number;
  /** 软警告（80%）是否已发出 */
  phase_budget_warning_issued: boolean;
  /** Phase 预算是否已耗尽（100%） */
  phase_budget_exhausted: boolean;
  /** Phase 预算耗尽次数累计 */
  phase_budget_exhaustion_count: number;
  /** Cycle 总预算（sum(all phases) × 1.2） */
  cycle_total_budget: number;
  /** Cycle 总消耗 */
  cycle_total_consumed: number;
  /** Agent 本会话预估 token 消耗 */
  estimated_tokens_this_session: number;
  /** 上下文使用百分比 */
  context_usage_pct: number;
  /** 预算超限动作 */
  budget_overrun_action: "checkpoint_and_exit" | "pause" | "warn";
}

/** 各 Phase 预设 token 预算 */
export const PHASE_BUDGET_PRESETS: Record<string, number> = {
  part_1_1: 15000,
  part_1_2: 12000,
  part_1_3: 10000,
  part_2_1: 12000,
  part_2_2: 25000,
  part_2_3: 10000,
  part_2_4: 8000,
  part_2_5: 8000,
  part_2_6: 20000,
  part_2_7: 12000,
  part_2_8: 8000,
};

// ============================================================
// BubbleState——Part 1 设计气泡拆分
// ============================================================

/** Part 1 设计气泡拆分状态 */
export interface BubbleState {
  /** 气泡 ID */
  bubble_id: string;
  /** 当前拆分索引（0 为未拆分） */
  split_index: number;
  /** 最大允许拆分次数（≥ 3 强制降级） */
  max_splits: number;
  /** 各子 phase 完成进度 */
  sub_phase_progress: {
    part_1_1: number;
    part_1_2: number;
    part_1_3: number;
  };
  /** Checkpoint 文件路径 */
  checkpoint_file: string | null;
  /** 是否已降级 */
  degraded: boolean;
  /** 降级原因 */
  degraded_reason: string | null;
  /** 所做假设数量 */
  assumptions_count: number;
  /** 质量信号 */
  quality_signals: QualitySignals;
}

/** 质量退化信号 */
export interface QualitySignals {
  /** 语义重复计数 */
  semantic_repetition_count: number;
  /** 矛盾声明计数 */
  contradiction_count: number;
}

/** 气泡 Checkpoint 文件格式 */
export interface BubbleCheckpoint {
  schema_version: number;
  bubble_id: string;
  split_index: number;
  split_reason: string;
  split_at_phase: PhaseEnum;
  completed_sub_phases: PhaseEnum[];
  current_sub_phase: PhaseEnum;
  pending_decisions: string[];
  unresolved_ambiguities: string[];
  assumptions_made: string[];
  next_agent_action: string;
  created_at: string;
  estimated_remaining_tokens_needed: number;
}

// ============================================================
// P0 复发升级类型
// ============================================================

/** P0 签名——用于检测同一 P0 跨 cycle 复发 */
export interface P0Signature {
  /** 标准化描述 */
  description_normalized: string;
  /** 根因标签 */
  root_cause_tag: string;
  /** 受影响模块（去重排序） */
  affected_modules: string[];
  /** 路由目标 */
  route_target: string;
  /** 首次发现 cycle */
  first_seen_cycle: number;
  /** 首次发现时间（ISO 8601） */
  first_seen_at: string;
}

/** P0 签名历史条目（写入 state.json p0_history） */
export interface P0SignatureEntry {
  /** P0 唯一 ID */
  p0_id: string;
  /** P0 签名 */
  signature: P0Signature;
  /** 出现次数 */
  occurrence_count: number;
  /** 首次发现 cycle */
  first_seen_cycle: number;
  /** 首次发现时间 */
  first_seen_at: string;
  /** 最近发现 cycle */
  last_seen_cycle: number;
  /** 最近发现时间 */
  last_seen_at: string;
  /** 修复历史 */
  fix_history: FixHistoryEntry[];
  /** 升级级别 */
  escalation_level: "active" | "paused" | "failed";
  /** 升级时间 */
  escalated_at?: string;
}

/** P0 修复历史条目 */
export interface FixHistoryEntry {
  /** 修复所在 cycle */
  cycle: number;
  /** 修复描述 */
  fix_description: string;
  /** 验证时间 */
  verified_at?: string;
  /** 验证结果 */
  verification_result?: "pass" | "fail" | "blocked";
}

/** P0 复发检测结果 */
export interface RecurrenceResult {
  /** 是否为复发 */
  isRecurrence: boolean;
  /** 匹配的历史签名 */
  matchedSignature?: P0Signature;
  /** 复发评分（0-1） */
  recurrenceScore: number;
  /** 历史复发次数 */
  recurrenceCount: number;
  /** 算法 A（Levenshtein）评分 */
  levenshteinScore: number;
  /** 算法 B（Jaccard）评分 */
  jaccardScore: number;
  /** 算法 C（模块重叠）评分 */
  moduleOverlapScore: number;
}

// ============================================================
// Watchdog 监控类型
// ============================================================

/** Watchdog 状态 */
export interface WatchdogState {
  /** Watchdog 进程 PID */
  pid: number | null;
  /** Watchdog 是否在运行 */
  running: boolean;
  /** 最后心跳时间（ISO 8601） */
  last_heartbeat_at: string | null;
  /** 最后 marker 时间（ISO 8601） */
  last_marker_at: string | null;
  /** 告警列表 */
  alerts: WatchdogAlert[];
  /** Watchdog 启动时间 */
  started_at: string | null;
}

/** Watchdog 告警 */
export interface WatchdogAlert {
  /** 告警 ID */
  alert_id: string;
  /** 告警类型 */
  type:
    | "stale_heartbeat"
    | "agent_stuck"
    | "gate_violation_escalation"
    | "budget_exhaustion"
    | "stagnant_output"
    | "session_timeout";
  /** 告警详情 */
  details: string;
  /** 告警时间（ISO 8601） */
  alerted_at: string;
  /** 是否已处理 */
  resolved: boolean;
  /** 处理时间 */
  resolved_at?: string;
}

/** Watchdog 心跳格式（单行 JSON） */
export interface HeartbeatEntry {
  /** 父进程 PID */
  pid: number;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 当前 cycle */
  cycle: number;
  /** 当前 phase */
  phase: PhaseEnum;
  /** Agent 是否在运行 */
  agent_running: boolean;
}

// ============================================================
// SAP Block 校验类型
// ============================================================

/** agent 输出的 <<<LOOP_STATE>>> block 数据 */
export interface SapBlock {
  /** 当前 phase */
  phase: PhaseEnum;
  /** 当前 cycle */
  cycle: number;
  /** Convergence counter */
  convergence_counter: number;
  /** 活跃 P0 数量 */
  active_p0_count: number;
  /** 活跃 P1 数量 */
  active_p1_count: number;
  /** 活跃 P2 数量 */
  active_p2_count: number;
  /** 本次完成的任务数 */
  tasks_completed: number;
  /** 本次发现的问题数（含 P0/P1/P2） */
  issues_found: number;
  /** Phase 合约完成声明 */
  phase_contract_claimed: string | null;
  /** SAP 输出时间 */
  emitted_at: string;
}

/** SAP 校验结果 */
export interface SapValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** SAP 声明与实际 state 的偏差 */
  deviation: number;
  /** 偏差详情 */
  details: SapDeviation[];
  /** 是否允许终止（偏差 < 2 方可终止） */
  allows_termination: boolean;
}

/** SAP 偏差条目 */
export interface SapDeviation {
  /** 偏差字段 */
  field: string;
  /** SAP 声明值 */
  claimed: unknown;
  /** state.json 实际值 */
  actual: unknown;
}

// ============================================================
// LoopState——文件状态机核心数据结构
// ============================================================

/**
 * 文件驱动状态机核心类型。
 *
 * 写入 `.loop-opencode/state.json`，agent 每轮读写。
 * 扛 compaction、扛 session 重启。
 */
export interface LoopState {
  /** Schema 版本号——用于迁移与兼容性检查 */
  schema_version: number;

  /** 进度状态 */
  progress: {
    /** 当前 phase */
    phase: PhaseEnum;
    /** 工作流 pass 次数（仅 P0/P1/P2 回退时递增） */
    cycle: number;
    /** 方案稳定性计数器（无新问题则 +1，发现任何级别问题重置为 0） */
    convergence_counter: number;
    /** Part 1 内部迭代数 */
    part1_round: number;
    /** 硬验证通过次数 */
    verification_pass_count: number;
    /** 修复上下文（null 表示常规模式） */
    repair_context: RepairContext | null;
    /** 收敛预算状态 */
    budget: BudgetState;
    /** Part 1 气泡拆分状态 */
    bubble_state: BubbleState;
    /** Phase 跳转历史 */
    phase_transitions: PhaseTransition[];
    /** 当前 phase 重试次数 */
    retry_count_this_phase: number;
  };

  /** 运行配置 */
  config: {
    /** 运行模式 */
    mode: RunMode;
    /** 是否启用 TDD */
    tdd: boolean;
    /** 是否跳过测试阶段 */
    skip_testing: boolean;
    /** 最大 cycle 数（默认 5，上限 50） */
    max_cycles: number;
    /** Part 1 最大内部轮次 */
    max_part1_rounds: number;
    /** 收敛所需轮次（默认 2） */
    convergence_rounds: number;
    /** 路由重复最大次数（默认 3） */
    route_repeat_max: number;
    /** Part 1 超时分钟数 */
    part1_timeout_minutes: number;
    /** pending_confirmation 超时分钟数 */
    pending_confirmation_timeout_minutes: number;
    /** 用户原始需求描述 */
    user_request: string;
    /** 是否使用 --auto 模式 */
    auto_mode: boolean;
    /** 子 agent 实现引擎 */
    impl_engine: "direct" | "subagent";
    /** 版本号 */
    version: string;
  };

  /** 问题跟踪 */
  issues: {
    /** 当前活跃问题 */
    active: {
      p0: Issue[];
      p1: Issue[];
      p2: Issue[];
    };
    /** 全时统计 */
    all_time: {
      p0_total: number;
      p1_total: number;
      p2_total: number;
    };
  };

  /** 路由历史 */
  routing_history: RoutingEntry[];

  /** P0 复发历史 */
  p0_history: P0SignatureEntry[];

  /** Phase 间合约 */
  phase_contracts: PhaseContracts;

  /** 待确认项 */
  pending_confirmation: PendingConfirmation | null;

  /** Watchdog 状态 */
  watchdog: WatchdogState;

  /** 终止信息 */
  termination: {
    /** 终止状态 */
    status: "active" | "complete" | "paused" | "failed";
    /** 退出原因 */
    exit_reason: TerminationReason | null;
    /** 完成时间（ISO 8601） */
    completed_at: string | null;
    /** 暂停时间 */
    paused_at: string | null;
    /** 失败时间 */
    failed_at: string | null;
  };

  /** Artifact 产出物元数据 */
  artifacts: {
    /** 各 phase 产出状态 */
    [phase: string]: {
      /** 产出状态 */
      status: "not_started" | "in_progress" | "generated" | "skipped";
      /** 产出时间 */
      generated_at: string | null;
      /** 产出 phase */
      generated_in_phase: string | null;
    };
  };

  /** 创建时间（ISO 8601） */
  created_at: string;
  /** 最后更新时间（ISO 8601） */
  updated_at: string;
}

// ============================================================
// Termination 终止评估类型
// ============================================================

/** should_terminate() 返回值 */
export interface TerminationResult {
  /** 是否应终止 */
  shouldTerminate: boolean;
  /** 终止原因 */
  reason: TerminationReason;
  /** 是否仅为警告（不会实际终止） */
  warning?: boolean;
  /** 终止详情 */
  detail?: string;
}

// ============================================================
// Plugin / OpenCode 事件系统接口
// ============================================================

/** tool.execute.before 上下文 */
export interface ToolExecuteBeforeContext {
  /** 工具名称 */
  toolName: string;
  /** 工具输入参数 */
  toolInput: Record<string, unknown>;
  /** 会话 ID */
  sessionId: string;
}

/** 插件决策返回值 */
export interface PluginDecision {
  /** 是否允许执行 */
  allow: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** 用户提示消息 */
  message?: string;
  /** 是否需要用户确认 */
  requireConfirmation?: boolean;
}

/** 工具执行前拦截结果（与 PluginDecision 兼容，用于 onPreToolUse 返回值） */
export type ToolExecuteBeforeResult = PluginDecision;

/** Gate State 文件格式 */
export interface GateState {
  /** Schema 版本 */
  schema_version: number;
  /** 各闸门状态 */
  gates: {
    [gate_id: string]: GateRecord;
  };
  /** Watchdog 告警（仅 watchdog 可写入） */
  watchdog_alerts: WatchdogAlert[];
  /** 终止信息（plugin/二进制/agent 可读，仅 plugin/二进制可写） */
  termination: {
    status: "active" | "complete" | "paused" | "failed";
    exit_reason: TerminationReason | null;
  };
}

/** 闸门拦截记录 */
export interface GateRecord {
  /** 闸门 ID */
  gate_id: string;
  /** 闸门名称 */
  name: string;
  /** 拦截次数 */
  block_count: number;
  /** 最近拦截时间 */
  last_blocked_at: string | null;
  /** 最近拦截原因 */
  last_block_reason: string | null;
}

// ============================================================
// Post-hoc 审计类型
// ============================================================

/** Post-hoc 审计发现 */
export interface PostHocFinding {
  /** 发现编号 */
  finding_id: string;
  /** 发现类型 */
  type: "merge_commit" | "pr_created" | "worktree_created" | "file_changed_outside_plan";
  /** 发现详情 */
  detail: string;
  /** 发现时间 */
  found_at: string;
  /** 关联文件/分支 */
  related_entity: string;
  /** 严重度 */
  severity: "warning" | "violation";
}

// ============================================================
// 错误码类型
// ============================================================

/** 错误码条目 */
export interface ErrorCodeEntry {
  /** 错误码 */
  code: string;
  /** 错误类别 */
  category: string;
  /** 严重度 */
  severity: Severity;
  /** 错误描述（中文） */
  description: string;
  /** 建议处理方式 */
  suggestion: string;
}

// ============================================================
/**
 * 平台无关能力代号 —— 17 个 CAP_*
 *
 * 每个 CAP_* 对应工作流中的一个原子能力。路由引擎根据当前 Phase 和 Issue 严重度，
 * 从该表中选取目标能力代号派发给 agent。
 *
 * 覆盖领域：头脑风暴、方向研究、方案规划、代码实施、Code Review、测试策略/规划/执行、
 * 审计、验证、路由、终止、自检、预算管理、升级、修复、气泡拆分。
 *
 * 与 loop-claudecode 共享语义，确保跨平台能力定义一致。
 */
export const CAPABILITIES = {
  CAP_BRAINSTORM: "cap_brainstorm",
  CAP_RESEARCH: "cap_research",
  CAP_PLAN: "cap_plan",
  CAP_IMPLEMENT: "cap_implement",
  CAP_CODE_REVIEW: "cap_code_review",
  CAP_TEST_STRATEGY: "cap_test_strategy",
  CAP_TEST_PLAN: "cap_test_plan",
  CAP_TEST_EXEC: "cap_test_exec",
  CAP_AUDIT: "cap_audit",
  CAP_VERIFY: "cap_verify",
  CAP_ROUTE: "cap_route",
  CAP_TERMINATE: "cap_terminate",
  CAP_SELF_CHECK: "cap_self_check",
  CAP_BUDGET: "cap_budget",
  CAP_ESCALATE: "cap_escalate",
  CAP_REPAIR: "cap_repair",
  CAP_BUBBLE: "cap_bubble",
} as const;

/** 平台无关能力代号的联合类型——从 CAPABILITIES 对象的所有值中提取 */
export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

// ============================================================
// 锁协议类型
// ============================================================

/** 锁文件内容 */
export interface LockFileContent {
  /** 持有者 PID */
  pid: number;
  /** 持有者角色 */
  role: "main" | "watchdog" | "plugin";
  /** 获取锁时间（ISO 8601） */
  acquired_at: string;
  /** 锁超时秒数 */
  timeout_seconds: number;
}
