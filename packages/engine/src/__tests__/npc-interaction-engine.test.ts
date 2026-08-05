import { describe, it, expect } from 'vitest';
import { NPCInteractionEngine } from '../interaction/npc-interaction-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 1000, maxExp: 2000 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 5, agility: 5, luck: 5, charm: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

function makeNPC(id: string, overrides: Partial<Character> = {}): Character {
  return makePlayer({ id, name: 'NPC', ...overrides });
}

describe('NPCInteractionEngine', () => {
  it('论道根据悟性获得修为', () => {
    const player = makePlayer();
    const npc = makeNPC('N1');
    const result = NPCInteractionEngine.discuss(player, npc);
    expect(result.expGained).toBeGreaterThan(0);
    expect(result.favorabilityChange).toBe(3);
  });

  it('切磋成功增加好感度', () => {
    const player = makePlayer();
    const npc = makeNPC('N2');
    const result = NPCInteractionEngine.duel(player, npc, true);
    expect(result.favorabilityChange).toBe(5);
    expect(result.triggerBattle).toBe(true);
  });

  it('交易受好感度影响价格', () => {
    const player = makePlayer({
      relations: { 'N3': { targetId: 'N3', favorability: 100, hatred: 0, jealousy: 0, tags: [] } },
    });
    const mult = NPCInteractionEngine.getPriceMultiplier(player, 'N3');
    expect(mult).toBe(0.5);
  });

  it('无好感度时价格为 100%', () => {
    const player = makePlayer();
    const mult = NPCInteractionEngine.getPriceMultiplier(player, 'N_UNKNOWN');
    expect(mult).toBe(1.0);
  });
});

describe('NPCInteractionEngine recipe unlock', () => {
  it('论道有概率解锁配方（模拟多次必触发）', () => {
    let unlocked = false;
    for (let i = 0; i < 100; i++) {
      const player = makePlayer();
      const npc = makeNPC('N1');
      const result = NPCInteractionEngine.discuss(player, npc);
      if (result.unlockedRecipe) {
        unlocked = true;
        expect(typeof result.unlockedRecipe).toBe('string');
        break;
      }
    }
    // 100 次 20% 概率，几乎不可能不触发
    expect(unlocked).toBe(true);
  });

  it('切磋胜利有概率解锁配方', () => {
    let unlocked = false;
    for (let i = 0; i < 100; i++) {
      const player = makePlayer();
      const npc = makeNPC('N2');
      const result = NPCInteractionEngine.duel(player, npc, true);
      if (result.unlockedRecipe) {
        unlocked = true;
        break;
      }
    }
    expect(unlocked).toBe(true);
  });

  it('切磋失败不解锁配方', () => {
    for (let i = 0; i < 50; i++) {
      const player = makePlayer();
      const npc = makeNPC('N3');
      const result = NPCInteractionEngine.duel(player, npc, false);
      expect(result.unlockedRecipe).toBeUndefined();
    }
  });

  it('已解锁全部配方时不再授予', () => {
    for (let i = 0; i < 50; i++) {
      const player = makePlayer({ unlockedRecipes: ['RECIPE_FOUNDATION_PILL', 'RECIPE_QI_PILL', 'RECIPE_LONGEVITY_PILL', 'RECIPE_SPIRIT_SWORD', 'RECIPE_SPIRIT_ARMOR', 'RECIPE_STAR_SWORD'] });
      const npc = makeNPC('N4');
      const result = NPCInteractionEngine.discuss(player, npc);
      expect(result.unlockedRecipe).toBeUndefined();
    }
  });
});
