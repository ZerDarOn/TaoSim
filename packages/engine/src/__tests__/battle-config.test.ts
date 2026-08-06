import { describe, it, expect } from 'vitest';
import { BATTLE_CONFIG } from '../battle/battle-config.js';

describe('BATTLE_CONFIG', () => {
  it('集中配置含 Phase A 必要项', () => {
    expect(BATTLE_CONFIG.MAX_AP).toBe(3);
    expect(BATTLE_CONFIG.ATB_TICK_MS).toBe(400);
    expect(BATTLE_CONFIG.BASE_DODGE_RATE).toBeGreaterThanOrEqual(0);
    expect(BATTLE_CONFIG.MAX_DODGE_RATE).toBeLessThanOrEqual(0.3);
    expect(BATTLE_CONFIG.CRIT_MULTIPLIER).toBe(1.5);
    expect(BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER).toBe(0.5);
    expect(BATTLE_CONFIG.MAX_EVENT_HISTORY).toBeGreaterThan(0);
  });
});
