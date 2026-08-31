// ============================================================
// useBattleEngine 单元测试（S7-P5）
// 验证新引擎 UI adapter 的基础动作能正常工作
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import type { Character, HexBattleMap, HexTile, Skill } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';
import { useBattleEngine } from '../useBattleEngine';

function makeCharacter(id: string, opts: { hp?: number; maxHp?: number; ap?: number } = {}): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: opts.hp ?? 100, maxHp: opts.maxHp ?? 100, ap: opts.ap ?? 3, canFly: false,
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

describe('useBattleEngine (S7)', () => {
  let scope: ReturnType<typeof effectScope>;
  let combat: ReturnType<typeof useBattleEngine>;

  beforeEach(() => {
    scope = effectScope();
    scope.run(() => {
      const p = makeCharacter('p');
      const e = makeCharacter('e');
      combat = useBattleEngine(makeMap(), 'p', p, [e]);
    });
  });

  afterEach(() => { scope.stop(); });

  it('start 后 state 已初始化（含 units/characters/map）', () => {
    expect(combat.state.characters.p).toBeDefined();
    expect(combat.state.characters.e).toBeDefined();
    expect(combat.state.map).toBeDefined();
  });

  it('普攻：玩家回合攻击敌人，敌人扣血', () => {
    // 找到玩家和敌人的位置，把它们挪到相邻
    const map = combat.state.map;
    let pPos: { q: number; r: number } | null = null;
    let ePos: { q: number; r: number } | null = null;
    for (const t of Object.values(map.tiles)) {
      if (t.occupantId === 'p') pPos = { q: t.q, r: t.r };
      if (t.occupantId === 'e') ePos = { q: t.q, r: t.r };
    }
    expect(pPos).not.toBeNull();
    expect(ePos).not.toBeNull();
    // 手动移动让 p/e 相邻
    if (pPos && ePos) {
      const dist = Math.abs(pPos.q - ePos.q) + Math.abs(pPos.r - ePos.r);
      if (dist > 1) {
        // 把 e 挪到 p 旁边
        const oldTile = map.tiles[hexKey(ePos.q, ePos.r)]!;
      oldTile.occupantId = undefined;
      const newKey = hexKey(pPos.q + 1, pPos.r);
      if (map.tiles[newKey] && !map.tiles[newKey]!.occupantId) {
        map.tiles[newKey]!.occupantId = 'e';
        }
      }
    }
    combat._forcePlayerActivationForTest();
    const apBefore = combat.state.characters.p!.ap;
    const hpBefore = combat.state.characters.e!.hp;
    const result = combat.basicAttack('e');
    expect(result).not.toBeNull();
    expect(combat.state.characters.p!.ap).toBe(apBefore - 1);
    expect(combat.state.characters.p!.ap).toBe(combat.state.engine!.getState().units.p!.actionPoints);
    // 普攻伤害 > 0（除非随机闪避）
    if (!result!.missed) {
      expect(combat.state.characters.e!.hp).toBeLessThan(hpBefore);
    }
  });

  it('移动：合法格移动成功', () => {
    combat._forcePlayerActivationForTest();
    // 找玩家位置
    const map = combat.state.map;
    let pPos: { q: number; r: number } | null = null;
    for (const t of Object.values(map.tiles)) {
      if (t.occupantId === 'p') { pPos = { q: t.q, r: t.r }; break; }
    }
    expect(pPos).not.toBeNull();
    if (!pPos) return;
    // 找一个相邻空格
    const candidates = [
      { q: pPos.q + 1, r: pPos.r },
      { q: pPos.q, r: pPos.r + 1 },
      { q: pPos.q - 1, r: pPos.r },
      { q: pPos.q, r: pPos.r - 1 },
    ];
    const validTarget = candidates.find((c) => {
      const t = map.tiles[hexKey(c.q, c.r)];
      return t && !t.occupantId && !t.isBlocked;
    });
    expect(validTarget).toBeDefined();
    if (validTarget) {
      const ok = combat.movePlayer(validTarget.q, validTarget.r);
      expect(ok).toBe(true);
      // 玩家位置已更新
      const newTile = map.tiles[hexKey(validTarget.q, validTarget.r)]!;
      expect(newTile.occupantId).toBe('p');
    }
  });

  it('防御：执行后不报错', () => {
    combat._forcePlayerActivationForTest();
    combat.defend();
    // 防御指令本身不抛错即通过
    expect(combat.state.characters.p).toBeDefined();
  });

  it('技能：选择技能后进入 targeting 相位', () => {
    const skill: Skill = {
      id: 'fire', name: '火球', quality: 'Huang', type: 'Active',
      primitives: [], cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 0,
    };
    combat.selectSkill(skill);
    expect(combat.state.selectedSkill?.id).toBe(skill.id);
  });

  it('endTurn：玩家回合调用后清 currentTurn', () => {
    combat._forcePlayerActivationForTest();
    combat.endTurn();
    // 引擎内部 currentTurnId 清掉后，镜像也应为 null
    expect(combat.state.currentTurn).toBeNull();
  });
});
