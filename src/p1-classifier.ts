/**
 * p1-classifier.ts —— P1 问题分类器（M2）
 *
 * 核心职责：判定 P1 问题是「设计级」(design_level) 还是「实现级」(implementation_level)。
 * - design_level → 回退 part_1_3（修改方案层）
 * - implementation_level → 路由 part_2_2（修复模式，方案无需改动）
 *
 * 分类逻辑基于 5 个设计级别条件 + 4 个否定条件。
 *
 * @module p1-classifier
 */

import type { Issue, P1Classification } from "./types";

/**
 * 设计级别关键词——用于匹配 issue 描述
 *
 * 这些关键词暗示问题属于方案/设计/架构层面，而非纯编码实现。
 */
const DESIGN_KEYWORDS = [
  "接口设计",
  "接口不一致",
  "跨模块接口",
  "架构",
  "设计缺陷",
  "方案",
  "数据模型",
  "数据流",
  "数据不一致",
  "模块职责不清",
  "耦合",
  "依赖方向错误",
  "协议不兼容",
  "抽象泄漏",
  "领域模型错误",
];

/**
 * 实现级别关键词——暗示问题属于代码实现范畴
 */
const IMPL_KEYWORDS = [
  "实现错误",
  "逻辑错误",
  "边界",
  "空指针",
  "null安全",
  "性能问题",
  "内存泄漏",
  "并发问题",
  "竞态",
  "死锁",
  "异常处理缺失",
  "日志缺失",
  "错误处理",
  "类型错误",
  "样式问题",
];

/**
 * P1 问题分类器——5 个设计级条件 + 4 个否定条件
 *
 * 算法流程：
 * 1. 依次检查 5 个设计级条件——任一命中 → design_level
 * 2. 依次检查 4 个否定条件——任一命中 → implementation_level（覆盖设计级判定）
 * 3. 默认 → implementation_level（保守策略）
 *
 * @param issue - P1 严重度的 Issue 对象
 * @returns "design_level" 或 "implementation_level"
 */
export function classifyP1(issue: Issue): P1Classification {
  // ---- 5 个设计级别条件 ----
  if (condition1_crossModuleInterface(issue)) return "design_level";
  if (condition2_dataModelChange(issue)) return "design_level";
  if (condition3_architecturalConcern(issue)) return "design_level";
  if (condition4_moduleResponsibility(issue)) return "design_level";
  if (condition5_abstractionLeak(issue)) return "design_level";

  // ---- 4 个否定条件（覆盖设计级判定） ----
  if (negation1_scopedFix(issue)) return "implementation_level";
  if (negation2_pureCodeError(issue)) return "implementation_level";
  if (negation3_noInterfaceChange(issue)) return "implementation_level";
  if (negation4_testOnlyIssue(issue)) return "implementation_level";

  // 默认保守策略：实现级
  return "implementation_level";
}

/**
 * 条件 1: 跨模块接口设计缺陷
 *
 * 若 issue 的 affected_modules 跨越 >= 2 个模块，
 * 且描述涉及接口/协议不一致，则判为设计级。
 *
 * @param issue - P1 Issue
 */
function condition1_crossModuleInterface(issue: Issue): boolean {
  const modules = issue.affected_modules;
  if (modules.length < 2) return false;

  const titleLower = issue.title.toLowerCase();
  const descLower = issue.description.toLowerCase();
  const text = titleLower + " " + descLower;

  // 涉及接口或协议
  const interfaceTerms = [
    "interface",
    "接口",
    "签名",
    "协议",
    "contract",
    "约定",
    "跨模块",
    "模块间",
    "不一致",
    "mismatch",
  ];

  const hits = interfaceTerms.filter((t) => text.includes(t));
  return hits.length >= 1;
}

/**
 * 条件 2: 数据模型/数据流变更
 *
 * 若问题涉及数据模型结构变更、数据流方向调整，
 * 意味着方案层的 entity/schema 需修改。
 *
 * @param issue - P1 Issue
 */
function condition2_dataModelChange(issue: Issue): boolean {
  const text = (issue.title + " " + issue.description).toLowerCase();
  const terms = [
    "数据模型",
    "schema",
    "数据流",
    "entity",
    "字段",
    "表结构",
    "dto",
    "vo",
    "领域对象",
    "聚合根",
    "值对象",
  ];
  return terms.some((t) => text.includes(t));
}

/**
 * 条件 3: 架构层面问题
 *
 * 涉及架构决策、技术选型、模式选择等宏观设计问题。
 *
 * @param issue - P1 Issue
 */
function condition3_architecturalConcern(issue: Issue): boolean {
  const text = (issue.title + " " + issue.description).toLowerCase();
  const terms = [
    "架构",
    "architecture",
    "选型",
    "模式选择",
    "分层",
    "layer",
    "依赖倒置",
    "依赖注入",
    "中间件",
    "middleware",
  ];
  return terms.some((t) => text.includes(t));
}

/**
 * 条件 4: 模块职责划分不清
 *
 * 若问题源于模块职责重叠或职责缺失，需重新划分模块边界。
 *
 * @param issue - P1 Issue
 */
function condition4_moduleResponsibility(issue: Issue): boolean {
  const text = (issue.title + " " + issue.description).toLowerCase();
  const terms = [
    "职责不清",
    "职责",
    "responsibility",
    "边界",
    "耦合",
    "coupling",
    "内聚",
    "cohesion",
    "关注点分离",
  ];
  return terms.some((t) => text.includes(t));
}

/**
 * 条件 5: 抽象泄漏
 *
 * 底层实现细节穿透抽象层暴露到上层——需重新设计接口。
 *
 * @param issue - P1 Issue
 */
function condition5_abstractionLeak(issue: Issue): boolean {
  const text = (issue.title + " " + issue.description).toLowerCase();
  const terms = [
    "抽象泄漏",
    "leaky abstraction",
    "封装破坏",
    "封装",
    "encapsulation",
    "实现细节暴露",
    "穿透",
  ];
  return terms.some((t) => text.includes(t));
}

// ============================================================
// 4 个否定条件——当命中时覆盖设计级判定为实现级
// ============================================================

/**
 * 否定条件 1: 修复范围限定在单个文件/函数内
 *
 * 若 affected_files.length === 1 且标题暗示纯逻辑错误，
 * 则即使命中设计级条件也应降为实现级。
 *
 * @param issue - P1 Issue
 */
function negation1_scopedFix(issue: Issue): boolean {
  if (issue.affected_files.length > 1) return false;
  const text = (issue.title + " " + issue.description).toLowerCase();
  const scopedTerms = ["逻辑错误", "logic error", "条件判断", "循环", "算法"];
  return scopedTerms.some((t) => text.includes(t));
}

/**
 * 否定条件 2: 纯代码错误——不需要方案改动即可修复
 *
 * 如空指针、边界条件遗漏、异常处理缺失等。
 *
 * @param issue - P1 Issue
 */
function negation2_pureCodeError(issue: Issue): boolean {
  const text = (issue.title + " " + issue.description).toLowerCase();
  const terms = [
    "空指针",
    "null pointer",
    "undefined",
    "类型错误",
    "type error",
    "语法错误",
    "边界条件",
    "off-by-one",
    "数组越界",
  ];
  return terms.some((t) => text.includes(t));
}

/**
 * 否定条件 3: 无需修改接口/协议即可修复
 *
 * 修复不影响外部可见的接口签名或协议。
 *
 * @param issue - P1 Issue
 */
function negation3_noInterfaceChange(issue: Issue): boolean {
  const text = (issue.title + " " + issue.description).toLowerCase();
  // 检查是否明确声明"无需改接口"或"仅内部实现"
  const noChangeTerms = [
    "无需改接口",
    "接口不变",
    "仅内部实现",
    "内部实现",
    "签名不变",
    "api不变",
  ];
  return noChangeTerms.some((t) => text.includes(t));
}

/**
 * 否定条件 4: 纯测试相关问题
 *
 * 测试失败但 code review 未发现方案/逻辑错误时，
 * 应判为实现级（补充测试用例或修复测试代码）。
 *
 * @param issue - P1 Issue
 */
function negation4_testOnlyIssue(issue: Issue): boolean {
  if (issue.source !== "test_failure") return false;
  const text = (issue.title + " " + issue.description).toLowerCase();
  const testOnlyTerms = [
    "测试用例",
    "测试数据",
    "mock",
    "fixture",
    "断言",
    "assert",
    "测试环境",
  ];
  return testOnlyTerms.some((t) => text.includes(t));
}

/**
 * 批量分类——对多个 P1 Issue 逐条分类
 *
 * @param issues - P1 Issue 数组
 * @returns 分类结果数组（顺序一致）
 */
export function classifyP1Batch(issues: Issue[]): P1Classification[] {
  return issues.map((issue) => classifyP1(issue));
}

/**
 * 统计分类分布
 *
 * @param classifications - 分类结果数组
 * @returns { design: 设计级数量, impl: 实现级数量 }
 */
export function classificationStats(
  classifications: P1Classification[]
): { design: number; impl: number } {
  return {
    design: classifications.filter((c) => c === "design_level").length,
    impl: classifications.filter((c) => c === "implementation_level").length,
  };
}
