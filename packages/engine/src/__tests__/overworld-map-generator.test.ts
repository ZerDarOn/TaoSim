import { describe, it, expect } from 'vitest';
import { OverworldMapGenerator } from '../overworld/overworld-map-generator.js';

describe('OverworldMapGenerator', () => {
  it('生成指定节点数量的大陆', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 8, seed: 42 });
    expect(map.continents).toHaveLength(1);
    const continent = map.continents[0]!;
    const nodeIds = Object.keys(continent.nodes);
    expect(nodeIds.length).toBeGreaterThanOrEqual(6);
    expect(nodeIds.length).toBeLessThanOrEqual(12);
  });

  it('节点包含不同类型', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 10, seed: 123 });
    const continent = map.continents[0]!;
    const types = new Set(Object.values(continent.nodes).map(n => n.type));
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it('边连接相邻节点', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 8, seed: 99 });
    const continent = map.continents[0]!;
    expect(continent.edges.length).toBeGreaterThan(0);
    for (const e of continent.edges) {
      expect(continent.nodes[e.fromNodeId]).toBeDefined();
      expect(continent.nodes[e.toNodeId]).toBeDefined();
      expect(e.distanceDays).toBeGreaterThan(0);
    }
  });

  it('相同种子产生相同地图', () => {
    const a = OverworldMapGenerator.generate({ nodeCount: 8, seed: 777 });
    const b = OverworldMapGenerator.generate({ nodeCount: 8, seed: 777 });
    const nodesA = Object.keys(a.continents[0]!.nodes).sort();
    const nodesB = Object.keys(b.continents[0]!.nodes).sort();
    expect(nodesA).toEqual(nodesB);
  });

  it('生成的地图有起始节点（Sect 类型）', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 10, seed: 555 });
    const continent = map.continents[0]!;
    const sects = Object.values(continent.nodes).filter(n => n.type === 'Sect');
    expect(sects.length).toBeGreaterThanOrEqual(1);
  });
});
