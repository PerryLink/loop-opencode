# loop-opencode

*A [**Loop Engineering**](https://github.com/PerryLink/loop-everything) autonomous coding loop engine — turn goals into production code.*

> One-shot goal to production code — an 11-phase autonomous loop that designs, implements, tests, and verifies without human intervention.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-000000?logo=bun)](https://bun.sh/)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

[**English**](#loop-opencode) | [**中文**](#中文)

## Features

- **11-phase autonomous workflow** — brainstorming, plan, design, shell-op-preview, gate-check (G1-G2), implement, test, convergence-check, gate-check (G3-G6), verify, hard-done.
- **8 safety gates (G1-G6 + Gate State Guard + Permission Block)** — content safety, plan confirmation, dependency sandbox, dangerous operation interception, file mutation audit, completion declaration, gate state integrity, privilege elevation block.
- **Convergence-driven loop** — `convergence_counter` with fast-path early termination; detects stagnation and forces re-route before burning turns.
- **P0/P1/P2 issue routing** — automatic fallback to redesign (P0), re-implementation (P1), or inline fix (P2) based on failure severity.
- **State persistence** — `state.json` survives compaction and session restarts; resume any interrupted loop with the same `--goal`.
- **Bun single-binary build** — zero runtime dependencies, cross-platform (Linux / macOS / Windows).

## Quick Start

```bash
# Clone and install
git clone https://github.com/PerryLink/loop-opencode.git
cd loop-opencode
bun install

# Run directly
bun run src/index.ts --goal "Build a CLI weather app in Python"

# Or build a standalone binary
bash bin/build.sh
./loop-opencode --goal "Create a REST API with Express and TypeScript"
```

Requirements: **Bun >= 1.0**, OpenCode CLI installed and accessible in `PATH`.

## FAQ

### Q: How is loop-opencode different from running OpenCode CLI directly?
A: OpenCode CLI is a single-session interactive REPL. loop-opencode wraps it with an 11-phase state machine that automates the full design-implement-test-verify cycle. It auto-routes failures (P0/P1/P2), tracks convergence, enforces hard turn limits, and persists state across sessions — all without a human in the loop.

### Q: What do the 8 safety gates protect against?
A: **G1** blocks malicious/harmful content in outputs. **G2** requires a validated design artifact before any code is written. **G3** sandboxes dependency installation. **G4** intercepts dangerous shell commands (`rm -rf /`, `git push --force`, etc.). **G5** audits every file mutation against an allowlist. **G6** is the final hard verification gate — `should_terminate()` must pass before the loop declares completion. **Gate State Guard** prevents the agent from tampering with `gate_state.json`. **Permission Block** stops the agent from elevating its own privileges.

### Q: Can I pause and resume a loop?
A: Yes. Every phase transition writes full state to `state.json`. If the process is killed, restart with the same `--goal` and `--state-file` to pick up from the last completed phase. The convergence counter and gate states are preserved exactly.

### Q: What happens when the agent gets stuck in a loop?
A: The convergence detector monitors the `convergence_counter`. If it exceeds the configured threshold without making forward progress, the loop triggers a forced re-route — escalating through P2 (retry), P1 (re-implement), and P0 (redesign) until the blockage resolves or the hard turn limit is hit.

### Q: Is this production-ready?
A: The core engine (phase machine, gates, routing, persistence) is complete and battle-tested. Areas still maturing: CI pipeline (currently `bun test` only), OpenCode CLI plugin hook documentation, and system-level E2E test coverage.

## Related Projects

| Project | Description | Repo |
|---------|------------|------|
| loop-everything | Meta-index and aggregation hub for all loop-* projects | [PerryLink/loop-everything](https://github.com/PerryLink/loop-everything) |
| loop-superpowers | Pure Skill mini-loops for Claude Code | [PerryLink/loop-superpowers](https://github.com/PerryLink/loop-superpowers) |
| loop-codex | Dual-channel (JSON-RPC + CDP) driver for Codex Desktop | [PerryLink/loop-codex](https://github.com/PerryLink/loop-codex) |
| loop-copilot | Closed-loop driver for GitHub Copilot SDK | [PerryLink/loop-copilot](https://github.com/PerryLink/loop-copilot) |
| loop-cursor | Closed-loop driver for Cursor IDE SDK | [PerryLink/loop-cursor](https://github.com/PerryLink/loop-cursor) |
| loop-deepseek | Self-built ReAct agent loop for DeepSeek API | [PerryLink/loop-deepseek](https://github.com/PerryLink/loop-deepseek) |
| loop-ollama | Self-built ReAct agent loop for local Ollama models | [PerryLink/loop-ollama](https://github.com/PerryLink/loop-ollama) |
| loop-antigravity | Closed-loop driver for Google Antigravity / Gemini | [PerryLink/loop-antigravity](https://github.com/PerryLink/loop-antigravity) |
| loop-openclaw | Multi-agent loop config generator for OpenClaw Gateway | [PerryLink/loop-openclaw](https://github.com/PerryLink/loop-openclaw) |
| loop-windsurf | Autonomous coding loop driver for Windsurf IDE | [PerryLink/loop-windsurf](https://github.com/PerryLink/loop-windsurf) |
| loop-aider | Multi-phase ReAct loop wrapping Aider CLI | [PerryLink/loop-aider](https://github.com/PerryLink/loop-aider) |

## License

Apache License 2.0 © 2026 Perry Link. See [LICENSE](./LICENSE) for full text.

---

<a id="中文"></a>

## 中文说明

**loop-opencode** 是一个面向 OpenCode CLI 的全自主编码闭环驱动——给定一个目标，自动完成设计、实施、测试、验证全流程。定位为原始 OpenCode CLI 的增强替代，专为无人值守的多阶段自主编码场景优化，内置 8 道安全闸门。

### 核心功能

- **11 阶段全自主工作流**：头脑风暴 → 计划 → 设计 → Shell 预览 → 门禁检查(G1-G2) → 实施 → 测试 → 收敛检测 → 门禁检查(G3-G6) → 验证 → 最终确认。
- **8 道安全闸门 (G1-G6 + Gate State Guard + Permission Block)**：内容安全过滤、计划确认、依赖沙箱安装、危险操作拦截、文件变更审计、完成声明硬验证、闸门状态防篡改、权限提升阻断。
- **收敛驱动循环**：`convergence_counter` 配合快速路径提前终止机制，检测停滞并自动重路由。
- **P0/P1/P2 问题路由**：根据失败严重程度自动回退到重新设计(P0)、重新实施(P1)或内联修复(P2)。
- **状态持久化**：每次阶段切换写入 `state.json`，支持进程崩溃后从断点续跑。
- **Bun 单二进制构建**：零运行时依赖，跨 Linux / macOS / Windows。

### 快速开始

```bash
git clone https://github.com/PerryLink/loop-opencode.git
cd loop-opencode
bun install
bun run src/index.ts --goal "用 Python 写一个命令行天气应用"
```

环境要求：**Bun >= 1.0**，系统中已安装 OpenCode CLI 并位于 `PATH`。
