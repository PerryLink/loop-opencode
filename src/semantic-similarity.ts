/**
 * semantic-similarity.ts —— 语义相似度计算模块（M2）
 *
 * 双算法架构：
 * - Levenshtein 距离（归一化文本相似度）
 * - Jaccard 相似度（关键词集合重叠度）
 *
 * 用途：P0 复发检测中计算新旧问题描述之间的相似度，
 *      通过双算法加权结果判定是否为同一问题复发。
 *
 * @module semantic-similarity
 */

import type { RecurrenceResult, P0Signature, Issue } from "./types";

/**
 * 计算加权语义相似度——Levenshtein + Jaccard 双算法
 *
 * 双算法权重：
 * - Levenshtein: 0.5
 * - Jaccard:     0.5
 *
 * 若两算法得分差 > 0.3，则以较低分为准（保守策略）。
 *
 * @param textA - 第一个文本（新问题描述）
 * @param textB - 第二个文本（历史问题描述）
 * @returns RecurrenceResult 对象
 */
export function computeSemanticSimilarity(
  textA: string,
  textB: string,
  signatureA?: P0Signature,
  extraModules?: string[]
): RecurrenceResult {
  // 归一化文本（去空格、转小写）
  const a = normalizeText(textA);
  const b = normalizeText(textB);

  // 算法 A: Levenshtein 相似度
  const levenshteinScore = levenshteinSimilarity(a, b);

  // 算法 B: Jaccard 相似度
  const jaccardScore = jaccardSimilarity(a, b);

  // 算法 C: 模块重叠度（若提供了模块信息）
  let moduleOverlapScore = 0;
  if (signatureA && extraModules && extraModules.length > 0) {
    moduleOverlapScore = computeModuleOverlap(
      signatureA.affected_modules,
      extraModules
    );
  }

  // 加权综合得分（Levenshtein 0.5 + Jaccard 0.5）
  let compositeScore = levenshteinScore * 0.5 + jaccardScore * 0.5;

  // 双算法得分差 > 0.3 → 取较低分（保守策略）
  const diff = Math.abs(levenshteinScore - jaccardScore);
  if (diff > 0.3) {
    compositeScore = Math.min(levenshteinScore, jaccardScore);
    console.log(
      `[semantic] 双算法分歧过大 (diff=${diff.toFixed(2)})，采用保守策略: score=${compositeScore.toFixed(2)}`
    );
  }

  // 判定是否为复发（综合得分 >= 0.6 视为同一问题）
  const isRecurrence = compositeScore >= 0.6;

  return {
    isRecurrence,
    matchedSignature: isRecurrence ? signatureA : undefined,
    recurrenceScore: compositeScore,
    recurrenceCount: 0, // 由调用方填充
    levenshteinScore,
    jaccardScore,
    moduleOverlapScore,
  };
}

/**
 * Levenshtein 编辑距离相似度
 *
 * 计算两个字符串之间的 Levenshtein 编辑距离，
 * 然后归一化到 0-1 区间（1 = 完全相同）。
 *
 * @param a - 归一化后的文本 A
 * @param b - 归一化后的文本 B
 * @returns 相似度 0-1（1 表示完全相同）
 */
export function levenshteinSimilarity(a: string, b: string): number {
  // 空串保护
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Levenshtein 编辑距离核心算法
 *
 * 动态规划实现——O(m*n) 时间，O(min(m,n)) 空间优化。
 * 支持三种操作：插入、删除、替换（代价均为 1）。
 *
 * @param a - 字符串 A
 * @param b - 字符串 B
 * @returns 最小编辑距离
 */
export function levenshteinDistance(a: string, b: string): number {
  // 保证 a 是较短的字符串（空间优化）
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // 单行 DP 数组
  let prev = new Array(m + 1).fill(0);
  let curr = new Array(m + 1).fill(0);

  for (let j = 0; j <= m; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // 删除
        curr[j - 1] + 1, // 插入
        prev[j - 1] + cost // 替换
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m]!;
}

/**
 * Jaccard 相似度——关键词集合重叠度
 *
 * 分词后计算 Jaccard 指数: |A ∩ B| / |A ∪ B|
 *
 * @param a - 归一化后的文本 A
 * @param b - 归一化后的文本 B
 * @returns 相似度 0-1
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  // 计算交集
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0.0;

  return intersection / union;
}

/**
 * 模块重叠度算法
 *
 * 计算两个模块列表的重叠度: |A ∩ B| / max(|A|, |B|)
 *
 * @param modulesA - 历史签名的模块列表
 * @param modulesB - 当前问题的模块列表
 * @returns 重叠度 0-1
 */
export function computeModuleOverlap(
  modulesA: string[],
  modulesB: string[]
): number {
  if (modulesA.length === 0 && modulesB.length === 0) return 1.0;
  if (modulesA.length === 0 || modulesB.length === 0) return 0.0;

  const setA = new Set(modulesA);
  const setB = new Set(modulesB);
  let overlap = 0;
  for (const m of setA) {
    if (setB.has(m)) overlap++;
  }
  return overlap / Math.max(setA.size, setB.size);
}

/**
 * 文本归一化——小写 + 去标点 + 去多余空格
 *
 * @param text - 原始文本
 * @returns 归一化后的文本
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿\s]/g, " ") // 保留中英文词语、空格
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 中文+英文混合分词
 *
 * 策略：
 * - 空格分词（英文）
 * - 中文大粒度：按空格 + 标点分，不去中文单字
 * - 过滤掉长度 < 2 的词（单字无意义）
 *
 * @param text - 归一化后的文本
 * @returns 词条数组
 */
export function tokenize(text: string): string[] {
  // 按空格 + 标点分割
  const raw = text
    .replace(/[^\w一-鿿]+/g, " ") // 非中英文替换为空格
    .split(/\s+/)
    .filter((t) => t.length >= 2); // 过滤短词

  return raw;
}

/**
 * 从 Issue 中提取用于比较的文本
 *
 * 拼接 title + description 作为语义比较的基础文本。
 *
 * @param issue - Issue 对象
 * @returns 拼接后的文本
 */
export function extractIssueText(issue: Issue): string {
  return `${issue.title}. ${issue.description}`;
}

/**
 * 构建 P0 签名
 *
 * 从 Issue 中提取标准化描述、根因标签、受影响模块。
 *
 * @param issue - P0 Issue
 * @param rootCauseTag - 根因标签（可由调用方指定）
 * @returns P0Signature 对象
 */
export function buildP0Signature(
  issue: Issue,
  rootCauseTag?: string
): P0Signature {
  return {
    description_normalized: normalizeText(
      `${issue.title}. ${issue.description}`
    ),
    root_cause_tag: rootCauseTag || extractRootCauseTag(issue),
    affected_modules: [...issue.affected_modules].sort(),
    route_target: issue.route_target || "part_1_1",
    first_seen_cycle: issue.found_in_cycle,
    first_seen_at: issue.found_at,
  };
}

/**
 * 从 issue 描述中提取根因标签
 *
 * 检查标题与描述中是否包含已知根因关键词。
 *
 * @param issue - Issue 对象
 * @returns 根因标签字符串
 */
function extractRootCauseTag(issue: Issue): string {
  const text = (
    issue.title + " " + issue.description
  ).toLowerCase();
  const tags = [
    "需求理解错误",
    "架构设计缺陷",
    "接口不一致",
    "数据模型错误",
    "算法错误",
    "边界条件遗漏",
    "并发问题",
    "资源泄漏",
  ];
  for (const tag of tags) {
    if (text.includes(tag.toLowerCase())) return tag;
  }
  return "未分类";
}
