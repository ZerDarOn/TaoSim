// ============================================================
// Faction 宗门/势力数据模型 — 架构规范 §26
// ============================================================

export interface Faction {
  id: string;
  name: string;
  alignment: 'Righteous' | 'Demonic' | 'Neutral';
  leaderId: string;
  members: string[];                             // Character ID 列表
  territories: string[];                         // OverworldNode ID 列表
  spiritVeinLevel: number;                       // 灵脉阶位 (1-5)
  treasurySpiritStones: number;                  // 宗门金库
  diplomacy: Record<string, 'Alliance' | 'War' | 'Neutral'>;

  aiPolicy: {
    expansionism: number;                        // 扩张倾向
    aggression: number;                          // 好斗度
  };
}
