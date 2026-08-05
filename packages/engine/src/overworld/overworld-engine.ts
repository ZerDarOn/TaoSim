import type { Character, OverworldMap } from '@taosim/contracts';

export interface TravelResult {
  success: boolean;
  reason?: string;
  currentNodeId?: string;
  daysPassed: number;
  events: TravelEvent[];
}

export interface TravelEvent {
  type: 'encounter' | 'battle' | 'npc_meet' | 'material_found';
  title: string;
  description: string;
  nodeId?: string;
  materials?: { itemId: string; itemName: string }[];
}

const MATERIAL_POOL: Record<number, { id: string; name: string }[]> = {
  1: [{ id: 'MAT_SPIRIT_GRASS', name: '灵草' }, { id: 'MAT_IRON_ORE', name: '铁矿石' }],
  2: [{ id: 'MAT_YIN_DEW', name: '阴露' }, { id: 'MAT_YANG_STONE', name: '阳石' }, { id: 'MAT_BLOOD_FLOWER', name: '血花' }],
  3: [{ id: 'MAT_SPIRIT_STONE', name: '灵石矿' }, { id: 'MAT_JADE', name: '灵玉' }],
  4: [{ id: 'MAT_METEORITE', name: '陨铁' }, { id: 'MAT_DRAGON_BLOOD', name: '龙血' }],
  5: [{ id: 'MAT_STARLIGHT', name: '星光碎片' }, { id: 'MAT_PHOENIX_FEATHER', name: '凤羽' }],
};

export class OverworldEngine {
  static travel(
    character: Character,
    fromNodeId: string,
    toNodeId: string,
    map: OverworldMap,
  ): TravelResult {
    const continent = map.continents[0];
    if (!continent) return { success: false, reason: '大陆不存在', daysPassed: 0, events: [] };

    const fromNode = continent.nodes[fromNodeId];
    const toNode = continent.nodes[toNodeId];
    if (!fromNode || !toNode) return { success: false, reason: '节点不存在', daysPassed: 0, events: [] };

    if (fromNodeId === toNodeId) {
      return { success: true, currentNodeId: toNodeId, daysPassed: 0, events: [] };
    }

    const edge = continent.edges.find(
      e => (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
           (e.fromNodeId === toNodeId && e.toNodeId === fromNodeId),
    );
    if (!edge) return { success: false, reason: '节点不相邻，不可直接旅行', daysPassed: 0, events: [] };

    const daysPassed = edge.distanceDays;
    const events: TravelEvent[] = [];

    const luckBonus = character.attributes.luck / 200;
    const encounterChance = 0.3 + luckBonus;

    if (Math.random() < encounterChance) {
      const roll = Math.random();

      if (roll < 0.4) {
        const pool = MATERIAL_POOL[toNode.tier] ?? MATERIAL_POOL[1]!;
        const mat = pool[Math.floor(Math.random() * pool.length)]!;
        events.push({
          type: 'material_found',
          title: '发现材料',
          description: `旅行途中发现 ${mat.name}`,
          nodeId: toNodeId,
          materials: [{ itemId: mat.id, itemName: mat.name }],
        });
      } else if (roll < 0.7) {
        events.push({
          type: 'battle',
          title: '遭遇敌人',
          description: `在${toNode.name}附近遭遇妖兽！`,
          nodeId: toNodeId,
        });
      } else {
        const npcNames = ['云游散修', '外出历练的弟子', '神秘商人'];
        const npcName = npcNames[Math.floor(Math.random() * npcNames.length)]!;
        events.push({
          type: 'npc_meet',
          title: '偶遇修士',
          description: `在${toNode.name}附近遇到了${npcName}`,
          nodeId: toNodeId,
        });
      }
    }

    return { success: true, currentNodeId: toNodeId, daysPassed, events };
  }
}
