import { describe, it, expect, beforeEach } from 'vitest';
import { CombatEngine } from '../combat/combat-engine.js';
import type { Character, HexBattleMap } from '@taosim/contracts';

function makeMap(): HexBattleMap {
  const tiles: Record<string, any> = {};
  for (let q = 0; q < 5; q++) {
    for (let r = 0; r < 5; r++) {
      tiles[`${q},${r}`] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  return { width: 5, height: 5, tiles };
}

function makeChar(id: string, overrides: Partial<Character> = {}): Character {
  return {
    id, name: 'Test', gender: 'Male',
    realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('CombatEngine', () => {
  let map: HexBattleMap;

  beforeEach(() => { map = makeMap(); });

  it('初始化后角色放置在指定位置', () => {
    const player = makeChar('PLAYER');
    const enemy = makeChar('ENEMY');
    const engine = new CombatEngine(map, [player, enemy]);
    engine.placeCharacter('PLAYER', 0, 0);
    engine.placeCharacter('ENEMY', 2, 0);
    expect(engine.getMap().tiles['0,0']!.occupantId).toBe('PLAYER');
    expect(engine.getMap().tiles['2,0']!.occupantId).toBe('ENEMY');
  });

  it('findCharacterPosition 返回正确坐标', () => {
    const player = makeChar('P');
    const engine = new CombatEngine(map, [player]);
    engine.placeCharacter('P', 3, 1);
    const pos = engine.findCharacterPosition('P');
    expect(pos).toEqual({ q: 3, r: 1 });
  });

  it('ATB tick 让行动值随敏捷增长', () => {
    const fast = makeChar('FAST', { attributes: { physique: 5, comprehension: 5, perception: 5, agility: 20, luck: 5 } });
    const slow = makeChar('SLOW', { attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5 } });
    const chars = { FAST: fast, SLOW: slow };
    const engine = new CombatEngine(map, [fast, slow]);
    // FAST: 每 tick 10+40=50, 2 tick 到 100; SLOW: 每 tick 10+10=20, 需 5 tick
    engine.tickATB(chars);
    engine.tickATB(chars);
    const ready = engine.getReadyUnits();
    const fastReady = ready.find(u => u.characterId === 'FAST');
    expect(fastReady).toBeDefined();
  });
});
