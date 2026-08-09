import { describe, it, expect } from 'vitest';
import type { BigEventLog, NpcRecord, WorldState } from '@taosim/contracts';
import {
  buildAiNarrativePrompt,
  serializeEventChain,
  serializeNpcBiography,
  serializeWorldDigest,
} from '../world/context-serializer.js';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_A',
    name: '云鹤',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'prodigy', born: 'fortune', luck: 95, hidden: true },
    realm: 'GoldenCore_1',
    soulState: 'Active',
    cultivation: { currentExp: 500, maxExp: 1500 },
    spiritRoot: { grade: 'Earth', elements: ['Fire'], isVariant: false },
    attributes: { physique: 10, comprehension: 12, perception: 8, agility: 9, luck: 15, charm: 7 },
    lifespan: { age: 60, maxLifespan: 200 },
    skillIds: ['SKILL_A', 'SKILL_B'],
    birthYear: 1,
    birthMonth: 3,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 5, month: 6 },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<BigEventLog> = {}): BigEventLog {
  return {
    id: 'EVT_1', year: 2, month: 5, isMajorEvent: true, category: 'cultivation',
    title: '云鹤 突破至金丹！', description: '云鹤 历经磨难，一举跨入金丹，震动一方',
    involvedCharacterIds: ['NPC_A'], severity: 'major', visibility: 'regional', source: 'engine',
    ...overrides,
  };
}

describe('serializeNpcBiography', () => {
  it('输出包含真实事实：名字/境界/出身与事迹认定/灵根/时间线', () => {
    const npc = makeNpc({
      relations: {
        NPC_B: { type: 'enemy', bond: -40, trust: 5, events: ['结仇'], changedAt: { year: 2, month: 1 } },
      },
    });
    const timeline = [makeEvent()];
    const out = serializeNpcBiography(npc, timeline, { NPC_B: { ...makeNpc({ id: 'NPC_B', name: '影月' }) } });
    expect(out).toContain('云鹤');
    expect(out).toContain('金丹');
    expect(out).toContain('出身 气运之子');
    expect(out).toContain('影月');
    expect(out).toContain('云鹤 突破至金丹！');
    expect(out).toContain('500/1500');
  });

  it('关系/事件的 NPC id 缺省回退为 id（不虚构）', () => {
    const npc = makeNpc({ relations: { NPC_B: { type: 'friend', bond: 20, trust: 40, events: ['初识'], changedAt: { year: 1, month: 1 } } } });
    const out = serializeNpcBiography(npc, []);
    expect(out).toContain('NPC_B：friend');
  });
});

describe('serializeWorldDigest', () => {
  it('输出年份/量劫/人口/近期大事', () => {
    const state: WorldState = {
      currentYear: 5, currentMonth: 6, catastropheCountdownMonths: 500,
      activeContinentIds: ['CONTINENT_CANGZHOU'], globalFlags: {},
      npcs: { NPC_A: makeNpc() },
      eventLog: [makeEvent({ year: 5, month: 1 })],
    };
    const out = serializeWorldDigest(state, 12);
    expect(out).toContain('第 5 年');
    expect(out).toContain('量劫倒计时 500');
    expect(out).toContain('1 人');
    expect(out).toContain('云鹤 突破至金丹！');
  });
});

describe('serializeEventChain', () => {
  it('按 relatedEventIds 展开因果链', () => {
    const e1 = makeEvent({ id: 'EVT_1', title: '初遇' });
    const e2 = makeEvent({ id: 'EVT_2', year: 3, month: 1, title: '结仇', relatedEventIds: ['EVT_1'] });
    const out = serializeEventChain([e2, e1]);
    expect(out.indexOf('结仇')).toBeLessThan(out.indexOf('初遇'));
    expect(out).toContain('初遇：');
  });
});

describe('buildAiNarrativePrompt', () => {
  it('system 约束不虚构事实，user 携带事实素材', () => {
    const { system, user } = buildAiNarrativePrompt('biography', '云鹤 金丹境 气运95');
    expect(system).toContain('不虚构');
    expect(user).toContain('云鹤 金丹境 气运95');
    expect(user).toContain('生平');
  });
});
