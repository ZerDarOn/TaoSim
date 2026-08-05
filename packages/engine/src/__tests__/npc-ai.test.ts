import { describe, it, expect, beforeEach } from 'vitest';
import { NpcAI } from '../combat/npc-ai.js';
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
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    spiritStones: 0,
    inventory: [],
    equipmentSlots: { weapon: { id: 'w1', name: '\u5251', tier: 1, type: 'Equipment', attributes: { attack: 15 } }, armor: undefined, treasures: [] },
    skills: [{ id: 's1', name: '\u65a9\u51fb', quality: 'Huang', type: 'Active', primitives: [], cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 0 }],
    skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('NpcAI', () => {
  let map: HexBattleMap;
  let player: Character;
  let enemy: Character;
  let engine: CombatEngine;

  beforeEach(() => {
    map = makeMap();
    player = makeChar('PLAYER');
    enemy = makeChar('ENEMY');
    engine = new CombatEngine(map, [player, enemy]);
    engine.placeCharacter('PLAYER', 0, 0);
    engine.placeCharacter('ENEMY', 2, 2);
  });

  it('\u654c\u4eba\u6709\u53ef\u7528\u6280\u80fd\u4e14\u76f8\u90bb\u65f6\u8f93\u51fa\u653b\u51fb\u884c\u52a8', () => {
    engine.placeCharacter('ENEMY', 1, 0); // \u76f8\u90bb hexDistance(1,0,0,0)=1
    const action = NpcAI.decide(enemy, player, engine, { PLAYER: player, ENEMY: enemy });
    expect(action.type).toBe('attack');
    expect(action.skill).toBeDefined();
    expect(action.targetId).toBe('PLAYER');
  });

  it('\u8ddd\u79bb\u8fc7\u8fdc\u65f6\u4f18\u5148\u79fb\u52a8\u9760\u8fd1', () => {
    engine.placeCharacter('ENEMY', 4, 4);
    const action = NpcAI.decide(enemy, player, engine, { PLAYER: player, ENEMY: enemy });
    expect(action.type).toBe('move');
    expect(action.toQ).toBeDefined();
    expect(action.toR).toBeDefined();
  });

  it('\u6280\u80fd\u51b7\u5374\u4e2d\u5219\u65e0\u6cd5\u653b\u51fb', () => {
    engine.placeCharacter('ENEMY', 1, 0);
    const enemy2 = makeChar('E2', {
      skills: [{ id: 's1', name: '\u65a9\u51fb', quality: 'Huang', type: 'Active', primitives: [], cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 2 }],
      skillCooldowns: { s1: 3 },
      spiritEnergy: { current: 100, max: 100 },
    });
    const action = NpcAI.decide(enemy2, player, engine, { PLAYER: player, E2: enemy2 });
    expect(action.type === 'move' || action.type === 'skip').toBe(true);
  });
});
