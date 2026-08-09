import { describe, it, expect } from 'vitest';
import {
  chooseBehavior,
  evolveAspiration,
  hasHeritageDisciple,
  motivationPressuresOf,
  rollInitialAspiration,
} from '../world/world-motivation.js';
import type { Rng } from '../world/world-tick-rules.js';
import type { NpcRecord } from '@taosim/contracts';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_MOTIV_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
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

const rngLow: Rng = () => 0.01;
const now = { year: 1, month: 1 };

function enemyRelation(bond: number) {
  return { type: 'enemy' as const, bond, trust: 0, events: ['结仇'], changedAt: now };
}

describe('动机缺口计算（§4.13 需求状态机）', () => {
  it('寿元压力 = 年龄/寿元比（与时间赛跑，最硬约束）', () => {
    expect(motivationPressuresOf(makeNpc({ lifespan: { age: 50, maxLifespan: 100 } })).longevity).toBeCloseTo(0.5);
    expect(motivationPressuresOf(makeNpc({ lifespan: { age: 95, maxLifespan: 100 } })).longevity).toBeCloseTo(0.95);
  });

  it('仇恨压力：最恨之敌 bond 归一（-60 → 满压，-30 → 半压；友好关系不计）', () => {
    const deep = makeNpc({ relations: { E: enemyRelation(-60) } });
    expect(motivationPressuresOf(deep).grudge).toBe(1);
    const mild = makeNpc({ relations: { E: enemyRelation(-30) } });
    expect(motivationPressuresOf(mild).grudge).toBeCloseTo(0.5);
    const friendly = makeNpc({
      relations: { F: { type: 'friend', bond: 60, trust: 50, events: [], changedAt: now } },
    });
    expect(motivationPressuresOf(friendly).grudge).toBe(0);
  });

  it('孤独压力：无道侣且年岁渐长（30 岁起积累）；有配偶归零', () => {
    expect(motivationPressuresOf(makeNpc()).loneliness).toBe(0); // age 30 → 起点
    expect(motivationPressuresOf(makeNpc({ lifespan: { age: 110, maxLifespan: 100 } })).loneliness).toBe(1);
    expect(motivationPressuresOf(makeNpc({ spouseId: 'SP' })).loneliness).toBe(0);
  });

  it('道途压力：修为占阈值比（卡关者压力高）；maxExp=0 视为已圆满', () => {
    const stuck = makeNpc({ cultivation: { currentExp: 72, maxExp: 80 } });
    expect(motivationPressuresOf(stuck).dao).toBeCloseTo(0.9);
    expect(motivationPressuresOf(makeNpc({ cultivation: { currentExp: 0, maxExp: 0 } })).dao).toBe(1);
  });

  it('传承压力：仅寿元>85% 且无传人时非零（香火急迫）', () => {
    const oldNoDisciple = makeNpc({ lifespan: { age: 90, maxLifespan: 100 } });
    expect(motivationPressuresOf(oldNoDisciple).succession).toBeCloseTo((0.9 - 0.85) / 0.15);
    expect(motivationPressuresOf(makeNpc({ lifespan: { age: 60, maxLifespan: 100 } })).succession).toBe(0);
    const oldWithDisciple = makeNpc({
      lifespan: { age: 90, maxLifespan: 100 },
      relations: {
        D: { type: 'master-disciple', bond: 50, trust: 55, events: [], changedAt: now, direction: 'disciple' },
      },
    });
    expect(motivationPressuresOf(oldWithDisciple).succession).toBe(0);
    expect(hasHeritageDisciple(oldWithDisciple)).toBe(true);
  });
});

describe('志向初掷（出生心性 + 寿元约束）', () => {
  it('寿元>90% → 求传人；>75% → 求寿（最硬约束优先）', () => {
    expect(rollInitialAspiration(makeNpc({ lifespan: { age: 91, maxLifespan: 100 } }), rngLow)).toBe('seekSuccessor');
    expect(rollInitialAspiration(makeNpc({ lifespan: { age: 80, maxLifespan: 100 } }), rngLow)).toBe('seekLongevity');
  });

  it('中青年按心性池随机（不会直接给定求传人/求寿）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      seen.add(rollInitialAspiration(makeNpc(), rngLow));
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const a of seen) {
      expect(a).not.toBe('seekSuccessor');
      expect(a).not.toBe('seekLongevity');
    }
  });
});

describe('志向塑形（经历改执念，零 rng）', () => {
  it('寻仇者：仇怨已淡/仇人已逝（无深仇）→ 转求道', () => {
    expect(evolveAspiration(makeNpc({ aspiration: 'seekRevenge' }))).toBe('seekDao');
    const hating = makeNpc({ aspiration: 'seekRevenge', relations: { E: enemyRelation(-60) } });
    expect(evolveAspiration(hating)).toBe('seekRevenge');
  });

  it('求缘者：结为道侣 → 成家后专心道途', () => {
    expect(evolveAspiration(makeNpc({ aspiration: 'seekPartner', spouseId: 'SP' }))).toBe('seekDao');
    expect(evolveAspiration(makeNpc({ aspiration: 'seekPartner' }))).toBe('seekPartner');
  });

  it('传道者：已有传人 → 了却心愿转求道', () => {
    const withDisciple = makeNpc({
      aspiration: 'seekSuccessor',
      relations: {
        D: { type: 'master-disciple', bond: 50, trust: 55, events: [], changedAt: now, direction: 'disciple' },
      },
    });
    expect(evolveAspiration(withDisciple)).toBe('seekDao');
  });

  it('寿元>90% 时任何志向都被最硬约束覆盖为求传人', () => {
    expect(evolveAspiration(makeNpc({ aspiration: 'wander', lifespan: { age: 95, maxLifespan: 100 } }))).toBe('seekSuccessor');
  });
});

describe('行为选择（志向 × 缺口 → 行为槽，零 rng）', () => {
  it('深仇者：有仇可寻 → 寻仇；无仇 → 闭关蓄力', () => {
    const hating = makeNpc({ aspiration: 'seekRevenge', relations: { E: enemyRelation(-60) } });
    expect(chooseBehavior(hating).type).toBe('revenge');
    expect(chooseBehavior(makeNpc({ aspiration: 'seekRevenge' })).type).toBe('seclude');
  });

  it('求缘→求偶；传道→收徒；求寿→访缘', () => {
    expect(chooseBehavior(makeNpc({ aspiration: 'seekPartner' })).type).toBe('courtship');
    expect(chooseBehavior(makeNpc({ aspiration: 'seekSuccessor' })).type).toBe('teach');
    expect(chooseBehavior(makeNpc({ aspiration: 'seekLongevity' })).type).toBe('seekWonder');
  });

  it('扬名/逍遥 → 云游；求道卡关 → 访机缘，其余闭关苦修', () => {
    expect(chooseBehavior(makeNpc({ aspiration: 'seekFame' })).type).toBe('wander');
    expect(chooseBehavior(makeNpc({ aspiration: 'wander' })).type).toBe('wander');
    const stuck = makeNpc({ aspiration: 'seekDao', cultivation: { currentExp: 72, maxExp: 80 } });
    expect(chooseBehavior(stuck).type).toBe('seekWonder');
    expect(chooseBehavior(makeNpc({ aspiration: 'seekDao' })).type).toBe('seclude');
  });
});
