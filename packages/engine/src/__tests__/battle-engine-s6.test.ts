import { describe, it, expect } from 'vitest';
import type { Character, HexBattleMap, BattleState, Skill, AtomicNode } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';
import { BattleEngine } from '../battle/battle-engine.js';
import { interpretSkill, interpretGeometry, interpretNumeric, interpretStatusHook, interpretTimeAtb, interpretTerrainMutate, makeAtomicContext } from '../battle/atomic/registry.js';
import { isAtomicFailure } from '../battle/atomic/types.js';
import type { AtomicContext } from '../battle/atomic/types.js';

function makeChar(id: string, opts: Partial<Pick<Character, 'hp' | 'maxHp' | 'ap' | 'spiritEnergy' | 'skills' | 'canFly' | 'realm'>> = {}): Character {
  return {
    id,
    name: id,
    gender: 'Male',
    realm: opts.realm ?? 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: opts.spiritEnergy ?? { current: 100, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: opts.hp ?? 100,
    maxHp: opts.maxHp ?? 100,
    ap: opts.ap ?? 3,
    canFly: opts.canFly ?? false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: opts.skills ?? [],
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

function stateOf(engine: BattleEngine): BattleState {
  return engine.getState() as BattleState;
}

/** 构造一个简单的攻击技能（用于测试） */
function makeAttackSkill(id: string, multiplier: number, range = 1): Skill {
  return {
    id,
    name: id,
    quality: 'Huang',
    type: 'Active',
    primitives: [
      { id: `g_${id}`, category: 'Geometry', params: { type: 'Single', range }, costBudget: 10 },
      { id: `n_${id}`, category: 'Numeric', params: { multiplier }, costBudget: 10 },
    ],
    cost: { ap: 1, spiritEnergy: 5 },
    cooldownTurns: 0,
  };
}

function makeContext(opts: {
  actor: Character;
  target: Character;
  units?: Record<string, any>;
  characters?: Record<string, Character>;
  map?: HexBattleMap;
}): AtomicContext {
  const map = opts.map ?? makeMap();
  return makeAtomicContext({
    actor: opts.actor,
    actorUnit: opts.units?.[opts.actor.id] ?? {
      characterId: opts.actor.id, team: 'Player', controller: 'Human',
      gauge: 0, actionReady: true, actionPoints: 3, maxActionPoints: 3,
      movePoints: 4, maxMovePoints: 4, statuses: [],
    },
    primaryTargetId: opts.target.id,
    map,
    units: opts.units ?? {
      [opts.actor.id]: {
        characterId: opts.actor.id, team: 'Player', controller: 'Human',
        gauge: 0, actionReady: true, actionPoints: 3, maxActionPoints: 3,
        movePoints: 4, maxMovePoints: 4, statuses: [],
      },
      [opts.target.id]: {
        characterId: opts.target.id, team: 'Enemy', controller: 'AI',
        gauge: 0, actionReady: true, actionPoints: 3, maxActionPoints: 3,
        movePoints: 4, maxMovePoints: 4, statuses: [],
      },
    },
    characters: opts.characters ?? { [opts.actor.id]: opts.actor, [opts.target.id]: opts.target },
    // 原子数值测试只验证伤害结构；固定命中随机源，避免基础闪避率让断言偶发为 0。
    rng: () => 0.5,
    turnNumber: 1,
    element: 'Physical',
    tier: 1,
  });
}

// ============================================================
// 一、五类原子解释器单元测试
// ============================================================
describe('原子解释器（S6）', () => {
  describe('Geometry', () => {
    it('Single 形状只产出主目标', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 'g1', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 };
      const ctx = makeContext({ actor, target });
      const r = interpretGeometry(node, ctx);
      expect(isAtomicFailure(r)).toBe(false);
      if (!isAtomicFailure(r)) {
        expect(r.appliedTo).toEqual(['t']);
      }
    });

    it('Self 形状只产出施法者', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 'g1', category: 'Geometry', params: { type: 'Self' }, costBudget: 10 };
      const ctx = makeContext({ actor, target });
      const r = interpretGeometry(node, ctx);
      if (!isAtomicFailure(r)) {
        expect(r.appliedTo).toEqual(['a']);
      }
    });

    it('AOE 形状产出主目标 + 半径内的敌方单位', () => {
      const actor = makeChar('a');
      const t1 = makeChar('t1');
      const t2 = makeChar('t2');
      // t1 在 (3,3)，t2 在 (3,4)（距离 1），actor 在 (0,0)
      const map = makeMap();
      map.tiles[hexKey(3, 3)]!.occupantId = 't1';
      map.tiles[hexKey(3, 4)]!.occupantId = 't2';
      const ctx = makeContext({ actor, target: t1, characters: { a: actor, t1, t2 }, map });
      const node: AtomicNode = { id: 'g1', category: 'Geometry', params: { type: 'AOE', range: 5, radius: 1 }, costBudget: 15 };
      const r = interpretGeometry(node, ctx);
      if (!isAtomicFailure(r)) {
        expect(r.appliedTo).toContain('t1');
        expect(r.appliedTo).toContain('t2');
      }
    });
  });

  describe('Numeric', () => {
    it('multiplier 原子对目标造成伤害', () => {
      const actor = makeChar('a');
      const target = makeChar('t', { hp: 100 });
      const node: AtomicNode = { id: 'n1', category: 'Numeric', params: { multiplier: 2.0 }, costBudget: 10 };
      const ctx = makeContext({ actor, target });
      const r = interpretNumeric(node, ctx, ['t']);
      expect(isAtomicFailure(r)).toBe(false);
      if (!isAtomicFailure(r)) {
        expect(r.numericApps).toHaveLength(1);
        expect(r.numericApps[0]!.targetId).toBe('t');
        expect(r.numericApps[0]!.hpDelta).toBeGreaterThan(0);
      }
    });

    it('heal 原子治疗目标', () => {
      const actor = makeChar('a');
      const target = makeChar('t', { hp: 30, maxHp: 100 });
      const node: AtomicNode = { id: 'n1', category: 'Numeric', params: { heal: 0.5 }, costBudget: 12 };
      const ctx = makeContext({ actor, target });
      const r = interpretNumeric(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        expect(r.numericApps[0]!.hpDelta).toBeLessThan(0); // 负数 = 治疗
      }
    });

    it('shieldValue 原子产出护盾 application', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 'n1', category: 'Numeric', params: { shieldValue: 30 }, costBudget: 12 };
      const ctx = makeContext({ actor, target });
      const r = interpretNumeric(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        expect(r.numericApps[0]!.shieldGain).toBe(30);
      }
    });
  });

  describe('StatusHook', () => {
    it('施加 Burn 状态到目标', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 's1', category: 'StatusHook', params: { status: 'Burn', duration: 2 }, costBudget: 8 };
      const ctx = makeContext({ actor, target });
      const r = interpretStatusHook(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        expect(r.statusApps).toHaveLength(1);
        expect(r.statusApps[0]!.status.type).toBe('Burn');
        expect(r.statusApps[0]!.status.remainingTurns).toBe(2);
      }
    });

    it('归并 Frozen → Freeze', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 's1', category: 'StatusHook', params: { status: 'Frozen', duration: 1 }, costBudget: 10 };
      const ctx = makeContext({ actor, target });
      const r = interpretStatusHook(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        expect(r.statusApps[0]!.status.type).toBe('Freeze');
      }
    });

    it('被动状态（ArmorPassive）不产出 application', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 's1', category: 'StatusHook', params: { status: 'ArmorPassive', duration: 0 }, costBudget: 10 };
      const ctx = makeContext({ actor, target });
      const r = interpretStatusHook(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        expect(r.statusApps).toHaveLength(0);
      }
    });

    it('缺 status 参数返回失败', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 's1', category: 'StatusHook', params: {}, costBudget: 8 };
      const ctx = makeContext({ actor, target });
      const r = interpretStatusHook(node, ctx, ['t']);
      expect(isAtomicFailure(r)).toBe(true);
    });
  });

  describe('TimeATB', () => {
    it('攻击技能：对目标 gauge 减益', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 't1', category: 'TimeATB', params: { atbCost: 50 }, costBudget: 6 };
      const ctx = makeContext({ actor, target });
      const r = interpretTimeAtb(node, ctx, ['t'], false);
      if (!isAtomicFailure(r)) {
        expect(r.atbApps[0]!.gaugeDelta).toBe(-50);
      }
    });

    it('辅助技能：对施法者 gauge 加速', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 't1', category: 'TimeATB', params: { atbCost: 30 }, costBudget: 6 };
      const ctx = makeContext({ actor, target });
      const r = interpretTimeAtb(node, ctx, ['t'], true);
      if (!isAtomicFailure(r)) {
        expect(r.atbApps[0]!.targetId).toBe('a');
        expect(r.atbApps[0]!.gaugeDelta).toBe(30);
      }
    });

    it('缺 atbCost 返回失败', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 't1', category: 'TimeATB', params: {}, costBudget: 6 };
      const ctx = makeContext({ actor, target });
      const r = interpretTimeAtb(node, ctx, ['t'], false);
      expect(isAtomicFailure(r)).toBe(true);
    });
  });

  describe('TerrainMutate', () => {
    it('Fire 地形改造为 Lava', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const map = makeMap();
      map.tiles[hexKey(3, 3)]!.occupantId = 't';
      const ctx = makeContext({ actor, target, map });
      const node: AtomicNode = { id: 'tm1', category: 'TerrainMutate', params: { terrain: 'Fire' }, costBudget: 8 };
      const r = interpretTerrainMutate(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        expect(r.mutatedTiles.length).toBeGreaterThan(0);
        // 检查周围格确实被改成 Lava
        const changedTile = map.tiles[hexKey(3, 4)]!;
        expect(changedTile.terrain).toBe('Lava');
      }
    });

    it('Meteor 地形改造为 Obstacle', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const map = makeMap();
      map.tiles[hexKey(3, 3)]!.occupantId = 't';
      const ctx = makeContext({ actor, target, map });
      const node: AtomicNode = { id: 'tm1', category: 'TerrainMutate', params: { terrain: 'Meteor' }, costBudget: 10 };
      const r = interpretTerrainMutate(node, ctx, ['t']);
      if (!isAtomicFailure(r)) {
        const changedTile = map.tiles[hexKey(3, 4)]!;
        expect(changedTile.terrain).toBe('Obstacle');
        expect(changedTile.isBlocked).toBe(true);
      }
    });

    it('缺 terrain 返回失败', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const node: AtomicNode = { id: 'tm1', category: 'TerrainMutate', params: {}, costBudget: 8 };
      const ctx = makeContext({ actor, target });
      const r = interpretTerrainMutate(node, ctx, ['t']);
      expect(isAtomicFailure(r)).toBe(true);
    });
  });

  describe('interpretSkill 统一入口', () => {
    it('解释完整技能：Geometry + Numeric + StatusHook 三原子合并', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const skill: Skill = {
        id: 'fire_burn',
        name: '灼烧',
        quality: 'Xuan',
        type: 'Active',
        primitives: [
          { id: 'g1', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
          { id: 'n1', category: 'Numeric', params: { multiplier: 1.5 }, costBudget: 10 },
          { id: 's1', category: 'StatusHook', params: { status: 'Burn', duration: 2 }, costBudget: 8 },
        ],
        cost: { ap: 1, spiritEnergy: 8 },
        cooldownTurns: 1,
      };
      const ctx = makeContext({ actor, target });
      const outcome = interpretSkill(skill, ctx);
      expect(isAtomicFailure(outcome)).toBe(false);
      if (!isAtomicFailure(outcome)) {
        expect(outcome.appliedTo).toContain('t');
        expect(outcome.numericApps.length).toBeGreaterThan(0);
        expect(outcome.statusApps.length).toBeGreaterThan(0);
        expect(outcome.statusApps[0]!.status.type).toBe('Burn');
      }
    });

    it('未知 category 原子返回失败', () => {
      const actor = makeChar('a');
      const target = makeChar('t');
      const skill: Skill = {
        id: 'bad',
        name: '坏技能',
        quality: 'Huang',
        type: 'Active',
        primitives: [
          { id: 'g1', category: 'Geometry', params: { type: 'Single', range: 1 }, costBudget: 10 },
          { id: 'u1', category: 'Unknown' as any, params: {}, costBudget: 10 },
        ],
        cost: { ap: 1, spiritEnergy: 1 },
        cooldownTurns: 0,
      };
      const ctx = makeContext({ actor, target });
      const outcome = interpretSkill(skill, ctx);
      expect(isAtomicFailure(outcome)).toBe(true);
    });
  });
});

// ============================================================
// 二、BattleEngine 端到端：UseSkill/Flee/场景规则/状态 tick
// ============================================================
describe('BattleEngine S6 新功能', () => {
  it('UseSkill 命令：施放技能后扣 AP/灵力，目标扣血', () => {
    const skill = makeAttackSkill('fire', 2.0, 1);
    const p = makeChar('p', { skills: [skill] });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    // p 挪到 e 旁边（距离 1）
    const oldPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    const ePos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'e')!;
    const adjacent = Object.values(stateOf(engine).map.tiles).find(
      (t) => !t.occupantId && Math.abs(t.q - ePos.q) + Math.abs(t.r - ePos.r) === 1,
    )!;
    adjacent.occupantId = 'p';
    const eHpBefore = stateOf(engine).characters.e!.hp;
    const pApBefore = stateOf(engine).units.p!.actionPoints;
    const pSpiritBefore = stateOf(engine).characters.p!.spiritEnergy.current;

    const r = engine.dispatch({ type: 'UseSkill', actorId: 'p', skillId: 'fire', targetId: 'e' });
    expect(r.error).toBeUndefined();
    expect(stateOf(engine).characters.e!.hp).toBeLessThan(eHpBefore);
    expect(stateOf(engine).units.p!.actionPoints).toBe(pApBefore - 1);
    expect(stateOf(engine).characters.p!.spiritEnergy.current).toBe(pSpiritBefore - 5);
  });

  it('UseSkill 命令：灵力不足拒绝', () => {
    const skill = makeAttackSkill('fire', 2.0, 1);
    const p = makeChar('p', { skills: [skill], spiritEnergy: { current: 2, max: 100 } });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    const r = engine.dispatch({ type: 'UseSkill', actorId: 'p', skillId: 'fire', targetId: 'e' });
    expect(r.error).toBe('no_spirit_energy');
  });

  it('UseSkill 命令：技能冷却中拒绝', () => {
    const skill = makeAttackSkill('fire', 2.0, 1);
    skill.cooldownTurns = 2;
    const p = makeChar('p', { skills: [skill] });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    stateOf(engine).characters.p!.skillCooldowns['fire'] = 2;
    const r = engine.dispatch({ type: 'UseSkill', actorId: 'p', skillId: 'fire', targetId: 'e' });
    expect(r.error).toBe('skill_on_cooldown');
  });

  it('UseSkill 命令：射程外拒绝', () => {
    const skill = makeAttackSkill('fire', 2.0, 1); // 射程 1
    const p = makeChar('p', { skills: [skill] });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    // p 和 e 都在初始位置（相距较远）
    const r = engine.dispatch({ type: 'UseSkill', actorId: 'p', skillId: 'fire', targetId: 'e' });
    expect(r.error).toBe('out_of_range');
  });

  it('Flee 命令：成功时战斗结束 fled=true', () => {
    const p = makeChar('p');
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    // 玩家放边缘 (0,0) 提高逃跑成功率
    const oldPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    stateOf(engine).map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    // 跑多次直到看到 success
    let fled = false;
    for (let i = 0; i < 100; i++) {
      const engine2 = new BattleEngine(i);
      engine2.start(makeMap(), [p], [e]);
      stateOf(engine2).currentTurnId = 'p';
      const oldPos2 = Object.values(stateOf(engine2).map.tiles).find((t) => t.occupantId === 'p')!;
      oldPos2.occupantId = undefined;
      stateOf(engine2).map.tiles[hexKey(0, 0)]!.occupantId = 'p';
      const r = engine2.dispatch({ type: 'Flee', actorId: 'p' });
      if (r.error === undefined && stateOf(engine2).fled === true) {
        fled = true;
        expect(stateOf(engine2).phase).toBe('BattleEnd');
        break;
      }
    }
    expect(fled).toBe(true);
  });

  it('Flee 命令：场景禁用逃跑时拒绝', () => {
    const p = makeChar('p');
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e], { fleeEnabled: false });
    stateOf(engine).currentTurnId = 'p';
    const r = engine.dispatch({ type: 'Flee', actorId: 'p' });
    expect(r.error).toBe('flee_disabled');
  });

  it('场景规则：canFly 单位可越水', () => {
    const p = makeChar('p', { canFly: true });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    // p 放在 (0,0)，目标格 (1,0) 设为水域
    const oldPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    stateOf(engine).map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    stateOf(engine).map.tiles[hexKey(1, 0)]!.isWater = true;
    const r = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 1, r: 0 } });
    expect(r.error).toBeUndefined(); // canFly 可以越水
  });

  it('场景规则：非 canFly 单位不可越水', () => {
    const p = makeChar('p', { canFly: false });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    const oldPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    stateOf(engine).map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    stateOf(engine).map.tiles[hexKey(1, 0)]!.isWater = true;
    const r = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 1, r: 0 } });
    expect(r.error).toBe('water_impassable');
  });

  it('场景规则：requireRevealed 时未揭示格不可进入', () => {
    const p = makeChar('p');
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e], { requireRevealed: true });
    stateOf(engine).currentTurnId = 'p';
    const oldPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'p')!;
    oldPos.occupantId = undefined;
    stateOf(engine).map.tiles[hexKey(0, 0)]!.occupantId = 'p';
    stateOf(engine).map.tiles[hexKey(1, 0)]!.isRevealed = false;
    const r = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 1, r: 0 } });
    expect(r.error).toBe('not_revealed');
  });

  it('状态 tick：Burn 在回合结束时扣血', () => {
    const p = makeChar('p', { hp: 100 });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    // 手动给 p 加 Burn 状态（potency 10，持续 2 回合）
    stateOf(engine).units.p!.statuses.push({
      id: 'burn1', type: 'Burn', potency: 10, remainingTurns: 2, sourceId: 'e',
    });
    const hpBefore = stateOf(engine).characters.p!.hp;
    engine.dispatch({ type: 'EndActivation', actorId: 'p' });
    expect(stateOf(engine).characters.p!.hp).toBeLessThan(hpBefore);
  });

  it('状态 tick：Regen 在回合结束时回血', () => {
    const p = makeChar('p', { hp: 30, maxHp: 100 });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    stateOf(engine).units.p!.statuses.push({
      id: 'regen1', type: 'Regen', potency: 10, remainingTurns: 3, sourceId: 'p',
    });
    const hpBefore = stateOf(engine).characters.p!.hp;
    engine.dispatch({ type: 'EndActivation', actorId: 'p' });
    expect(stateOf(engine).characters.p!.hp).toBeGreaterThan(hpBefore);
  });

  it('状态 tick：duration 归零时状态移除', () => {
    const p = makeChar('p', { hp: 100 });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    stateOf(engine).units.p!.statuses.push({
      id: 'burn1', type: 'Burn', potency: 10, remainingTurns: 1, sourceId: 'e',
    });
    engine.dispatch({ type: 'EndActivation', actorId: 'p' });
    expect(stateOf(engine).units.p!.statuses).toHaveLength(0);
  });

  it('同 seed 同命令序列完全可复现（含 UseSkill）', () => {
    const skill = makeAttackSkill('fire', 2.0, 1);
    const run = () => {
      const p = makeChar('p', { skills: [skill] });
      const e = makeChar('e');
      const engine = new BattleEngine(42, 'battle_fixed');
      engine.start(makeMap(), [p], [e]);
      const state = stateOf(engine);
      state.currentTurnId = 'p';
      // p 挪到 e 旁边
      const oldPos = Object.values(state.map.tiles).find((t) => t.occupantId === 'p')!;
      oldPos.occupantId = undefined;
      const ePos = Object.values(state.map.tiles).find((t) => t.occupantId === 'e')!;
      const adjacent = Object.values(state.map.tiles).find(
        (t) => !t.occupantId && Math.abs(t.q - ePos.q) + Math.abs(t.r - ePos.r) === 1,
      )!;
      adjacent.occupantId = 'p';
      engine.dispatch({ type: 'UseSkill', actorId: 'p', skillId: 'fire', targetId: 'e' });
      return engine.getState();
    };
    const s1 = run();
    const s2 = run();
    expect(JSON.stringify(s1.events)).toBe(JSON.stringify(s2.events));
    expect(JSON.stringify(s1.characters)).toBe(JSON.stringify(s2.characters));
    expect(JSON.stringify(s1.units)).toBe(JSON.stringify(s2.units));
  });

  it('Shield 状态抵消伤害', () => {
    const p = makeChar('p', { hp: 100 });
    const e = makeChar('e');
    const engine = new BattleEngine(42);
    engine.start(makeMap(), [p], [e]);
    stateOf(engine).currentTurnId = 'p';
    // 给 p 加 Shield 状态
    stateOf(engine).units.p!.statuses.push({
      id: 'shield1', type: 'Shield', potency: 50, remainingTurns: 2, sourceId: 'p',
    });
    // 让 e 攻击 p（需要先把 currentTurnId 切到 e）
    stateOf(engine).currentTurnId = 'e';
    const oldPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'e')!;
    oldPos.occupantId = undefined;
    const pPos = Object.values(stateOf(engine).map.tiles).find((t) => t.occupantId === 'p')!;
    const adjacent = Object.values(stateOf(engine).map.tiles).find(
      (t) => !t.occupantId && Math.abs(t.q - pPos.q) + Math.abs(t.r - pPos.r) === 1,
    )!;
    adjacent.occupantId = 'e';
    const hpBefore = stateOf(engine).characters.p!.hp;
    engine.dispatch({ type: 'BasicAttack', actorId: 'e', targetId: 'p' });
    // 伤害应该被 Shield 部分或全部抵消
    const damage = hpBefore - stateOf(engine).characters.p!.hp;
    // 由于 Shield 50，普攻伤害应该被显著降低（甚至为 0）
    expect(damage).toBeLessThanOrEqual(50);
  });
});
