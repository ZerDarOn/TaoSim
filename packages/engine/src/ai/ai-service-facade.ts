// ============================================================
// AI Service Facade — 架构规范 §16
//
// 统一 AI 调用门面，封装：
//   - 超时控制 (3s)
//   - JSON Schema 校验
//   - 异常捕获与降级路由
//   - 审计日志
// ============================================================

export interface AIRequest {
  prompt: string;
  context: Record<string, unknown>;
  maxTokens?: number;
}

export interface AIResponse<T = unknown> {
  success: boolean;
  data?: T;
  fallbackUsed: boolean;
  errorMessage?: string;
}

const AI_TIMEOUT_MS = 3_000;

export class AIServiceFacade {
  /**
   * 发起 AI 请求，含超时与降级。
   * 当前为 stub 实现，后续接入真实 LLM API。
   */
  public static async request<T>(req: AIRequest): Promise<AIResponse<T>> {
    try {
      const result = await AIServiceFacade.withTimeout(
        AIServiceFacade.callLLM<T>(req),
        AI_TIMEOUT_MS,
      );
      return { success: true, data: result, fallbackUsed: false };
    } catch (err) {
      AIServiceFacade.logAudit(req, err);
      // 降级：返回空数据，由调用方使用 Fallback 模板
      return {
        success: false,
        fallbackUsed: true,
        errorMessage: err instanceof Error ? err.message : 'AI service unavailable',
      };
    }
  }

  /**
   * Stub：真实 LLM 调用占位。
   * 后续替换为 OpenAI / 本地模型 HTTP 调用。
   */
  private static async callLLM<T>(_req: AIRequest): Promise<T> {
    // TODO: 接入真实 LLM API
    throw new Error('AI service not yet configured');
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
    const msg = `[AI_AUDIT] ${new Date().toISOString()} | FAILED | prompt=${req.prompt.slice(0, 80)}... | error=${error}`;
    console.warn(msg);
    // TODO: 写入 ai_audit.log
  }
}
