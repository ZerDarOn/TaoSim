import { describe, it, expect } from 'vitest';
import type { NpcRecord } from '@taosim/contracts';
import {
  powerScore,
  samplePairs,
  socialEncounter,
  tryFeud,
} from '../world/world-social-rules.js';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_1',
    name: '散修·甲',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', luck: 50, hidden: false },
    realm: 'QiRefinement_3',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 240 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

/** 固定序列 rng：耗尽后返回 0 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

const now = { year: 5, month: 3 };

describe('powerScore', () => {
  it('随境界/体质/功法数提升', () => {
    const low = makeNpc();
    const high = makeNpc({
      id: 'NPC_2',
      realm: 'GoldenCore_1',
      attributes: { physique: 20, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
      skillIds: ['SKILL_A', 'SKILL_B'],
    });
    expect(powerScore(high)).toBeGreaterThan(powerScore(low));
  });
});

describe('samplePairs', () => {
  it('同种子同配对（注入 rng 可复现）', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const seq = [0.1, 0.7, 0.3, 0.9, 0.5, 0.2];
    const r1 = seqRng(seq);
    const r2 = seqRng(seq);
    const p1 = samplePairs(items, r1, 3).map(p => p.join(''));
    const p2 = samplePairs(items, r2, 3).map(p => p.join(''));
    expect(p1).toEqual(p2);
    expect(p1.length).toBe(3);
  });

  it('每对两个元素且来自输入集合', () => {
    const items = ['a', 'b', 'c'];
    const pairs = samplePairs(items, seqRng([0, 0]), 2);
    expect(pairs.length).toBe(1);
    expect(pairs[0]).toHaveLength(2);
    expect(items).toContain(pairs[0]![0]);
    expect(items).toContain(pairs[0]![1]);
  });
});

describe('socialEncounter', () => {
  it('初识沉淀 friend 关系（双向 + bond/trust）', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2', name: '散修·乙' });
    const result = socialEncounter(a, b, now, seqRng([0.0, 0.0, 0.5])); // 相遇 → 初识 → bond 5+5=10
    expect(result).toBeDefined();
    expect(result!.kind).toBe('meet');

    const relA = a.relations['NPC_2']!;
    const relB = b.relations['NPC_1']!;
    expect(relA.type).toBe('friend');
    expect(relA.bond).toBe(10);
    expect(relA.trust).toBe(25);
    expect(relA.events).toContain('初识');
    expect(relA.changedAt).toEqual(now);
    expect(relB.type).toBe('friend');
    expect(relB.bond).toBe(10);
  });

  it('结仇沉淀 enemy 关系（bond 为负）', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2' });
    const result = socialEncounter(a, b, now, seqRng([0.0, 0.95, 0.5])); // 相遇 → 结仇 → bond -28
    expect(result!.kind).toBe('grudge');
    expect(result!.major).toBe(true);
    expect(a.relations['NPC_2']!.type).toBe('enemy');
    expect(a.relations['NPC_2']!.bond).toBeLessThan(0);
    expect(b.relations['NPC_1']!.type).toBe('enemy');
  });

  it('论道增益归悟性高者', () => {
    const a = makeNpc({ attributes: { physique: 5, comprehension: 10, perception: 5, agility: 5, luck: 5, charm: 5 } });
    const b = makeNpc({ id: 'NPC_2', attributes: { physique: 5, comprehension: 3, perception: 5, agility: 5, luck: 5, charm: 5 } });
    const result = socialEncounter(a, b, now, seqRng([0.0, 0.6, 0.5])); // 相遇 → 论道 → bond 8+5=13
    expect(result!.kind).toBe('dao-discussion');
    expect(result!.expGain).toBe(20); // min(30, 10*2)
    expect(a.cultivation.currentExp).toBe(20);
    expect(b.cultivation.currentExp).toBe(0);
    expect(a.relations['NPC_2']!.events).toContain('论道');
  });

  it('概率未命中时不产生关系', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2' });
    const result = socialEncounter(a, b, now, seqRng([0.9])); // 0.9 >= 0.05 → 未相遇
    expect(result).toBeUndefined();
    expect(a.relations['NPC_2']).toBeUndefined();
  });

  it('关系类型升级：friend → enemy（结仇覆盖友善）', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2' });
    socialEncounter(a, b, now, seqRng([0.0, 0.0, 0.5])); // 先初识
    expect(a.relations['NPC_2']!.type).toBe('friend');
    socialEncounter(a, b, now, seqRng([0.0, 0.95, 0.5])); // 后结仇
    expect(a.relations['NPC_2']!.type).toBe('enemy');
    expect(a.relations['NPC_2']!.events).toEqual(['初识', '结仇']);
  });
});

describe('tryFeud', () => {
  function enemyOf(a: NpcRecord, targetId: string): NpcRecord {
    a.relations[targetId] = {
      type: 'enemy', bond: -30, trust: 5,
      events: ['结仇'], changedAt: now,
    };
    return a;
  }

  it('无 enemy 关系不触发', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2' });
    expect(tryFeud(a, b, now, seqRng([0.0]))).toBeUndefined();
  });

  it('实力悬殊：强者必胜，弱者折寿', () => {
    const attacker = makeNpc({
      realm: 'GoldenCore_1',
      attributes: { physique: 30, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
      skillIds: ['SKILL_A'],
    });
    const target = enemyOf(makeNpc({ id: 'NPC_2', lifespan: { age: 30, maxLifespan: 100 } }), attacker.id);
    enemyOf(attacker, target.id);

    // 触发 0.0 → 胜判 0.5（winChance≈0.93）→ 重伤 10 年（gap>250）→ 不死 0.5
    const result = tryFeud(attacker, target, now, seqRng([0.0, 0.5, 0.5]))!;
    expect(result.attackerWins).toBe(true);
    expect(result.lethal).toBe(false);
    expect(result.injuryYears).toBe(10);
    expect(target.lifespan.maxLifespan).toBe(90);
    expect(target.soulState).toBe('Active');
    expect(target.relations[attacker.id]!.events).toContain('寻仇落败');
    expect(attacker.relations[target.id]!.events).toContain('寻仇得手');
  });

  it('实力悬殊 + 霉运：败者陨落（仇杀）', () => {
    const attacker = makeNpc({
      realm: 'SoulFormation_1',
      attributes: { physique: 30, comprehension: 20, perception: 20, agility: 20, luck: 20, charm: 20 },
      skillIds: ['SKILL_A', 'SKILL_B', 'SKILL_C'],
    });
    const target = enemyOf(makeNpc({ id: 'NPC_2' }), attacker.id);
    enemyOf(attacker, target.id);

    // 触发 0.0 → 胜判 0.0 → 致死 0.0（gap>250 且 <0.2）
    const result = tryFeud(attacker, target, now, seqRng([0.0, 0.0, 0.0]))!;
    expect(result.lethal).toBe(true);
    expect(result.major).toBe(true);
    expect(target.soulState).toBe('PrimordialSoul');
    expect(target.causeOfDeath).toBe('仇杀陨落');
    expect(target.deathYear).toBe(5);
  });

  it('双方仇恨时由强者发起并取胜', () => {
    const strong = makeNpc({ realm: 'Foundation_2', skillIds: ['SKILL_A'] });
    const weak = makeNpc({ id: 'NPC_2' });
    enemyOf(strong, weak.id);
    enemyOf(weak, strong.id);
    const result = tryFeud(strong, weak, now, seqRng([0.0, 0.5, 0.5]))!;
    expect(result.attackerWins).toBe(true);
  });
});
