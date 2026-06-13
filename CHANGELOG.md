# Changelog

All notable changes to loop-opencode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.1.0] - 2026-06-13

### Added

- **11-Phase Autonomous Workflow**: From brainstorming to hard verification gate, fully automated design-implement-test-verify closed loop
- **8 Safety Gates (G1-G6, Gate State Guard, Permission Block)**: Content safety (G1), plan confirmation (G2), dependency install sandbox (G3), dangerous operations interception (G4), file mutation audit (G5), completion declaration verification (G6), gate state protection (GSG), permission change interception (PB)
- **Convergence-Driven Loop**: `convergence_counter` with fast-path early termination for efficient task completion
- **P0/P1/P2 Issue Routing**: Automatic fallback to redesign (P0), design-level vs implementation-level decision (P1), or re-implementation (P2)
- **State Persistence**: `state.json` survives process interruptions and session restarts with atomic writes and `.bak` auto-recovery
- **Bun-Compiled Single Binary**: Zero runtime dependencies, cross-platform (Linux x64/arm64, macOS x64/arm64, Windows x64)
- **OpenCode CLI Plugin Architecture**: In-process plugin system for guard gates and phase orchestration
- **Comprehensive Test Suite**: Unit tests for state management, guard gates, post-hoc validation, and 10 E2E integration scenarios

### Changed

- Initial release, no historical changes.

### Fixed

- Initial release, no historical fixes.

### Security

- G1 blocks at >=85% context usage, warns at >=70%
- G4 intercepts destructive commands (rm -rf, git push --force, etc.)
- G5 audits all file writes for scope validation
- P0 issue routing ensures critical failures trigger full redesign review

---

[v0.1.0]: https://github.com/PerryLink/loop-opencode/releases/tag/v0.1.0
