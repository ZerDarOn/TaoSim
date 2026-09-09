import { describe, expect, it } from 'vitest';
import { resolvePlayerHexProjection } from '../player-spatial-projection';

describe('resolvePlayerHexProjection', () => {
  it('keeps the authoritative coordinate when a stale map cache and legacy landmark disagree', () => {
    const result = resolvePlayerHexProjection(
      { nodeId: 'LOCAL_CONT_EAST_OVERWORLD', coordinate: { q: 12, r: 5 }, occupancy: 'stationary' },
      { q: 10, r: 5 },
      () => ({ q: 10, r: 5 }),
    );

    expect(result).toEqual({ position: { q: 12, r: 5 }, source: 'authority-coordinate' });
  });

  it('projects an authoritative landmark node before consulting the map cache', () => {
    const result = resolvePlayerHexProjection(
      { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
      { q: 2, r: 2 },
      (nodeId) => nodeId === 'NODE_CITY_TIANJI' ? { q: 14, r: 4 } : null,
    );

    expect(result).toEqual({ position: { q: 14, r: 4 }, source: 'authority-node' });
  });

  it('preserves the map cache only when no authoritative position can be projected', () => {
    const result = resolvePlayerHexProjection(undefined, { q: 7, r: 9 }, () => null);
    expect(result).toEqual({ position: { q: 7, r: 9 }, source: 'map-cache' });
  });
});
