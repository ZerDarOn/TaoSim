import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock context-serializer 模块（避免导入复杂的数据依赖链）
vi.mock('../../world/context-serializer.js', () => ({
  serializeNpcBiography: (npc: any, timeline: any[], _worldNpcs?: any) => {
    return `NPC: ${npc.name}, Events: ${timeline.length}`;
  },
  serializeEventChain: (events: any[]) => {
    return events.map((e: any) => e.title).join(' → ');
  },
  buildAiNarrativePrompt: (kind: string, facts: string) => {
    return {
      system: `你是一个修仙叙事助手 - ${kind}`,
      user: `请为以下事件生成叙事：\n${facts}`,
    };
  },
}));

// Mock AI Service Facade
vi.mock('../ai-service-facade.js', () => ({
  AIServiceFacade: {
    isAvailable: () => true,
    request: vi.fn(),
  },
}));

import { NarrativeEnhancer } from '../narrative-enhancer.js';
import { AIServiceFacade } from '../ai-service-facade.js';
import type { BigEventLog, NpcRecord, WorldState } from '@taosim/contracts';

function makeEvent(overrides: Partial<BigEventLog> = {}): BigEventLog {
  return {
    id: 'evt_001',
    title: '筑基突破',
    description: '丹田激荡，天地灵气涌入体内，成功突破筑基境。',
    category: 'cultivation',
    severity: 'major',
    year: 5,
    month: 3,
    involvedCharacterIds: ['npc_001'],
    locationId: 'loc_cave',
    templateKey: 'npc.breakthrough',
    ...overrides,
  } as BigEventLog;
}

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'npc_001',
    name: '李清云',
    gender: 'Male',
    realm: 'Foundation_1',
    birthYear: 50,
    origin: '沧洲',
    aspiration: '长生',
    destiny: { tier: 'rare' },
    lifespan: { age: 25, maxLifespan: 200 },
    ...overrides,
  } as unknown as NpcRecord;
}

function makeWorldState(): WorldState {
  return {
    currentYear: 5,
    currentMonth: 3,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
    elapsedMinutes: 0,
  };
}

describe('NarrativeEnhancer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 AI 可用
    (AIServiceFacade.request as any).mockResolvedValue({
      success: true,
      data: 'AI 生成的叙事文本',
      fallbackUsed: false,
      modelUsed: 'gpt-4o-mini',
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('enhanceEvent', () => {
    it('minor 事件直接使用降级模板（不调用 AI）', async () => {
      const event = makeEvent({ severity: 'minor', templateKey: 'npc.mind.minor' });
      const result = await NarrativeEnhancer.enhanceEvent({
        event,
        primaryNpc: makeNpc(),
      });

      expect(result.fallback).toBe(true);
      expect(result.narrative).toContain('李清云');
      expect(result.narrative).toContain('Foundation_1');
      // 确认没有调用 AI
      expect(AIServiceFacade.request).not.toHaveBeenCalled();
    });

    it('AI 可用时返回 AI 生成的叙事（非 minor 事件）', async () => {
      const event = makeEvent({ severity: 'major' });
      const result = await NarrativeEnhancer.enhanceEvent({
        event,
        primaryNpc: makeNpc(),
      });

      expect(result.fallback).toBe(false);
      expect(result.narrative).toBe('AI 生成的叙事文本');
      expect(result.modelUsed).toBe('gpt-4o-mini');
      expect(AIServiceFacade.request).toHaveBeenCalled();
    });

    it('AI 返回失败时降级到模板', async () => {
      (AIServiceFacade.request as any).mockResolvedValueOnce({
        success: false,
        fallbackUsed: true,
      });

      const event = makeEvent({ severity: 'major', category: 'cultivation' });
      const result = await NarrativeEnhancer.enhanceEvent({
        event,
        primaryNpc: makeNpc(),
      });

      expect(result.fallback).toBe(true);
      expect(result.narrative).toContain('【重磅】');
      expect(result.narrative).toContain('李清云');
    });

    it('AI 调用抛出异常时降级', async () => {
      (AIServiceFacade.request as any).mockRejectedValueOnce(new Error('timeout'));

      const event = makeEvent({ severity: 'major' });
      const result = await NarrativeEnhancer.enhanceEvent({
        event,
        primaryNpc: makeNpc(),
      });

      expect(result.fallback).toBe(true);
    });

    it('cultivation major 事件降级模板包含【重磅】标记', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const event = makeEvent({ severity: 'major', category: 'cultivation' });
      const result = await NarrativeEnhancer.enhanceEvent({ event });

      expect(result.fallback).toBe(true);
      expect(result.narrative).toContain('【重磅】');
    });

    it('social 事件降级模板正确格式', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const event = makeEvent({ severity: 'major', category: 'social', title: '恩怨纠葛' });
      const result = await NarrativeEnhancer.enhanceEvent({
        event,
        primaryNpc: makeNpc({ name: '张铁柱' }),
      });

      expect(result.fallback).toBe(true);
      expect(result.narrative).toContain('恩怨纠葛');
      expect(result.narrative).toContain('张铁柱');
    });

    it('combat 事件降级模板包含 ⚔', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const event = makeEvent({ severity: 'major', category: 'combat', title: '仙魔大战' });
      const result = await NarrativeEnhancer.enhanceEvent({ event });

      expect(result.narrative).toContain('⚔');
      expect(result.narrative).toContain('仙魔大战');
    });

    it('world 事件降级模板包含 🌍', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const event = makeEvent({ severity: 'major', category: 'world', title: '天地异变' });
      const result = await NarrativeEnhancer.enhanceEvent({ event });

      expect(result.narrative).toContain('🌍');
      expect(result.narrative).toContain('天地异变');
    });

    it('未知分类降级返回 description 或 title', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const event = makeEvent({ severity: 'major', category: 'other' as any, description: '未知事件描述' });
      const result = await NarrativeEnhancer.enhanceEvent({ event });

      expect(result.narrative).toBe('未知事件描述');
    });

    it('无 description 和 title 时降级返回空字符串', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const event = makeEvent({
        severity: 'major',
        category: 'other' as any,
        description: undefined as any,
        title: undefined as any,
      });
      const result = await NarrativeEnhancer.enhanceEvent({ event });

      expect(result.narrative).toBe('');
    });
  });

  describe('enhanceBiography', () => {
    it('AI 可用时返回 AI 生成的传记', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({
        success: true,
        data: 'AI 生成的传记文本',
        fallbackUsed: false,
      });

      const npc = makeNpc();
      const result = await NarrativeEnhancer.enhanceBiography(npc, [
        makeEvent({ title: '拜师学艺' }),
      ]);

      expect(result.fallback).toBe(false);
      expect(result.narrative).toBe('AI 生成的传记文本');
    });

    it('AI 不可用时降级为模板传记', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const npc = makeNpc({ gender: 'Female' as any, realm: 'GoldenCore_1' });
      const result = await NarrativeEnhancer.enhanceBiography(npc, []);

      expect(result.fallback).toBe(true);
      expect(result.narrative).toContain('李清云');
      expect(result.narrative).toContain('女');
      expect(result.narrative).toContain('GoldenCore_1');
      expect(result.narrative).toContain('rare');
    });

    it('common tier 不在传记中显示 tier', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({ success: false });

      const npc = makeNpc({ destiny: { tier: 'common' } } as any);
      const result = await NarrativeEnhancer.enhanceBiography(npc, []);

      expect(result.narrative).not.toContain('common');
    });

    it('异常时降级', async () => {
      (AIServiceFacade.request as any).mockRejectedValueOnce(new Error('fail'));

      const npc = makeNpc();
      const result = await NarrativeEnhancer.enhanceBiography(npc, []);

      expect(result.fallback).toBe(true);
      expect(result.narrative).toContain('李清云');
    });
  });

  describe('enhanceBatch', () => {
    it('批量增强返回所有结果', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({
        success: true,
        data: '批量事件叙事',
        fallbackUsed: false,
      });

      const results = await NarrativeEnhancer.enhanceBatch(
        [
          { event: makeEvent({ id: 'e1', severity: 'major' }) },
          { event: makeEvent({ id: 'e2', severity: 'major' }) },
        ],
        2,
      );

      expect(results.size).toBe(2);
      expect(results.get('e1')!.narrative).toBe('批量事件叙事');
      expect(results.get('e2')!.narrative).toBe('批量事件叙事');
    });

    it('批量中 minor 事件不调用 AI', async () => {
      (AIServiceFacade.request as any).mockResolvedValue({
        success: true,
        data: 'AI 叙事',
        fallbackUsed: false,
      });

      const results = await NarrativeEnhancer.enhanceBatch(
        [
          { event: makeEvent({ id: 'e1', severity: 'minor' }) },
          { event: makeEvent({ id: 'e2', severity: 'major' }) },
        ],
        2,
      );

      expect(results.size).toBe(2);
      // e1 是 minor 应该降级
      expect(results.get('e1')!.fallback).toBe(true);
      // e2 是 major 调用 AI
      expect(results.get('e2')!.fallback).toBe(false);
    });
  });
});
