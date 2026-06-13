/**
 * loop-opencode 错误码系统 —— 105 个错误码
 *
 * 错误码基于 phase 枚举 × P0/P1/P2 严重度 × 路由目标 × 终止原因的笛卡尔积组合。
 * 编码格式: ERR_<CATEGORY>_<NNNN>（类别缩写 + 4 位数字）。
 *
 * @module error-codes
 * @version 0.1.0
 */

import type { ErrorCodeEntry } from "./types";

/**
 * 105 个错误码定义表
 *
 * 分类：
 * - STATE:  状态管理 (8)
 * - PHASE:  Phase 流转 (19)
 * - ROUTE:  路由决策 (12)
 * - GATE:   安全闸门 (18)
 * - BUDGET: 收敛预算 (6)
 * - WDOG:   Watchdog (6)
 * - P0ESC:  P0 复发升级 (5)
 * - BUBBLE: Part 1 气泡拆分 (5)
 * - SAP:    SAP block 校验 (4)
 * - SEM:    语义相似度 (3)
 * - POST:   Post-hoc 审计 (4)
 * - TERM:   终止条件 (7)
 * - INIT:   初始化 (3)
 * - SYS:    系统通用 (5)
 * 合计: 105
 */
export const ERROR_CODES: ErrorCodeEntry[] = [
  // ==========================================================
  // ERR_STATE —— 状态管理错误 (8)
  // ==========================================================
  {
    code: "ERR_STATE_0001",
    category: "state",
    severity: "P0",
    description: "无法读取 state.json——文件不存在或权限不足",
    suggestion: "检查 .loop-opencode/state.json 是否存在且可读，必要时执行 --init 重建",
  },
  {
    code: "ERR_STATE_0002",
    category: "state",
    severity: "P0",
    description: "无法写入 state.json——磁盘满或权限不足",
    suggestion: "检查磁盘空间与 .loop-opencode/ 目录写入权限",
  },
  {
    code: "ERR_STATE_0003",
    category: "state",
    severity: "P1",
    description: "state.json Schema 校验失败——字段缺失或类型错误",
    suggestion: "检查 state.json 与 LoopState 类型定义是否一致，必要时从 .bak 恢复",
  },
  {
    code: "ERR_STATE_0004",
    category: "state",
    severity: "P0",
    description: "state.json 已损坏——JSON 解析失败",
    suggestion: "从 state.json.bak 自动恢复，若 .bak 也损坏则执行 --init --force",
  },
  {
    code: "ERR_STATE_0005",
    category: "state",
    severity: "P1",
    description: "state.json 并发锁获取超时——另一进程持有锁超过阈值",
    suggestion: "等待重试或手动检查 .lock 文件并清理僵死锁",
  },
  {
    code: "ERR_STATE_0006",
    category: "state",
    severity: "P0",
    description: "state.json 恢复失败——.bak 备份不可用",
    suggestion: "执行 --init --force 重新初始化，artifacts/ 目录内容将重建",
  },
  {
    code: "ERR_STATE_0007",
    category: "state",
    severity: "P0",
    description: "原子写入 fail——tmp→fsync→rename→fsync dir 四步法中断",
    suggestion: "清理 state.json.tmp 残留，重试写入。若反复出现检查磁盘",
  },
  {
    code: "ERR_STATE_0008",
    category: "state",
    severity: "P2",
    description: ".bak 备份文件写入失败",
    suggestion: "不影响主流程但需关注——检查磁盘空间；主 state.json 仍有效",
  },

  // ==========================================================
  // ERR_PHASE —— Phase 流转错误 (19)
  // ==========================================================
  {
    code: "ERR_PHASE_0101",
    category: "phase",
    severity: "P1",
    description: "init phase 未完成——state.json 缺少必要初始字段",
    suggestion: "执行 --init 完成初始化后再启动主循环",
  },
  {
    code: "ERR_PHASE_0102",
    category: "phase",
    severity: "P1",
    description: "part_1_1 需求澄清失败——agent 无法产出 01-requirements.md",
    suggestion: "检查用户需求描述是否可操作，可能需要更具体的需求表述",
  },
  {
    code: "ERR_PHASE_0103",
    category: "phase",
    severity: "P1",
    description: "part_1_2 方向研究失败——技术选型无可行方案",
    suggestion: "放宽技术约束或调整需求范围，在 02-direction.md 中记录阻塞项",
  },
  {
    code: "ERR_PHASE_0104",
    category: "phase",
    severity: "P1",
    description: "part_1_3 方案形成失败——无法产出完整 03-solution.md",
    suggestion: "回退到 part_1_2 重新评估方向，或缩小方案范围",
  },
  {
    code: "ERR_PHASE_0105",
    category: "phase",
    severity: "P1",
    description: "part_2_1 实施规划失败——方案无法分解为可执行 Task",
    suggestion: "检查 03-solution.md 是否足够详细，必要时回退 part_1_3 补充",
  },
  {
    code: "ERR_PHASE_0106",
    category: "phase",
    severity: "P1",
    description: "part_2_2 代码实施失败——Task 执行中断或产出不完整",
    suggestion: "检查错误日志，根据失败原因设置 repair_context 或路由回退",
  },
  {
    code: "ERR_PHASE_0107",
    category: "phase",
    severity: "P1",
    description: "part_2_3 Code Review 失败——审查报告无法生成",
    suggestion: "检查 05b-implementation-diff.patch 是否有效",
  },
  {
    code: "ERR_PHASE_0108",
    category: "phase",
    severity: "P1",
    description: "part_2_4 E2E 测试策略研究失败",
    suggestion: "若 skip_testing=true 则自动跳过；否则设置 P1 issue 并降级到 part_2_5",
  },
  {
    code: "ERR_PHASE_0109",
    category: "phase",
    severity: "P1",
    description: "part_2_5 测试规划失败——策略无法转化为可执行测试 Task",
    suggestion: "检查 06b-test-strategy.md 输出质量，若为空则降级推进",
  },
  {
    code: "ERR_PHASE_0110",
    category: "phase",
    severity: "P1",
    description: "part_2_6 测试执行失败——测试编写或运行异常",
    suggestion: "保留已执行结果；记录失败测试为 P1 issue；推进到 part_2_7",
  },
  {
    code: "ERR_PHASE_0111",
    category: "phase",
    severity: "P1",
    description: "part_2_7 验证审计失败——artifact 链不完整或交叉引用矛盾",
    suggestion: "产出已知问题清单；标记缺失 artifact；推进到 part_2_8",
  },
  {
    code: "ERR_PHASE_0112",
    category: "phase",
    severity: "P0",
    description: "part_2_8 硬验证闸门失败——验证命令不通过",
    suggestion: "retry 最多 2 次；若持续失败 → 记录 P0 + pause",
  },
  {
    code: "ERR_PHASE_0113",
    category: "phase",
    severity: "P1",
    description: "routing phase 判定逻辑因 state 不完整而失败",
    suggestion: "手动检查 state.json issues 字段完整性",
  },
  {
    code: "ERR_PHASE_0114",
    category: "phase",
    severity: "P0",
    description: "complete 状态遭遇新问题——不应出现的状态冲突",
    suggestion: "回退状态为 active 并路由到对应 phase",
  },
  {
    code: "ERR_PHASE_0115",
    category: "phase",
    severity: "P0",
    description: "paused 状态下不应触发新的 agent 会话",
    suggestion: "用户手动恢复（设置 termination.status=active）后重新启动",
  },
  {
    code: "ERR_PHASE_0116",
    category: "phase",
    severity: "P0",
    description: "failed 终态——不可自动恢复",
    suggestion: "检查 termination.exit_reason，人工介入分析根因",
  },
  {
    code: "ERR_PHASE_0117",
    category: "phase",
    severity: "P1",
    description: "awaiting_approval 超时——用户未在 timeout 内回复",
    suggestion: "自动降级为默认选项推进；或延长 timeout_minutes",
  },
  {
    code: "ERR_PHASE_0118",
    category: "phase",
    severity: "P2",
    description: "Phase 跳转非法——从当前 phase 不可跳到目标 phase",
    suggestion: "检查 phase_transitions 规则表；记录跳转错误并修正状态",
  },
  {
    code: "ERR_PHASE_0119",
    category: "phase",
    severity: "P1",
    description: "Part 1 设计气泡在一次会话内未完成——异常退出",
    suggestion: "从 bubble_checkpoint.json 恢复，继续未完成的子 phase",
  },

  // ==========================================================
  // ERR_ROUTE —— 路由决策错误 (12)
  // ==========================================================
  {
    code: "ERR_ROUTE_0201",
    category: "route",
    severity: "P0",
    description: "P0 路由失败——需求理解错误或架构方向错误触发回退",
    suggestion: "回退到 part_1_1 重新进行头脑风暴，cycle += 1",
  },
  {
    code: "ERR_ROUTE_0202",
    category: "route",
    severity: "P1",
    description: "P1(design) 路由——跨模块接口设计缺陷须回退方案层",
    suggestion: "回退到 part_1_3 修改方案，cycle += 1",
  },
  {
    code: "ERR_ROUTE_0203",
    category: "route",
    severity: "P1",
    description: "P1(impl) 路由——核心功能缺失或实现错误但方案无需改",
    suggestion: "设置 repair_context 并路由到 part_2_2 修复模式",
  },
  {
    code: "ERR_ROUTE_0204",
    category: "route",
    severity: "P2",
    description: "P2 路由——边界 case 或 UI 瑕疵需修补",
    suggestion: "设置 repair_context 并路由到 part_2_2 常规修复",
  },
  {
    code: "ERR_ROUTE_0205",
    category: "route",
    severity: "P1",
    description: "P1 决策树判定失败——无法确定设计级还是实现级",
    suggestion: "默认路由到 part_2_2（实现级修复）作为保守策略",
  },
  {
    code: "ERR_ROUTE_0206",
    category: "route",
    severity: "P0",
    description: "同一路由目标重复 >= route_repeat_max（默认 3 次）",
    suggestion: "暂停并输出诊断报告，请求用户手动介入判断",
  },
  {
    code: "ERR_ROUTE_0207",
    category: "route",
    severity: "P0",
    description: "路由循环检测——phase 跳转形成死循环",
    suggestion: "检查 routing_history 最近 N 条是否重复；设置 paused",
  },
  {
    code: "ERR_ROUTE_0208",
    category: "route",
    severity: "P1",
    description: "路由时缺少必要 issue 信息——issue_id 引用无效",
    suggestion: "检查 issues.active 中 issue 完整性；补全缺失字段后重试",
  },
  {
    code: "ERR_ROUTE_0209",
    category: "route",
    severity: "P1",
    description: "convergence_counter 操作表执行异常——加减逻辑冲突",
    suggestion: "审计 convergence_counter 变更历史，手动修正异常值",
  },
  {
    code: "ERR_ROUTE_0210",
    category: "route",
    severity: "P2",
    description: "路由目标 phase 合约未满足——目标 phase 的前置条件不足",
    suggestion: "检查 phase_contracts 中依赖 phase 的完成状态",
  },
  {
    code: "ERR_ROUTE_0211",
    category: "route",
    severity: "P0",
    description: "路由后将进入已标记为 failed 的 phase",
    suggestion: "检查目标 phase 的合约状态；若不可恢复则设置 paused",
  },
  {
    code: "ERR_ROUTE_0212",
    category: "route",
    severity: "P1",
    description: "repair_context 路由——修复模式目标 phase 不可达",
    suggestion: "检查 repair_context.target_phase 的合约依赖链",
  },

  // ==========================================================
  // ERR_GATE —— 安全闸门错误 (18)
  // ==========================================================
  {
    code: "ERR_GATE_0301",
    category: "gate",
    severity: "P1",
    description: "G1 内容安全检查触发——检测到 malware/exploit/backdoor 关键词",
    suggestion: "人工审查 agent 输出内容，确认非误报后拒绝执行",
  },
  {
    code: "ERR_GATE_0302",
    category: "gate",
    severity: "P1",
    description: "G1 内容安全检查插件异常——规则加载失败",
    suggestion: "检查 plugin/guard-content-safety.ts 是否完整可用",
  },
  {
    code: "ERR_GATE_0303",
    category: "gate",
    severity: "P2",
    description: "G1 误报风险——关键词匹配过度敏感",
    suggestion: "调优关键词列表或添加白名单规则",
  },
  {
    code: "ERR_GATE_0304",
    category: "gate",
    severity: "P1",
    description: "G2 方案确认拦截——L1 模式下方案未获用户确认",
    suggestion: "等待用户在 pending_confirmation 中确认方案或调整模式",
  },
  {
    code: "ERR_GATE_0305",
    category: "gate",
    severity: "P2",
    description: "G2 方案确认自动通过记录——L2 模式跳过用户确认",
    suggestion: "此为非错误；仅作审计日志记录",
  },
  {
    code: "ERR_GATE_0306",
    category: "gate",
    severity: "P2",
    description: "G2 插件 context 读取失败——无法获取 state.json",
    suggestion: "检查 .loop-opencode/state.json 读取权限",
  },
  {
    code: "ERR_GATE_0307",
    category: "gate",
    severity: "P1",
    description: "G3 依赖安装拦截——非默认源或未审批的安装命令",
    suggestion: "若信任来源则手动确认安装；否则拒绝",
  },
  {
    code: "ERR_GATE_0308",
    category: "gate",
    severity: "P1",
    description: "G3 依赖安装审批超时——用户未在规定时间内确认",
    suggestion: "拒绝该次安装，agent 需寻找替代方案",
  },
  {
    code: "ERR_GATE_0309",
    category: "gate",
    severity: "P2",
    description: "G3 依赖安装默认源白名单——自动通过",
    suggestion: "仅作审计日志记录",
  },
  {
    code: "ERR_GATE_0310",
    category: "gate",
    severity: "P0",
    description: "G4 L0 灾难级操作拦截——全模式硬拦截",
    suggestion: "永久拒绝执行；审查 agent 意图是否异常",
  },
  {
    code: "ERR_GATE_0311",
    category: "gate",
    severity: "P1",
    description: "G4 L1 不可逆操作拦截——仅 safe/auto 模式拦截",
    suggestion: "若在 unsafe 模式下可放行；否则需用户手动确认",
  },
  {
    code: "ERR_GATE_0312",
    category: "gate",
    severity: "P1",
    description: "G4 L2 高影响操作超阈值拦截",
    suggestion: "评估操作影响范围；超出阈值则拒绝或降级为 L1",
  },
  {
    code: "ERR_GATE_0313",
    category: "gate",
    severity: "P1",
    description: "G5 文件变更超阈值——单次变更文件数超限",
    suggestion: "拆分变更为多次操作或提升阈值",
  },
  {
    code: "ERR_GATE_0314",
    category: "gate",
    severity: "P2",
    description: "G5 文件变更记录异常——tool.execute.after 未触发",
    suggestion: "检查 OpenCode 事件系统是否正常运行",
  },
  {
    code: "ERR_GATE_0315",
    category: "gate",
    severity: "P1",
    description: "G5 非计划文件遭到修改——变更文件不在 Task 清单中",
    suggestion: "审计变更意图；若无意变更则回退",
  },
  {
    code: "ERR_GATE_0316",
    category: "gate",
    severity: "P0",
    description: "G6 完成声明验证失败——should_terminate() 条件不满足",
    suggestion: "拒绝终止；输出未满足条件清单",
  },
  {
    code: "ERR_GATE_0317",
    category: "gate",
    severity: "P0",
    description: "Gate State Guard 拦截——agent 尝试写入 gate_state.json",
    suggestion: "拒绝写入；此文件仅 plugin/二进制可写",
  },
  {
    code: "ERR_GATE_0318",
    category: "gate",
    severity: "P1",
    description: "权限变更拦截——agent 尝试 modify permission rules",
    suggestion: "拒绝权限变更；仅用户可手动修改 opencode.json",
  },

  // ==========================================================
  // ERR_BUDGET —— 收敛预算错误 (6)
  // ==========================================================
  {
    code: "ERR_BUDGET_0401",
    category: "budget",
    severity: "P1",
    description: "Phase 预算 80% 软边界触发——token 消耗接近上限",
    suggestion: "加速收敛；输出软警告但不中断",
  },
  {
    code: "ERR_BUDGET_0402",
    category: "budget",
    severity: "P1",
    description: "Phase 预算 100% 硬边界——token 消耗达到上限",
    suggestion: "触发 budget_overrun_action（checkpoint_and_exit 或 pause）",
  },
  {
    code: "ERR_BUDGET_0403",
    category: "budget",
    severity: "P0",
    description: "Phase 预算重复耗尽 >= 3 次——同 phase 连续预算不足",
    suggestion: "立即 pause；exit_reason=phase_budget_repeated_exhaustion",
  },
  {
    code: "ERR_BUDGET_0404",
    category: "budget",
    severity: "P0",
    description: "Cycle 总预算超限——所有 phase 总消耗超出 cycle_total_budget",
    suggestion: "立即 pause；检查是否有 phase 异常消耗 token",
  },
  {
    code: "ERR_BUDGET_0405",
    category: "budget",
    severity: "P2",
    description: "Context 用量估算异常——三重估算法返回不一致结果",
    suggestion: "取最大值作为保守估计；审计估算偏差原因",
  },
  {
    code: "ERR_BUDGET_0406",
    category: "budget",
    severity: "P2",
    description: "Phase 预算注入失败——预算未正确写入 state.progress.budget",
    suggestion: "重新计算并注入 phase_budget",
  },

  // ==========================================================
  // ERR_WDOG —— Watchdog 监控错误 (6)
  // ==========================================================
  {
    code: "ERR_WDOG_0501",
    category: "watchdog",
    severity: "P1",
    description: "父进程心跳停滞 > 90s——父进程可能 hung",
    suggestion: "Watchdog 注入 alert；若持续停滞则 pause",
  },
  {
    code: "ERR_WDOG_0502",
    category: "watchdog",
    severity: "P2",
    description: "state.json mtime 停滞 > 15min——agent 可能卡住",
    suggestion: "Watchdog 注入 alert；检查 agent session 是否正常",
  },
  {
    code: "ERR_WDOG_0503",
    category: "watchdog",
    severity: "P1",
    description: "pending_confirmation 超时——Watchdog 检测到超时",
    suggestion: "Watchdog 执行 auto_degrade：选默认选项推进",
  },
  {
    code: "ERR_WDOG_0504",
    category: "watchdog",
    severity: "P0",
    description: "Watchdog 自身崩溃——父进程检测到 .watchdog_marker 超时",
    suggestion: "父进程在 2s 内 respawn watchdog 子进程",
  },
  {
    code: "ERR_WDOG_0505",
    category: "watchdog",
    severity: "P1",
    description: "Watchdog 锁竞争失败——无法获取 gate_lock 写入告警",
    suggestion: "重试最多 3 次；仍失败则记录到父进程日志",
  },
  {
    code: "ERR_WDOG_0506",
    category: "watchdog",
    severity: "P2",
    description: "Watchdog 启动失败——子进程 spawn 异常",
    suggestion: "检查二进制路径与执行权限；重试 spawn",
  },

  // ==========================================================
  // ERR_P0ESC —— P0 复发升级错误 (5)
  // ==========================================================
  {
    code: "ERR_P0ESC_0601",
    category: "p0_escalation",
    severity: "P0",
    description: "P0 首次复发——相同 P0 问题跨 cycle 再次出现",
    suggestion: "立即 pause；exit_reason=p0_recurrence；输出诊断报告",
  },
  {
    code: "ERR_P0ESC_0602",
    category: "p0_escalation",
    severity: "P0",
    description: "P0 恶性复发——同一 P0 复发 >= 2 次",
    suggestion: "标记 failed；exit_reason=p0_malignant_recurrence；需人工深度介入",
  },
  {
    code: "ERR_P0ESC_0603",
    category: "p0_escalation",
    severity: "P1",
    description: "P0 签名提取失败——无法标准化问题描述",
    suggestion: "使用原始描述作为 fallback；降低相似度判定阈值",
  },
  {
    code: "ERR_P0ESC_0604",
    category: "p0_escalation",
    severity: "P1",
    description: "P0 复发检测算法异常——三算法加权计算错误",
    suggestion: "fallback 到单一算法（Levenshtein）判定",
  },
  {
    code: "ERR_P0ESC_0605",
    category: "p0_escalation",
    severity: "P0",
    description: "P0 复发导致 convergence_counter 重置失败",
    suggestion: "手动重置 convergence_counter 为 0",
  },

  // ==========================================================
  // ERR_BUBBLE —— Part 1 气泡拆分错误 (5)
  // ==========================================================
  {
    code: "ERR_BUBBLE_0701",
    category: "bubble",
    severity: "P1",
    description: "C1 自动 checkpoint 触发——context_usage_pct >= 70%",
    suggestion: "写入 bubble_checkpoint.json，拆分上下文到新会话",
  },
  {
    code: "ERR_BUBBLE_0702",
    category: "bubble",
    severity: "P0",
    description: "强制降级——split_index >= 3 或 Part 1 预算耗尽 + 拆分 3 次",
    suggestion: "标记 degraded=true；pending_decisions 全选默认；强制推进 part_2_1",
  },
  {
    code: "ERR_BUBBLE_0703",
    category: "bubble",
    severity: "P2",
    description: "C3 质量退化警告——语义重复或矛盾 >= 3 次",
    suggestion: "生成警告性 checkpoint；加速收敛",
  },
  {
    code: "ERR_BUBBLE_0704",
    category: "bubble",
    severity: "P1",
    description: "气泡 checkpoint 恢复失败——checkpoint 文件损坏或缺失",
    suggestion: "从 context_summary.md 重建上下文；若不可行则从 part_1_1 重来",
  },
  {
    code: "ERR_BUBBLE_0705",
    category: "bubble",
    severity: "P1",
    description: "降级假设注入失败——无法追加到 03-solution.md",
    suggestion: "手动标注未解决歧义为假设并记录",
  },

  // ==========================================================
  // ERR_SAP —— SAP block 校验错误 (4)
  // ==========================================================
  {
    code: "ERR_SAP_0801",
    category: "sap",
    severity: "P0",
    description: "SAP block 缺失——agent 退出前未输出 <<<LOOP_STATE>>>",
    suggestion: "拒绝承认 phase 完成状态；重试当前 phase",
  },
  {
    code: "ERR_SAP_0802",
    category: "sap",
    severity: "P0",
    description: "SAP block 与 state.json 偏差 >= 2——agent 可能谎报",
    suggestion: "拒绝终止；审计偏差字段；必要时回退 agent 声明",
  },
  {
    code: "ERR_SAP_0803",
    category: "sap",
    severity: "P1",
    description: "SAP block JSON 解析失败——格式不符合 SapBlock 类型",
    suggestion: "检查 agent 输出是否包含非 JSON 内容；提取并重试解析",
  },
  {
    code: "ERR_SAP_0804",
    category: "sap",
    severity: "P1",
    description: "SAP phase_contract_claimed 与实际不匹配",
    suggestion: "拒绝该合约声明；重新执行当前 phase",
  },

  // ==========================================================
  // ERR_SEM —— 语义相似度计算错误 (3)
  // ==========================================================
  {
    code: "ERR_SEM_0901",
    category: "semantic",
    severity: "P2",
    description: "Levenshtein 距离计算异常——输入文本无效",
    suggestion: "使用归一化处理后的文本重新计算",
  },
  {
    code: "ERR_SEM_0902",
    category: "semantic",
    severity: "P2",
    description: "Jaccard 相似度计算异常——关键词提取失败",
    suggestion: "fallback 到纯 Levenshtein；标记本次结果置信度降低",
  },
  {
    code: "ERR_SEM_0903",
    category: "semantic",
    severity: "P2",
    description: "双算法结果差异过大——Levenshtein 与 Jaccard 得分差 > 0.3",
    suggestion: "以较低分值为准（保守策略）；记录分歧供人工审核",
  },

  // ==========================================================
  // ERR_POST —— Post-hoc 审计错误 (4)
  // ==========================================================
  {
    code: "ERR_POST_1001",
    category: "post_hoc",
    severity: "P0",
    description: "Post-hoc 检测到意外 merge commit——agent 未授权合并",
    suggestion: "记录 P0 issue；回退 merge；重新路由到 part_1_1",
  },
  {
    code: "ERR_POST_1002",
    category: "post_hoc",
    severity: "P1",
    description: "Post-hoc 检测到意外 PR 创建——agent 未经审批发起 PR",
    suggestion: "关闭 PR；记录 issue；检查是否需要方案级修正",
  },
  {
    code: "ERR_POST_1003",
    category: "post_hoc",
    severity: "P1",
    description: "Post-hoc 检测到意外 worktree——agent 绕过主流程创建隔离区",
    suggestion: "清理 worktree；记录 issue",
  },
  {
    code: "ERR_POST_1004",
    category: "post_hoc",
    severity: "P1",
    description: "Post-hoc 检测到非计划文件变更——Task 清单外的文件被修改",
    suggestion: "审计变更意图；若属无意则回退；若属必要则更新 Task 清单",
  },

  // ==========================================================
  // ERR_TERM —— 终止条件错误 (7)
  // ==========================================================
  {
    code: "ERR_TERM_1101",
    category: "termination",
    severity: "P1",
    description: "max_cycles 超限——cycle 达到 config.max_cycles",
    suggestion: "输出未解决问题清单；终止循环；建议人工接管",
  },
  {
    code: "ERR_TERM_1102",
    category: "termination",
    severity: "P2",
    description: "收敛快速路径未触发——CR >= 2 连续无新问题",
    suggestion: "继续标准收敛路径：verification_pass_count 递增",
  },
  {
    code: "ERR_TERM_1103",
    category: "termination",
    severity: "P1",
    description: "活跃 issue 未清零——存在 open 状态的 P0/P1 问题",
    suggestion: "回退路由处理未解决问题；不可直接终止",
  },
  {
    code: "ERR_TERM_1104",
    category: "termination",
    severity: "P1",
    description: "验证链不完整——关键 artifact 缺失",
    suggestion: "补全缺失 artifact；重跑验证闸门",
  },
  {
    code: "ERR_TERM_1105",
    category: "termination",
    severity: "P0",
    description: "verification_gate_failed_after_retries——硬验证重试耗尽",
    suggestion: "记录 P0 issue；设置 paused；用户手动介入",
  },
  {
    code: "ERR_TERM_1106",
    category: "termination",
    severity: "P0",
    description: "P0 复发导致无法收敛——工作流进入恶性循环",
    suggestion: "标记 failed；输出完整诊断与 p0_history",
  },
  {
    code: "ERR_TERM_1107",
    category: "termination",
    severity: "P1",
    description: "should_terminate() 评估异常——终止判定逻辑内部错误",
    suggestion: "fallback 到保守策略（不终止）；记录错误详情",
  },

  // ==========================================================
  // ERR_INIT —— 初始化错误 (3)
  // ==========================================================
  {
    code: "ERR_INIT_1201",
    category: "init",
    severity: "P0",
    description: "--init 失败——无法创建 .loop-opencode/ 目录结构",
    suggestion: "检查目标目录写入权限；确认磁盘空间充足",
  },
  {
    code: "ERR_INIT_1202",
    category: "init",
    severity: "P1",
    description: "--init 模板文件缺失——templates/ 中缺少必要模板",
    suggestion: "重新安装 loop-opencode 或手动补全 templates/ 目录",
  },
  {
    code: "ERR_INIT_1203",
    category: "init",
    severity: "P1",
    description: "--init 发现已存在 .loop-opencode/ 但未使用 --force",
    suggestion: "使用 --init --force 强制重新初始化（将备份现有状态）",
  },

  // ==========================================================
  // ERR_SYS —— 系统通用错误 (5)
  // ==========================================================
  {
    code: "ERR_SYS_1301",
    category: "system",
    severity: "P0",
    description: "文件系统错误——读写文件时遭遇 OS 级 I/O 错误",
    suggestion: "检查磁盘健康状态与文件系统完整性",
  },
  {
    code: "ERR_SYS_1302",
    category: "system",
    severity: "P1",
    description: "进程管理错误——spawn/exec 子进程失败",
    suggestion: "检查二进制执行权限与 PATH 环境变量",
  },
  {
    code: "ERR_SYS_1303",
    category: "system",
    severity: "P1",
    description: "环境变量缺失——必要的 env var 未设置",
    suggestion: "检查 LOOP_OPENCODE_ROLE、LOOP_PROJECT_ROOT 等环境变量",
  },
  {
    code: "ERR_SYS_1304",
    category: "system",
    severity: "P0",
    description: "未捕获异常——代码逻辑抛出意外错误",
    suggestion: "检查堆栈追踪；记录完整错误上下文；安全降级",
  },
  {
    code: "ERR_SYS_1305",
    category: "system",
    severity: "P2",
    description: "版本不兼容——schema_version 与当前二进制版本不匹配",
    suggestion: "执行迁移或使用对应版本二进制；检查 changelog",
  },
];

/**
 * 按错误码查找
 * @param code - 错误码字符串（如 "ERR_STATE_0001"）
 * @returns 匹配的错误码条目或 undefined
 */
export function lookupErrorCode(code: string): ErrorCodeEntry | undefined {
  return ERROR_CODES.find((e) => e.code === code);
}

/**
 * 按类别查找所有错误码
 * @param category - 错误类别
 * @returns 该类别下的所有错误码
 */
export function lookupByCategory(category: string): ErrorCodeEntry[] {
  return ERROR_CODES.filter((e) => e.category === category);
}

/**
 * 按严重度查找所有错误码
 * @param severity - P0/P1/P2
 * @returns 该严重度的所有错误码
 */
export function lookupBySeverity(severity: "P0" | "P1" | "P2"): ErrorCodeEntry[] {
  return ERROR_CODES.filter((e) => e.severity === severity);
}

/**
 * 验证是否为合法错误码
 * @param code - 待验证字符串
 */
export function isValidErrorCode(code: string): boolean {
  return ERROR_CODES.some((e) => e.code === code);
}

/**
 * 获取错误码总数——预期为 105
 */
export function totalErrorCodes(): number {
  return ERROR_CODES.length;
}