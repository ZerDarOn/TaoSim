// ============================================================
// AI 上下文序列化 — 世界涌现叙事设计 §8（AI 增强层预留）
//
// - 输出只含真实实体引用（NPC id/事件 id/数值），AI 不虚构任何事实
// - LLM 只增强 narrative（文学化描述）/ 对话 / 生平总结
// - 全部纯函数：无 I/O，可在引擎/UI/未来 AI 服务中复用
// ============================================================

import type { BigEventLog, NpcRecord, WorldState } from '@taosim/contracts';
import { realmDisplay } from './world-tick-rules.js';

const SEVERITY_ICON: Record<string, string> = { minor: '·', normal: '◆', major: '★', epoch: '☀' };

function formatTime(e: { year: number; month: number }): string {
  return `${e.year}年${e.month}月`;
}

function resolveName(id: string, npcs?: Record<string, NpcRecord>): string {
  return npcs?.[id]?.name ?? id;
}

/**
 * 单 NPC 生平素材（时间线 + 实体引用）。
 * npcs 可选：将关系/事件中的 NPC id 映射为名字（缺省回退 id，仍为真实引用）。
 */
export function serializeNpcBiography(
  npc: NpcRecord,
  timeline: BigEventLog[],
  npcs?: Record<string, NpcRecord>,
): string {
  const lines: string[] = [];
  lines.push(`【生平素材】${npc.name}（${npc.gender} · ${realmDisplay(npc.realm)} · 命格 ${npc.destiny.tier} · 气运 ${npc.destiny.luck}）`);
  lines.push(`- 出生：${formatTime({ year: npc.birthYear, month: npc.birthMonth })}`);
  lines.push(`- 当前境界：${realmDisplay(npc.realm)}；修为 ${npc.cultivation.currentExp}/${npc.cultivation.maxExp}`);
  lines.push(`- 寿元：${Math.floor(npc.lifespan.age)}岁 / 上限 ${npc.lifespan.maxLifespan} 年（${npc.soulState}）`);
  lines.push(`- 灵根：${npc.spiritRoot.grade} · ${npc.spiritRoot.elements.join('/')}${npc.spiritRoot.isVariant ? '（变异）' : ''}`);
  lines.push(`- 功法：${npc.skillIds.length} 门`);
  if (npc.causeOfDeath) lines.push(`- 陨落：${npc.causeOfDeath}（${npc.deathYear ?? '?'}年${npc.deathMonth ?? '?'}月）`);

  const relEntries = Object.entries(npc.relations);
  if (relEntries.length > 0) {
    lines.push(`- 关系（${relEntries.length} 段）：`);
    for (const [targetId, rel] of relEntries) {
      lines.push(`  · ${resolveName(targetId, npcs)}：${rel.type}（亲密度 ${rel.bond}，信任 ${rel.trust}）`);
    }
  }

  lines.push(`- 时间线（${timeline.length} 条）：`);
  for (const e of timeline) {
    lines.push(`  · ${formatTime(e)} [${e.category}]${e.severity === 'major' || e.severity === 'epoch' ? ' ★' : ''} ${e.title}`);
  }

  return lines.join('\n');
}

/**
 * 世界摘要（上帝视角素材）：年份/量劫/人口/近期大事。
 * recentMonths 控制最近事件窗口（默认 12 个月）。
 */
export function serializeWorldDigest(
  state: WorldState,
  recentMonths = 12,
): string {
  const now = state.currentYear * 12 + state.currentMonth;
  const cutoff = now - recentMonths;
  const active = Object.values(state.npcs).filter(n => n.soulState === 'Active');
  const recent = state.eventLog
    .filter(e => e.year * 12 + e.month > cutoff)
    .slice(-30)
    .reverse();

  const lines: string[] = [];
  lines.push(`【世界摘要】第 ${state.currentYear} 年 ${state.currentMonth} 月 · 量劫倒计时 ${state.catastropheCountdownMonths} 个月`);
  lines.push(`- 活跃大陆：${state.activeContinentIds.join('、')}`);
  lines.push(`- 修仙人口：${active.length} 人（档案 ${Object.keys(state.npcs).length} 人）`);
  lines.push(`- 近 ${recentMonths} 月大事（${recent.length} 条）：`);
  for (const e of recent) {
    lines.push(`  · ${formatTime(e)} ${SEVERITY_ICON[e.severity] ?? '·'} [${e.category}] ${e.title}（${e.involvedCharacterIds.map(id => resolveName(id, state.npcs)).join('、')}）`);
  }
  return lines.join('\n');
}

/**
 * 因果链序列化：按 relatedEventIds 展开事件链（叙述素材 §2.4）。
 * 若无 relatedEventIds 则按时间顺序输出传入事件。
 */
export function serializeEventChain(events: BigEventLog[]): string {
  const byId = new Map(events.map(e => [e.id, e]));
  const lines: string[] = [];
  const visited = new Set<string>();

  for (const start of events) {
    let cur: BigEventLog | undefined = start;
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      lines.push(`- ${formatTime(cur)} [${cur.category}]${cur.severity === 'major' || cur.severity === 'epoch' ? ' ★' : ''} ${cur.title}：${cur.description}`);
      const nextId: string | undefined = cur.relatedEventIds?.[0];
      cur = nextId ? byId.get(nextId) : undefined;
    }
  }
  return lines.join('\n');
}

export type AiEnhancementKind = 'biography' | 'event' | 'dialogue';

/** AI 增强接口桩：生成 prompt（系统约束 + 事实素材），供未来 LLM 调用 */
export function buildAiNarrativePrompt(kind: AiEnhancementKind, facts: string): { system: string; user: string } {
  const system =
    '你是修仙世界叙事增强引擎。只负责把给定的结构化事实改写成文学化描述，' +
    '绝不虚构任何实体 id、数值或事件。世界事实以输入为准，不改动。';
  const task: Record<AiEnhancementKind, string> = {
    biography: '根据素材为角色写一段 100 字以内的传奇生平（可用文言风味，但不得增减事实）。',
    event: '把事件描述改写为更有画面感的叙事（100 字内，不得改变事件参与人与结果）。',
    dialogue: '根据素材生成一段符合人物性格的简短对话。',
  };
  return {
    system,
    user: `${task[kind]}\n\n--- 结构化事实 ---\n${facts}`,
  };
}
