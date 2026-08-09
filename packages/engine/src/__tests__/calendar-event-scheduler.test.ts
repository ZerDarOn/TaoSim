import { describe, it, expect } from 'vitest';
import { rollWorldEvent, WORLD_EVENTS } from '../time/calendar-event-scheduler.js';

describe('rollWorldEvent（§4.10 世界事件）', () => {
  it('累计概率未命中时返回 undefined', () => {
    const total = WORLD_EVENTS.reduce((sum, e) => sum + e.probability, 0);
    expect(rollWorldEvent(() => total)).toBeUndefined();
    expect(rollWorldEvent(() => 0.999)).toBeUndefined();
  });

  it('命中时按概率池区间返回对应事件', () => {
    // 0~0.004 → 异宝出世
    expect(rollWorldEvent(() => 0.001)?.id).toBe('WE_CELESTIAL_TREASURE');
    // 0.004~0.007 → 秘境开启
    expect(rollWorldEvent(() => 0.005)?.id).toBe('WE_SECRET_REALM');
    // 0.007~0.010 → 妖潮来袭
    expect(rollWorldEvent(() => 0.008)?.id).toBe('WE_DEMON_TIDE');
    // 0.010~0.012 → 宗门大比
    expect(rollWorldEvent(() => 0.011)?.id).toBe('WE_SECT_TOURNAMENT');
    // 0.012~0.0135 → 天灾临世
    expect(rollWorldEvent(() => 0.013)?.id).toBe('WE_NATURAL_DISASTER');
    // 0.0135~0.0155 → 灵气复苏
    expect(rollWorldEvent(() => 0.015)?.id).toBe('WE_HEAVEN_FAVOR');
  });

  it('世界事件均为 major 且可传播（regional/world）', () => {
    for (const e of WORLD_EVENTS) {
      expect(e.severity).toBe('major');
      expect(['regional', 'world']).toContain(e.visibility);
      expect(e.probability).toBeGreaterThan(0);
    }
  });
});
