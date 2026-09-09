import { describe, expect, it } from 'vitest';
import {
  sortScheduledWakes,
  takeDueScheduledWakes,
  takeNextDueScheduledWake,
  upsertScheduledWake,
  type ScheduledWake,
} from '@taosim/contracts';

const wake = (wakeId: string, atMinutes: number): ScheduledWake => ({
  wakeId,
  entityId: 'entity',
  kind: 'travel_checkpoint',
  atMinutes,
});

describe('scheduled wake queue', () => {
  it('sorts by time and stable id', () => {
    expect(sortScheduledWakes([wake('b', 10), wake('c', 2), wake('a', 10)])
      .map((item) => item.wakeId)).toEqual(['c', 'a', 'b']);
  });

  it('upserts idempotently without duplicating a wake', () => {
    const first = upsertScheduledWake([wake('travel', 10)], wake('travel', 4));
    expect(first).toHaveLength(1);
    expect(first[0]?.atMinutes).toBe(4);
  });

  it('takes only wakes due at the requested absolute minute', () => {
    const result = takeDueScheduledWakes([wake('future', 11), wake('now', 10)], 10);
    expect(result.due.map((item) => item.wakeId)).toEqual(['now']);
    expect(result.remaining.map((item) => item.wakeId)).toEqual(['future']);
  });

  it('takes one earliest wake so newly scheduled intermediate work can keep chronological order', () => {
    const first = takeNextDueScheduledWake([wake('late', 50), wake('early', 10)], 100);
    expect(first.next?.wakeId).toBe('early');
    const withInserted = upsertScheduledWake(first.remaining, wake('inserted', 20));
    expect(takeNextDueScheduledWake(withInserted, 100).next?.wakeId).toBe('inserted');
  });
});
