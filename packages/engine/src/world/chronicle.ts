// ============================================================
// 编年史 / 传闻服务 — 世界涌现叙事设计 §5 / §6
//
// - buildChronicle：上帝视角数据基础（按年分组 + 年度大事记提炼）
// - visibleToPlayer：沉浸视角过滤（§6.3 信息不对称）
// - rumorPool：传闻扩散（regional/world 事件近窗可闻，local 不可闻）
// ============================================================

import type { BigEventLog, Character, EventSeverity } from '@taosim/contracts';

export interface YearChronicle {
  year: number;
  /** 年度大事记（major/epoch 提炼） */
  highlights: BigEventLog[];
  totalEvents: number;
}

export interface GameTime {
  year: number;
  month: number;
}

function monthIndex(t: GameTime): number {
  return (t.year - 1) * 12 + t.month;
}

function addMonths(t: GameTime, months: number): GameTime {
  const idx = monthIndex(t) + months;
  return { year: Math.floor((idx - 1) / 12) + 1, month: ((idx - 1) % 12) + 1 };
}

/** 上帝视角编年史：按年分组，major/epoch 提炼年度大事记 */
export function buildChronicle(eventLog: BigEventLog[]): YearChronicle[] {
  const byYear = new Map<number, BigEventLog[]>();
  for (const e of eventLog) {
    const list = byYear.get(e.year) ?? [];
    list.push(e);
    byYear.set(e.year, list);
  }
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => {
      const events = byYear.get(year) ?? [];
      return {
        year,
        highlights: events.filter(e => e.severity === 'major' || e.severity === 'epoch'),
        totalEvents: events.length,
      };
    });
}

const SEVERITY_LEVEL: Record<EventSeverity, number> = { minor: 0, normal: 1, major: 2, epoch: 3 };

/**
 * 沉浸视角可见性（§6.3）：
 * - 玩家直接参与 → 可见
 * - world 事件且 major+ → 可见
 * - regional 事件且 normal+ → 可见
 * - 其余（local / 影响力不足）→ 不可见（信息不对称）
 */
export function visibleToPlayer(event: BigEventLog, player: Character): boolean {
  if (event.involvedCharacterIds.includes(player.id)) return true;
  const sev = SEVERITY_LEVEL[event.severity];
  if (event.visibility === 'world' && sev >= SEVERITY_LEVEL.major) return true;
  if (event.visibility === 'regional' && sev >= SEVERITY_LEVEL.normal) return true;
  return false;
}

export interface Rumor {
  event: BigEventLog;
  /** 得知时间（传播延迟：world 当月、regional 隔月） */
  heardAt: GameTime;
}

/**
 * 传闻池：近 windowMonths 月内可被"听说"的 regional/world 事件。
 * local 事件不扩散；已过窗口的事件自然淡出江湖。
 */
export function rumorPool(eventLog: BigEventLog[], now: GameTime, windowMonths = 24): Rumor[] {
  const cutoff = monthIndex(now) - windowMonths;
  const result: Rumor[] = [];
  for (const e of eventLog) {
    if (e.visibility === 'local') continue;
    const heardAt = addMonths({ year: e.year, month: e.month }, e.visibility === 'world' ? 0 : 1);
    if (monthIndex(heardAt) > cutoff) {
      result.push({ event: e, heardAt });
    }
  }
  return result;
}
