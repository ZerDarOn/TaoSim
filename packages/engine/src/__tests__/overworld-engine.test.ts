import { describe, it, expect } from 'vitest';
import { OverworldEngine } from '../overworld/overworld-engine.js';
import type { Character, OverworldMap } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '旅行者', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    factionId: undefined, factionRank: undefined,
    ...overrides,
  } as Character;
}

const testMap: OverworldMap = {
  continents: [{
    id: 'C1', name: '测试大陆',
    nodes: {
      'N1': {
        id: 'N1', name: '起点', continentId: 'C1', coordinates: { x: 100, y: 100 },
        type: 'Sect', tier: 1, travelCostDays: 0,
        battleMapConfig: { baseTerrain: 'Forest', clusterDensity: 0.5, hazardProbability: 0.1 },
      },
      'N2': {
        id: 'N2', name: '终点', continentId: 'C1', coordinates: { x: 300, y: 100 },
        type: 'Wilderness', tier: 2, travelCostDays: 0,
        battleMapConfig: { baseTerrain: 'Swamp', clusterDensity: 0.5, hazardProbability: 0.2 },
      },
      'N3': {
        id: 'N3', name: '孤岛', continentId: 'C1', coordinates: { x: 500, y: 500 },
        type: 'Dungeon', tier: 5, travelCostDays: 0,
        battleMapConfig: { baseTerrain: 'Void', clusterDensity: 0.8, hazardProbability: 0.5 },
      },
    },
    edges: [
      { fromNodeId: 'N1', toNodeId: 'N2', distanceDays: 3 },
    ],
  }],
};

describe('OverworldEngine', () => {
  it('相邻节点间可旅行', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N2', testMap);
    expect(result.success).toBe(true);
    expect(result.currentNodeId).toBe('N2');
    expect(result.daysPassed).toBe(3);
  });

  it('非相邻节点不可直接旅行', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N3', testMap);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('不相邻');
  });

  it('旅行可能触发奇遇事件', () => {
    let hadEncounter = false;
    for (let i = 0; i < 30; i++) {
      const p = makePlayer();
      const result = OverworldEngine.travel(p, 'N1', 'N2', testMap);
      if (result.events.length > 0) hadEncounter = true;
    }
    expect(hadEncounter).toBe(true);
  });

  it('起点终点相同时不消耗天数', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N1', testMap);
    expect(result.success).toBe(true);
    expect(result.daysPassed).toBe(0);
  });

  it('旅行消耗天数', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N2', testMap);
    expect(result.success).toBe(true);
    expect(result.daysPassed).toBeGreaterThan(0);
  });
});
