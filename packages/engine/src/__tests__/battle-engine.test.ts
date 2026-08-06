import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../battle/battle-engine.js';
import type { Character, HexBattleMap } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';

/** 用与 damage-calculator.test.ts 相同的真实 Character 构造方式 */
function makeChar(id: string, agility: number): Character {
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
    attributes: { physique: 10, comprehension: 10, perception: 10, agility, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 100,
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

function makeMap(): HexBattleMap {
  const tiles: Record<string, any> = {};
  for (let q = 0; q < 7; q++) {
    for (let r = 0; r < 7; r++) {
      tiles[hexKey(q, r)] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  return { width: 7, height: 7, tiles };
}

describe('BattleEngine', () => {
  it('start 注册双方单位并放置', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    const state = engine.getState();
    expect(state.units.p!.team).toBe('Player');
    expect(state.units.e!.team).toBe('Enemy');
    expect(state.phase).toBe('Running');
  });

  it('advanceTick 推进 ATB，身法快者先就绪', () => {
    const engine = new BattleEngine(1);
    const fast = makeChar('fast', 30);
    const slow = makeChar('slow', 1);
    engine.start(makeMap(), [fast], [slow]);
    for (let i = 0; i < 30; i++) engine.advanceTick();
    expect(engine.getState().currentTurnId).toBe('fast');
  });

  it('同 tick 就绪顺序：身法降序，相同按 characterId 升序（与插入顺序无关）', () => {
    const engine = new BattleEngine(1);
    const a = makeChar('a', 10);
    const b = makeChar('b', 10);
    const c = makeChar('c', 10);
    engine.start(makeMap(), [a, b], [c]);
    for (let i = 0; i < 40; i++) engine.advanceTick();
    expect(engine.getState().currentTurnId).toBe('a');
  });

  it('一方全灭时 winner 立即判定', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    engine.getState().characters.e!.hp = 0;
    engine.checkVictory();
    expect(engine.getState().phase).toBe('BattleEnd');
    expect(engine.getState().winner).toBe('Player');
  });

  it('非法命令零写入：非本回合者攻击被拒', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    const before = JSON.stringify(engine.getState().characters);
    const result = engine.dispatch({ type: 'BasicAttack', actorId: 'p', targetId: 'e' });
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(engine.getState().characters)).toBe(before);
  });

  it('移动：占用格与阻挡格不可进入', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    engine.getState().currentTurnId = 'p';
    const map = engine.getState().map;
    map.tiles[hexKey(1, 1)]!.isBlocked = true;
    const r1 = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 1, r: 1 } });
    expect(r1.error).toBe('blocked');
    const r2 = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 2, r: 0 } });
    expect(r2.error).toBeUndefined();
  });

  it('普攻射程为 1，AP 不足时被拒，防御/调息回 1 AP 且永不软锁', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    engine.getState().currentTurnId = 'p';
    const unit = engine.getState().units.p!;
    unit.actionPoints = 0;
    const r = engine.dispatch({ type: 'Guard', actorId: 'p' });
    expect(r.error).toBeUndefined();
    expect(unit.actionPoints).toBe(1);
  });
});
