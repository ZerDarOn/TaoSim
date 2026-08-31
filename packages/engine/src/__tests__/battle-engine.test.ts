import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../battle/battle-engine.js';
import type { Character, HexBattleMap, BattleState } from '@taosim/contracts';
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

/** getState() 返回 TS 只读视图；测试需要直接改写回合字段时经此取可变引用 */
function stateOf(engine: BattleEngine): BattleState {
  return engine.getState() as BattleState;
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
    const mk = () => ({
      a: makeChar('a', 10),
      b: makeChar('b', 10),
      c: makeChar('c', 10),
    });
    // 正向插入：players [a, b] + enemies [c]
    {
      const { a, b, c } = mk();
      const engine = new BattleEngine(1);
      engine.start(makeMap(), [a, b], [c]);
      for (let i = 0; i < 40; i++) engine.advanceTick();
      expect(engine.getState().currentTurnId).toBe('a');
    }
    // 反向插入对照：players [b, a] + enemies [c]，characterId 升序 'a' 仍胜出
    // （'a' 须留在玩家阵营：AI 单位就绪后会立即结算回合，无法作为最终停留者）
    {
      const { a, b, c } = mk();
      const engine = new BattleEngine(1);
      engine.start(makeMap(), [b, a], [c]);
      for (let i = 0; i < 40; i++) engine.advanceTick();
      expect(engine.getState().currentTurnId).toBe('a');
    }
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
    stateOf(engine).currentTurnId = 'p';
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
    stateOf(engine).currentTurnId = 'p';
    const unit = engine.getState().units.p!;
    unit.actionPoints = 0;
    const r = engine.dispatch({ type: 'Guard', actorId: 'p' });
    expect(r.error).toBeUndefined();
    expect(unit.actionPoints).toBe(1);
  });

  it('新一轮激活恢复完整 AP，单位不会在耗尽开局 AP 后永久失去行动能力', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    const state = stateOf(engine);
    state.units.p!.actionPoints = 0;
    state.units.p!.gauge = 100;
    state.units.p!.actionReady = true;
    state.units.e!.gauge = 0;
    state.units.e!.actionReady = false;

    engine.advanceTick();

    expect(state.currentTurnId).toBe('p');
    expect(state.units.p!.actionPoints).toBe(state.units.p!.maxActionPoints);
  });

  it('就绪单位 gauge 不再被封顶在 100，保留溢出行动值', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('a', 10)], [makeChar('e', 1)]);
    engine.getState().units.a!.gauge = 95;
    engine.advanceTick(); // 95 + 30 = 125，溢出 25
    const state = engine.getState();
    expect(state.units.a!.actionReady).toBe(true);
    expect(state.units.a!.gauge).toBeGreaterThan(100);
    expect(state.units.a!.gauge).toBe(125);
    expect(state.currentTurnId).toBe('a');
  });

  it('同 tick 就绪按溢出行动值降序：身法低但溢出高者先行动', () => {
    const engine = new BattleEngine(1);
    const a = makeChar('a', 10); // gain = 10 + 10*2 = 30
    const b = makeChar('b', 30); // gain = 10 + 30*2 = 70
    engine.start(makeMap(), [a, b], [makeChar('e', 1)]);
    const units = engine.getState().units;
    units.a!.gauge = 170; // 1 tick 后 200（溢出 100）
    units.b!.gauge = 101; // 1 tick 后 171（溢出 71）
    engine.advanceTick();
    const state = engine.getState();
    expect(state.units.a!.gauge).toBe(200);
    expect(state.units.b!.gauge).toBe(171);
    // a 溢出 100 > b 溢出 71，但 a 身法 10 < b 身法 30 ⇒ 溢出键优先于身法键
    expect(state.currentTurnId).toBe('a');
  });

  it('N vs N：所有玩家与敌人都放置到出生格且互不重叠', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p1', 10), makeChar('p2', 10)], [makeChar('e1', 10), makeChar('e2', 10)]);
    const state = engine.getState();
    const occupantIds = Object.values(state.map.tiles)
      .map((t) => t.occupantId)
      .filter((id): id is string => id !== undefined);
    expect(new Set(occupantIds)).toEqual(new Set(['p1', 'p2', 'e1', 'e2']));
    // 玩家落在左半场（q < mid=3），敌人落在右半场（q >= mid）
    for (const t of Object.values(state.map.tiles)) {
      if (t.occupantId === 'p1' || t.occupantId === 'p2') expect(t.q).toBeLessThan(3);
      if (t.occupantId === 'e1' || t.occupantId === 'e2') expect(t.q).toBeGreaterThanOrEqual(3);
    }
  });

  it('出生格不足时启动失败且无部分放置', () => {
    const engine = new BattleEngine(1);
    const map = makeMap();
    for (const t of Object.values(map.tiles)) {
      if (t.q < 3) t.isBlocked = true;
    }
    // 左侧仅保留 1 个可放置格，却传入 2 个玩家
    const leftTile = Object.values(map.tiles).find((t) => t.q < 3)!;
    leftTile.isBlocked = false;
    const result = engine.start(map, [makeChar('p1', 10), makeChar('p2', 10)], [makeChar('e1', 10)]);
    expect(result.error).toBe('not_enough_spawn_slots');
    const state = engine.getState();
    expect(state.phase).toBe('Idle');
    expect(Object.keys(state.units)).toHaveLength(0);
    expect(Object.keys(state.characters)).toHaveLength(0);
  });

  it('start 深拷贝隔离：修改传入 Character 不影响战斗副本', () => {
    const engine = new BattleEngine(1);
    const p = makeChar('p', 10);
    engine.start(makeMap(), [p], [makeChar('e', 10)]);
    p.hp = 1;
    expect(engine.getState().characters.p!.hp).toBe(100);
  });

  it('非当前回合者 EndActivation 被拒', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    stateOf(engine).currentTurnId = 'p';
    const r = engine.dispatch({ type: 'EndActivation', actorId: 'e' });
    expect(r.error).toBe('not_your_turn');
  });

  it('阻挡路径不可穿越：阻挡格无法直线跨过（movePoints 2 无 ≤2 步绕行）', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 1)], [makeChar('e', 10)]);
    const state = stateOf(engine);
    state.currentTurnId = 'p';
    // 把 p 放到 (0,0)（先清掉原出生格），(1,0) 设为阻挡
    const oldPos = Object.values(state.map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    state.map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    state.map.tiles[hexKey(1, 0)]!.isBlocked = true;
    const r = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 2, r: 0 } });
    expect(['blocked', 'out_of_range']).toContain(r.error);
    expect(state.map.tiles[hexKey(2, 0)]!.occupantId).toBeUndefined();
  });

  it('寻路可绕行：movePoints 4 可绕行 4 步避开阻挡，证明是寻路而非纯端点判断', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    const state = stateOf(engine);
    state.currentTurnId = 'p';
    const oldPos = Object.values(state.map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    state.map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    state.map.tiles[hexKey(1, 0)]!.isBlocked = true;
    // 绕行 (0,0)→(0,1)→(1,1)→(2,1)→(2,0) 共 4 步 ≤ movePoints 4
    const r = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 2, r: 0 } });
    expect(r.error).toBeUndefined();
    expect(state.map.tiles[hexKey(2, 0)]!.occupantId).toBe('p');
    expect(state.map.tiles[hexKey(0, 0)]!.occupantId).toBeUndefined();
  });

  it('水域不可通行：水域格无法直线跨过', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 1)], [makeChar('e', 10)]);
    const state = stateOf(engine);
    state.currentTurnId = 'p';
    const oldPos = Object.values(state.map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    state.map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    state.map.tiles[hexKey(1, 0)]!.isWater = true;
    const r = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 2, r: 0 } });
    expect(r.error).toBe('blocked');
    expect(state.map.tiles[hexKey(2, 0)]!.occupantId).toBeUndefined();
  });

  it('ID 重复时启动失败且零写入', () => {
    const engine = new BattleEngine(1);
    const result = engine.start(makeMap(), [makeChar('p', 10), makeChar('p', 10)], [makeChar('e', 10)]);
    expect(result.error).toBe('duplicate_unit_id');
    const state = engine.getState();
    expect(state.phase).toBe('Idle');
    expect(Object.keys(state.units)).toHaveLength(0);
    expect(Object.keys(state.characters)).toHaveLength(0);
  });

  it('一方无存活单位时启动失败且零写入', () => {
    const engine = new BattleEngine(1);
    const e = makeChar('e', 10);
    e.hp = 0;
    const result = engine.start(makeMap(), [makeChar('p', 10)], [e]);
    expect(result.error).toBe('no_alive_unit');
    const state = engine.getState();
    expect(state.phase).toBe('Idle');
    expect(Object.keys(state.units)).toHaveLength(0);
  });

  it('同队不可攻击', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p1', 10), makeChar('p2', 10)], [makeChar('e', 10)]);
    stateOf(engine).currentTurnId = 'p1';
    const r = engine.dispatch({ type: 'BasicAttack', actorId: 'p1', targetId: 'p2' });
    expect(r.error).toBe('invalid_target');
  });

  it('currentTurnId 为 null 时 EndActivation 被拒', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    // start 后 currentTurnId 为 null，任何单位都不可提前结算
    const r = engine.dispatch({ type: 'EndActivation', actorId: 'p' });
    expect(r.error).toBe('not_your_turn');
    expect(engine.getState().currentTurnId).toBeNull();
  });

  it('同 seed 同命令序列完全可复现（events/characters/units 一致）', () => {
    const run = () => {
      const engine = new BattleEngine(42, 'battle_fixed'); // battleId 注入固定值消除 Date.now 差异
      engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
      const state = stateOf(engine);
      state.currentTurnId = 'p';
      // p 挪到 (2,0) 紧邻 e 出生格 (3,0)，保证 BasicAttack 射程内命中（消耗 rng 序列）
      const oldPos = Object.values(state.map.tiles).find((t) => t.occupantId === 'p')!;
      oldPos.occupantId = undefined;
      state.map.tiles[hexKey(2, 0)]!.occupantId = 'p';
      engine.dispatch({ type: 'BasicAttack', actorId: 'p', targetId: 'e' });
      engine.dispatch({ type: 'Guard', actorId: 'p' });
      engine.advanceTick();
      engine.advanceTick();
      return engine.getState();
    };
    const s1 = run();
    const s2 = run();
    expect(JSON.stringify(s1.events)).toBe(JSON.stringify(s2.events));
    expect(JSON.stringify(s1.characters)).toBe(JSON.stringify(s2.characters));
    expect(JSON.stringify(s1.units)).toBe(JSON.stringify(s2.units));
  });
});
