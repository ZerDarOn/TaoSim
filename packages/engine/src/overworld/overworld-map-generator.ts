import type { OverworldMap, OverworldNode, OverworldContinent, TerrainType } from '@taosim/contracts';

export interface GeneratorConfig {
  nodeCount: number;
  seed: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const NODE_TYPES: OverworldNode['type'][] = ['Wilderness', 'Wilderness', 'Wilderness', 'Dungeon', 'Dungeon', 'Market', 'City', 'Sect'];
const TERRAINS: TerrainType[] = ['Forest', 'Swamp', 'Lava', 'Void', 'Plain'];

export class OverworldMapGenerator {
  static generate(config: GeneratorConfig): OverworldMap {
    const rand = seededRandom(config.seed);
    const count = Math.max(6, Math.min(16, config.nodeCount));

    const nodes: Record<string, OverworldNode> = {};
    const edges: { fromNodeId: string; toNodeId: string; distanceDays: number }[] = [];
    const nodeList: OverworldNode[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count + (rand() - 0.5) * 0.4;
      const radius = 200 + rand() * 150;
      const x = 400 + Math.cos(angle) * radius;
      const y = 300 + Math.sin(angle) * radius;

      const type = NODE_TYPES[i % NODE_TYPES.length]!;
      const tier = type === 'Dungeon' ? 2 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 3);
      const terrain = TERRAINS[Math.floor(rand() * TERRAINS.length)]!;

      const node: OverworldNode = {
        id: `GEN_NODE_${i}`,
        name: `${type}_${i + 1}`,
        continentId: 'CONT_GEN',
        coordinates: { x: Math.round(x), y: Math.round(y) },
        type,
        tier,
        travelCostDays: 1 + Math.floor(rand() * 4),
        battleMapConfig: {
          baseTerrain: terrain,
          clusterDensity: 0.3 + rand() * 0.4,
          hazardProbability: 0.1 + rand() * 0.3,
        },
      };

      nodes[node.id] = node;
      nodeList.push(node);
    }

    for (let i = 0; i < count; i++) {
      const from = nodeList[i]!;
      const to = nodeList[(i + 1) % count]!;
      edges.push({
        fromNodeId: from.id,
        toNodeId: to.id,
        distanceDays: 1 + Math.floor(rand() * 4),
      });

      if (rand() < 0.3 && count > 4) {
        const extraIdx = (i + 2 + Math.floor(rand() * (count - 3))) % count;
        if (extraIdx !== i && extraIdx !== (i + 1) % count) {
          edges.push({
            fromNodeId: from.id,
            toNodeId: nodeList[extraIdx]!.id,
            distanceDays: 2 + Math.floor(rand() * 5),
          });
        }
      }
    }

    const continent: OverworldContinent = {
      id: 'CONT_GEN',
      name: '随机大陆',
      nodes,
      edges,
    };

    return { continents: [continent] };
  }
}
