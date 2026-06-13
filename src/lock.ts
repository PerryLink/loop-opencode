/**
 * 并发锁协议模块
 *
 * 管理两种锁文件：
 * - .lock：state.json 并发写入锁（二进制持有）
 * - .gate_lock：gate_state.json 写入锁（二进制 + watchdog 竞争）
 *
 * 锁机制：
 * - 使用 O_CREAT | O_EXCL（exclusive create）实现原子获取
 * - 超时检测：持有锁超过 timeout 的进程视为僵死，允许抢断
 * - 锁内容记录持有者 PID、角色与获取时间——便于调试
 *
 * @module lock
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { LockFileContent } from "./types";

/** 默认锁超时（毫秒） */
const DEFAULT_LOCK_TIMEOUT_MS = 60_000; // 60s

/** state.json 锁文件路径 */
const LOCK_FILE = ".loop-opencode/.lock";

/** gate_state.json 锁文件路径 */
const GATE_LOCK_FILE = ".loop-opencode/.gate_lock";

/**
 * 锁句柄——表示已获取的锁
 */
export interface LockHandle {
  /** 锁文件路径 */
  path: string;
  /** 获取锁时间（ISO 8601） */
  acquiredAt: string;
}

/**
 * 尝试获取锁（非阻塞）
 *
 * 使用排他创建（wx flag）原子获取锁。
 * 若锁已存在且未超时 → 返回 null。
 * 若锁已存在但超时 → 强制释放后重试获取。
 *
 * @param projectRoot - 项目根目录
 * @param lockName - 锁文件名（如 ".lock" 或 ".gate_lock"）
 * @param role - 持有者角色
 * @param timeoutMs - 超时毫秒数
 * @returns LockHandle 或 null（获取失败）
 */
export function tryAcquireLock(
  projectRoot: string,
  lockName: string = LOCK_FILE,
  role: "main" | "watchdog" | "plugin" = "main",
  timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS,
): LockHandle | null {
  const lockPath = join(projectRoot, lockName);

  // 检查是否存在未超时的锁
  if (existsSync(lockPath)) {
    try {
      const raw = readFileSync(lockPath, "utf-8");
      const content = JSON.parse(raw) as LockFileContent;
      const age = Date.now() - new Date(content.acquired_at).getTime();

      if (age < timeoutMs) {
        // 锁有效——获取失败
        return null;
      }

      // 锁已超时——强制释放
      console.warn(
        `[lock] {{lockName}} 锁已超时 (${age}ms)，强制释放 (PID: ${content.pid}, 角色: ${content.role})`,
      );
      releaseLock({ path: lockPath, acquiredAt: content.acquired_at });
    } catch {
      // 锁文件损坏——直接清理
      try {
        unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
  }

  // 尝试排他创建
  try {
    const content: LockFileContent = {
      pid: process.pid,
      role,
      acquired_at: new Date().toISOString(),
      timeout_seconds: Math.ceil(timeoutMs / 1000),
    };

    writeFileSync(lockPath, JSON.stringify(content), { flag: "wx" });

    return {
      path: lockPath,
      acquiredAt: content.acquired_at,
    };
  } catch {
    // 竞争失败——另一进程抢先获取
    return null;
  }
}

/**
 * 阻塞式获取锁（带超时）
 *
 * 每隔 retryIntervalMs 重试一次，直到获取成功或超时。
 *
 * @param projectRoot - 项目根目录
 * @param lockName - 锁文件名
 * @param role - 持有者角色
 * @param timeoutMs - 总超时（毫秒）
 * @param retryIntervalMs - 重试间隔（毫秒，默认 100ms）
 * @returns LockHandle 或 null（超时）
 */
export async function acquireLock(
  projectRoot: string,
  lockName: string = LOCK_FILE,
  role: "main" | "watchdog" | "plugin" = "main",
  timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS,
  retryIntervalMs: number = 100,
): Promise<LockHandle | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const handle = tryAcquireLock(projectRoot, lockName, role, timeoutMs);
    if (handle) {
      return handle;
    }

    // 短暂休眠后重试
    await sleep(retryIntervalMs);
  }

  return null; // 超时
}

/**
 * 释放锁
 *
 * 仅释放自己持有的锁（校验 PID）。
 *
 * @param handle - 锁句柄
 */
export function releaseLock(handle: LockHandle): void {
  try {
    if (existsSync(handle.path)) {
      const raw = readFileSync(handle.path, "utf-8");
      const content = JSON.parse(raw) as LockFileContent;

      // 仅释放自己持有的锁
      if (content.pid === process.pid) {
        unlinkSync(handle.path);
      } else {
        console.warn(
          `[lock] 尝试释放非自有锁 (holder PID: ${content.pid}, current PID: ${process.pid})`,
        );
      }
    }
  } catch (err) {
    console.warn(`[lock] 释放锁失败: ${err}`);
  }
}

/**
 * 获取 state.json 锁
 *
 * 快捷方法——锁定 .loop-opencode/.lock
 */
export function acquireStateLock(
  projectRoot: string,
  timeoutMs?: number,
): Promise<LockHandle | null> {
  return acquireLock(projectRoot, LOCK_FILE, "main", timeoutMs);
}

/**
 * 获取 gate_state.json 锁
 *
 * 快捷方法——锁定 .loop-opencode/.gate_lock
 */
export function acquireGateLock(
  projectRoot: string,
  timeoutMs?: number,
): Promise<LockHandle | null> {
  return acquireLock(projectRoot, GATE_LOCK_FILE, "main", timeoutMs);
}

/**
 * 检查锁是否被持有
 *
 * @param projectRoot - 项目根目录
 * @param lockName - 锁文件名
 * @returns 锁内容或 null（锁未持有）
 */
export function checkLock(
  projectRoot: string,
  lockName: string = LOCK_FILE,
): LockFileContent | null {
  const lockPath = join(projectRoot, lockName);

  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const raw = readFileSync(lockPath, "utf-8");
    return JSON.parse(raw) as LockFileContent;
  } catch {
    return null;
  }
}

/**
 * 清理所有锁（仅清理当前进程持有的锁）
 *
 * @param projectRoot - 项目根目录
 */
export function cleanupLocks(projectRoot: string): void {
  const locks = [
    join(projectRoot, LOCK_FILE),
    join(projectRoot, GATE_LOCK_FILE),
  ];

  for (const lockPath of locks) {
    try {
      if (existsSync(lockPath)) {
        const raw = readFileSync(lockPath, "utf-8");
        const content = JSON.parse(raw) as LockFileContent;
        if (content.pid === process.pid) {
          unlinkSync(lockPath);
        }
      }
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 异步 sleep
 *
 * 返回一个 Promise，在指定毫秒后 resolve。用于轮询等待场景（如锁重试间隔）。
 *
 * @param ms - 休眠毫秒数
 * @returns 在 ms 毫秒后 resolve 的 Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
