import { describe, it, expect } from 'vitest';
import type { NpcRecord } from '@taosim/contracts';
import {
  samplePairs,
  socialEncounter,
  tryFeud,
  tryJealousy,
} from '../world/world-social-rules.js';
import { affinityOpinionOffset } from '../world/affinity.js';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_1',
    name: '散修·甲',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
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

/** 固定序列 rng：耗尽后返回 0.5（中性值：不闪避、不暴击、不触发越阶爆发/致死） */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

const now = { year: 5, month: 3 };

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
  it('初识沉淀 friend 关系（双向 + bond/trust；叠加兼容性基底）', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2', name: '散修·乙' });
    const result = socialEncounter(a, b, now, seqRng([0.0, 0.0, 0.5])); // 相遇 → 初识 → base 5+5=10 + 道缘偏移
    expect(result).toBeDefined();
    expect(result!.kind).toBe('meet');

    const expectedBond = Math.max(-20, 10 + affinityOpinionOffset(a, b));
    const relA = a.relations['NPC_2']!;
    const relB = b.relations['NPC_1']!;
    expect(relA.type).toBe(expectedBond > 0 ? 'friend' : 'rival');
    expect(relA.bond).toBe(expectedBond);
    expect(relA.trust).toBe(expectedBond > 0 ? 25 : 10);
    expect(relA.events).toContain('初识');
    expect(relA.changedAt).toEqual(now);
    expect(relB.type).toBe(expectedBond > 0 ? 'friend' : 'rival');
    expect(relB.bond).toBe(expectedBond);
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

describe('tryFeud（真实斗法）', () => {
  function enemyOf(a: NpcRecord, targetId: string): NpcRecord {
    a.relations[targetId] = {
      type: 'enemy', bond: -30, trust: 5,
      events: ['结仇'], changedAt: now,
    };
    return a;
  }
  const STRONG_ATTRS = {
    physique: 30, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10,
  };

  it('无 enemy 关系不触发', () => {
    const a = makeNpc();
    const b = makeNpc({ id: 'NPC_2' });
    expect(tryFeud(a, b, now, seqRng([0.0]))).toBeUndefined();
  });

  it('碾压局：强者必胜，弱者重创折寿（无变数不弱胜强，也不滥杀）', () => {
    const attacker = makeNpc({ realm: 'GoldenCore_1', attributes: STRONG_ATTRS, skillIds: ['SKILL_A'] });
    const target = enemyOf(makeNpc({ id: 'NPC_2', lifespan: { age: 30, maxLifespan: 100 } }), attacker.id);
    enemyOf(attacker, target.id);
    // 0.0 触发；0.9/0.9 首击不闪避不暴击；耗尽 0.5 中性 → 致死判定不通过 → 折寿 10 年
    const result = tryFeud(attacker, target, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(true);
    expect(result.lethal).toBe(false);
    expect(result.injuryYears).toBe(10);
    expect(target.lifespan.maxLifespan).toBe(90);
    expect(target.soulState).toBe('Active');
    expect(target.relations[attacker.id]!.events).toContain('寻仇落败');
    expect(attacker.relations[target.id]!.events).toContain('寻仇得手');
  });

  it('碾压局 + 死斗下杀手：弱者陨落（仇杀）', () => {
    const attacker = makeNpc({
      realm: 'SoulFormation_1',
      attributes: {
        physique: 30, comprehension: 20, perception: 20, agility: 20, luck: 20, charm: 20,
      },
      skillIds: ['SKILL_A', 'SKILL_B', 'SKILL_C'],
    });
    const target = enemyOf(makeNpc({ id: 'NPC_2' }), attacker.id);
    enemyOf(attacker, target.id);
    // 全 0：触发 + 战斗中暴击全触发 + 致死判定 0 < 0.35 → 陨落
    const result = tryFeud(attacker, target, now, seqRng(Array(120).fill(0)))!;
    expect(result.lethal).toBe(true);
    expect(result.major).toBe(true);
    expect(target.soulState).toBe('PrimordialSoul');
    expect(target.causeOfDeath).toBe('仇杀陨落');
    expect(target.deathYear).toBe(5);
  });

  it('弱者挑衅强者：无变数必败（寻仇未果）', () => {
    const weak = makeNpc({ id: 'NPC_1' });
    const strong = makeNpc({ id: 'NPC_2', realm: 'GoldenCore_1', attributes: STRONG_ATTRS });
    enemyOf(weak, strong.id);
    enemyOf(strong, weak.id);
    const result = tryFeud(weak, strong, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(false);
    expect(result.lethal).toBe(false); // 强者的重创不致死（防御方克制/留手 → 折寿）
    expect(strong.soulState).toBe('Active');
    expect(weak.lifespan.maxLifespan).toBe(90);
  });

  it('装备决定胜负：同境界有兵刃者胜（面板+道具进斗法）', () => {
    const geared = makeNpc({ id: 'NPC_1', combatGear: { attack: 30, defense: 0, critRate: 0 } });
    const bare = makeNpc({ id: 'NPC_2' });
    enemyOf(geared, bare.id);
    enemyOf(bare, geared.id);
    const result = tryFeud(geared, bare, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(true);
    expect(result.lethal).toBe(false);
  });

  it('一阶内天赋越阶：练气妖孽（悟性/体质高）可胜筑基庸才（世界内因）', () => {
    const prodigy = makeNpc({
      id: 'NPC_1',
      realm: 'QiRefinement_3',
      destiny: { tier: 'prodigy', born: 'fortune', luck: 80, hidden: false },
      attributes: {
        physique: 26, comprehension: 34, perception: 28, agility: 28, luck: 26, charm: 26,
      },
    });
    const mediocrity = makeNpc({
      id: 'NPC_2',
      realm: 'Foundation_1',
      attributes: {
        physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5,
      },
    });
    enemyOf(prodigy, mediocrity.id);
    enemyOf(mediocrity, prodigy.id);
    // 0.0 触发；0.9/0.9 首击不闪避不暴击；耗尽 0.5 中性 → 天赋面板碾压一阶壁垒 → 险胜
    const result = tryFeud(prodigy, mediocrity, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(true);
    expect(result.lethal).toBe(false);
  });

  it('庸才越阶：炼气庸才挑衅筑基 → 破防也打不过，必败', () => {
    const weakling = makeNpc({ id: 'NPC_1' }); // 悟性 5 体质 5
    const foundation = makeNpc({
      id: 'NPC_2',
      realm: 'Foundation_1',
      attributes: { physique: 20, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    });
    enemyOf(weakling, foundation.id);
    enemyOf(foundation, weakling.id);
    const result = tryFeud(weakling, foundation, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(false);
    expect(foundation.soulState).toBe('Active');
  });

  it('跨 2 阶铁壁：炼气打金丹根基差距不可逾越（0 伤必败）', () => {
    const qi = makeNpc({
      id: 'NPC_1',
      attributes: { physique: 26, comprehension: 34, perception: 28, agility: 28, luck: 26, charm: 26 },
    });
    const golden = makeNpc({
      id: 'NPC_2',
      realm: 'GoldenCore_1',
      attributes: { physique: 20, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    });
    enemyOf(qi, golden.id);
    enemyOf(golden, qi.id);
    const result = tryFeud(qi, golden, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(false); // 天骄也打不过跨 2 阶——天赋再高也有限度
    expect(golden.soulState).toBe('Active');
  });

  it('势均力敌（同阶同面板）：先手微胜，平局不再反判主动方落败', () => {
    const attrs = { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 };
    const attacker = enemyOf(makeNpc({ id: 'NPC_1', attributes: attrs }), 'NPC_2');
    const target = enemyOf(makeNpc({ id: 'NPC_2', attributes: attrs }), 'NPC_1');
    // 同面板同阶：双方每回合各 3 点对耗（攻击 8 - 防御 5），60 回合各自掉血 180，
    // HP 同比例（平局）——修复前 aPct > bPct 为假，主动寻仇者反被判负并折寿
    const result = tryFeud(attacker, target, now, seqRng([0.0, 0.9, 0.9]))!;
    expect(result.attackerWins).toBe(true); // 平局 → 先手微优
    expect(result.lethal).toBe(false);
    expect(target.soulState).toBe('Active'); // 不误杀
  });
});

describe('tryJealousy（嫉妒追捧 §spec 3.3.2）', () => {
  it('天才（天灵根）被嫉贤者嫉妒（bond 下降），温和者不主动生怨', () => {
    const genius = makeNpc({
      id: 'NPC_G',
      realm: 'QiRefinement_3',
      spiritRoot: { grade: 'Heaven', elements: ['Fire'], isVariant: false },
    });
    const jealous = makeNpc({ id: 'NPC_J', realm: 'QiRefinement_3', personalityId: 'PERSONALITY_JEALOUS' });
    const normal = makeNpc({ id: 'NPC_N', realm: 'QiRefinement_3' });
    // jealous: rng 0.0 < 0.5 → 嫉妒；normal: rng 0.9 >= 0.05 → 无敬仰无嫉妒
    tryJealousy([jealous, normal], genius, now, seqRng([0.0, 0.9]));
    // 嫉贤者生怨：bond 下降且事件沉淀
    const relJ = jealous.relations['NPC_G'];
    expect(relJ).toBeDefined();
    expect(relJ!.type).toBe('rival');
    expect(relJ!.bond).toBeLessThan(0);
    expect(relJ!.events).toContain('心生嫉妒');
    // 天才察觉敌意（双向）
    const relG = genius.relations['NPC_J'];
    expect(relG).toBeDefined();
    expect(relG!.bond).toBeLessThan(0);
    expect(relG!.events).toContain('察觉敌意');
    // 温和者不主动嫉妒
    expect(normal.relations['NPC_G']).toBeUndefined();
  });

  it('平庸者不嫉妒同级或更高资质者', () => {
    const normal = makeNpc({ id: 'NPC_N', realm: 'QiRefinement_3' });
    const fellowNormal = makeNpc({ id: 'NPC_F', realm: 'QiRefinement_3' });
    tryJealousy([normal], fellowNormal, now, seqRng([0.0]));
    expect(normal.relations['NPC_F']).toBeUndefined();
  });

  it('低资质对天才偶发敬仰（少部分人仰慕）', () => {
    const genius = makeNpc({
      id: 'NPC_G',
      realm: 'QiRefinement_3',
      spiritRoot: { grade: 'Heaven', elements: ['Fire'], isVariant: false },
    });
    const normal = makeNpc({ id: 'NPC_N', realm: 'QiRefinement_3' });
    tryJealousy([normal], genius, now, seqRng([0.01])); // 0.01 < 0.05 → 敬仰
    const rel = normal.relations['NPC_G'];
    expect(rel).toBeDefined();
    expect(rel!.type).toBe('friend');
    expect(rel!.bond).toBeGreaterThan(0);
    expect(rel!.events).toContain('心生敬仰');
  });
});
