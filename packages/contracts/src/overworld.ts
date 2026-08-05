import type { TerrainType } from './hex.js';
import type { Character } from './character.js';

// ============================================================
// Overworld 大地图数据模型 — 架构规范 §25
// ============================================================

export interface OverworldNode {
  id: string;
  name: string;
  continentId: string;
  coordinates: { x: number; y: number };
  type: 'City' | 'Sect' | 'Dungeon' | 'Market' | 'Wilderness';
  tier: number;                       // 灵脉/危险阶位 (1-5)
  travelCostDays: number;

  battleMapConfig: {
    baseTerrain: TerrainType;
    clusterDensity: number;
    hazardProbability: number;
  };
}

export interface OverworldContinent {
  id: string;
  name: string;
  nodes: Record<string, OverworldNode>;
  edges: { fromNodeId: string; toNodeId: string; distanceDays: number }[];
}

export interface OverworldMap {
  continents: OverworldContinent[];
}

export interface TravelEvent {
  type: 'encounter' | 'battle' | 'npc_meet' | 'material_found';
  title: string;
  description: string;
  nodeId?: string;
  materials?: { itemId: string; itemName: string }[];
  npc?: Character;                    // Phase 11: NPC 偶遇携带实际 Character 对象
}
