# Security Policy / 安全策略

## Supported Versions / 支持的版本

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability / 报告漏洞

**请勿通过公开 Issue 提交安全漏洞。**  
**Please do NOT report security vulnerabilities via public GitHub Issues.**

请将漏洞详情发送至：  
Please send vulnerability details to:

**novelnexusai@outlook.com**

我们承诺在 **72 小时内** 确认收到报告，并在 **14 天内** 发布修复版本。  
We commit to acknowledging receipt within **72 hours** and releasing a fix within **14 days**.

请在报告中包含以下信息 / Please include the following in your report:

- 受影响的版本 / Affected version(s)
- 复现步骤 / Steps to reproduce
- 影响评估 / Impact assessment (CVSS score if possible)
- 建议修复方案（如有）/ Suggested fix (if any)
- 是否已有公开利用代码 / Whether a public exploit exists

### Disclosure Policy / 披露政策

We follow a coordinated disclosure model:

1. Reporter submits vulnerability via email (novelnexusai@outlook.com)
2. Maintainer acknowledges within 72 hours
3. Fix developed and tested within 14 calendar days
4. CVE requested if severity warrants (CVSS >= 7.0)
5. Public advisory published alongside the patch release
6. Reporter credited in the advisory (unless anonymity requested)

**Safe Harbor**: We will not pursue legal action against security researchers who act in good faith and follow this disclosure policy. We consider security research conducted in accordance with this policy to be "authorized" under applicable anti-hacking laws.

### Recognition Hall of Fame / 致谢

| Date | Reporter | Issue | Severity | CVE |
|------|----------|-------|----------|-----|
| (none yet -- be the first!) | | | | |

---

## Threat Model / 威胁模型

### Assets to Protect / 需保护的资产

| Asset | Sensitivity | Description |
|-------|------------|-------------|
| `opencode.json` | **Critical** | Agent permission configuration; compromise = full system access |
| `.loop-opencode/state.json` | **High** | Workflow state machine; corruption = undefined behavior |
| `.loop-opencode/gate_state.json` | **High** | Gate violation history; tampering = audit trail loss |
| `.loop-opencode/runs.log` | **Medium** | Execution audit log; deletion = evidence destruction |
| Source code files | **Medium** | Project intellectual property |
| `CLAUDE.md` | **Medium** | Agent instructions; modification = prompt injection vector |

### Attack Surface / 攻击面

| Vector | Risk Level | Mitigation |
|--------|-----------|------------|
| Agent tool abuse (Write/Edit to opencode.json) | **Critical** | Permission Block guard (guard-permission-block.ts) |
| Agent tool abuse (Bash with dangerous commands) | **Critical** | G4 Dangerous Ops guard + G3 Dependency guard |
| Agent completing prematurely | **High** | G6 Completion guard (3-way validation) |
| Context exhaustion (agent output quality degradation) | **High** | G1 Context Usage guard (85% hard threshold) |
| Token budget exhaustion (infinite loops) | **High** | G2 Token Budget guard + Convergence counter |
| Concurrent state corruption | **Medium** | File-based PID locking (src/lock.ts) |
| Agent stalling / hanging | **Medium** | Watchdog subprocess (30s heartbeat timeout) |
| State file corruption | **Low** | Atomic 4-step write + .bak auto-recovery |
| Session hijacking via environment | **Low** | ROLE env var checked on startup |
| Post-hoc unauthorized changes | **Low** | runPostHocAudit checks git/gh history |

---

## Security Model / 安全模型

### 1. Guard Gate System / 闸门系统

loop-opencode 内置 **8 层闸门** 保护 agent 行为安全：  
loop-opencode has a built-in **8-gate system** to protect agent behavior:

| Gate | File | Priority | Description / 描述 |
|------|------|----------|---------------------|
| G1 | guard-g1.ts | 100 | 上下文使用率闸门 -- 阻断上下文超过 85% 的高风险操作 |
| G2 | guard-g2.ts | 200 | Token 预算闸门 -- 阻断预算耗尽（>= 100%）的高成本操作 |
| G3 | guard-g3.ts | 300 | 依赖安装安全闸门 -- 拦截含危险标志/管道的安装命令 |
| G4 | guard-g4.ts | 400 | 危险操作闸门 -- L0-L4 多层危险命令拦截（rm -rf /、dd、fork bomb） |
| G5 | guard-g5.ts | 500 | 文件操作闸门 -- 拦截超出项目根目录的文件写入 |
| G6 | guard-g6.ts | 600 | 完成声明闸门 -- 验证终止条件：P0 清零 + CR 达标 + 合约完成 |
| GSG | gate-state-guard.ts | 700 | 门禁文件保护 -- 禁止 agent 修改 gate_state.json |
| PB | guard-permission-block.ts | 800 | 权限变更拦截 -- 禁止 agent 修改 opencode.json 中的权限配置 |

**Gate priority order**: Lower-numbered gates fire first. All 8 gates run in the `safe` (L1) and `auto` (L2) modes. In `unsafe` (L3) mode, only G4 (L0-L2 hard blocks) and Permission Block are active.

### 2. Run Mode Security Matrix / 运行模式安全矩阵

| Mode | Gates Active | Confirmation Halt | Use Case |
|------|-------------|-------------------|----------|
| `safe` (L1) | All 8 | Every critical decision | Production, untrusted codebases |
| `auto` (L2, default) | All 8 | Only when threshold exceeded | Standard development |
| `unsafe` (L3) | G4 (L0-L2) + PB | None (fully automated) | Sandbox/VM, trusted code only |
| `collaborative` (L1+) | All 8 | Part 1 decisions only | Team collaboration |

### 3. Five-Layer Command Interception / 五层命令拦截

G4 (Dangerous Ops Guard) implements a 5-level command classification:

| Level | Pattern | Examples | Action |
|-------|---------|----------|--------|
| **L0** | Catastrophic | `rm -rf /`, `dd if=/dev/zero of=/dev/sda`, fork bombs | **Always block (hard)** |
| **L1** | System Destructive | `chmod 777`, `mkfs.*`, `:(){ :\|:& };:` | Block in safe mode |
| **L2** | File Destructive | `rm -rf` (non-root), `shred` | Block in safe mode, warn in auto |
| **L3** | Network Dangerous | `curl \| bash`, `wget -O - \| sh` | Warn in all modes |
| **L4** | Write Dangerous | `> /etc/*`, `>> ~/.ssh/*` | Block writes outside projectRoot |

### 4. File System Safety / 文件系统安全

- **Sandbox enforcement (G5)**: All file writes constrained within `projectRoot`; system paths (`/etc/`, `/usr/`, `/boot/`, `~/.ssh/`) hard-blocked
- **Atomic writes**: `state.json` uses 4-step protocol (tmp → fsync → rename → fsync dir), ensuring no partial writes survive crashes
- **Automatic backup**: `.loop-opencode/state.json.bak` created before every write; `.bak` auto-restore on corruption detection
- **Gate state isolation**: `gate_state.json` write-protected by Gate State Guard; agent reads allowed, writes denied

### 5. Permission Model / 权限模型

- **Configuration file protection**: Agent cannot modify `opencode.json` (Permission Block guard, priority 800)
- **Sensitive key monitoring**: 9 sensitive keys monitored (`allowed_tools`, `command_permissions`, `disabled_tools`, `tool_whitelist`, `tool_blacklist`, `approval_policy`, `max_turns`, `safety_mode`, `sandbox`)
- **Whitelist enforcement**: G3 validates install commands against known package managers only (npm, yarn, pip, cargo, gem, go)
- **Confirmation gating**: `requireConfirmation: true` returned when critical guard is triggered; agent must obtain explicit user approval

### 6. Dependency Safety / 依赖安全

- **G3 guard patterns**:
  - `--force` flag: Hard block (npm/pip/yarn)
  - Piped installs (`curl | bash`): Hard block
  - `eval` / `$(...)` injection: Hard block
  - `sudo` prefix: Warn, block in safe mode
  - Unknown package managers: Block
- **Whitelist registries**: npmjs.org, pypi.org, crates.io only
- **No automated global installs**: `-g` / `--global` flags blocked

### 7. Concurrent Access / 并发访问

- **File-based PID locking**: `.loop-opencode/.lock` and `.loop-opencode/.gate_lock` prevent concurrent state corruption
- **Watchdog monitoring**: Independent Bun subprocess (`ROLE=watchdog`) checks:
  1. Parent heartbeat (90s staleness → alert + pause)
  2. Agent stuck detection (60s same phase → alert)
  3. Gate violation escalation (>10 accumulated blocks → escalation)
  4. Budget exhaustion (>= 95% consumed → alert)
  5. Output stagnation (state hash unchanged 30s → alert)
  6. Session timeout (total elapsed > max_cycles * 10min → alert + pause)
- **Automatic cleanup**: `cleanupLocks()` on process exit; orphan lock expiry via timeout

### 8. Attack Surface Mitigations / 攻击面缓解

| Threat | Attack Vector | Mitigation | Guard Reference |
|--------|--------------|------------|-----------------|
| Privilege escalation | Agent writes to opencode.json | Permission Block | guard-permission-block.ts |
| Arbitrary code execution | Bash with `eval` / `$()` | G3 dependency guard | guard-g3.ts |
| System destruction | `rm -rf /` / `dd` | G4 dangerous ops (L0) | guard-g4.ts |
| Data exfiltration | Write to external paths | G5 file operation guard | guard-g5.ts |
| Prompt injection | Agent modifies CLAUDE.md | G5 file operation guard | guard-g5.ts |
| State tampering | Agent corrupts state.json | Atomic write protocol | src/state.ts |
| Audit log deletion | Agent deletes gate_state.json | Gate State Guard | gate-state-guard.ts |
| Denial of service | Infinite loops / budget drain | G2 budget guard + Watchdog | guard-g2.ts + watchdog.ts |
| Incomplete verification | Agent declares "done" prematurely | G6 completion guard | guard-g6.ts |
| Context poisoning | Agent ignores context exhaustion warning | G1 context guard | guard-g1.ts |

---

## Secure Development Lifecycle / 安全开发生命周期

### Pre-commit

1. TypeScript strict mode enabled (`tsconfig.json`: `strict: true`)
2. `bun run tsc --noEmit` type-check before every commit
3. `.editorconfig` enforces consistent formatting (UTF-8, LF, 2-space tab)
4. All new features require corresponding guard tests

### CI/CD Pipeline

1. **Test matrix**: Ubuntu + Windows + macOS, Bun 1.1 + 1.2
2. **Coverage**: `bun test --coverage` with >= 70% line/function threshold
3. **Integration tests**: Separate job with 30s timeout
4. **Plugin verification**: All 8 guard plugins verified present in CI
5. **Build**: Multi-platform binary compilation (linux-x64, linux-arm64, macos-x64, macos-arm64, windows-x64)

### Dependency Management

- Lockfile-based installs: `bun install --frozen-lockfile` in CI
- Dev dependencies only: `@types/bun`, `@types/node`, `typescript` (no runtime deps)
- Bun runtime: >= 1.0.0 (includes built-in security sandboxing)

---

## Data Handling / 数据处理

| Data | Storage | Encryption | Retention | Access |
|------|---------|------------|-----------|--------|
| state.json | `.loop-opencode/` (local) | None (local file) | Until project deletion | Main process + Agent (read-only) |
| gate_state.json | `.loop-opencode/` (local) | None (local file) | Until project deletion | Plugin/Binary only (agent denied) |
| runs.log | `.loop-opencode/` (local) | None (local text) | Until project deletion | All processes |
| Security reports | Email (novelnexusai@outlook.com) | TLS in transit | 2 years after resolution | Maintainer only |

**No data leaves the local machine.** loop-opencode is a local-only CLI tool. It does not send telemetry, error reports, or usage data to any external service.

---

## Incident Response / 事件响应

In case of a confirmed security incident:

1. **Containment**: Immediately stop all loop-opencode instances
2. **Assessment**: Review `.loop-opencode/runs.log` and `gate_state.json` for the attack timeline
3. **Mitigation**: Apply the fix and verify all 8 guard gates pass
4. **Notification**: If the incident involves a vulnerability, follow the disclosure policy above
5. **Post-mortem**: Document the root cause and update guard rules accordingly

---

## Compliance / 合规性

- **License**: Apache-2.0 (OSI approved, no copyleft restrictions)
- **Dependencies**: All dev-only; no runtime dependencies = minimal supply chain risk
- **SBOM**: Available via `bun.lockb` (lockfile)
- **Vulnerability scanning**: Recommended to run `bun audit` (when available) or `npm audit` on the `bun-types` dependency

---

## Dependencies / 依赖项

- **Runtime**: Bun >= 1.0.0 (JavaScript runtime with built-in security: `--sandbox`, `--no-install`)
- **Type system**: TypeScript 5.x (strict mode: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- **File operations**: Node.js `fs` module (constrained to project root by G5 guard)
- **Testing**: Bun test runner (built-in, no external test framework dependency)

All dependencies are **dev dependencies only**. Runtime is single-binary (Bun compile), eliminating npm dependency chain attacks at runtime.

---

## Security Best Practices / 安全最佳实践

1. **始终使用 `--safe` 模式用于生产环境项目** / Always use `--safe` mode for production projects
2. **定期审计 `.loop-opencode/runs.log`** 检查异常行为 / Regularly audit runs.log for anomalies
3. **不要信任 `--unsafe` 模式下的自动提交** / Do not trust automated commits in `--unsafe` mode
4. **保持 opencode.json 中的 `allowed_tools` 最小化** / Keep `allowed_tools` in opencode.json minimal
5. **使用版本控制监控 opencode.json 变更** / Monitor opencode.json changes via VCS
6. **定期备份 `.loop-opencode/` 目录** / Regularly back up the runtime directory
7. **限制 agent 的 session 时长** / Limit agent session duration via `--max-cycles`
8. **生产环境使用 dedicated 用户运行** / Run under a dedicated user account in production
9. **在 CI/CD 中启用覆盖率检查** / Enable coverage thresholds in CI/CD
10. **发生安全事件时立即检查 gate_state.json** / Check gate_state.json immediately after suspected security incidents

---

## License / 许可证

```
Copyright 2026 Perry Link

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

**GitHub**: [PerryLink](https://github.com/PerryLink)  
**Project**: loop-opencode -- Closed-Loop Development Driver  
**Contact**: novelnexusai@outlook.com  
**Copyright**: 2026 Perry Link  
**Version**: 0.1.0  
**Last Updated**: 2026-06-13
