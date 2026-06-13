/**
 * p0-escalation.ts —— P0 复发升级机制（M4）
 *
 * 核心功能：
 * - P0 签名提取（标准化描述 + 根因标签 + 受影响模块）
 * - 跨 cycle 复发检测（语义相似度 + 模块重叠度）
 * - 升级路径: active → paused (>=2 次) → failed (>=3 次)
 * - convergence_counter 联动（发现 P0 复发时重置）
 *
 * @module p0-escalation
 */

import { readState, writeState } from "./state";
import type { Issue, P0Signature, P0SignatureEntry, RecurrenceResult } from "./types";
import { computeSemanticSimilarity, buildP0Signature, extractIssueText } from "./semantic-similarity";

/**
 * 对新增 P0 issue 执行复发检测与升级
 *
 * 流程：
 * 1. 从 issue 提取 P0 签名
 * 2. 与 p0_history 中已有签名做语义相似度比较
 * 3. 若判定为复发 → 递增 occurrence_count + 更新升级级别
 * 4. 若为新 P0 → 追加到 p0_history
 * 5. P0 复发时重置 convergence_counter = 0
 *
 * @param projectRoot - 项目根目录
 * @param newP0 - 新增的 P0 issue
 * @returns 复发检测结果
 */
export function detectAndEscalateP0(
  projectRoot: string,
  newP0: Issue
): RecurrenceResult {
  const state = readState(projectRoot);

  // 步骤 1: 签名提取
  const newSig = buildP0Signature(newP0);
  const newText = extractIssueText(newP0);

  // 步骤 2: 与历史签名比较
  let bestMatch: RecurrenceResult = {
    isRecurrence: false,
    recurrenceScore: 0,
    recurrenceCount: 0,
    levenshteinScore: 0,
    jaccardScore: 0,
    moduleOverlapScore: 0,
  };

  for (const entry of state.p0_history) {
    const histText = `${entry.signature.description_normalized}`;
    const result = computeSemanticSimilarity(
      newText,
      histText,
      newSig,
      entry.signature.affected_modules
    );

    if (result.isRecurrence && result.recurrenceScore > bestMatch.recurrenceScore) {
      bestMatch = result;
      bestMatch.recurrenceCount = entry.occurrence_count + 1;
      bestMatch.matchedSignature = entry.signature;
    }
  }

  // 步骤 3: 更新 p0_history
  if (bestMatch.isRecurrence && bestMatch.matchedSignature) {
    // 复发——更新已有条目
    const entry = state.p0_history.find(
      (e) => e.signature === bestMatch.matchedSignature
    );
    if (entry) {
      entry.occurrence_count += 1;
      entry.last_seen_cycle = state.progress.cycle;
      entry.last_seen_at = new Date().toISOString();

      // 升级判定
      if (entry.occurrence_count >= 3) {
        entry.escalation_level = "failed";
        entry.escalated_at = new Date().toISOString();
        console.error(
          `[p0esc] P0 恶性复发: "${entry.signature.root_cause_tag}" 累计 ${entry.occurrence_count} 次 → failed`
        );
      } else if (entry.occurrence_count >= 2) {
        entry.escalation_level = "paused";
        entry.escalated_at = new Date().toISOString();
        console.warn(
          `[p0esc] P0 复发: "${entry.signature.root_cause_tag}" ${entry.occurrence_count} 次 → paused`
        );
      }

      // 记录修复历史
      entry.fix_history.push({
        cycle: state.progress.cycle,
        fix_description: `P0 复发——${newP0.title}`,
      });
    }
  } else {
    // 新 P0——追加到历史
    const newEntry: P0SignatureEntry = {
      p0_id: `p0sig_${Date.now()}_${state.p0_history.length}`,
      signature: newSig,
      occurrence_count: 1,
      first_seen_cycle: state.progress.cycle,
      first_seen_at: new Date().toISOString(),
      last_seen_cycle: state.progress.cycle,
      last_seen_at: new Date().toISOString(),
      fix_history: [],
      escalation_level: "active",
    };
    state.p0_history.push(newEntry);
  }

  // 步骤 4: convergence_counter 联动
  if (bestMatch.isRecurrence) {
    state.progress.convergence_counter = 0;
    console.log("[p0esc] P0 复发——convergence_counter 重置为 0");
  }

  writeState(projectRoot, state);
  return bestMatch;
}

/**
 * 批量检测——对多个 P0 issue 逐一执行复发检测
 *
 * @param projectRoot - 项目根目录
 * @param p0s - P0 issue 数组
 * @returns 各 issue 的检测结果
 */
export function detectP0Batch(
  projectRoot: string,
  p0s: Issue[]
): RecurrenceResult[] {
  return p0s.map((p0) => detectAndEscalateP0(projectRoot, p0));
}

/**
 * 检查当前是否有 P0 处于需要暂停的状态
 *
 * @param projectRoot - 项目根目录
 * @returns 是否应暂停（paused 或 failed 级别）
 */
export function shouldPauseForP0(projectRoot: string): boolean {
  const state = readState(projectRoot);
  return state.p0_history.some(
    (e) => e.escalation_level === "paused" || e.escalation_level === "failed"
  );
}

/**
 * 获取 P0 复发历史摘要
 *
 * @param projectRoot - 项目根目录
 * @returns 摘要字符串数组
 */
export function getP0HistorySummary(projectRoot: string): string[] {
  const state = readState(projectRoot);
  return state.p0_history.map(
    (e) =>
      `[${e.escalation_level}] ${e.signature.root_cause_tag}: ${e.occurrence_count} 次 (首次: cycle ${e.first_seen_cycle}, 最近: cycle ${e.last_seen_cycle})`
  );
}

export { extractIssueText, buildP0Signature };
