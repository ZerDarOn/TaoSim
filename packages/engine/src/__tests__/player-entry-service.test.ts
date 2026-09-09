import { describe, expect, it } from 'vitest';
import type { NpcRecord, WorldState } from '@taosim/contracts';
import { CharacterFactory } from '../character/character-factory.js';
import {
  applyGodResourceIntervention,
  beginPlayerEntry,
  completePlayerChildhood,
  ensurePlayerEntryProfile,
} from '../character/player-entry-service.js';
import { createLegacySpatialState } from '../overworld/spatial-catalog.js';
import { MINUTES_PER_MONTH, MINUTES_PER_YEAR } from '../time/world-clock.js';
import { WorldEngine } from '../world/world-engine.js';

function npc(id: string, name: string, spouseId?: string): NpcRecord {
  return {
    id,
    name,
    gender: id.endsWith('A') ? 'Female' : 'Male',
    personalityId: 'neutral',
    origin: { type: '世家' },
    destiny: { tier: 'common', born: 'mortal', luck: 5, hidden: true },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    factionId: 'FACTION_QINGYUN',
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    spiritStones: 20,
    birthYear: 1,
    birthMonth: 1,
    spouseId,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 3, month: 1 },
    spatialAddress: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
  };
}

function world(): WorldState {
  const a = npc('NPC_PARENT_A', '周清', 'NPC_PARENT_B');
  const b = npc('NPC_PARENT_B', '周衡', 'NPC_PARENT_A');
  return {
    currentYear: 3,
    currentMonth: 1,
    elapsedMinutes: 2 * MINUTES_PER_YEAR,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONT_EAST'],
    globalFlags: { worldSeed: 42 },
    npcs: { [a.id]: a, [b.id]: b },
    eventLog: [],
    facts: [],
    spatialState: createLegacySpatialState(),
  };
}

function player(mode: 'birth' | 'transmigration' | 'god' = 'birth') {
  return CharacterFactory.create({
    name: '周宁',
    gender: 'Other',
    background: 'small-clan',
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    innateTraits: [],
    arrivalMode: mode,
    startAge: 24,
  });
}

describe('PlayerEntryService', () => {
  it('binds birth to real NPC family and lets the same world advance through childhood', () => {
    const begun = beginPlayerEntry(player(), world(), {
      mode: 'birth', background: 'small-clan', childhoodChoice: 'study_classics', worldSeed: 42,
    });
    expect(begun.childhoodMonths).toBe(72);
    expect(begun.player.entryProfile?.family.map((link) => link.npcId).sort()).toEqual(['NPC_PARENT_A', 'NPC_PARENT_B']);
    expect(begun.player.relations.NPC_PARENT_A?.tags).toContain('Kinsman');
    expect(begun.worldState.npcs.NPC_PARENT_A?.childrenIds).toContain(begun.player.id);
    expect(begun.worldState.facts?.some((fact) => fact.type === 'birth' && fact.participants.some((p) => p.entityId === begun.player.id))).toBe(true);

    const engine = new WorldEngine(begun.worldState, { rng: () => 0.99, npcBrainV2Mode: 'single-write' });
    engine.fastForward(72);
    const completed = completePlayerChildhood(begun.player, engine.getState());
    expect(completed.player.lifespan.age).toBeCloseTo(6, 8);
    expect(completed.player.realm).toBe('Mortal');
    expect(completed.player.spiritEnergy.max).toBe(0);
    expect(completed.player.entryProfile?.status).toBe('active');
    expect(completed.player.entryProfile?.enteredWorldAtMinutes).toBe(8 * MINUTES_PER_YEAR);
    expect(completed.player.attributes.comprehension).toBe(6);
    expect(completed.worldState.currentYear).toBe(9);
  }, 15_000);

  it('selects the same real family for the same world seed', () => {
    const options = { mode: 'birth' as const, background: 'small-clan' as const, worldSeed: 73 };
    const first = beginPlayerEntry(player(), world(), options);
    const second = beginPlayerEntry(player(), world(), options);
    expect(first.player.entryProfile?.family).toEqual(second.player.entryProfile?.family);
  });

  it('records transmigration age, place and entry time without invented family', () => {
    const result = beginPlayerEntry(player('transmigration'), world(), {
      mode: 'transmigration', background: 'orphan', startAge: 24, worldSeed: 42,
    });
    expect(result.childhoodMonths).toBe(0);
    expect(result.player.lifespan.age).toBe(24);
    expect(result.player.entryProfile).toMatchObject({
      mode: 'transmigration',
      source: 'transmigration',
      enteredWorldAtMinutes: 2 * MINUTES_PER_YEAR,
      family: [],
    });
    expect(result.worldState.facts?.some((fact) => fact.title.includes('穿越入世'))).toBe(true);
  });

  it('limits god resource intervention to one traceable grant per month', () => {
    const entered = beginPlayerEntry(player('god'), world(), {
      mode: 'god', background: 'orphan', worldSeed: 42,
    });
    const first = applyGodResourceIntervention(entered.player, entered.worldState, 'NPC_PARENT_A', 10);
    expect(first.ok).toBe(true);
    expect(first.worldState.npcs.NPC_PARENT_A?.spiritStones).toBe(30);
    expect(first.worldState.facts?.at(-1)?.metadata).toMatchObject({ source: 'god_intervention', amount: 10 });
    expect(first.event?.source).toBe('player');

    const repeated = applyGodResourceIntervention(first.player, first.worldState, 'NPC_PARENT_A', 10);
    expect(repeated.ok).toBe(false);
    expect(repeated.worldState.npcs.NPC_PARENT_A?.spiritStones).toBe(30);

    const nextMonth = structuredClone(first.worldState);
    nextMonth.elapsedMinutes = (nextMonth.elapsedMinutes ?? 0) + MINUTES_PER_MONTH;
    const later = applyGodResourceIntervention(first.player, nextMonth, 'NPC_PARENT_A', 10);
    expect(later.ok).toBe(true);
    expect(later.worldState.npcs.NPC_PARENT_A?.spiritStones).toBe(40);
  });

  it('defaults an old save to legacy without fabricating family facts', () => {
    const oldPlayer = player('birth');
    delete oldPlayer.entryProfile;
    const oldWorld = world();
    const factCount = oldWorld.facts?.length;
    const migrated = ensurePlayerEntryProfile(oldPlayer, oldWorld);
    expect(migrated.entryProfile).toMatchObject({ mode: 'legacy', source: 'legacy_save', family: [] });
    expect(oldWorld.facts).toHaveLength(factCount ?? 0);
  });
});
