/**
 * SeasonSystem — 季节 + 灵气浓度系统
 *
 * 设计：
 * - 12月分四季，每季3月
 * - 灵气浓度随季节波动 ±10%（纯波动，不绑定五行）
 * - 仲月（每季第2月）浓度最高，旺月（每季第3月）次之，初月（每季第1月）最低
 * - 特定月份的节气事件会叠加额外修正
 */

import type { Season, CalendarEventDef } from '@taosim/contracts';

/** 月份 → 季节映射 */
export function getSeason(month: number): Season {
  if (month >= 1 && month <= 3) return 'Spring';
  if (month >= 4 && month <= 6) return 'Summer';
  if (month >= 7 && month <= 9) return 'Autumn';
  return 'Winter';
}

/** 月份在季节中的阶段：初/仲/暮 */
export function getSeasonPhase(month: number): 'early' | 'mid' | 'late' {
  const seasonMonth = ((month - 1) % 3) + 1; // 1, 2, 3
  if (seasonMonth === 1) return 'early';
  if (seasonMonth === 2) return 'mid';
  return 'late';
}

/**
 * 计算某月的灵气浓度倍率。
 *
 * 基础波动规则：
 * - 初月：0.95（灵气初生，尚不稳定）
 * - 仲月：1.10（灵气最盛）
 * - 暮月：1.05（灵气渐收）
 *
 * 如果该月有节气事件激活，叠加事件修正。
 */
export function getSpiritDensityMultiplier(
  month: number,
  activeCalendarEvent?: CalendarEventDef,
): number {
  const phase = getSeasonPhase(month);
  let mult = 1.0;
  switch (phase) {
    case 'early': mult = 0.95; break;
    case 'mid':   mult = 1.10; break;
    case 'late':  mult = 1.05; break;
  }

  // 叠加节气事件修正
  if (activeCalendarEvent?.effect.spiritDensityMult) {
    mult *= activeCalendarEvent.effect.spiritDensityMult;
  }

  return mult;
}

/** 季节描述（用于 UI 展示） */
export function getSeasonDescription(season: Season, phase: 'early' | 'mid' | 'late'): string {
  const phaseLabel = phase === 'early' ? '初' : phase === 'mid' ? '仲' : '暮';
  const seasonLabel = season === 'Spring' ? '春' : season === 'Summer' ? '夏' : season === 'Autumn' ? '秋' : '冬';
  const desc: Record<Season, string> = {
    Spring: '万物复苏，灵气渐生',
    Summer: '烈日当空，灵气炽盛',
    Autumn: '金风送爽，灵气收敛',
    Winter: '寒凝大地，灵气沉寂',
  };
  return `${phaseLabel}${seasonLabel} · ${desc[season]}`;
}
