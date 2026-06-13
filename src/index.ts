/**
 * loop-opencode 入口模块
 *
 * 角色分发：
 * - main：解析 CLI 参数 → --init 初始化 / 主循环驱动
 * - watchdog：独立子进程监控循环（心跳检测 + state staleness + 超时处理）
 *
 * 编译：
 *   bun build --compile --target=bun-<platform> --outfile=dist/loop-opencode src/index.ts
 *
 * @module index
 */

import { parseArgs, HELP_TEXT, VERSION } from "./args";
import { initProject } from "./init";
import { runLoop, startLoop } from "./loop";
import { startWatchdog } from "./watchdog";

/** 从环境变量读取角色（watchdog 子进程由父进程设置） */
const ROLE: string =
  (typeof Bun !== "undefined" && Bun.env.LOOP_OPENCODE_ROLE) ||
  (typeof process !== "undefined" ? process.env["LOOP_OPENCODE_ROLE"] : undefined) ||
  "main";

/** 从环境变量读取项目根目录 */
const PROJECT_ROOT: string =
  (typeof Bun !== "undefined" && Bun.env.LOOP_PROJECT_ROOT) ||
  (typeof process !== "undefined" ? process.env["LOOP_PROJECT_ROOT"] : undefined) ||
  (typeof process !== "undefined" ? process.cwd() : ".");

/**
 * 主入口——根据 ROLE 分发到不同执行路径
 */
async function main(): Promise<void> {
  if (ROLE === "watchdog") {
    await watchdogMain();
    return;
  }

  // ---- main 角色 ----
  const parsed = parseArgs();

  // --help
  if (parsed.showHelp) {
    console.log(`loop-opencode v${VERSION}\n`);
    console.log(HELP_TEXT);
    return;
  }

  // --version
  if (parsed.showVersion) {
    console.log(`loop-opencode v${VERSION}`);
    return;
  }

  // --init 初始化（委托 src/init.ts 完整实现）
  if (parsed.init) {
    initProject(PROJECT_ROOT, parsed.force);
    // --init 之后自动进入主循环
    console.log(`[loop-opencode] 项目初始化完成，启动主循环...`);
    const ctx = startLoop(PROJECT_ROOT);
    if (ctx.running) {
      console.log(`[loop-opencode] 主循环已启动 | phase=${ctx.state.progress.phase}`);
      // 对于 --init 后的默认行为，先输出当前状态供 agent 使用
      console.log(`[loop-opencode] 循环引擎就绪，执行默认主循环`);
      runLoop(PROJECT_ROOT);
    }
    return;
  }

  // 正常循环驱动——检查是否有需求描述
  if (!parsed.userRequest) {
    console.log(`loop-opencode v${VERSION}`);
    console.log("用法: loop-opencode [选项] <需求描述>");
    console.log("      loop-opencode --init [--force]");
    console.log("      loop-opencode --help");
    console.log();
    console.log("运行模式: --safe | --auto | --unsafe | --interactive");
    return;
  }

  // 启动主循环
  console.log(`[loop-opencode] 启动主循环`);
  console.log(`  模式:   ${parsed.mode}`);
  console.log(`  需求:   ${parsed.userRequest}`);
  console.log(`  TDD:    ${parsed.tdd ? "启用" : "未启用"}`);
  console.log(`  跳过测试: ${parsed.skipTesting ? "是" : "否"}`);
  console.log(`  项目根:   ${PROJECT_ROOT}`);
  console.log();

  // 启动完整主循环——调用 loop.ts 引擎
  const ctx = startLoop(PROJECT_ROOT);
  if (ctx.running) {
    runLoop(PROJECT_ROOT);
  } else {
    console.log(`[loop-opencode] 循环未启动——项目状态: ${ctx.state.termination.status}`);
  }
}

// --init 初始化逻辑已移至 src/init.ts 模块（M1 完整实现）

/**
 * Watchdog 子进程入口
 *
 * 独立子进程——每 5s 执行六项监控检查：
 * 1. 父进程心跳（.watchdog_heartbeat 年龄 > 90s → 告警 + pause）
 * 2. 卡住检测（同一 phase 超过 60s 无进展 → 告警）
 * 3. 闸门违规升级（闸门拦截块累积 > 10 → 升级）
 * 4. 预算耗尽（phase 预算消耗 >= 95% → 告警）
 * 5. 输出停滞（state 关键字段哈希 30s 无变化 → 告警）
 * 6. 会话超时（总时长超过 max_cycles * 10min → 告警 + pause）
 *
 * 写入 gate_state.json watchdog_alerts + 发送信号给父进程。
 * 父进程退出时自动清理退出。
 */
async function watchdogMain(): Promise<void> {
  console.log(`[watchdog] 监控子进程已启动 (PID: ${process.pid})`);
  console.log(`[watchdog] 项目根目录: ${PROJECT_ROOT}`);
  startWatchdog(PROJECT_ROOT);
}

// ---- 启动 ----
main().catch((err) => {
  console.error("[loop-opencode] 致命错误:", err);
  process.exit(1);
});
