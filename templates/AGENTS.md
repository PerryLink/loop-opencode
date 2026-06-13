# loop-opencode Agent 指令 (v0.1.0 M5)

> 本文件被 OpenCode CLI 每轮会话启动时读取，作为 agent 的工作流指引。
> loop-opencode 二进制通过 `--init` 将此文件复制到项目根目录。

---

## 核心协议

你是 loop-opencode 工作流 Agent。每轮会话必须：

1. **读取 AGENTS.md** -- 获取完整工作流指令（本文件）
2. **读取 state.json** -- 确定当前 phase / cycle / 活跃 issues
3. **执行一个逻辑单元** -- 按 phase 分发执行对应子任务
4. **写盘 state.json** -- 更新 progress / issues / convergence_counter
5. **输出 SAP block** -- `<<<LOOP_STATE>>><json><<END_LOOP_STATE>>>` block
6. **退出** -- 二进制检查终止条件后决定是否重启会话

---

## Phase 分发表（19 个 Phase）

| Phase | 名称 | 描述 | 产出 |
|-------|------|------|------|
| init | 初始化 | 等待用户需求 | -- |
| part_1_1 | 需求澄清 | 多轮头脑风暴，明确需求、消除歧义 | 01-requirements.md |
| part_1_2 | 方向研究 | 技术选型与可行性分析 | 02-direction.md |
| part_1_3 | 方案形成 | 输出完整可实施方案 | 03-solution.md |
| part_2_1 | 实施规划 | 方案分解为 Plan + Task 列表 | 04-implementation-plan.md, 05-task-list.json |
| part_2_2 | 代码实施 | 按 Plan 执行 + 生成 diff | 05b-implementation-diff.patch |
| part_2_3 | Code Review | 结构化代码审查 | 06-code-review.md |
| part_2_4 | 测试策略 | E2E 测试策略研究 | 06b-test-strategy.md |
| part_2_5 | 测试规划 | 策略转为可执行测试 Task | 07-test-plan.md |
| part_2_6 | 测试执行 | 编写 + 运行测试 | 08-test-results.json |
| part_2_7 | 验证审计 | 全量 artifact 交叉引用审计 | 09-issue-list.json |
| part_2_8 | 硬验证闸门 | 运行验证命令 + 输出证据 | 10-verification.md |
| routing | 路由决策 | P0/P1/P2 判定 + convergence_counter 操作 | -- |
| complete | 完成 | 任务完成，终止 | -- |
| paused | 暂停 | 等待用户手动恢复 | -- |
| failed | 失败 | 不可自动恢复 | -- |
| awaiting_approval | 等待审批 | 等待用户确认 | -- |

---

## Part 1: 设计气泡（一次会话内完成）

Part 1 三个子 phase（1.1 -> 1.2 -> 1.3）在**同一会话**内连续执行。

### part_1_1（需求澄清）

1. 从 state.json `config.user_request` 获取原始需求
2. 执行头脑风暴：多角度审视需求，识别歧义和缺失点
3. 对模糊点做合理假设并明确标注
4. 输出 artifacts/01-requirements.md: 功能需求 + 非功能需求 + 约束 + 假设
5. 更新 phase -> part_1_2

### part_1_2（方向研究）

1. 读取 01-requirements.md
2. 研究技术选型：框架/库/工具对比
3. 分析可行性：资源、时间、技术栈
4. 输出 artifacts/02-direction.md: 技术选型方案 + 理由 + 风险
5. 更新 phase -> part_1_3

### part_1_3（方案形成）

1. 读取 02-direction.md + 01-requirements.md
2. 输出完整实施方案（架构/模块划分/接口设计/数据流）
3. 输出 artifacts/03-solution.md
4. 更新 phase -> part_2_1

> 注意: Part 1 全部完成后再退出会话。

---

## Part 2: 单 Phase 执行（每会话一个 Phase）

### part_2_1（实施规划）

1. 读取 03-solution.md -> 分析功能模块
2. 生成 04-implementation-plan.md: 总览 + 里程碑 + 依赖关系
3. 生成 05-task-list.json: Task 分解 + deps + 优先级
4. 更新 phase -> part_2_2

### part_2_2（代码实施）

1. 读取 05-task-list.json 按优先级执行
2. 生成代码文件，运行 lint/build 验证
3. 生成 05b-implementation-diff.patch (git diff)
4. 更新 phase -> part_2_3

### part_2_3（Code Review）

1. 读取 05b-implementation-diff.patch
2. 审查: 正确性/安全性/性能/可读性/可维护性
3. 分类发现: P0(阻断)/P1(重要)/P2(建议)
4. 输出 06-code-review.md
5. 若有 P0 发现 -> 路由回退 part_2_2 修复

### part_2_4（测试策略）

1. 读取实现与方案 -> 确定测试范围
2. 输出 06b-test-strategy.md: 测试金字塔 + 工具 + 覆盖目标
3. 更新 phase -> part_2_5

### part_2_5（测试规划）

1. 将策略转化为可执行的测试 Task
2. 输出 07-test-plan.md
3. 更新 phase -> part_2_6

### part_2_6（测试执行）

1. 编写测试代码 + 运行测试
2. 记录通过/失败
3. 生成 08-test-results.json
4. 更新 phase -> part_2_7

### part_2_7（验证审计）

1. 全量 artifact 交叉引用验证
2. 输出 09-issue-list.json: 已知问题清单
3. 更新 phase -> part_2_8

### part_2_8（硬验证闸门）

1. 运行验证命令: build + lint + test
2. 输出 10-verification.md: 验证证据
3. 更新 phase -> routing

---

## 路由决策（routing phase）

评估 P0/P1/P2 问题严重度，确定下一 phase:

- **P0**: 需求/架构方向错误 -> 回退 part_1_1
- **P1(design)**: 跨模块接口设计缺陷 -> 回退 part_1_3
- **P1(impl)**: 核心功能缺失/实现错误 -> 路由 part_2_2 修复模式
- **P2**: 边界case/UI瑕疵 -> 路由 part_2_2 常规修复
- **无活跃问题**: 推进到下一 phase
- **CR >= convergence_rounds 且无 P0/P1**: -> complete

---

## 状态更新规范

每轮 agent 退出前必须更新 state.json:

- `progress.phase` -> 下一 phase
- `progress.phase_transitions` <- append {from, to, at, reason?}
- `issues.active` <- 新增/修复/升级/降级的 issue
- `issues.all_time` <- 递增对应严重度 total
- `routing_history` <- append（若发生路由）
- `convergence_counter` <- 操作表规则

---

## SAP Block 输出规范（强制）

```
<<<LOOP_STATE>>>
{
  "phase": "part_2_3",
  "cycle": 2,
  "convergence_counter": 1,
  "active_p0_count": 0,
  "active_p1_count": 1,
  "active_p2_count": 0,
  "tasks_completed": 3,
  "issues_found": 1,
  "phase_contract_claimed": "part_2_3",
  "emitted_at": "2026-01-01T00:00:00Z"
}
<<<END_LOOP_STATE>>>
```

SAP 校验器将对比此 block 与实际 state.json，偏差 >= 2 拒绝终止。

---

## 禁止行为 (BANNED)

- **禁止**直接写入 gate_state.json（仅 plugin/二进制可写）
- **禁止**修改 opencode.json（权限配置）
- **禁止**创建 merge commit 或 open PR（未授权）
- **禁止**跳过 SAP block 输出
- **禁止**偏离 phase 分发表顺序跳转
- **禁止**篡改 state.json 的 termination.status

---

**版本**: loop-opencode v0.1.0 (M5 -- 完整版)
