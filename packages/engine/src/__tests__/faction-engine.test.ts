import { describe, it, expect, beforeEach } from 'vitest';
import { FactionEngine } from '../faction/faction-engine.js';
import type { Faction, Character } from '@taosim/contracts';

function makeFaction(overrides: Partial<Faction> = {}): Faction {
  return {
    id: 'FACT_TEST', name: '青云宗', alignment: 'Righteous',
    leaderId: 'NPC_LEADER', members: ['NPC_LEADER'], territories: ['NODE_SECT'],
    spiritVeinLevel: 2, treasurySpiritStones: 5000,
    diplomacy: {}, aiPolicy: { expansionism: 0.3, aggression: 0.2 },
    ...overrides,
  };
}

function makeChar(id: string, overrides: Partial<Character> = {}): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_5', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 25, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 150, maxHp: 150, ap: 3, canFly: false,
    spiritStones: 0,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('FactionEngine', () => {
  it('散修可加入宗门成为弟子', () => {
    const faction = makeFaction();
    const player = makeChar('P');
    const result = FactionEngine.joinFaction(player, faction);
    expect(result.success).toBe(true);
    expect(player.factionId).toBe('FACT_TEST');
    expect(player.factionRank).toBe('Disciple');
  });

  it('已有宗门的角色无法加入另一宗门', () => {
    const faction = makeFaction();
    const player = makeChar('P', { factionId: 'OTHER_FACTION' });
    const result = FactionEngine.joinFaction(player, faction);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('已有');
  });

  it('贡献灵石可提升宗门贡献度', () => {
    const faction = makeFaction({ treasurySpiritStones: 1000 });
    const result = FactionEngine.contribute(faction, 500);
    expect(result.success).toBe(true);
    expect(faction.treasurySpiritStones).toBe(1500);
  });

  it('贡献度达标可晋升执事', () => {
    const player = makeChar('P', { factionId: 'FACT_TEST', factionRank: 'Disciple' });
    const result = FactionEngine.promote(player, 1000);
    expect(result.success).toBe(true);
    expect(player.factionRank).toBe('Deacon');
  });

  it('贡献度不足晋升失败', () => {
    const player = makeChar('P', { factionId: 'FACT_TEST', factionRank: 'Disciple' });
    const result = FactionEngine.promote(player, 100);
    expect(result.success).toBe(false);
  });
});
