import { describe, it, expect, vi, afterEach } from 'vitest';
import { TribulationEngine } from '../tribulation/tribulation-engine.js';
import type { RealmBreakthroughConfig, Character } from '@taosim/contracts';

const TIER1_CONFIG: RealmBreakthroughConfig = {
  fromRealm: 'QiRefinement_9',
  toRealm: 'Foundation_1',
  tier: 1,
  requirements: { expThreshold: 1000, requiredItems: ['FoundationPill'] },
  simpleModeSuccessRate: 0.85,
};

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test', name: '渡劫者', gender: 'Male', realm: 'QiRefinement_9', soulState: 'Active',
    cultivation: { currentExp: 1200, maxExp: 1200 },
    lifespan: { age: 40, maxLifespan: 100 },
    spiritEnergy: { current: 200, max: 200 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 5, charm: 5 },
    hp: 300, maxHp: 300, ap: 3, canFly: false,
    spiritStones: 0,
    inventory: [{ item: { id: 'FoundationPill', name: '筑基丹', tier: 2, type: 'Medicine', attributes: {} }, count: 1 }],
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

describe('TribulationEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('修为不足时无法渡劫', () => {
    const c = makeChar({ cultivation: { currentExp: 500, maxExp: 1200 } });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('修为不足');
  });

  it('缺少筑基丹时仍可尝试渡劫（成功率降低）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // 必定失败
    const c = makeChar({ inventory: [] });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('成功率');
  });

  it('渡劫成功后境界提升，寿元增加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100, charm: 5 },
    });
    const oldLifespan = c.lifespan.maxLifespan;
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    expect(result.success).toBe(true);
    if (result.updatedCharacter) {
      expect(result.updatedCharacter.realm).toBe('Foundation_1');
      expect(result.updatedCharacter.lifespan.maxLifespan).toBeGreaterThan(oldLifespan);
    }
  });

  it('渡劫失败不提升境界', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const c = makeChar({
      attributes: { physique: 1, comprehension: 1, perception: 1, agility: 1, luck: 1, charm: 5 },
    });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    expect(result.success).toBe(false);
  });

  it('渡劫成功消耗筑基丹', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100, charm: 5 },
    });
    expect(c.inventory.find(s => s.item.id === 'FoundationPill')!.count).toBe(1);
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    if (result.success && result.updatedCharacter) {
      const pill = result.updatedCharacter.inventory.find(s => s.item.id === 'FoundationPill');
      expect(pill?.count ?? 0).toBe(0);
    }
  });

  it('渡劫成功后 canFly 变为 true (筑基可飞行)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100, charm: 5 },
    });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    if (result.updatedCharacter) {
      expect(result.updatedCharacter.canFly).toBe(true);
    }
  });

  // ---- Tier 2: 筑基 → 金丹 ----
  it('Tier2 筑基突破到金丹', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      realm: 'Foundation_3',
      cultivation: { currentExp: 6000, maxExp: 6000 },
      lifespan: { age: 50, maxLifespan: 200 },
      hp: 600, maxHp: 600,
      inventory: [{ item: { id: 'GoldenCorePill', name: '金元丹', tier: 3, type: 'Medicine', attributes: {} }, count: 1 }],
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100, charm: 5 },
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.70,
      postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
    });
    expect(result.success).toBe(true);
    expect(result.updatedCharacter?.realm).toBe('GoldenCore_1');
    expect(result.updatedCharacter?.lifespan.maxLifespan).toBe(400);
  });

  it('Tier2 修为不足无法突破', () => {
    const c = makeChar({
      realm: 'Foundation_3',
      cultivation: { currentExp: 3000, maxExp: 6000 },
      inventory: [{ item: { id: 'GoldenCorePill', name: '金元丹', tier: 3, type: 'Medicine', attributes: {} }, count: 1 }],
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.70,
      postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
    });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('修为不足');
  });

  it('Tier2 缺少金元丹仍可尝试（成功率降低）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // 必定失败
    const c = makeChar({
      realm: 'Foundation_3',
      cultivation: { currentExp: 6000, maxExp: 6000 },
      inventory: [],
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.70,
      postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
    });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('成功率');
  });

  // ---- Tier 3: 金丹 → 元婴 ----
  it('Tier3 金丹突破到元婴', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      realm: 'GoldenCore_3',
      cultivation: { currentExp: 25000, maxExp: 25000 },
      lifespan: { age: 200, maxLifespan: 400 },
      hp: 1200, maxHp: 1200,
      inventory: [{ item: { id: 'NascentSoulPill', name: '凝婴丹', tier: 4, type: 'Medicine', attributes: {} }, count: 1 }],
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100, charm: 5 },
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
      requirements: { expThreshold: 20000, requiredItems: ['NascentSoulPill'] },
      simpleModeSuccessRate: 0.55,
      postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
    });
    expect(result.success).toBe(true);
    expect(result.updatedCharacter?.realm).toBe('NascentSoul_1');
    expect(result.updatedCharacter?.lifespan.maxLifespan).toBe(800);
  });

  it('Tier3 成功率较低（基础 55%）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const c = makeChar({
      realm: 'GoldenCore_3',
      cultivation: { currentExp: 25000, maxExp: 25000 },
      hp: 1200, maxHp: 1200,
      inventory: [{ item: { id: 'NascentSoulPill', name: '凝婴丹', tier: 4, type: 'Medicine', attributes: {} }, count: 1 }],
      attributes: { physique: 1, comprehension: 1, perception: 1, agility: 1, luck: 1, charm: 5 },
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
      requirements: { expThreshold: 20000, requiredItems: ['NascentSoulPill'] },
      simpleModeSuccessRate: 0.55,
      postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
    });
    expect(result.success).toBe(false);
  });
});
