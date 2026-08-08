import { describe, it, expect } from 'vitest';
import {
  cultivateNpc,
  isBigRealmEnd,
  nextRealm,
  realmDisplay,
  realmExpThreshold,
  tryBreakthrough,
  tryWander,
  tryWonder,
} from '../world/world-tick-rules.js';
import type { NpcRecord } from '@taosim/contracts';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_T1',
    name: '散修·甲',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', luck: 50, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 8, perception: 5, agility: 5, luck: 5, charm: 5 },
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

describe('world-tick-rules', () => {
  it('realmDisplay 中文名', () => {
    expect(realmDisplay('QiRefinement_1')).toBe('炼气1层');
    expect(realmDisplay('GoldenCore_3')).toBe('金丹3层');
    expect(realmDisplay('SoulFormation_1')).toBe('化神1层');
  });

  it('nextRealm 子级与跨大境界', () => {
    expect(nextRealm('QiRefinement_5')).toBe('QiRefinement_6');
    expect(nextRealm('QiRefinement_9')).toBe('Foundation_1');
    expect(nextRealm('GoldenCore_3')).toBe('NascentSoul_1');
    expect(nextRealm('SoulFormation_1')).toBeUndefined();
  });

  it('realmExpThreshold 随境界递增', () => {
    expect(realmExpThreshold('QiRefinement_1')).toBe(80);
    expect(realmExpThreshold('QiRefinement_5')).toBe(400);
    expect(realmExpThreshold('Foundation_1')).toBe(600);
    expect(realmExpThreshold('GoldenCore_1')).toBe(1500);
    expect(realmExpThreshold('NascentSoul_1')).toBe(3000);
  });

  it('isBigRealmEnd 识别大境界末层', () => {
    expect(isBigRealmEnd('QiRefinement_9')).toBe(true);
    expect(isBigRealmEnd('Foundation_3')).toBe(true);
    expect(isBigRealmEnd('QiRefinement_5')).toBe(false);
  });

  it('cultivateNpc 每月修为增长', () => {
    const npc = makeNpc();
    cultivateNpc(npc);
    expect(npc.cultivation.currentExp).toBeCloseTo(4); // 悟性 8 × 0.5
  });

  it('tryBreakthrough 未达阈值不尝试', () => {
    const npc = makeNpc();
    const result = tryBreakthrough(npc, () => 0);
    expect(result.attempted).toBe(false);
  });

  it('tryBreakthrough 成功：境界推进、修为清零', () => {
    const npc = makeNpc({ cultivation: { currentExp: 80, maxExp: 80 } });
    const result = tryBreakthrough(npc, () => 0); // rng 恒 0 → 必成功
    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(npc.realm).toBe('QiRefinement_2');
    expect(npc.cultivation.currentExp).toBe(0);
  });

  it('tryBreakthrough 跨大境界标记 major', () => {
    const npc = makeNpc({ realm: 'QiRefinement_9', cultivation: { currentExp: 720, maxExp: 720 } });
    const result = tryBreakthrough(npc, () => 0);
    expect(result.succeeded).toBe(true);
    expect(result.major).toBe(true);
    expect(npc.realm).toBe('Foundation_1');
  });

  it('tryBreakthrough 失败：折损寿元', () => {
    const npc = makeNpc({ cultivation: { currentExp: 80, maxExp: 80 } });
    const maxLifespanBefore = npc.lifespan.maxLifespan;
    const result = tryBreakthrough(npc, () => 0.99); // 必失败
    expect(result.succeeded).toBe(false);
    expect(npc.lifespan.maxLifespan).toBe(maxLifespanBefore - 3);
  });

  it('天骄突破成功率更高', () => {
    const common = makeNpc({ cultivation: { currentExp: 80, maxExp: 80 } });
    const prodigy = makeNpc({
      destiny: { tier: 'prodigy', luck: 95, hidden: true },
      cultivation: { currentExp: 80, maxExp: 80 },
    });
    // rng 恒 0.82：common 成功率 0.7±0.18 → 约 0.52..0.88；prodigy 额外 +0.1
    const commonResult = tryBreakthrough(common, () => 0.82);
    const prodigyResult = tryBreakthrough(prodigy, () => 0.82);
    expect(commonResult.succeeded).toBe(false);
    expect(prodigyResult.succeeded).toBe(true);
  });

  it('tryWonder 天材地宝：修为增加', () => {
    const npc = makeNpc({ destiny: { tier: 'prodigy', luck: 95, hidden: true } });
    let calls = 0;
    // 第一次 rng 触发判定（需 < 触发概率 ~0.012），第二次 type roll < 0.6 → treasure
    const result = tryWonder(npc, () => (calls++ === 0 ? 0.001 : 0.05));
    expect(result.triggered).toBe(true);
    expect(result.type).toBe('treasure');
    expect(npc.cultivation.currentExp).toBeGreaterThan(0);
  });

  it('tryWonder 秘境遇险：折损寿元', () => {
    const npc = makeNpc({ destiny: { tier: 'prodigy', luck: 95, hidden: true } });
    const maxLifespanBefore = npc.lifespan.maxLifespan;
    let calls = 0;
    // 触发 + type roll >= 0.9 → injury
    const result = tryWonder(npc, () => (calls++ === 0 ? 0.001 : 0.95));
    expect(result.triggered).toBe(true);
    expect(result.type).toBe('injury');
    expect(npc.lifespan.maxLifespan).toBe(maxLifespanBefore - 5);
  });

  it('tryWander 小概率触发', () => {
    const npc = makeNpc();
    expect(tryWander(npc, () => 0.01)).toBe(true);
    expect(tryWander(npc, () => 0.5)).toBe(false);
  });
});
