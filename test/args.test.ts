/**
 * args.test.ts —— CLI 参数解析模块单元测试
 *
 * 测试 src/args.ts 的 parseArgs、validateArgs 函数，
 * 覆盖所有 CLI 选项、边界条件与冲突检测。
 *
 * 注意：parseArgs 内部调用 argv.slice(2) 跳过运行时与脚本路径，
 * 因此测试必须提供完整 argv（含两个占位前缀）。
 *
 * @module args.test
 * @license Apache-2.0
 * @copyright 2026 Perry Link
 */

import { describe, test, expect } from "bun:test";
import { parseArgs, validateArgs, HELP_TEXT, VERSION } from "../src/args";

/** 构建完整 argv 数组——前两个元素模拟 bun 运行时路径 */
function argv(...rest: string[]): string[] {
  return ["bun", "loop-opencode", ...rest];
}

// ═══════════════════════════════════════════
// parseArgs 测试
// ═══════════════════════════════════════════

describe("parseArgs — 解析 CLI 参数", () => {
  test("默认模式为 auto", () => {
    const result = parseArgs(argv());
    expect(result.mode).toBe("auto");
    expect(result.userRequest).toBe("");
  });

  test("--safe 设置 safe 模式", () => {
    const result = parseArgs(argv("--safe", "实现一个功能"));
    expect(result.mode).toBe("safe");
    expect(result.userRequest).toBe("实现一个功能");
  });

  test("--auto 设置 auto 模式", () => {
    const result = parseArgs(argv("--auto", "需求"));
    expect(result.mode).toBe("auto");
  });

  test("--unsafe 设置 unsafe 模式", () => {
    const result = parseArgs(argv("--unsafe", "快速原型"));
    expect(result.mode).toBe("unsafe");
  });

  test("--interactive 设置 collaborative 模式", () => {
    const result = parseArgs(argv("--interactive", "协作"));
    expect(result.mode).toBe("collaborative");
  });

  test("多个模式标志——最后一个非 auto 生效", () => {
    const result = parseArgs(argv("--auto", "--safe", "需求"));
    expect(result.mode).toBe("safe");
  });

  test("多个模式标志——unsafe 优先", () => {
    const result = parseArgs(argv("--safe", "--unsafe", "需求"));
    expect(result.mode).toBe("unsafe");
  });

  test("--init 模式", () => {
    const result = parseArgs(argv("--init"));
    expect(result.init).toBe(true);
    expect(result.mode).toBe("auto");
  });

  test("--init --force", () => {
    const result = parseArgs(argv("--init", "--force"));
    expect(result.init).toBe(true);
    expect(result.force).toBe(true);
  });

  test("--part1-only 设置 part1Only", () => {
    const result = parseArgs(argv("--part1-only", "需求"));
    expect(result.part1Only).toBe(true);
  });

  test("--tdd 启用 TDD", () => {
    const result = parseArgs(argv("--tdd", "需求"));
    expect(result.tdd).toBe(true);
  });

  test("--skip-testing 跳过测试", () => {
    const result = parseArgs(argv("--skip-testing", "需求"));
    expect(result.skipTesting).toBe(true);
  });

  test("--max-cycles 设置最大 cycle 数", () => {
    const result = parseArgs(argv("--max-cycles", "10", "需求"));
    expect(result.maxCycles).toBe(10);
  });

  test("--max-cycles 超过上限 50 被限制", () => {
    const result = parseArgs(argv("--max-cycles", "100", "需求"));
    expect(result.maxCycles).toBe(50);
  });

  test("--max-cycles 缺少参数时记录错误", () => {
    const result = parseArgs(argv("--max-cycles"));
    expect(result.maxCycles).toBe(0);
  });

  test("--max-cycles 非数字参数被忽略", () => {
    const result = parseArgs(argv("--max-cycles", "abc", "需求"));
    expect(result.maxCycles).toBe(0);
  });

  test("--max-part1 设置 part1 轮次", () => {
    const result = parseArgs(argv("--max-part1", "5", "需求"));
    expect(result.maxPart1Rounds).toBe(5);
  });

  test("--conv-rounds 设置收敛轮次", () => {
    const result = parseArgs(argv("--conv-rounds", "3", "需求"));
    expect(result.convergenceRounds).toBe(3);
  });

  test("--help 显示帮助", () => {
    const result = parseArgs(argv("--help"));
    expect(result.showHelp).toBe(true);
  });

  test("-h 别名显示帮助", () => {
    const result = parseArgs(argv("-h"));
    expect(result.showHelp).toBe(true);
  });

  test("--version 显示版本", () => {
    const result = parseArgs(argv("--version"));
    expect(result.showVersion).toBe(true);
  });

  test("-v 别名显示版本", () => {
    const result = parseArgs(argv("-v"));
    expect(result.showVersion).toBe(true);
  });

  test("无参数时 userRequest 为空", () => {
    const result = parseArgs(argv());
    expect(result.userRequest).toBe("");
    expect(result.mode).toBe("auto");
  });

  test("仅位置参数被拼接为 userRequest", () => {
    const result = parseArgs(argv("实现一个 CLI 天气查询工具"));
    expect(result.userRequest).toBe("实现一个 CLI 天气查询工具");
  });

  test("多个位置参数被拼接", () => {
    const result = parseArgs(argv("实现", "一个", "功能"));
    expect(result.userRequest).toBe("实现 一个 功能");
  });

  test("未知标志被收集为位置参数", () => {
    const result = parseArgs(argv("--unknown-flag", "value"));
    expect(result.rest).toContain("--unknown-flag");
  });

  test("综合参数解析", () => {
    const result = parseArgs(argv(
      "--safe", "--tdd", "--max-cycles", "8", "--conv-rounds", "2",
      "实现全栈应用"
    ));
    expect(result.mode).toBe("safe");
    expect(result.tdd).toBe(true);
    expect(result.maxCycles).toBe(8);
    expect(result.convergenceRounds).toBe(2);
    expect(result.userRequest).toBe("实现全栈应用");
  });
});

// ═══════════════════════════════════════════
// validateArgs 测试
// ═══════════════════════════════════════════

describe("validateArgs — 验证参数合法性", () => {
  test("默认参数通过验证", () => {
    const result = parseArgs(argv());
    const errors = validateArgs(result);
    expect(errors).toHaveLength(0);
  });

  test("有效参数通过验证", () => {
    const result = parseArgs(argv("--safe", "需求"));
    const errors = validateArgs(result);
    expect(errors).toHaveLength(0);
  });

  test("--tdd 与 --skip-testing 冲突", () => {
    const result = parseArgs(argv("--tdd", "--skip-testing", "需求"));
    const errors = validateArgs(result);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes("冲突"))).toBe(true);
  });

  test("--max-cycles 超过 50", () => {
    const parsed = parseArgs(argv());
    parsed.maxCycles = 51;
    const errors = validateArgs(parsed);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes("50"))).toBe(true);
  });

  test("--max-cycles 为负数", () => {
    const parsed = parseArgs(argv());
    parsed.maxCycles = -1;
    const errors = validateArgs(parsed);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("--conv-rounds 为负数", () => {
    const parsed = parseArgs(argv());
    parsed.convergenceRounds = -5;
    const errors = validateArgs(parsed);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// 常量测试
// ═══════════════════════════════════════════

describe("CLI 常量", () => {
  test("HELP_TEXT 包含关键用法说明", () => {
    expect(HELP_TEXT).toContain("loop-opencode");
    expect(HELP_TEXT).toContain("--safe");
    expect(HELP_TEXT).toContain("--auto");
    expect(HELP_TEXT).toContain("--unsafe");
    expect(HELP_TEXT).toContain("--interactive");
    expect(HELP_TEXT).toContain("--init");
    expect(HELP_TEXT).toContain("--help");
    expect(HELP_TEXT).toContain("--version");
  });

  test("VERSION 为 semver 格式", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
