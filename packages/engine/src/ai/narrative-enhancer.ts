// ============================================================
// Narrative Enhancer — AI 叙事增强管道
//
// 流程：
//   event + world context → serialize → AI request → narrative 文本
//
// 降级：AI 不可用时从事件字段结构化拼接模板文本。
// 绝不虚构实体 id、数值或事件事实（架构规范 §16）。
// ============================================================

import type { BigEventLog, WorldState, NpcRecord } from '@taosim/contracts';
import { AIServiceFacade } from './ai-service-facade.js';
import { serializeNpcBiography, serializeEventChain, buildAiNarrativePrompt } from '../world/context-serializer.js';

export interface NarrativeRequest {
  /** 目标事件 */
  event: BigEventLog;
  /** 事件涉及的主要 NPC（用于生平素材） */
  primaryNpc?: NpcRecord;
  /** 世界状态快照（用于上下文） */
  worldState?: WorldState;
  /** 相关事件链（用于因果链素材） */
  relatedEvents?: BigEventLog[];
}

export interface NarrativeResult {
  /** AI 生成的叙事文本，或降级模板文本 */
  narrative: string;
  /** 是否使用了降级模板 */
  fallback: boolean;
  /** 使用的模型（降级时为空） */
  modelUsed?: string;
}

/** 降级模板：从事件字段结构化拼接文本 */
function fallbackTemplate(req: NarrativeRequest): string {
  const e = req.event;
  const npc = req.primaryNpc;
  const name = npc?.name ?? '某修士';
  const realm = npc?.realm ?? '';

  switch (e.category) {
    case 'cultivation':
      if (e.templateKey === 'npc.mind.action' || e.templateKey === 'npc.mind.minor') {
        return `${name}（${realm}）${e.description}`;
      }
      if (e.severity === 'major') {
        return `【重磅】${name}（${realm}）${e.title}——${e.description}`;
      }
      return `${name}${e.description ? `：${e.description}` : ''}`;

    case 'social':
      return `${e.title} · ${name}与相关修士之间的恩怨纠葛——${e.description}`;

    case 'combat':
      return `⚔ ${e.title}——${e.description}`;

    case 'world':
      return `🌍 ${e.title}：${e.description}`;

    default:
      return e.description || e.title || '';
  }
}

export class NarrativeEnhancer {
  /**
   * 为单个事件生成叙事增强文本。
   *
   * - AI 可用 → 调用 LLM 生成文学化描述
   * - AI 不可用 → 降级模板
   */
  static async enhanceEvent(req: NarrativeRequest): Promise<NarrativeResult> {
    // 快速路径：minor 事件不调用 AI（避免 API 开销）
    if (req.event.severity === 'minor') {
      return {
        narrative: fallbackTemplate(req),
        fallback: true,
      };
    }

    // 尝试 AI 增强
    try {
      const facts = NarrativeEnhancer.buildFacts(req);
      const prompt = buildAiNarrativePrompt('event', facts);

      const result = await AIServiceFacade.request<string>({
        prompt: prompt.user,
        context: { systemPrompt: prompt.system },
        maxTokens: 150,
      });

      if (result.success && result.data) {
        return {
          narrative: result.data,
          fallback: false,
          modelUsed: result.modelUsed,
        };
      }
    } catch {
      // 降级
    }

    return {
      narrative: fallbackTemplate(req),
      fallback: true,
    };
  }

  /**
   * 为 NPC 生成传记叙事。
   */
  static async enhanceBiography(npc: NpcRecord, timeline: BigEventLog[], worldState?: WorldState): Promise<NarrativeResult> {
    try {
      const facts = serializeNpcBiography(npc, timeline, worldState?.npcs);
      const prompt = buildAiNarrativePrompt('biography', facts);

      const result = await AIServiceFacade.request<string>({
        prompt: prompt.user,
        context: { systemPrompt: prompt.system },
        maxTokens: 200,
      });

      if (result.success && result.data) {
        return {
          narrative: result.data,
          fallback: false,
          modelUsed: result.modelUsed,
        };
      }
    } catch {
      // 降级
    }

    // 降级：简短模板
    const tierLabel = npc.destiny.tier === 'common' ? '' : ` · ${npc.destiny.tier}`;
    return {
      narrative: `${npc.name}（${npc.gender === 'Male' ? '男' : '女'}，${npc.realm}${tierLabel}），${npc.birthYear}年生于${npc.origin}，${npc.aspiration ? `志在${npc.aspiration}` : '修仙求道'}。`,
      fallback: true,
    };
  }

  /** 批量增强：取前 N 个事件（避免单次请求过多） */
  static async enhanceBatch(requests: NarrativeRequest[], maxConcurrent = 3): Promise<Map<string, NarrativeResult>> {
    const results = new Map<string, NarrativeResult>();

    // 串行批量（避免 API 限流）
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      const batch = requests.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (req) => {
          const result = await NarrativeEnhancer.enhanceEvent(req);
          return { eventId: req.event.id, result };
        }),
      );
      for (const { eventId, result } of batchResults) {
        results.set(eventId, result);
      }
    }

    return results;
  }

  /** 构建发给 AI 的事实素材 */
  private static buildFacts(req: NarrativeRequest): string {
    const parts: string[] = [];
    const e = req.event;

    parts.push(`事件标题：${e.title}`);
    parts.push(`事件描述：${e.description}`);
    parts.push(`严重性：${e.severity}`);
    parts.push(`分类：${e.category}`);
    parts.push(`时间：${e.year}年${e.month}月`);

    if (req.primaryNpc) {
      parts.push(`\n主要角色：${req.primaryNpc.name}（${req.primaryNpc.realm}，${req.primaryNpc.gender}，${Math.floor(req.primaryNpc.lifespan.age)}岁）`);
    }

    if (e.involvedCharacterIds.length > 0) {
      parts.push(`参与角色：${e.involvedCharacterIds.join('、')}`);
    }

    if (e.locationId) {
      parts.push(`地点：${e.locationId}`);
    }

    if (req.relatedEvents && req.relatedEvents.length > 0) {
      parts.push(`\n前因：${serializeEventChain(req.relatedEvents)}`);
    }

    return parts.join('\n');
  }
}
