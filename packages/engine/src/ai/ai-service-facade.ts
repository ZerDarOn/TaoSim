// ============================================================
// AI Service Facade — 统一 LLM 调用门面
//
//   - 超时控制 (默认 10s)
//   - 异常捕获与降级路由
//   - 审计日志
//   - 支持 OpenAI / 兼容 API（可扩展 Anthropic / Gemini）
//
// 接入后：删除 callLLM stub，替换为真实 HTTP 调用。
// ============================================================

export interface AIRequest {
  prompt: string;
  context: Record<string, unknown>;
  maxTokens?: number;
  /** 模型选择（默认 gpt-4o-mini，开销低、速度快） */
  model?: string;
}

export interface AIResponse<T = unknown> {
  success: boolean;
  data?: T;
  fallbackUsed: boolean;
  errorMessage?: string;
  /** 实际使用的模型 */
  modelUsed?: string;
}

const AI_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** 从环境变量读 API Key（优先级：VITE_OPENAI_API_KEY > OPENAI_API_KEY） */
function getApiKey(): string | undefined {
  // Vite 构建时通过 import.meta.env 暴露给前端
  if (typeof process !== 'undefined' && process.env) {
    return process.env['OPENAI_API_KEY'] ?? undefined;
  }
  return undefined;
}

function getBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env['OPENAI_BASE_URL'] ?? DEFAULT_BASE_URL;
  }
  return DEFAULT_BASE_URL;
}

export class AIServiceFacade {
  /** 检查 AI 服务是否可用（API Key 已配置且网络可达） */
  static isAvailable(): boolean {
    const key = getApiKey();
    return key !== undefined && key.length > 10 && !key.startsWith('sk-your-');
  }

  /**
   * 发起 AI 请求，含超时与降级。
   * - 成功 → { success: true, data: result }
   * - 失败/超时/无密钥 → { success: false, fallbackUsed: true }
   */
  static async request<T>(req: AIRequest): Promise<AIResponse<T>> {
    const model = req.model ?? DEFAULT_MODEL;

    if (!AIServiceFacade.isAvailable()) {
      return {
        success: false,
        fallbackUsed: true,
        errorMessage: 'OPENAI_API_KEY 未配置或无效',
        modelUsed: model,
      };
    }

    try {
      const result = await AIServiceFacade.withTimeout(
        AIServiceFacade.callOpenAI<T>(req),
        AI_TIMEOUT_MS,
      );
      return { success: true, data: result, fallbackUsed: false, modelUsed: model };
    } catch (err) {
      AIServiceFacade.logAudit(req, err);
      return {
        success: false,
        fallbackUsed: true,
        errorMessage: err instanceof Error ? err.message : 'AI service unavailable',
        modelUsed: model,
      };
    }
  }

  /**
   * 真实 OpenAI / 兼容 API 调用。
   * 支持 chat/completions 端点，返回纯文本或 JSON。
   */
  private static async callOpenAI<T>(req: AIRequest): Promise<T> {
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    const model = req.model ?? DEFAULT_MODEL;
    const maxTokens = req.maxTokens ?? 256;

    const body = {
      model,
      messages: [
        ...(req.context.systemPrompt ? [{ role: 'system', content: req.context.systemPrompt as string }] : []),
        { role: 'user', content: req.prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI 返回空响应');
    }

    // 尝试解析 JSON（若调用方期望结构化输出）
    try {
      return JSON.parse(content) as T;
    } catch {
      // 纯文本返回
      return content as unknown as T;
    }
  }

  /** 带超时的 Promise */
  private static withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timeout')), ms),
      ),
    ]);
  }

  /** 审计日志记录 */
  private static logAudit(req: AIRequest, error: unknown): void {
    const msg = `[AI_AUDIT] ${new Date().toISOString()} | FAILED | model=${req.model ?? DEFAULT_MODEL} | prompt=${req.prompt.slice(0, 80)}... | error=${error}`;
    console.warn(msg);
  }
}
