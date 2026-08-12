import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// 保存/恢复 process.env
function setEnv(key: string, value: string | undefined) {
  if (typeof process !== 'undefined') {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// 动态导入（避免缓存）
async function getFacade() {
  const mod = await import('../ai-service-facade.js');
  return mod.AIServiceFacade;
}

describe('AIServiceFacade', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setEnv('OPENAI_API_KEY', undefined);
  });

  afterEach(() => {
    setEnv('OPENAI_API_KEY', undefined);
  });

  describe('isAvailable', () => {
    it('无 API Key 时返回 false', async () => {
      const facade = await getFacade();
      expect(facade.isAvailable()).toBe(false);
    });

    it('API Key 过短（≤10 字符）时返回 false', async () => {
      setEnv('OPENAI_API_KEY', 'sk-short');
      const facade = await getFacade();
      // 重新获取 isAvailable 会调用 getApiKey
      expect(facade.isAvailable()).toBe(false);
    });

    it('API Key 以 sk-your- 开头时返回 false（占位 key）', async () => {
      setEnv('OPENAI_API_KEY', 'sk-your-custom-api-key-here-12345');
      const facade = await getFacade();
      expect(facade.isAvailable()).toBe(false);
    });

    it('有效 API Key 时返回 true', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-abcdefghijklmnopqrstuvwxyz123456');
      const facade = await getFacade();
      expect(facade.isAvailable()).toBe(true);
    });
  });

  describe('request', () => {
    it('无 API Key 时降级返回 fallbackUsed=true', async () => {
      const facade = await getFacade();
      const result = await facade.request({ prompt: '你好', context: {} });
      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.errorMessage).toContain('未配置');
    });

    it('API 返回有效 JSON 时成功解析', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"name":"李小仙","realm":"筑基"}' } }],
        }),
      } as any);

      const facade = await getFacade();
      const result = await facade.request<{ name: string; realm: string }>({
        prompt: '生成一个修仙角色',
        context: {},
      });

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(result.data).toEqual({ name: '李小仙', realm: '筑基' });
    });

    it('API 返回纯文本时作为字符串返回', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '天劫降临，风云变色。' } }],
        }),
      } as any);

      const facade = await getFacade();
      const result = await facade.request<string>({
        prompt: '描述天劫场景',
        context: {},
      });

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(result.data).toBe('天劫降临，风云变色。');
    });

    it('API 返回空响应时降级', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }],
        }),
      } as any);

      const facade = await getFacade();
      const result = await facade.request({
        prompt: '空响应测试',
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
    });

    it('API HTTP 错误时降级', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as any);

      const facade = await getFacade();
      const result = await facade.request({
        prompt: '错误测试',
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
    });

    it('fetch 抛出异常时降级', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const facade = await getFacade();
      const result = await facade.request({
        prompt: '网络错误测试',
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.errorMessage).toBe('Network error');
    });

    it('请求中包含系统提示词', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '好的。' } }],
        }),
      } as any);

      const facade = await getFacade();
      await facade.request({
        prompt: '你是修仙助手',
        context: { systemPrompt: '你是一个修仙世界叙事助手' },
      });

      // 验证 fetch 调用参数中包含 system 消息
      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.messages[0]!.role).toBe('system');
      expect(body.messages[0]!.content).toBe('你是一个修仙世界叙事助手');
      expect(body.messages[1]!.role).toBe('user');
    });

    it('使用自定义模型', async () => {
      setEnv('OPENAI_API_KEY', 'sk-proj-valid-key-here-1234567890abc');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '响应' } }],
        }),
      } as any);

      const facade = await getFacade();
      const result = await facade.request({
        prompt: '模型测试',
        context: {},
        model: 'gpt-4o',
        maxTokens: 512,
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.max_tokens).toBe(512);
      expect(result.success).toBe(true);
    });
  });
});
