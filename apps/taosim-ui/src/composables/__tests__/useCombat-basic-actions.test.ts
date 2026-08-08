import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import type { Character, HexBattleMap, HexTile } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';
import { useCombat, MAX_AP } from '../useCombat';

/** 固定命中/暴击判定：默认 0.5 既不触发闪避也不触发暴击，避免随机 flaky */
function stubRng(...vals: number[]): void {
  const q = [...vals];
  vi.spyOn(Math, 'random').mockImplementation(() => (q.length > 0 ? q.shift()! : 0.5));
}

function makeCharacter(id: string, agility = 10): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, spiritStones: 0,
    wantedLevels: {}, unlockedRecipes: [],
  } as Character;
}

function makeMap(w = 7, h = 7): HexBattleMap {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) {
      tiles[hexKey(q, r)] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  return { width: w, height: h, tiles };
}

describe('useCombat basicAttack/defend', () => {
  let scope: ReturnType<typeof effectScope>;
  let combat: ReturnType<typeof useCombat>;

  beforeEach(() => {
    scope = effectScope();
    scope.run(() => {
      combat = useCombat(makeMap(), 'p', makeCharacter('p'), [makeCharacter('e')]);
      combat.state.engine!.placeCharacter('p', 1, 1);
      combat.state.engine!.placeCharacter('e', 1, 2); // 相邻（距离 1）
      combat.state.currentTurn = 'p'; // 模拟轮到玩家
    });
  });

  afterEach(() => { scope.stop(); vi.restoreAllMocks(); });

  it('普攻：距离 1 结算伤害（physique 10 → 5 点）、扣 1 AP、消耗回合、写日志', () => {
    stubRng(0.5, 0.5);
    const result = combat.basicAttack('e');
    const p = combat.state.characters['p']!;
    const e = combat.state.characters['e']!;
    expect(result).toEqual({ defenderId: 'e', damage: 5, blockedByBarrier: false });
    expect(e.hp).toBe(95);
    expect(p.ap).toBe(2);
    expect(combat.state.currentTurn).toBeNull();
    expect(combat.state.phase).toBe('idle');
    expect(combat.state.log.some(l => l.includes('造成 5 点伤害'))).toBe(true);
  });

  it('普攻：距离 > 1 时提示无法命中，不结算、不消耗回合', () => {
    combat.state.engine!.moveCharacter('e', 1, 3); // 距离 2
    const result = combat.basicAttack('e');
    expect(result).toBeNull();
    expect(combat.state.characters['e']!.hp).toBe(100);
    expect(combat.state.currentTurn).toBe('p'); // 回合未消耗
    expect(combat.state.log.some(l => l.includes('距离过远'))).toBe(true);
  });

  it('普攻：非玩家回合直接忽略', () => {
    combat.state.currentTurn = 'e';
    const result = combat.basicAttack('e');
    expect(result).toBeNull();
    expect(combat.state.characters['e']!.hp).toBe(100);
  });

  it('防御：回复 1 AP（封顶 MAX_AP）并结束回合', () => {
    combat.state.characters['p']!.ap = 1;
    combat.defend();
    expect(combat.state.characters['p']!.ap).toBe(2);
    expect(combat.state.currentTurn).toBeNull();
    expect(combat.state.log.some(l => l.includes('防御'))).toBe(true);
  });

  it('防御：AP 已达 MAX_AP 时封顶不再增加', () => {
    combat.state.characters['p']!.ap = MAX_AP;
    combat.defend();
    expect(combat.state.characters['p']!.ap).toBe(MAX_AP);
  });
});
