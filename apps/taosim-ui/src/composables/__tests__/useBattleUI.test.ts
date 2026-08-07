import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import type { Character, HexBattleMap, HexTile, Skill } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';
import { useCombat } from '../useCombat';
import { useBattleUI } from '../useBattleUI';

function makeCharacter(id: string): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
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

const skill: Skill = {
  id: 's1', name: '火焰掌', quality: 'Huang', type: 'Active',
  primitives: [], cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 0,
};

describe('useBattleUI 状态机', () => {
  let scope: ReturnType<typeof effectScope>;
  let combat: ReturnType<typeof useCombat>;
  let ui: ReturnType<typeof useBattleUI>;

  beforeEach(() => {
    scope = effectScope();
    scope.run(() => {
      combat = useCombat(makeMap(), 'p', makeCharacter('p'), [makeCharacter('e')]);
      combat.state.engine!.placeCharacter('p', 1, 1);
      combat.state.engine!.placeCharacter('e', 1, 2);
      ui = useBattleUI(combat, 'p');
    });
  });

  afterEach(() => { scope.stop(); });

  it('非玩家回合 phase=idle；轮到玩家自动进入 command', async () => {
    expect(ui.phase.value).toBe('idle');
    combat.state.currentTurn = 'p';
    await nextTick();
    expect(ui.phase.value).toBe('command');
  });

  it('openAttack 进入 targeting-attack 并高亮射程内敌人', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openAttack();
    expect(ui.phase.value).toBe('targeting-attack');
    expect(ui.attackRange.value).toEqual([{ q: 1, r: 2, characterId: 'e' }]);
  });

  it('targeting-attack 点击敌人格 → 普攻结算、产生伤害飘字、回 idle', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openAttack();
    ui.onTileClick(1, 2);
    await nextTick();
    expect(combat.state.characters['e']!.hp).toBe(95);
    expect(ui.phase.value).toBe('idle');
    expect(ui.floatingTexts.value.length).toBe(1);
    expect(ui.floatingTexts.value[0]!.text).toBe('-5');
    expect(ui.floatingTexts.value[0]!.q).toBe(1);
    expect(ui.floatingTexts.value[0]!.r).toBe(2);
  });

  it('targeting-attack 点击空地 → info 飘字提示，不退出选择状态', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openAttack();
    ui.onTileClick(5, 5);
    await nextTick();
    expect(ui.phase.value).toBe('targeting-attack');
    expect(ui.floatingTexts.value[0]!.kind).toBe('info');
  });

  it('cancel：targeting/moving 取消回 command', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openAttack();
    ui.cancel();
    expect(ui.phase.value).toBe('command');
    ui.openMove();
    ui.cancel();
    expect(ui.phase.value).toBe('command');
  });

  it('openMove 高亮可达格并点击移动；移动不结束回合', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    combat.state.movePoints = 3; // 模拟回合开始 beginTurn 已初始化移动池
    ui.openMove();
    expect(ui.moveRange.value.length).toBe(16);
    ui.onTileClick(1, 3); // 直线距离 2，但 (1,2) 被占，BFS 路径绕行需 3 步
    await nextTick();
    expect(combat.state.engine!.findCharacterPosition('p')).toEqual({ q: 1, r: 3 });
    expect(ui.phase.value).toBe('command'); // 不结束回合
    expect(combat.state.currentTurn).toBe('p');
  });

  it('openMove 点击不可达格 → info 飘字，不移动', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openMove();
    ui.onTileClick(5, 5);
    await nextTick();
    expect(combat.state.engine!.findCharacterPosition('p')).toEqual({ q: 1, r: 1 });
    expect(ui.floatingTexts.value[0]!.kind).toBe('info');
  });

  it('openSkill 进入 targeting-skill；点击射程内敌人结算技能', async () => {
    combat.state.characters['e']!.hp = 100;
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openSkill(skill);
    expect(ui.phase.value).toBe('targeting-skill');
    expect(ui.selectedSkill.value?.id).toBe('s1');
    ui.onTileClick(1, 2);
    await nextTick();
    expect(ui.phase.value).toBe('idle');
    expect(ui.floatingTexts.value.length).toBe(1); // 技能伤害飘字
  });

  it('defendCmd 回 1 AP 并回 idle；endTurnCmd 直接结束回合', async () => {
    combat.state.characters['p']!.ap = 1;
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.defendCmd();
    await nextTick();
    expect(combat.state.characters['p']!.ap).toBe(2);
    expect(ui.phase.value).toBe('idle');
    expect(combat.state.currentTurn).toBeNull();

    // endTurnCmd：重置为玩家回合进入 command 后直接结束
    combat.state.currentTurn = 'p';
    await nextTick();
    expect(ui.phase.value).toBe('command');
    ui.endTurnCmd();
    await nextTick();
    expect(ui.phase.value).toBe('idle');
    expect(combat.state.currentTurn).toBeNull();
  });

  it('removeFloatingText 从队列移除指定飘字', async () => {
    combat.state.currentTurn = 'p';
    await nextTick();
    ui.openAttack();
    ui.onTileClick(1, 2);
    await nextTick();
    const id = ui.floatingTexts.value[0]!.id;
    ui.removeFloatingText(id);
    await nextTick();
    expect(ui.floatingTexts.value.length).toBe(0);
  });
});
