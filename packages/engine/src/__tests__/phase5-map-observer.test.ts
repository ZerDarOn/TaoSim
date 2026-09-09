import { describe, expect, it } from 'vitest';
import type { Character, NpcRecord } from '@taosim/contracts';
import { createLegacySpatialState, npcSpatialIndex, settleHexMoveEvents } from '../index.js';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';

function player(): Character {
  return {
    id: 'PLAYER_PHASE5', name: '观察者', gender: 'Other', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 10, max: 100 }, monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' }, hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [], equipmentSlots: { treasures: [] }, skills: [], skillCooldowns: {}, traits: [], relations: {},
    spiritStones: 100, wantedLevels: {}, unlockedRecipes: [],
  };
}

function npc(id: string, nodeId: string): NpcRecord {
  return {
    id, name: id, gender: 'Other', personalityId: 'cautious', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, lifespan: { age: 20, maxLifespan: 100 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    relations: {}, locationId: nodeId, hexPos: { q: 10, r: 10 }, moveState: 'resident',
    biography: { milestones: [], summary: '' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    affinityMatrixSeed: 1, lastUpdate: { year: 1, month: 1 },
    spatialAddress: { nodeId, coordinate: { q: 10, r: 10 }, occupancy: 'stationary' },
    origin: { type: '散修' }, skillIds: [], birthYear: 1, birthMonth: 1,
  };
}

describe('Phase 5 map observer projections', () => {
  it('indexes the authoritative spatial coordinate before the legacy hex projection', () => {
    const state = createLegacySpatialState();
    const grid = generateWorldGrid('CONT_EAST');
    const record = npc('NPC_SPATIAL', 'NODE_CITY_TIANJI');
    record.hexPos = { q: 1, r: 1 };
    record.spatialAddress = {
      nodeId: 'NODE_CITY_TIANJI', coordinate: { q: 4, r: 5 }, occupancy: 'stationary',
    };
    expect(npcSpatialIndex({ [record.id]: record }, grid).get('4,5')).toEqual([record]);
    expect(state.nodes[record.spatialAddress.nodeId]).toBeDefined();
  });

  it('settles a map material event into a real registered item without UI-side fabrication', () => {
    const result = settleHexMoveEvents(player(), [{
      type: 'material_found', title: '发现材料', description: '找到灵草', materialId: 'MAT_SPIRIT_GRASS',
    }]);
    expect(result.updatedPlayer.inventory).toHaveLength(1);
    expect(result.updatedPlayer.inventory[0]?.item.templateId).toBe('MAT_SPIRIT_GRASS');
    expect(result.materialIds).toEqual(['MAT_SPIRIT_GRASS']);
  });
});
