import { describe, expect, it } from 'vitest';
import type { Character } from '@taosim/contracts';
import {
  getHexEventChance,
  moveOneStep,
  type HexTerrain,
  type WorldHexGrid,
} from '../overworld/hex-overworld-engine.js';

function makeGrid(targetTerrain: HexTerrain): WorldHexGrid {
  return {
    width: 2,
    height: 1,
    hexes: new Map([
      ['0,0', { q: 0, r: 0, terrain: 'plain', explored: true }],
      ['1,0', { q: 1, r: 0, terrain: targetTerrain, explored: false }],
    ]),
  };
}

describe('HexOverworldEngine 沿途事件节流', () => {
  it('地形事件率受控，单步最多产生一个事件', () => {
    const values = [0.01, 0.8, 0.2];
    const result = moveOneStep(
      makeGrid('forest'),
      { q: 0, r: 0 },
      1,
      0,
      {} as Character,
      { rng: () => values.shift() ?? 0.99 },
    );

    expect(result?.events).toHaveLength(1);
    expect(getHexEventChance('forest')).toBe(0.12);
    expect(getHexEventChance('wilderness')).toBeLessThan(0.2);
  });

  it('未命中事件率或进入城镇时不产生随机事件', () => {
    const noEvent = moveOneStep(
      makeGrid('forest'),
      { q: 0, r: 0 },
      1,
      0,
      {} as Character,
      { rng: () => 0.5 },
    );
    const town = moveOneStep(
      makeGrid('town'),
      { q: 0, r: 0 },
      1,
      0,
      {} as Character,
      { rng: () => 0 },
    );

    expect(noEvent?.events).toHaveLength(0);
    expect(town?.events).toHaveLength(0);
    expect(getHexEventChance('town')).toBe(0);
    expect(getHexEventChance('void')).toBe(0);
  });
});
