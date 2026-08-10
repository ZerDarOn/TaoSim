import { describe, it, expect } from 'vitest';
import { BattleAI } from '../battle/battle-ai.js';
import type { Character, HexBattleMap, BattleUnit, BattleSceneConfig } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';

/** 用与 damage-calculator.test.ts 相同的真实 Character 构造方式 */
function makeChar(id: string, hp: number): Character {
  return {
    id,
    name: id,
    gender: 'Male',
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp,
    maxHp: 100,
    ap: 3,
    canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [],
    skillCooldowns: {},
    traits: [],
    relations: {},
    spiritStones: 0,
    wantedLevels: {},
    unlockedRecipes: [],
  };
}

/** 构造测试用 HexBattleMap：7×7 全平原，可指定单位位置 */
function makeMap(units: Record<string, { q: number; r: number }> = {}): HexBattleMap {
  const tiles: Record<string, any> = {};
  for (let q = 0; q < 7; q++) {
    for (let r = 0; r < 7; r++) {
      tiles[hexKey(q, r)] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  for (const [id, pos] of Object.entries(units)) {
    tiles[hexKey(pos.q, pos.r)].occupantId = id;
  }
  return { width: 7, height: 7, tiles };
}

/** 构造测试用 BattleUnit 字典 */
function makeUnits(ids: string[], team: 'Player' | 'Enemy' = 'Player'): Record<string, BattleUnit> {
  const units: Record<string, BattleUnit> = {};
  for (const id of ids) {
    units[id] = {
      characterId: id,
      team,
      controller: team === 'Player' ? 'Human' : 'AI',
      gauge: 100,
      actionReady: true,
      actionPoints: 3,
      maxActionPoints: 3,
      movePoints: 4,
      maxMovePoints: 4,
      statuses: [],
    };
  }
  return units;
}

/** 完整 stub 引擎：提供 characters/units/map */
function stubEngine(opts: {
  chars: Record<string, Character>;
  units: Record<string, BattleUnit>;
  positions: Record<string, { q: number; r: number }>;
  sceneConfig?: BattleSceneConfig;
}) {
  return {
    getState: () => ({
      characters: opts.chars,
      units: opts.units,
      map: makeMap(opts.positions),
      currentTurnId: null,
      sceneConfig: opts.sceneConfig,
    }),
  } as any;
}

describe('BattleAI', () => {
  it('无技能时普攻血量最低的存活目标', () => {
    const npc = makeChar('n', 100);
    const targets = { a: makeChar('a', 80), b: makeChar('b', 30) };
    // 玩家与 NPC 紧邻（距离 1），保证在普攻射程内
    const engine = stubEngine({
      chars: { n: npc, ...targets },
      units: { ...makeUnits(['a', 'b']), ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 3, r: 3 }, a: { q: 4, r: 3 }, b: { q: 3, r: 4 } },
    });
    const decision = BattleAI.decide(npc, ['a', 'b'], engine);
    expect(decision.type).toBe('basicAttack');
    expect((decision as any).targetId).toBe('b');
  });

  it('没有任何存活目标时选择防御（永不软锁）', () => {
    const npc = makeChar('n', 100);
    const engine = stubEngine({
      chars: { n: npc },
      units: { ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 3, r: 3 } },
    });
    const decision = BattleAI.decide(npc, [], engine);
    expect(decision.type).toBe('guard');
  });

  it('有冷却/灵力不足的技能时回退普攻', () => {
    const npc = makeChar('n', 100);
    npc.skills = [
      {
        id: 's1',
        name: 'fire',
        quality: 'Huang',
        type: 'Active',
        primitives: [],
        cost: { ap: 1, spiritEnergy: 999 },
        cooldownTurns: 1,
      },
    ];
    const engine = stubEngine({
      chars: { n: npc, a: makeChar('a', 80) },
      units: { ...makeUnits(['a']), ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 3, r: 3 }, a: { q: 4, r: 3 } },
    });
    const decision = BattleAI.decide(npc, ['a'], engine);
    expect(decision.type).toBe('basicAttack');
  });

  it('可用高伤技能时优先施放 UseSkill', () => {
    const npc = makeChar('n', 100);
    npc.skills = [
      {
        id: 's_fire',
        name: '火球术',
        quality: 'Xuan',
        type: 'Active',
        primitives: [
          { id: 'g1', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
          { id: 'n1', category: 'Numeric', params: { multiplier: 2.5 }, costBudget: 18 },
        ],
        cost: { ap: 1, spiritEnergy: 5 },
        cooldownTurns: 0,
      },
    ];
    const engine = stubEngine({
      chars: { n: npc, a: makeChar('a', 80) },
      units: { ...makeUnits(['a']), ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 3, r: 3 }, a: { q: 5, r: 3 } }, // 距离 2，在技能射程内
    });
    const decision = BattleAI.decide(npc, ['a'], engine);
    expect(decision.type).toBe('useSkill');
    expect((decision as any).skillId).toBe('s_fire');
  });

  it('距离过远时选择移动贴近目标', () => {
    const npc = makeChar('n', 100);
    npc.skills = []; // 无技能
    const engine = stubEngine({
      chars: { n: npc, a: makeChar('a', 80) },
      units: { ...makeUnits(['a']), ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 0, r: 0 }, a: { q: 6, r: 6 } }, // 距离 12，超出射程
    });
    const decision = BattleAI.decide(npc, ['a'], engine);
    expect(decision.type).toBe('move');
  });

  it('hp 极低时选择逃跑（场景允许时）', () => {
    const npc = makeChar('n', 5); // hp < 20% maxHp
    const engine = stubEngine({
      chars: { n: npc, a: makeChar('a', 100) },
      units: { ...makeUnits(['a']), ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 3, r: 3 }, a: { q: 4, r: 3 } },
      sceneConfig: { fleeEnabled: true },
    });
    const decision = BattleAI.decide(npc, ['a'], engine);
    expect(decision.type).toBe('flee');
  });

  it('场景禁用逃跑时不逃跑', () => {
    const npc = makeChar('n', 5); // hp < 20%
    const engine = stubEngine({
      chars: { n: npc, a: makeChar('a', 100) },
      units: { ...makeUnits(['a']), ...makeUnits(['n'], 'Enemy') },
      positions: { n: { q: 3, r: 3 }, a: { q: 4, r: 3 } },
      sceneConfig: { fleeEnabled: false },
    });
    const decision = BattleAI.decide(npc, ['a'], engine);
    // 不会逃跑 → 走普攻（距离 1）
    expect(decision.type).not.toBe('flee');
  });
});
