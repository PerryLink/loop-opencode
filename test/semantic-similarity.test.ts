/**
 * semantic-similarity.test.ts —— 语义相似度模块单元测试
 *
 * 测试 src/semantic-similarity.ts 的全部导出函数：
 * levenshteinDistance、levenshteinSimilarity、jaccardSimilarity、
 * normalizeText、tokenize、computeModuleOverlap、
 * computeSemanticSimilarity、extractIssueText、buildP0Signature
 *
 * @license Apache-2.0
 * @copyright 2026 Perry Link
 */

import { describe, test, expect, beforeEach } from "bun:test";

let mod: typeof import("../src/semantic-similarity");
let typesMod: typeof import("../src/types");

async function loadModules() {
  mod = await import("../src/semantic-similarity");
  typesMod = await import("../src/types");
}

beforeEach(async () => {
  await loadModules();
});

// ============================================================
// Helper: construct a minimal mock Issue
// ============================================================
function makeMockIssue(overrides: Partial<import("../src/types").Issue> = {}): import("../src/types").Issue {
  const now = "2026-06-10T10:00:00Z";
  return {
    issue_id: "P0-001",
    title: "默认标题",
    description: "默认描述",
    severity: "P0",
    source: "test_failure",
    affected_files: ["src/a.ts"],
    affected_modules: ["module_a"],
    status: "open",
    found_in_phase: "part_2_6" as import("../src/types").PhaseEnum,
    found_in_cycle: 3,
    found_at: now,
    ...overrides,
  };
}

// ============================================================
// levenshteinDistance —— 编辑距离
// ============================================================

describe("levenshteinDistance", () => {
  test("identical strings return 0", () => {
    if (!mod) return;
    expect(mod.levenshteinDistance("abc", "abc")).toBe(0);
    expect(mod.levenshteinDistance("hello", "hello")).toBe(0);
  });

  test("completely different strings return max length", () => {
    if (!mod) return;
    // "abc" vs "xyz" — 每个字符都不同，需要 3 次替换
    expect(mod.levenshteinDistance("abc", "xyz")).toBe(3);
    // "ab" vs "xyzw" — 较短的是 "ab"，需要 2 次替换 + 2 次插入 = 4
    expect(mod.levenshteinDistance("ab", "xyzw")).toBe(4);
  });

  test("partial match with one substitution", () => {
    if (!mod) return;
    // "kitten" → "sitten" (k→s) → "sittin" (e→i) → "sitting" (+g) = 3
    expect(mod.levenshteinDistance("kitten", "sitting")).toBe(3);
    // "flaw" → "flaws" 只差一个字符（插入）
    expect(mod.levenshteinDistance("flaw", "flaws")).toBe(1);
  });

  test("both empty strings return 0", () => {
    if (!mod) return;
    expect(mod.levenshteinDistance("", "")).toBe(0);
  });

  test("single character edit distance", () => {
    if (!mod) return;
    expect(mod.levenshteinDistance("a", "b")).toBe(1);
    expect(mod.levenshteinDistance("a", "a")).toBe(0);
    expect(mod.levenshteinDistance("a", "")).toBe(1);
  });
});

// ============================================================
// levenshteinSimilarity —— 归一化相似度 0-1
// ============================================================

describe("levenshteinSimilarity", () => {
  test("identical strings return 1.0", () => {
    if (!mod) return;
    expect(mod.levenshteinSimilarity("hello", "hello")).toBe(1.0);
    expect(mod.levenshteinSimilarity("abc", "abc")).toBe(1.0);
  });

  test("different strings return lower than 1.0", () => {
    if (!mod) return;
    const score = mod.levenshteinSimilarity("hello", "world");
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThanOrEqual(0.0);
  });

  test("empty string protection", () => {
    if (!mod) return;
    // 两者均空 → 1.0
    expect(mod.levenshteinSimilarity("", "")).toBe(1.0);
    // 一方为空 → 0.0
    expect(mod.levenshteinSimilarity("hello", "")).toBe(0.0);
    expect(mod.levenshteinSimilarity("", "world")).toBe(0.0);
  });
});

// ============================================================
// jaccardSimilarity —— 关键词重叠度 0-1
// ============================================================

describe("jaccardSimilarity", () => {
  test("identical token sets return 1.0", () => {
    if (!mod) return;
    expect(mod.jaccardSimilarity("hello world", "hello world")).toBe(1.0);
  });

  test("50% token overlap", () => {
    if (!mod) return;
    // 分词结果: ["hello", "world", "this"] 与 ["hello", "world", "other"]
    // 交集 = {"hello","world"}=2, 并集 = 3+3-2=4, Jaccard = 2/4 = 0.5
    const score = mod.jaccardSimilarity("hello world this", "hello world other");
    expect(score).toBeCloseTo(0.5, 2);
  });

  test("no token overlap returns 0.0", () => {
    if (!mod) return;
    // "the login page is broken" → tokens: the, login, page, is, broken
    // "we need to add new feature" → tokens: we, need, to, add, new, feature
    // 交集 = 0
    const score = mod.jaccardSimilarity(
      "the login page is broken",
      "we need to add new feature"
    );
    expect(score).toBe(0.0);
  });

  test("empty string protection", () => {
    if (!mod) return;
    // 两者均空 → 1.0
    expect(mod.jaccardSimilarity("", "")).toBe(1.0);
    // 一方为空 → 0.0
    expect(mod.jaccardSimilarity("hello", "")).toBe(0.0);
    expect(mod.jaccardSimilarity("", "world")).toBe(0.0);
  });
});

// ============================================================
// normalizeText —— 文本归一化
// ============================================================

describe("normalizeText", () => {
  test("converts to lowercase", () => {
    if (!mod) return;
    expect(mod.normalizeText("Hello World")).toBe("hello world");
    expect(mod.normalizeText("ALL CAPS")).toBe("all caps");
  });

  test("strips punctuation", () => {
    if (!mod) return;
    // 标点符号替换为空格后压缩
    expect(mod.normalizeText("Hello, World!")).toBe("hello world");
    expect(mod.normalizeText("test...case???")).toBe("test case");
  });

  test("trims leading/trailing and collapses internal whitespace", () => {
    if (!mod) return;
    expect(mod.normalizeText("   hello   world   ")).toBe("hello world");
    expect(mod.normalizeText("\t spaced \t out \n")).toBe("spaced out");
  });

  test("preserves Chinese characters while normalizing punctuation", () => {
    if (!mod) return;
    const result = mod.normalizeText("你好，世界！");
    // 中文逗号和感叹号被替换为空格，保留中文字符
    expect(result).toBe("你好 世界");
  });
});

// ============================================================
// tokenize —— 中英文混合分词
// ============================================================

describe("tokenize", () => {
  test("splits English text into words", () => {
    if (!mod) return;
    const tokens = mod.tokenize("the quick brown fox");
    expect(tokens).toEqual(["the", "quick", "brown", "fox"]);
  });

  test("handles Chinese text as large tokens", () => {
    if (!mod) return;
    // 中文无空格，整段作为单个 token
    const tokens = mod.tokenize("你好世界");
    expect(tokens).toEqual(["你好世界"]);
  });

  test("handles mixed Chinese and English", () => {
    if (!mod) return;
    const tokens = mod.tokenize("hello 你好 world");
    expect(tokens).toEqual(["hello", "你好", "world"]);
  });

  test("filters out short tokens (length < 2)", () => {
    if (!mod) return;
    // "a" 长度为 1 被过滤，"be" 长度为 2 保留，"cats" 保留
    const tokens = mod.tokenize("a be cats");
    expect(tokens).toEqual(["be", "cats"]);
    // "I" 被过滤，只保留长度 >= 2 的词
    expect(tokens).not.toContain("a");
  });
});

// ============================================================
// computeModuleOverlap —— 模块重叠度
// ============================================================

describe("computeModuleOverlap", () => {
  test("full overlap returns 1.0", () => {
    if (!mod) return;
    const score = mod.computeModuleOverlap(
      ["auth", "database"],
      ["auth", "database"]
    );
    expect(score).toBe(1.0);
  });

  test("partial overlap returns intermediate score", () => {
    if (!mod) return;
    // ["auth","db","cache"] ∩ ["auth","db","api"] = {"auth","db"}=2
    // max(|A|,|B|) = 3, overlap = 2/3
    const score = mod.computeModuleOverlap(
      ["auth", "database", "cache"],
      ["auth", "database", "api"]
    );
    expect(score).toBeCloseTo(2 / 3, 4);
  });

  test("no overlap returns 0.0", () => {
    if (!mod) return;
    const score = mod.computeModuleOverlap(["auth"], ["database"]);
    expect(score).toBe(0.0);
  });

  test("empty array protection", () => {
    if (!mod) return;
    // 两者均空 → 1.0
    expect(mod.computeModuleOverlap([], [])).toBe(1.0);
    // 一方为空 → 0.0
    expect(mod.computeModuleOverlap(["auth"], [])).toBe(0.0);
    expect(mod.computeModuleOverlap([], ["auth"])).toBe(0.0);
  });
});

// ============================================================
// computeSemanticSimilarity —— 双算法综合相似度
// ============================================================

describe("computeSemanticSimilarity", () => {
  test("identical texts yield high score and isRecurrence=true", () => {
    if (!mod) return;
    const result = mod.computeSemanticSimilarity(
      "The login page is broken",
      "The login page is broken"
    );
    expect(result.isRecurrence).toBe(true);
    expect(result.recurrenceScore).toBeGreaterThanOrEqual(0.6);
    expect(result.levenshteinScore).toBeCloseTo(1.0, 2);
    expect(result.jaccardScore).toBeCloseTo(1.0, 2);
    expect(result.moduleOverlapScore).toBe(0);
    expect(result.recurrenceCount).toBe(0);
  });

  test("completely different texts yield low score and isRecurrence=false", () => {
    if (!mod) return;
    const result = mod.computeSemanticSimilarity(
      "The login page is broken and users cannot sign in",
      "We need to implement a new reporting dashboard feature"
    );
    expect(result.isRecurrence).toBe(false);
    expect(result.recurrenceScore).toBeLessThan(0.6);
    // 模块重叠未经提供时应为 0
    expect(result.moduleOverlapScore).toBe(0);
  });

  test("computes module overlap when signature and extraModules are provided", () => {
    if (!mod) return;
    const signature = {
      description_normalized: "the login page is broken",
      root_cause_tag: "未分类",
      affected_modules: ["auth", "login", "session"],
      route_target: "part_1_1",
      first_seen_cycle: 1,
      first_seen_at: "2026-06-01T00:00:00Z",
    };
    const result = mod.computeSemanticSimilarity(
      "The login page is broken",
      "The login page is broken",
      signature,
      ["auth", "login", "ui"]
    );
    // 模块重叠: {"auth","login","session"} ∩ {"auth","login","ui"} = 2, max=3, overlap=2/3
    expect(result.moduleOverlapScore).toBeCloseTo(2 / 3, 2);
    expect(result.isRecurrence).toBe(true);
    expect(result.matchedSignature).toBe(signature);
  });
});

// ============================================================
// extractIssueText —— 从 Issue 提取比较文本
// ============================================================

describe("extractIssueText", () => {
  test("concatenates title and description with dot separator", () => {
    if (!mod) return;
    const issue = makeMockIssue({
      title: "登录失败",
      description: "用户在输入密码后出现 500 错误",
    });
    const text = mod.extractIssueText(issue);
    expect(text).toBe("登录失败. 用户在输入密码后出现 500 错误");
  });
});

// ============================================================
// buildP0Signature —— 构建 P0 签名
// ============================================================

describe("buildP0Signature", () => {
  test("creates correct signature with auto-detected root cause tag", () => {
    if (!mod) return;
    const issue = makeMockIssue({
      title: "排序算法错误",
      description: "列表排序结果不正确，存在算法错误导致顺序错乱",
      affected_modules: ["sort", "display"],
      found_in_cycle: 2,
      found_at: "2026-06-12T08:00:00Z",
    });
    const sig = mod.buildP0Signature(issue);
    expect(sig.root_cause_tag).toBe("算法错误"); // 自动从描述中提取
    expect(sig.affected_modules).toEqual(["display", "sort"]); // 排序后
    expect(sig.route_target).toBe("part_1_1"); // 默认值
    expect(sig.first_seen_cycle).toBe(2);
    expect(sig.first_seen_at).toBe("2026-06-12T08:00:00Z");
    // description_normalized 应为归一化后的 title + description
    expect(sig.description_normalized).toContain("排序算法错误");
    expect(sig.description_normalized).toContain("列表排序结果不正确");
  });

  test("uses explicit rootCauseTag when provided, overriding auto-detection", () => {
    if (!mod) return;
    // 描述中不含任何已知根因关键词，但显式指定标签
    const issue = makeMockIssue({
      title: "按钮颜色不对",
      description: "主题切换后按钮颜色未更新",
      affected_modules: ["theme"],
    });
    const sig = mod.buildP0Signature(issue, "需求理解错误");
    expect(sig.root_cause_tag).toBe("需求理解错误");
  });

  test("defaults root_cause_tag to '未分类' when no keyword matches", () => {
    if (!mod) return;
    const issue = makeMockIssue({
      title: "无意义标题",
      description: "一段没有根因关键词的普通描述",
    });
    const sig = mod.buildP0Signature(issue);
    expect(sig.root_cause_tag).toBe("未分类");
  });
});
