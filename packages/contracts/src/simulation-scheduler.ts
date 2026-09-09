// ============================================================
// 世界调度队列契约 — 动态空间世界 Phase 2
//
// 队列只描述“何时需要重新评估”，不承载事实本身。事实仍由
// WorldEngine 在权威状态上提交；UI 和 AI 都不能直接消费后写入事实。
// ============================================================

export type ScheduledWakeKind =
  | 'travel_checkpoint'
  | 'npc_action'
  | 'feature_transition'
  | 'condition_expiry'
  | 'batch_boundary';

export interface ScheduledWake {
  wakeId: string;
  entityId: string;
  kind: ScheduledWakeKind;
  atMinutes: number;
  payload?: Record<string, string | number | boolean>;
}

/** 以时间、再以稳定 id 排序，保证快进与实时推进得到同一处理顺序。 */
export function sortScheduledWakes(wakes: ScheduledWake[]): ScheduledWake[] {
  return [...wakes].sort((a, b) => a.atMinutes - b.atMinutes || a.wakeId.localeCompare(b.wakeId));
}

function isSorted(wakes: readonly ScheduledWake[]): boolean {
  for (let index = 1; index < wakes.length; index++) {
    const previous = wakes[index - 1]!;
    const current = wakes[index]!;
    if (previous.atMinutes > current.atMinutes
      || (previous.atMinutes === current.atMinutes && previous.wakeId > current.wakeId)) {
      return false;
    }
  }
  return true;
}

/** 用 wakeId 幂等替换队列项，并保持确定性顺序。 */
export function upsertScheduledWake(wakes: ScheduledWake[], wake: ScheduledWake): ScheduledWake[] {
  const sorted = isSorted(wakes) ? wakes : sortScheduledWakes(wakes);
  const next = sorted.filter((item) => item.wakeId !== wake.wakeId);
  let low = 0;
  let high = next.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const item = next[middle]!;
    if (item.atMinutes < wake.atMinutes
      || (item.atMinutes === wake.atMinutes && item.wakeId < wake.wakeId)) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  next.splice(low, 0, wake);
  return next;
}

/** 取出截至指定时刻的唤醒项；未来项保持原顺序。 */
export function takeDueScheduledWakes(
  wakes: ScheduledWake[],
  atMinutes: number,
): { due: ScheduledWake[]; remaining: ScheduledWake[] } {
  const sorted = isSorted(wakes) ? wakes : sortScheduledWakes(wakes);
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle]!.atMinutes <= atMinutes) low = middle + 1;
    else high = middle;
  }
  return { due: sorted.slice(0, low), remaining: sorted.slice(low) };
}

/**
 * 一次只消费最早的到期项。处理器可能插入更早的新唤醒，调用方必须
 * 重新查看队列，不能先整批取出后导致 t50 抢在新产生的 t20 前执行。
 */
export function takeNextDueScheduledWake(
  wakes: ScheduledWake[],
  atMinutes: number,
): { next?: ScheduledWake; remaining: ScheduledWake[] } {
  const sorted = isSorted(wakes) ? wakes : sortScheduledWakes(wakes);
  const next = sorted[0];
  if (!next || next.atMinutes > atMinutes) return { remaining: sorted };
  return { next, remaining: sorted.slice(1) };
}
