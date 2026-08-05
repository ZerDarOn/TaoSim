import type { OverworldMap, OverworldNode } from '@taosim/contracts';

function makeNode(
  id: string, name: string, type: OverworldNode['type'], tier: number,
  x: number, y: number, travelCostDays: number,
  baseTerrain: 'Forest' | 'Swamp' | 'Volcano' | 'Cave' | 'Snow' = 'Forest',
): OverworldNode {
  return {
    id, name, continentId: 'CONT_EAST', coordinates: { x, y },
    type, tier, travelCostDays,
    battleMapConfig: {
      baseTerrain,
      clusterDensity: 0.4 + tier * 0.1,
      hazardProbability: 0.1 + tier * 0.05,
    },
  };
}

export const PRESET_MAP: OverworldMap = {
  continents: [
    {
      id: 'CONT_EAST',
      name: '东荒',
      nodes: {
        'NODE_SECT_QINGYUN': makeNode('NODE_SECT_QINGYUN', '青云宗', 'Sect', 2, 400, 250, 0),
        'NODE_CITY_TIANJI': makeNode('NODE_CITY_TIANJI', '天机城', 'City', 3, 550, 200, 3),
        'NODE_MARKET': makeNode('NODE_MARKET', '坊市', 'Market', 2, 650, 350, 2),
        'NODE_DUNGEON_HEIFENG': makeNode('NODE_DUNGEON_HEIFENG', '黑风洞', 'Dungeon', 3, 700, 150, 4, 'Cave'),
        'NODE_WILD_EAST': makeNode('NODE_WILD_EAST', '落霞荒野东', 'Wilderness', 1, 500, 350, 2, 'Swamp'),
        'NODE_WILD_NORTH': makeNode('NODE_WILD_NORTH', '落霞荒野北', 'Wilderness', 2, 350, 150, 2),
        'NODE_WILD_SOUTH': makeNode('NODE_WILD_SOUTH', '落霞荒野南', 'Wilderness', 2, 350, 450, 3, 'Swamp'),
        'NODE_DUNGEON_MINE': makeNode('NODE_DUNGEON_MINE', '灵脉矿洞', 'Dungeon', 2, 200, 300, 3, 'Cave'),
        'NODE_SECT_TIANJIAN': makeNode('NODE_SECT_TIANJIAN', '天剑宗', 'Sect', 2, 80, 300, 3),
        'NODE_WILD_SWAMP': makeNode('NODE_WILD_SWAMP', '幽冥沼泽', 'Wilderness', 3, 80, 450, 4, 'Swamp'),
        'NODE_DUNGEON_STAR': makeNode('NODE_DUNGEON_STAR', '陨星谷', 'Dungeon', 4, 200, 550, 5, 'Volcano'),
        'NODE_DUNGEON_ANCIENT': makeNode('NODE_DUNGEON_ANCIENT', '荒古战场', 'Dungeon', 5, 350, 600, 6, 'Volcano'),
      },
      edges: [
        { fromNodeId: 'NODE_SECT_QINGYUN', toNodeId: 'NODE_WILD_EAST', distanceDays: 2 },
        { fromNodeId: 'NODE_SECT_QINGYUN', toNodeId: 'NODE_CITY_TIANJI', distanceDays: 3 },
        { fromNodeId: 'NODE_CITY_TIANJI', toNodeId: 'NODE_MARKET', distanceDays: 2 },
        { fromNodeId: 'NODE_CITY_TIANJI', toNodeId: 'NODE_DUNGEON_HEIFENG', distanceDays: 3 },
        { fromNodeId: 'NODE_MARKET', toNodeId: 'NODE_WILD_SOUTH', distanceDays: 2 },
        { fromNodeId: 'NODE_WILD_EAST', toNodeId: 'NODE_WILD_NORTH', distanceDays: 2 },
        { fromNodeId: 'NODE_WILD_NORTH', toNodeId: 'NODE_DUNGEON_MINE', distanceDays: 2 },
        { fromNodeId: 'NODE_WILD_SOUTH', toNodeId: 'NODE_DUNGEON_MINE', distanceDays: 2 },
        { fromNodeId: 'NODE_DUNGEON_MINE', toNodeId: 'NODE_SECT_TIANJIAN', distanceDays: 2 },
        { fromNodeId: 'NODE_SECT_TIANJIAN', toNodeId: 'NODE_WILD_SWAMP', distanceDays: 3 },
        { fromNodeId: 'NODE_DUNGEON_HEIFENG', toNodeId: 'NODE_WILD_SWAMP', distanceDays: 4 },
        { fromNodeId: 'NODE_WILD_SWAMP', toNodeId: 'NODE_DUNGEON_STAR', distanceDays: 3 },
        { fromNodeId: 'NODE_DUNGEON_STAR', toNodeId: 'NODE_DUNGEON_ANCIENT', distanceDays: 4 },
      ],
    },
  ],
};

export function getNeighbors(nodeId: string): string[] {
  const continent = PRESET_MAP.continents[0]!;
  const neighbors: string[] = [];
  for (const e of continent.edges) {
    if (e.fromNodeId === nodeId) neighbors.push(e.toNodeId);
    if (e.toNodeId === nodeId) neighbors.push(e.fromNodeId);
  }
  return neighbors;
}

export function getEdge(fromId: string, toId: string): { fromNodeId: string; toNodeId: string; distanceDays: number } | null {
  const continent = PRESET_MAP.continents[0]!;
  return continent.edges.find(
    e => (e.fromNodeId === fromId && e.toNodeId === toId) || (e.fromNodeId === toId && e.toNodeId === fromId),
  ) ?? null;
}
