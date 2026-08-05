import { describe, it, expect } from 'vitest';
import { MapGenerator } from '../world/map-generator.js';
import type { OverworldNode } from '@taosim/contracts';

const FOREST_NODE: OverworldNode = {
  id: 'forest_cave', name: '密林洞窟', continentId: 'c1',
  coordinates: { x: 0, y: 0 }, type: 'Dungeon', tier: 2, travelCostDays: 3,
  battleMapConfig: { baseTerrain: 'Forest', clusterDensity: 0.6, hazardProbability: 0.1 },
};

describe('MapGenerator', () => {
  it('生成正确尺寸的地图', () => {
    const map = MapGenerator.generate(FOREST_NODE, { width: 5, height: 5 });
    expect(map.width).toBe(5);
    expect(map.height).toBe(5);
    expect(Object.keys(map.tiles).length).toBe(25);
  });

  it('中心区域为平地，无障碍物', () => {
    const map = MapGenerator.generate(FOREST_NODE, { width: 7, height: 7 });
    const center = map.tiles['3,3'];
    expect(center).toBeDefined();
    expect(center!.terrain).toBe('Plain');
    expect(center!.isBlocked).toBe(false);
  });

  it('hazardProbability=0 时无障碍物', () => {
    const safeNode = { ...FOREST_NODE, battleMapConfig: { ...FOREST_NODE.battleMapConfig, hazardProbability: 0 } };
    const map = MapGenerator.generate(safeNode, { width: 7, height: 7 });
    const obstacles = Object.values(map.tiles).filter(t => t.isBlocked);
    expect(obstacles.length).toBe(0);
  });

  it('hazardProbability>0 时产生障碍物', () => {
    const dangerNode = { ...FOREST_NODE, battleMapConfig: { ...FOREST_NODE.battleMapConfig, hazardProbability: 0.5 } };
    const map = MapGenerator.generate(dangerNode, { width: 7, height: 7 });
    const obstacles = Object.values(map.tiles).filter(t => t.isBlocked);
    expect(obstacles.length).toBeGreaterThan(0);
  });

  it('水域类型地图中 DeepWater 标记 isWater=true', () => {
    const waterNode = { ...FOREST_NODE, battleMapConfig: { baseTerrain: 'DeepWater' as const, clusterDensity: 0.8, hazardProbability: 0.2 } };
    const map = MapGenerator.generate(waterNode, { width: 7, height: 7 });
    const waterTiles = Object.values(map.tiles).filter(t => t.isWater);
    expect(waterTiles.length).toBeGreaterThan(0);
  });
});
