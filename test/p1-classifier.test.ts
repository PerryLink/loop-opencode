/**
 * p1-classifier.test.ts —— P1 问题分类器单元测试
 *
 * 测试 src/p1-classifier.ts 的 classifyP1、classifyP1Batch、classificationStats
 * 三个导出函数，覆盖 5 个设计级条件、4 个否定条件、批量分类、统计与边界情况。
 *
 * @license Apache-2.0
 * @copyright 2026 Perry Link
 */

import { describe, test, expect } from "bun:test";
import { classifyP1, classifyP1Batch, classificationStats } from "../src/p1-classifier";
import type { Issue } from "../src/types";

// ═══════════════════════════════════════════
// 设计级条件 (Design Conditions) 测试
// ═══════════════════════════════════════════

describe("classifyP1 - 设计级条件 (Design Conditions)", () => {
  test("条件1: 跨模块接口设计缺陷——>=2 模块 + 接口描述 → design_level", () => {
    const issue: Issue = {
      issue_id: "P1-001",
      title: "跨模块接口不一致导致数据丢失",
      description: "auth 模块与 payment 模块之间的接口协议不一致",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/auth/handler.ts", "src/payment/processor.ts"],
      affected_modules: ["auth", "payment"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("条件2: 数据模型变更——描述含 schema 术语 → design_level", () => {
    const issue: Issue = {
      issue_id: "P1-002",
      title: "用户数据模型需要增加字段",
      description: "User entity 的 schema 需要新增 phone 字段以支持短信登录",
      severity: "P1",
      source: "manual_inspection",
      affected_files: ["src/models/user.ts"],
      affected_modules: ["user"],
      status: "open",
      found_in_phase: "part_1_3",
      found_in_cycle: 1,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("条件2: DTO/领域对象术语触发数据模型条件", () => {
    const issue: Issue = {
      issue_id: "P1-003",
      title: "DTO 与领域对象字段不一致",
      description: "CreateOrderDTO 缺少 discount 字段，导致聚合根构建失败",
      severity: "P1",
      source: "build_error",
      affected_files: ["src/dto/order.ts"],
      affected_modules: ["order"],
      status: "open",
      found_in_phase: "part_2_2",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("条件3: 架构层面问题——描述含分层/架构术语 → design_level", () => {
    const issue: Issue = {
      issue_id: "P1-004",
      title: "中间件分层架构设计缺陷",
      description: "当前 architecture 中 middleware 层直接依赖数据库，违反分层原则",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/middleware/auth.ts"],
      affected_modules: ["middleware"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 1,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("条件4: 模块职责不清——含耦合/职责术语 → design_level", () => {
    const issue: Issue = {
      issue_id: "P1-005",
      title: "Order 模块职责不清导致与 Payment 模块耦合",
      description: "订单模块包含了支付逻辑，违反关注点分离原则，内聚性差",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/order/service.ts"],
      affected_modules: ["order"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("条件5: 抽象泄漏——含封装破坏/实现细节暴露术语 → design_level", () => {
    const issue: Issue = {
      issue_id: "P1-006",
      title: "Repository 抽象泄漏导致上层感知数据库细节",
      description: "封装破坏：底层 SQL 实现细节暴露到 Service 层，穿透了抽象边界",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/repository/userRepo.ts"],
      affected_modules: ["repository"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });
});

// ═══════════════════════════════════════════
// 否定条件 (Negation Conditions) 测试
// ═══════════════════════════════════════════

describe("classifyP1 - 否定条件 (Negation Conditions)", () => {
  test("否定条件1: 单文件 + 逻辑错误术语 → implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-007",
      title: "价格计算逻辑错误导致总额偏高",
      description: "条件判断中忽略了折扣边缘检查，循环累加时算法有误",
      severity: "P1",
      source: "test_failure",
      affected_files: ["src/order/calculator.ts"],
      affected_modules: ["order"],
      status: "open",
      found_in_phase: "part_2_6",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("否定条件2: 空指针/类型错误术语 → implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-008",
      title: "用户服务空指针异常",
      description: "getUserById 返回 null 时未检查，导致 null pointer 崩溃",
      severity: "P1",
      source: "test_failure",
      affected_files: ["src/user/service.ts", "src/user/controller.ts"],
      affected_modules: ["user"],
      status: "open",
      found_in_phase: "part_2_6",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("否定条件2: undefined/数组越界术语 → implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-009",
      title: "列表访问数组越界",
      description: "off-by-one 错误导致访问 undefined 元素，缺少索引范围检查",
      severity: "P1",
      source: "lint_warning",
      affected_files: ["src/utils/pagination.ts"],
      affected_modules: ["utils"],
      status: "open",
      found_in_phase: "part_2_2",
      found_in_cycle: 1,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("否定条件3: 明确声明无需改接口 → implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-010",
      title: "订单查询性能优化",
      description: "仅内部实现调整 SQL 查询，无需改接口，签名不变",
      severity: "P1",
      source: "manual_inspection",
      affected_files: ["src/order/repository.ts"],
      affected_modules: ["order"],
      status: "open",
      found_in_phase: "part_2_2",
      found_in_cycle: 1,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("否定条件3: 接口不变/API不变 → implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-011",
      title: "缓存策略优化",
      description: "内部实现从 LRU 换为 LFU，接口不变，api不变",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/cache/manager.ts"],
      affected_modules: ["cache"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("否定条件4: test_failure 来源 + 测试术语 → implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-012",
      title: "用户注册测试用例失败",
      description: "mock 数据未覆盖边缘场景，断言条件过严导致测试环境偶发失败",
      severity: "P1",
      source: "test_failure",
      affected_files: ["test/user/register.test.ts"],
      affected_modules: ["test"],
      status: "open",
      found_in_phase: "part_2_6",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });
});

// ═══════════════════════════════════════════
// 默认行为与边界情况测试
// ═══════════════════════════════════════════

describe("classifyP1 - 默认与边界行为", () => {
  test("无任何设计/否定特征时默认返回 implementation_level", () => {
    const issue: Issue = {
      issue_id: "P1-013",
      title: "修复用户列表分页bug",
      description: "页码计算偏移量错误，需要修正偏移计算逻辑",
      severity: "P1",
      source: "manual_inspection",
      affected_files: ["src/user/list.ts"],
      affected_modules: ["user"],
      status: "open",
      found_in_phase: "part_2_2",
      found_in_cycle: 1,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("空 affected_modules 数组仍可正常分类", () => {
    const issue: Issue = {
      issue_id: "P1-014",
      title: "修复空指针异常",
      description: "undefined 检查缺失导致运行时崩溃",
      severity: "P1",
      source: "test_failure",
      affected_files: ["src/utils/helper.ts"],
      affected_modules: [],
      status: "open",
      found_in_phase: "part_2_6",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    const result = classifyP1(issue);
    expect(result).toBeDefined();
    expect(result).toBe("implementation_level");
  });

  test("单模块不触发跨模块接口条件——条件1要求 >=2 模块", () => {
    const issue: Issue = {
      issue_id: "P1-015",
      title: "模块间接口签名不一致",
      description: "接口定义与调用方签名不匹配，协议不一致",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/auth/handler.ts"],
      affected_modules: ["auth"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    // 虽然标题/描述充满接口术语，但只有 1 个 affected_module，
    // 条件1不触发，且无其他设计条件→走默认 implementation_level
    expect(classifyP1(issue)).toBe("implementation_level");
  });

  test("设计条件优先于否定条件——同时命中时返回 design_level", () => {
    const issue: Issue = {
      issue_id: "P1-016",
      title: "跨模块接口存在空指针风险",
      description:
        "auth 与 payment 模块接口不一致，且存在空指针未检查的代码错误",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/auth/handler.ts", "src/payment/processor.ts"],
      affected_modules: ["auth", "payment"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    // 条件1(>=2模块+接口)命中 → design_level，否定条件2(空指针)不被检查
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("中文关键词正确匹配——数据模型中文术语", () => {
    const issue: Issue = {
      issue_id: "P1-017",
      title: "数据模型设计需要调整表结构",
      description: "新增订单表需要关联用户表，数据流方向需要重新规划",
      severity: "P1",
      source: "manual_inspection",
      affected_files: ["src/models/order.ts"],
      affected_modules: ["order"],
      status: "open",
      found_in_phase: "part_1_3",
      found_in_cycle: 1,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });

  test("英文关键词正确匹配——leaky abstraction", () => {
    const issue: Issue = {
      issue_id: "P1-018",
      title: "Leaky abstraction in data access layer",
      description:
        "encapsulation is broken because SQL details leak through the repository",
      severity: "P1",
      source: "code_review",
      affected_files: ["src/data/repository.ts"],
      affected_modules: ["data"],
      status: "open",
      found_in_phase: "part_2_3",
      found_in_cycle: 2,
      found_at: "2026-06-01T10:00:00Z",
    };
    expect(classifyP1(issue)).toBe("design_level");
  });
});

// ═══════════════════════════════════════════
// classifyP1Batch 批量分类测试
// ═══════════════════════════════════════════

describe("classifyP1Batch", () => {
  test("批量分类返回与输入等长的结果数组", () => {
    const issues: Issue[] = [
      {
        issue_id: "P1-B01",
        title: "架构分层问题",
        description: "中间件层违反依赖倒置原则",
        severity: "P1",
        source: "code_review",
        affected_files: ["src/middleware/logging.ts"],
        affected_modules: ["middleware"],
        status: "open",
        found_in_phase: "part_2_3",
        found_in_cycle: 1,
        found_at: "2026-06-01T10:00:00Z",
      },
      {
        issue_id: "P1-B02",
        title: "空指针异常",
        description: "null check 缺失",
        severity: "P1",
        source: "test_failure",
        affected_files: ["src/user/service.ts"],
        affected_modules: ["user"],
        status: "open",
        found_in_phase: "part_2_6",
        found_in_cycle: 2,
        found_at: "2026-06-01T10:00:00Z",
      },
      {
        issue_id: "P1-B03",
        title: "通用修复",
        description: "修正分页偏移计算",
        severity: "P1",
        source: "manual_inspection",
        affected_files: ["src/common/pager.ts"],
        affected_modules: ["common"],
        status: "open",
        found_in_phase: "part_2_2",
        found_in_cycle: 1,
        found_at: "2026-06-01T10:00:00Z",
      },
    ];
    const results = classifyP1Batch(issues);
    expect(results).toBeDefined();
    expect(results.length).toBe(3);
  });

  test("批量分类包含混合结果——design_level 与 implementation_level 并存", () => {
    const issues: Issue[] = [
      {
        issue_id: "P1-B04",
        title: "跨模块接口协议不一致",
        description: "auth 和 billing 模块之间的接口 contract 不一致",
        severity: "P1",
        source: "code_review",
        affected_files: ["src/auth/handler.ts", "src/billing/handler.ts"],
        affected_modules: ["auth", "billing"],
        status: "open",
        found_in_phase: "part_2_3",
        found_in_cycle: 2,
        found_at: "2026-06-01T10:00:00Z",
      },
      {
        issue_id: "P1-B05",
        title: "类型错误导致编译失败",
        description: "TypeScript type error 未处理",
        severity: "P1",
        source: "build_error",
        affected_files: ["src/utils/formatter.ts"],
        affected_modules: ["utils"],
        status: "open",
        found_in_phase: "part_2_2",
        found_in_cycle: 1,
        found_at: "2026-06-01T10:00:00Z",
      },
    ];
    const results = classifyP1Batch(issues);
    expect(results.length).toBe(2);
    expect(results[0]).toBe("design_level");
    expect(results[1]).toBe("implementation_level");
  });
});

// ═══════════════════════════════════════════
// classificationStats 统计测试
// ═══════════════════════════════════════════

describe("classificationStats", () => {
  test("全 design_level 统计返回 design=总数 impl=0", () => {
    const classifications = [
      "design_level",
      "design_level",
      "design_level",
    ] as const;
    const stats = classificationStats([...classifications]);
    expect(stats).toBeDefined();
    expect(stats).toEqual({ design: 3, impl: 0 });
  });

  test("全 implementation_level 统计返回 design=0 impl=总数", () => {
    const classifications = [
      "implementation_level",
      "implementation_level",
    ] as const;
    const stats = classificationStats([...classifications]);
    expect(stats).toEqual({ design: 0, impl: 2 });
  });

  test("混合统计正确计数", () => {
    const classifications = [
      "design_level",
      "implementation_level",
      "design_level",
      "implementation_level",
      "implementation_level",
    ] as const;
    const stats = classificationStats([...classifications]);
    expect(stats).toEqual({ design: 2, impl: 3 });
  });

  test("空数组统计返回全零", () => {
    const stats = classificationStats([]);
    expect(stats).toEqual({ design: 0, impl: 0 });
  });
});
