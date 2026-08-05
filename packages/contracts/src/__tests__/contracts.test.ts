import { describe, it, expect } from 'vitest';
import { hexKey, hexDistance, hexNeighbors, hexRing } from '../hex.js';

describe('Hex utilities', () => {
  it('hexKey formats coordinates', () => {
    expect(hexKey(3, -5)).toBe('3,-5');
  });

  it('hexDistance computes Manhattan distance in cube coords', () => {
    expect(hexDistance(0, 0, 1, -1)).toBe(1);
    expect(hexDistance(0, 0, 2, 0)).toBe(2);
    expect(hexDistance(0, 0, 0, 0)).toBe(0);
  });

  it('hexNeighbors returns 6 neighbors', () => {
    const neighbors = hexNeighbors(0, 0);
    expect(neighbors).toHaveLength(6);
    expect(neighbors).toContainEqual({ q: 1, r: 0 });
    expect(neighbors).toContainEqual({ q: 0, r: -1 });
  });

  it('hexRing returns correct number of cells', () => {
    // Radius 0 = center only
    expect(hexRing(0, 0, 0)).toHaveLength(1);
    // Radius 1 = center + 6 neighbors
    expect(hexRing(0, 0, 1)).toHaveLength(7);
    // Radius 2 = Hex number formula: 3*r^2 + 3*r + 1
    // r=2 => 3*4 + 3*2 + 1 = 19
    expect(hexRing(0, 0, 2)).toHaveLength(19);
  });
});

describe('parseRealm', () => {
  it('parses realm paths correctly', async () => {
    const { parseRealm } = await import('../character.js');
    const result = parseRealm('GoldenCore_3');
    expect(result.realmType).toBe('JinDan');
    expect(result.subLevel).toBe(3);
  });
});
