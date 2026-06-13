/**
 * CLI 参数解析模块
 *
 * 解析 loop-opencode 命令行参数，支持五种运行模式与 --init 初始化。
 *
 * 用法示例：
 *   loop-opencode --safe "实现一个 CLI 天气查询工具"
 *   loop-opencode --interactive "重构数据库访问层"
 *   loop-opencode --unsafe "快速原型——放心改"
 *   loop-opencode "默认标准模式启动"
 *   loop-opencode --init --force
 *   loop-opencode --help
 *   loop-opencode --version
 *
 * @module args
 */

import type { RunMode } from "./types";

/** 解析后的 CLI 参数 */
export interface ParsedArgs {
  /** 运行模式 */
  mode: RunMode;
  /** 是否为 --init 模式（初始化 .loop-opencode/） */
  init: boolean;
  /** --init 时是否强制覆盖（--force） */
  force: boolean;
  /** 用户请求（自然语言描述，--init 模式下为空字符串） */
  userRequest: string;
  /** 是否只执行 Part 1（设计气泡） */
  part1Only: boolean;
  /** 是否启用 TDD */
  tdd: boolean;
  /** 是否跳过测试 */
  skipTesting: boolean;
  /** 最大 cycle 数（0 = 使用默认值） */
  maxCycles: number;
  /** 最大 Part 1 轮次（0 = 使用默认值） */
  maxPart1Rounds: number;
  /** 收敛所需轮次（0 = 使用默认值） */
  convergenceRounds: number;
  /** 是否显示帮助 */
  showHelp: boolean;
  /** 是否显示版本 */
  showVersion: boolean;
  /** 剩余未解析参数 */
  rest: string[];
}

/** 帮助文本 */
export const HELP_TEXT = `
loop-opencode —— 全自动闭环开发驱动器

用法:
  loop-opencode [选项] [需求描述]
  loop-opencode --init [--force]
  loop-opencode --help
  loop-opencode --version

运行模式:
  --safe          安全模式 (L1)：全部 8 个安全闸门激活，关键决策点暂停等待确认
  --auto          标准模式 (L2，默认)：方案确认自动通过，危险操作超阈值暂停
  --unsafe        无限制模式 (L3)：仅灾难性操作硬拦截，用于沙箱/VM 环境
  --interactive   协作模式 (L1+)：Part 1 决策点等待用户确认，Part 2 自动执行

初始化:
  --init          在当前目录初始化 .loop-opencode/ 目录结构
  --force         配合 --init 使用，强制覆盖已存在的 .loop-opencode/

高级选项:
  --part1-only    仅执行 Part 1 设计气泡（不进入 Part 2 实施阶段）
  --tdd           启用测试驱动开发（TDD）模式
  --skip-testing  跳过所有测试相关 phase（part_2_4 ~ part_2_6）
  --max-cycles N  设置最大 cycle 轮次（默认 5，上限 50）
  --max-part1 N   设置 Part 1 内部最大轮次（默认 10）
  --conv-rounds N 设置收敛所需轮次（默认 2）

示例:
  loop-opencode --safe "实现一个 REST API 服务器"
  loop-opencode --interactive "重构用户认证模块"
  loop-opencode --unsafe --skip-testing "快速原型"
  loop-opencode --init
  loop-opencode --init --force
`.trim();

/** 版本号 */
export const VERSION = "0.1.0";

/**
 * 解析 CLI 参数
 *
 * 支持的参数格式：
 * - 短标志：--safe, --auto, --unsafe, --interactive, --init, --force
 * - 带值标志：--max-cycles 5, --conv-rounds 2
 * - 位置参数：需求描述（其余非标志参数拼接为 userRequest）
 *
 * 冲突检测：
 * - 多个模式标志（--safe + --unsafe 等）→ 最后一个生效（警告输出）
 * - --init 与运行模式互斥 → 若同时给出则以 --init 为准，忽略模式
 *
 * @param argv - 命令行参数数组（通常为 Bun.argv 或 process.argv）
 * @returns 解析后的 ParsedArgs 对象
 */
export function parseArgs(argv: string[] = Bun.argv): ParsedArgs {
  // 跳过前两个元素（bun 运行时路径 + 脚本路径）
  const args = argv.slice(2);

  const result: ParsedArgs = {
    mode: "auto",
    init: false,
    force: false,
    userRequest: "",
    part1Only: false,
    tdd: false,
    skipTesting: false,
    maxCycles: 0,
    maxPart1Rounds: 0,
    convergenceRounds: 0,
    showHelp: false,
    showVersion: false,
    rest: [],
  };

  const positional: string[] = [];
  let modeSet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    switch (arg) {
      // ---- 运行模式 ----
      case "--safe":
        if (modeSet) console.warn("[warn] 多个模式标志：使用 --safe（最后一个非 auto 生效）");
        result.mode = "safe";
        modeSet = true;
        break;

      case "--auto":
        if (modeSet) console.warn("[warn] 多个模式标志：使用 --auto");
        result.mode = "auto";
        modeSet = true;
        break;

      case "--unsafe":
        if (modeSet) console.warn("[warn] 多个模式标志：使用 --unsafe");
        result.mode = "unsafe";
        modeSet = true;
        break;

      case "--interactive":
        if (modeSet) console.warn("[warn] 多个模式标志：使用 --interactive");
        result.mode = "collaborative";
        modeSet = true;
        break;

      // ---- 初始化 ----
      case "--init":
        result.init = true;
        break;

      case "--force":
        result.force = true;
        break;

      // ---- 高级选项 ----
      case "--part1-only":
        result.part1Only = true;
        break;

      case "--tdd":
        result.tdd = true;
        break;

      case "--skip-testing":
        result.skipTesting = true;
        break;

      case "--max-cycles": {
        const next = args[i + 1];
        if (next !== undefined && /^\d+$/.test(next)) {
          const val = parseInt(next, 10);
          // 硬上限 50
          result.maxCycles = Math.min(val, 50);
          i++;
        } else {
          console.error("[error] --max-cycles 需要数字参数");
        }
        break;
      }

      case "--max-part1": {
        const next = args[i + 1];
        if (next !== undefined && /^\d+$/.test(next)) {
          result.maxPart1Rounds = parseInt(next, 10);
          i++;
        } else {
          console.error("[error] --max-part1 需要数字参数");
        }
        break;
      }

      case "--conv-rounds": {
        const next = args[i + 1];
        if (next !== undefined && /^\d+$/.test(next)) {
          result.convergenceRounds = parseInt(next, 10);
          i++;
        } else {
          console.error("[error] --conv-rounds 需要数字参数");
        }
        break;
      }

      // ---- 帮助与版本 ----
      case "--help":
      case "-h":
        result.showHelp = true;
        break;

      case "--version":
      case "-v":
        result.showVersion = true;
        break;

      // ---- 未知标志 → 收集为位置参数 ----
      default:
        if (arg.startsWith("-")) {
          console.warn(`[warn] 未知选项: ${arg}`);
        }
        positional.push(arg);
        break;
    }
  }

  // 组装 userRequest（位置参数的拼接）
  result.userRequest = positional.join(" ").trim();

  // 补充默认值
  if (result.mode === "collaborative" && !modeSet) {
    // 兼容：若用户直接传 --interactive
    result.mode = "collaborative";
  }

  // 收集剩余的未知参数
  result.rest = [...positional];

  return result;
}

/**
 * 验证解析结果的合法性
 *
 * 检查逻辑冲突：
 * - --init 同时给出 userRequest → init 不消耗 userRequest
 * - --part1-only + --skip-testing → 有效（Part 1 无测试阶段）
 * - --tdd + --skip-testing → 冲突警告（TDD 与跳过测试矛盾）
 * - mode="unsafe" + 无显式 --unsafe → 内部调用场景（允许）
 *
 * @param parsed - 解析结果
 * @returns 验证错误信息数组（空数组表示合法）
 */
export function validateArgs(parsed: ParsedArgs): string[] {
  const errors: string[] = [];

  // --tdd 与 --skip-testing 冲突
  if (parsed.tdd && parsed.skipTesting) {
    errors.push("--tdd 与 --skip-testing 冲突：TDD 模式要求运行测试");
  }

  // max_cycles 上限检查
  if (parsed.maxCycles > 50) {
    errors.push("--max-cycles 不能超过 50（硬上限）");
  }
  if (parsed.maxCycles < 0) {
    errors.push("--max-cycles 必须为非负整数");
  }

  // convergence_rounds 合法性
  if (parsed.convergenceRounds < 0) {
    errors.push("--conv-rounds 必须为非负整数");
  }

  // --init 模式下忽略 userRequest（非错误，仅日志）
  if (parsed.init && parsed.userRequest.length > 0) {
    console.log("[info] --init 模式下忽略需求描述参数");
  }

  return errors;
}
