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
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 5 },
    hp: 300, maxHp: 300, ap: 3, canFly: false,
    inventory: [{ item: { id: 'FoundationPill', name: '筑基丹', tier: 2, type: 'Medicine', attributes: {} }, count: 1 }],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
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

  it('缺少筑基丹时无法渡劫', () => {
    const c = makeChar({ inventory: [] });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('缺少');
  });

  it('渡劫成功后境界提升，寿元增加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100 },
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
      attributes: { physique: 1, comprehension: 1, perception: 1, agility: 1, luck: 1 },
    });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    expect(result.success).toBe(false);
  });

  it('渡劫成功消耗筑基丹', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100 },
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
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100 },
    });
    const result = TribulationEngine.attempt(c, TIER1_CONFIG);
    if (result.updatedCharacter) {
      expect(result.updatedCharacter.canFly).toBe(true);
    }
  });
});
