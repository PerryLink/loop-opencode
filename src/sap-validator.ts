/**
 * sap-validator.ts —— SAP Block 提取与交叉验证模块（M2）
 *
 * 核心职责：
 * 1. 从 agent 输出文本中提取 <<<LOOP_STATE>>> 块
 * 2. 将提取的 SAP block 与 state.json 实际数据交叉验证
 * 3. 计算偏差并判定是否允许终止（偏差 < 2 方可终止）
 *
 * agent 在每个 phase 完成时需输出 SAP block，
 * 声明当前 phase/cycle/convergence_counter/issue 数量等信息，
 * 供 validator 校验其声明的真实性。
 *
 * @module sap-validator
 */

import { readState } from "./state";
import type { SapBlock, SapValidationResult, SapDeviation, LoopState } from "./types";

/** SAP block 起始标记 */
const SAP_BEGIN = "<<<LOOP_STATE>>>";
/** SAP block 结束标记 */
const SAP_END = "<<<END_LOOP_STATE>>>";

/**
 * 从 agent 输出中提取 SAP block
 *
 * 搜索 <<<LOOP_STATE>>>...<<<END_LOOP_STATE>>> 标记块，
 * 提取中间 JSON 并解析为 SapBlock 对象。
 *
 * @param agentOutput - agent 完整输出文本
 * @returns SapBlock 或 null（未找到或解析失败）
 */
export function extractSapBlock(agentOutput: string): SapBlock | null {
  const beginIdx = agentOutput.indexOf(SAP_BEGIN);
  if (beginIdx === -1) {
    console.warn("[sap] 未找到 <<<LOOP_STATE>>> 起始标记");
    return null;
  }

  const endIdx = agentOutput.indexOf(SAP_END, beginIdx + SAP_BEGIN.length);
  if (endIdx === -1) {
    console.warn("[sap] 未找到 <<<END_LOOP_STATE>>> 结束标记");
    return null;
  }

  // 提取中间 JSON 部分
  const jsonStr = agentOutput
    .substring(beginIdx + SAP_BEGIN.length, endIdx)
    .trim();

  try {
    const block = JSON.parse(jsonStr) as SapBlock;
    if (!validateSapBlockSchema(block)) {
      console.warn("[sap] SAP block JSON 通过解析但 Schema 校验失败");
      return null;
    }
    return block;
  } catch (err) {
    console.warn(`[sap] SAP block JSON 解析失败: ${err}`);
    return null;
  }
}

/**
 * 交叉验证 SAP block 与 state.json
 *
 * 逐字段比对 SAP 声明值与 state.json 实际值，
 * 计算偏差数量与 allows_termination 判定。
 *
 * 偏差 < 2 → allows_termination = true（agent 声明可信）
 * 偏差 >= 2 → allows_termination = false（拒终止）
 *
 * @param projectRoot - 项目根目录
 * @param sapBlock - 提取的 SAP block
 * @returns 验证结果
 */
export function crossValidateSap(
  projectRoot: string,
  sapBlock: SapBlock
): SapValidationResult {
  const state = readState(projectRoot);
  const deviations: SapDeviation[] = [];

  // 逐字段比对
  compareField("phase", sapBlock.phase, state.progress.phase, deviations);
  compareField("cycle", sapBlock.cycle, state.progress.cycle, deviations);
  compareField(
    "convergence_counter",
    sapBlock.convergence_counter,
    state.progress.convergence_counter,
    deviations
  );
  compareField(
    "active_p0_count",
    sapBlock.active_p0_count,
    state.issues.active.p0.length,
    deviations
  );
  compareField(
    "active_p1_count",
    sapBlock.active_p1_count,
    state.issues.active.p1.length,
    deviations
  );
  compareField(
    "active_p2_count",
    sapBlock.active_p2_count,
    state.issues.active.p2.length,
    deviations
  );

  // phase_contract_claimed 比对（若 SAP 声明了合约完成）
  if (sapBlock.phase_contract_claimed) {
    const contract = state.phase_contracts[sapBlock.phase_contract_claimed];
    const actualCompleted = contract?.completed ?? false;
    compareField(
      "phase_contract_claimed",
      true,
      actualCompleted,
      deviations
    );
  }

  const deviation = deviations.length;
  const allowsTermination = deviation < 2;

  if (!allowsTermination) {
    console.warn(
      `[sap] 交叉验证失败: 偏差=${deviation}, 拒绝终止`
    );
  } else {
    console.log(`[sap] 交叉验证通过: 偏差=${deviation}`);
  }

  return {
    valid: deviation === 0,
    deviation,
    details: deviations,
    allows_termination: allowsTermination,
  };
}

/**
 * 完整验证流程——提取 + 交叉验证
 *
 * 一步完成 SAP block 提取与交叉验证的全流程。
 *
 * @param projectRoot - 项目根目录
 * @param agentOutput - agent 完整输出文本
 * @returns 验证结果；若无 SAP block 则返回偏差极大值
 */
export function validateAgentOutput(
  projectRoot: string,
  agentOutput: string
): SapValidationResult {
  const sapBlock = extractSapBlock(agentOutput);
  if (!sapBlock) {
    // SAP block 缺失——视为最大偏差，不允许终止
    console.warn(
      "[sap] agent 输出中缺少 <<<LOOP_STATE>>> block，拒绝承认 phase 完成"
    );
    return {
      valid: false,
      deviation: 999,
      details: [
        {
          field: "sap_block",
          claimed: "expected",
          actual: "missing",
        },
      ],
      allows_termination: false,
    };
  }

  return crossValidateSap(projectRoot, sapBlock);
}

/**
 * 比对单个字段并记录偏差
 *
 * @param field - 字段名
 * @param claimed - SAP 声明值
 * @param actual - state.json 实际值
 * @param deviations - 偏差数组（原地追加）
 */
function compareField(
  field: string,
  claimed: unknown,
  actual: unknown,
  deviations: SapDeviation[]
): void {
  if (JSON.stringify(claimed) !== JSON.stringify(actual)) {
    deviations.push({ field, claimed, actual });
    console.log(
      `[sap] 偏差: ${field} claimed=${JSON.stringify(claimed)} actual=${JSON.stringify(actual)}`
    );
  }
}

/**
 * 校验 SAP block 的 JSON Schema 合法性
 *
 * 检查必需字段的存在性与基本类型。
 *
 * @param block - 待校验的 SapBlock
 * @returns 是否通过校验
 */
function validateSapBlockSchema(block: unknown): block is SapBlock {
  if (typeof block !== "object" || block === null) return false;
  const b = block as Record<string, unknown>;

  // 必需字段校验
  if (typeof b["phase"] !== "string") return false;
  if (typeof b["cycle"] !== "number") return false;
  if (typeof b["convergence_counter"] !== "number") return false;
  if (typeof b["active_p0_count"] !== "number") return false;
  if (typeof b["active_p1_count"] !== "number") return false;
  if (typeof b["active_p2_count"] !== "number") return false;

  return true;
}

/**
 * 生成 SAP block 的 JSON 字符串（供 agent 输出模板用）
 *
 * 根据当前 state.json 构造标准的 SAP block，agent 可在输出末尾嵌入此块。
 *
 * @param projectRoot - 项目根目录
 * @returns 格式化的 SAP block 字符串
 */
export function generateSapBlock(projectRoot: string): string {
  const state = readState(projectRoot);
  const block: SapBlock = {
    phase: state.progress.phase,
    cycle: state.progress.cycle,
    convergence_counter: state.progress.convergence_counter,
    active_p0_count: state.issues.active.p0.length,
    active_p1_count: state.issues.active.p1.length,
    active_p2_count: state.issues.active.p2.length,
    tasks_completed: 0, // 由 agent 填充
    issues_found: 0, // 由 agent 填充
    phase_contract_claimed: null,
    emitted_at: new Date().toISOString(),
  };

  return `${SAP_BEGIN}\n${JSON.stringify(block, null, 2)}\n${SAP_END}`;
}

/**
 * 批量验证多个 SAP block（用于审计多轮输出）
 *
 * @param projectRoot - 项目根目录
 * @param outputs - agent 多轮输出数组
 * @returns 每条输出的验证结果
 */
export function batchValidate(
  projectRoot: string,
  outputs: string[]
): SapValidationResult[] {
  return outputs.map((output) => validateAgentOutput(projectRoot, output));
}

/**
 * 获取偏差摘要（人类可读）
 *
 * @param result - 验证结果
 * @returns 摘要字符串
 */
export function getDeviationSummary(result: SapValidationResult): string {
  if (result.deviation === 0) return "无偏差，所有字段一致";
  if (result.deviation >= 999) return "SAP block 缺失";
  const fields = result.details.map((d) => d.field).join(", ");
  return `偏差 ${result.deviation} 处: ${fields} | 允许终止: ${result.allows_termination ? "是" : "否"}`;
}
