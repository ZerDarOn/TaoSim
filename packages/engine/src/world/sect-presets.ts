// ============================================================
// 宗门预设 — 社会轨道（世界涌现叙事设计 §2.2）
//
// 开局预置的宗门档案（WorldState.factions 的数据来源）。
// 成员引用真实传奇 NPC（legendary-npc-generator），
// 后续由引擎社会轨道驱动 入宗→弟子→长老→宗主 演化。
// ============================================================

import type { Faction } from '@taosim/contracts';

/** 青云宗（唯一有真实驻地与在世成员的开局宗门；驻地 = VENUE_QINGYUN_HALL） */
export const SECT_PRESETS: Faction[] = [
  {
    id: 'FACT_QINGYUN',
    name: '青云宗',
    alignment: 'Righteous',
    leaderId: 'NPC_SECT_MASTER', // 掌门 云沧澜（传奇种子，socialRank: sectMaster）
    members: ['NPC_SECT_MASTER', 'LEGEND_1', 'LEGEND_3', 'LEGEND_4'],
    territories: ['NODE_SECT_QINGYUN'],
    // 灵脉 2 阶：驻地节点 tier=2，产出 100×2=200 = 维护 200 → 开局即稳态（不会因收支失衡降级）
    spiritVeinLevel: 2,
    treasurySpiritStones: 8000,
    diplomacy: {},
    aiPolicy: { expansionism: 0.3, aggression: 0.2 },
  },
];

/** 深拷贝为 Record<factionId, Faction>（避免静态数据被引擎月度维护原地改写） */
export function createInitialFactions(): Record<string, Faction> {
  return Object.fromEntries(
    SECT_PRESETS.map((f) => [
      f.id,
      { ...f, members: [...f.members], diplomacy: { ...f.diplomacy } },
    ]),
  );
}
