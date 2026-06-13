/**
 * guard-permission-block.ts —— 权限变更拦截插件
 *
 * 拦截 agent 对 opencode.json 权限配置的修改尝试。
 * 匹配工具：Write、Edit
 * 优先级：800（高于普通 write/edit 拦截器）
 *
 * 检测以下情况并予以阻断：
 * - 修改 opencode.json 中的 allowed_tools 白名单
 * - 修改 opencode.json 中的 command_permissions 条目
 * - 向 opencode.json 添加新的工具注册项
 * - 删除 opencode.json 中的安全配置项
 * - 通过 Write 工具覆盖整个 opencode.json
 *
 * 设计依据：DESIGN.md L121, L160, L454
 *
 * @module guard-permission-block
 * @license Apache-2.0
 * @copyright 2026 Perry Link
 */

import type { ToolExecuteBeforeContext, ToolExecuteBeforeResult, PluginDecision } from "../src/types";

// ═══════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════

/** 需要拦截的文件路径前缀——匹配则触发内容深检 */
const BLOCKED_PREFIXES: string[] = [
  "opencode.json",
  "opencode.json.",
  ".opencode",
  "config/opencode",
];

/** 严禁 agent 修改的敏感配置键——任一命中即告警 */
const SENSITIVE_KEYS = [
  "allowed_tools",
  "command_permissions",
  "disabled_tools",
  "tool_whitelist",
  "tool_blacklist",
  "approval_policy",
  "max_turns",
  "safety_mode",
  "sandbox",
];

// ═══════════════════════════════════════════
// 主导出函数
// ═══════════════════════════════════════════

/**
 * 权限阻止钩子 —— 在 agent 尝试写/编辑 opencode.json 时触发（异步版）
 *
 * 处理流程：
 * 1. 过滤工具：仅处理 Write 和 Edit 工具
 * 2. 提取文件路径：从 toolInput 中获取目标文件路径
 * 3. 判断是否为目标文件：调用 isOpenCodeConfig 匹配 BLOCKED_PREFIXES
 * 4. 深度内容分析：调用 analyzeContent 检测敏感键、新工具注册等
 * 5. 构建响应：命中规则则返回阻止（含 gateUpdate 记录），否则放行
 *
 * 与 evaluate() 的区别：本函数为异步版本，支持 gateUpdate 回调写入，
 * 适用于 OpenCode 钩子系统直接调用。evaluate() 为同步适配器，
 * 用于 guard 插件体系保持一致签名。
 *
 * @param ctx - Copilot SDK 提供的工具执行前上下文（含 toolName、toolInput、sessionId）
 * @returns 拦截结果——allow:false 时阻止工具执行，并附带 gateUpdate 日志记录
 * @throws 不抛出——所有路径均在内部返回正常结果
 */
export async function onPreToolUse(
  ctx: ToolExecuteBeforeContext
): Promise<ToolExecuteBeforeResult> {
  const { toolName, toolInput, sessionId } = ctx;

  // 仅处理 Write 和 Edit 工具
  if (toolName !== "Write" && toolName !== "Edit") {
    return { allow: true };
  }

  const filePath = extractFilePath(toolName, toolInput);
  if (!filePath) {
    return { allow: true };
  }

  // 检查是否针对 opencode.json
  if (!isOpenCodeConfig(filePath)) {
    return { allow: true };
  }

  // 针对 opencode.json 的写操作 —— 进行深度内容检查
  const reason = analyzeContent(toolName, toolInput, filePath);

  if (reason) {
    return {
      allow: false,
      message: buildBlockMessage(filePath, reason),
      gateUpdate: {
        permission_block: {
          last_blocked_at: new Date().toISOString(),
          blocked_file: filePath,
          blocked_reason: reason.type,
          session_id: sessionId,
        },
      },
    };
  }

  // 即使内容检查通过，仍然记录日志
  return {
    allow: true,
    message: `opencode.json 修改已放行（内容未命中敏感规则）`,
    gateUpdate: {
      permission_block: {
        last_allowed_at: new Date().toISOString(),
        allowed_file: filePath,
        session_id: sessionId,
      },
    },
  };
}

// ═══════════════════════════════════════════
// 内部辅助函数
// ═══════════════════════════════════════════

/**
 * 阻止原因信息——描述为何拦截某次写/编辑操作
 */
interface BlockReason {
  /** 阻止类型 */
  type: "sensitive_key_modification" | "full_overwrite" | "new_tool_registration" | "delete_config";
  /** 详细描述信息 */
  detail: string;
}

/**
 * 从工具输入中提取目标文件路径
 *
 * Write 工具从 input.file_path 提取，Edit 工具从 input.file_path 提取。
 * 若 toolName 非 Write/Edit 或 file_path 字段缺失，返回 null。
 *
 * @param toolName - 工具名称（如 "Write"、"Edit"）
 * @param input - 工具输入参数字典
 * @returns 提取的文件路径字符串，无法提取时返回 null
 */
function extractFilePath(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  if (toolName === "Write") {
    return typeof input.file_path === "string" ? input.file_path : null;
  }
  if (toolName === "Edit") {
    return typeof input.file_path === "string" ? input.file_path : null;
  }
  return null;
}

/**
 * 判断文件路径是否匹配 opencode 配置文件的已知路径模式
 *
 * 对路径做跨平台归一化（\\ → / + 小写），然后与 BLOCKED_PREFIXES
 * 逐一比对。支持精确匹配、后缀匹配、中间路径段匹配三种模式。
 *
 * @param filePath - 待判断的文件路径
 * @returns true 表示命中拦截列表，需要深度内容检查
 */
function isOpenCodeConfig(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return BLOCKED_PREFIXES.some(
    (prefix) =>
      normalized === prefix ||
      normalized.endsWith("/" + prefix) ||
      normalized.includes("/" + prefix + "/")
  );
}

/**
 * 深入分析写/编辑操作的内容，检测敏感修改
 *
 * 检测逻辑：
 * - Write 工具：直接覆盖整个文件，始终视为高风险（检查内容是否包含权限配置关键词）
 * - Edit 工具：检查 old_string 和 new_string 中是否包含 SENSITIVE_KEYS 中的敏感键
 *   - 若命中 → sensitive_key_modification
 *   - 若包含 "tools" / "tool_" 模式 → new_tool_registration
 *
 * @param toolName - 工具名称（Write 或 Edit）
 * @param input - 工具输入参数（含 content / old_string / new_string）
 * @param _filePath - 目标文件路径（保留参数，供未来扩展使用）
 * @returns 若检测到违规则返回 BlockReason，否则返回 null（放行）
 */
function analyzeContent(
  toolName: string,
  input: Record<string, unknown>,
  _filePath: string
): BlockReason | null {
  // Write 工具 —— 整个文件覆盖，始终拦截
  if (toolName === "Write") {
    const content = typeof input.content === "string" ? input.content : "";
    if (content.includes("allowed_tools") || content.includes("command_permissions")) {
      return {
        type: "full_overwrite",
        detail: "Write 工具尝试覆盖整个 opencode.json（包含权限配置）",
      };
    }
    return {
      type: "full_overwrite",
      detail: "Write 工具尝试覆盖整个 opencode.json",
    };
  }

  // Edit 工具 —— 检查 old_string/new_string 中是否涉及敏感键
  const oldStr = typeof input.old_string === "string" ? input.old_string : "";
  const newStr = typeof input.new_string === "string" ? input.new_string : "";

  for (const key of SENSITIVE_KEYS) {
    if (oldStr.includes(key) || newStr.includes(key)) {
      return {
        type: "sensitive_key_modification",
        detail: `Edit 操作涉及敏感权限键 "${key}"`,
      };
    }
  }

  // 检查是否尝试添加新工具注册
  if (
    newStr.includes('"tools"') ||
    newStr.includes('"tool_') ||
    (oldStr.includes("enabled") && newStr.includes("true"))
  ) {
    return {
      type: "new_tool_registration",
      detail: "检测到疑似新工具注册尝试",
    };
  }

  return null;
}

/**
 * 构建面向 agent 的可读阻止消息
 *
 * 根据阻止类型拼接对应的修复建议，帮助 agent 理解如何合规修改权限配置。
 * 消息格式：头部（文件路径 + 阻止原因） + 建议段 + 检测类型标签
 *
 * @param filePath - 被拦截的文件路径
 * @param reason - 检测到的阻止原因（含类型和详情）
 * @returns 多行格式化阻止消息字符串
 */
function buildBlockMessage(
  filePath: string,
  reason: BlockReason
): string {
  const header =
    "=== 权限阻止 (Permission Block) ===\n" +
    `文件: ${filePath}\n` +
    `阻止原因: ${reason.detail}`;

  /** 各阻止类型对应的修复建议映射表 */
  const suggestions: Record<string, string> = {
    sensitive_key_modification:
      "如需修改权限配置，请使用 opencode.json 的直接编辑并通过人工审核。",
    full_overwrite:
      "不允许通过 Write 工具覆盖整个 opencode.json。请使用 Edit 工具进行局部修改。",
    new_tool_registration:
      "添加新工具注册需要管理员审核。请在 opencode.json 中显式添加工具定义。",
    delete_config:
      "不允许删除 opencode.json 中的安全配置项。",
  };

  const suggestion = suggestions[reason.type] ?? "请通过人工审核流程修改权限配置。";

  return `${header}\n\n${suggestion}\n\n检测类型: ${reason.type}`;
}

/**
 * 构建面向 agent 的简短阻止消息（evaluate 适配器版本）
 *
 * 与 buildBlockMessage 逻辑相同，但使用更紧凑的格式（不含 "===" 装饰符）。
 * 用于 evaluate() 同步适配器的返回值中。
 *
 * @param filePath - 被拦截的文件路径
 * @param reason - 检测到的阻止原因
 * @returns 格式化阻止消息字符串
 */
function formatBlockMessage(
  filePath: string,
  reason: BlockReason
): string {
  return `${reason.detail}\n文件: ${filePath}\n类型: ${reason.type}`;
}

/**
 * evaluate() —— 标准 guard 签名适配器（同步版）
 *
 * 将 onPreToolUse 的异步逻辑适配为 guard 系统统一的
 * evaluate(ctx, projectRoot): PluginDecision 同步接口。
 * 用于与其他 7 个 guard 插件保持调用签名一致。
 *
 * 与 onPreToolUse 的区别：
 * - 同步执行（不返回 Promise）
 * - 不写入 gateUpdate 回调
 * - 使用 formatBlockMessage 替代 buildBlockMessage（更紧凑的消息格式）
 *
 * @param ctx - 工具执行前上下文
 * @param _projectRoot - 项目根目录（保留参数，本 guard 未使用）
 * @returns PluginDecision 决策结果——allow:false 表示拦截
 */
export function evaluate(
  ctx: ToolExecuteBeforeContext,
  _projectRoot: string,
): PluginDecision {
  const { toolName, toolInput } = ctx;

  // 仅处理 Write 和 Edit 工具
  if (toolName !== "Write" && toolName !== "Edit") {
    return { allow: true };
  }

  const filePath = extractFilePath(toolName, toolInput);
  if (!filePath) {
    return { allow: true };
  }

  // 检查是否针对 opencode.json
  if (!isOpenCodeConfig(filePath)) {
    return { allow: true };
  }

  // 同步内容分析
  const reason = analyzeContent(toolName, toolInput, filePath);

  if (reason) {
    return {
      allow: false,
      reason: reason.detail,
      message: formatBlockMessage(filePath, reason),
      requireConfirmation: true,
    };
  }

  return { allow: true };
}
