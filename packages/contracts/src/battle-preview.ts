// ============================================================
// BattlePreview 战棋技能预判层 — 架构规范 §31.2
// ============================================================

export interface BattlePreviewState {
  isHovering: boolean;
  activeSkillId?: string;
  sourceCoords?: { q: number; r: number };
  targetCoords?: { q: number; r: number };

  highlightHexes: { q: number; r: number; type: 'AOE' | 'Target' | 'DangerZone' }[];
  predictedOutput: {
    minDamage: number;
    maxDamage: number;
    armorPenetrationPercent: number;
    backfireRisk?: string;
  };
}
