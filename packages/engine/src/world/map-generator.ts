import type { HexBattleMap, OverworldNode, TerrainType } from '@taosim/contracts';

interface MapSize { width: number; height: number; }

export class MapGenerator {
  static generate(node: OverworldNode, size: MapSize = { width: 7, height: 7 }): HexBattleMap {
    const { baseTerrain, clusterDensity, hazardProbability } = node.battleMapConfig;
    const tiles: Record<string, any> = {};
    const centerQ = Math.floor(size.width / 2);
    const centerR = Math.floor(size.height / 2);
    const clearRadius = 2;

    for (let q = 0; q < size.width; q++) {
      for (let r = 0; r < size.height; r++) {
        const dq = q - centerQ;
        const dr = r - centerR;
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));

        let terrain: TerrainType = 'Plain';
        let isBlocked = false;
        let isWater = false;

        if (dist > clearRadius) {
          const terrainRoll = Math.random();
          if (terrainRoll < clusterDensity) {
            terrain = baseTerrain;
          } else {
            terrain = MapGenerator.pickSecondaryTerrain(baseTerrain);
          }

          const hazardRoll = Math.random();
          if (hazardRoll < hazardProbability) {
            if (baseTerrain === 'DeepWater' || baseTerrain === 'Swamp') {
              isWater = true;
            } else {
              isBlocked = true;
              terrain = 'Obstacle';
            }
          }
        }

        if (terrain === 'DeepWater') isWater = true;

        tiles[`${q},${r}`] = { q, r, terrain, elevation: 0, isBlocked, isWater, isRevealed: true };
      }
    }

    return { width: size.width, height: size.height, tiles };
  }

  private static pickSecondaryTerrain(base: TerrainType): TerrainType {
    const pools: Record<TerrainType, TerrainType[]> = {
      Plain: ['Plain', 'Forest', 'Plain'],
      Forest: ['Forest', 'Plain', 'Swamp'],
      DeepWater: ['DeepWater', 'DeepWater', 'Plain'],
      Swamp: ['Swamp', 'Forest', 'DeepWater'],
      Lava: ['Lava', 'Obstacle', 'Plain'],
      Obstacle: ['Obstacle', 'Plain', 'Plain'],
      Void: ['Void', 'Void', 'Void'],
    };
    const pool = pools[base] ?? ['Plain', 'Forest', 'Plain'];
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
}
