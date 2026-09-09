import { describe, expect, it } from 'vitest';
import type { SpatialState } from '@taosim/contracts';
import {
  advanceSpatialTravel,
  evaluateSpatialTravelPosition,
  findSpatialRoute,
  hexCoordinateDistance,
  isTravelRouteValid,
  planSpatialTravel,
  pauseSpatialTravel,
  resumeSpatialTravel,
  reverseSpatialTravel,
  MINUTES_PER_DAY,
} from '../overworld/spatial-travel.js';

function state(): SpatialState {
  return {
    schemaVersion: 1,
    baseMapId: 'test',
    baseMapSeed: 1,
    revision: 4,
    nodes: {
      root: { id: 'root', name: '根', kind: 'LocalArea', coordinateScale: { unit: 'days', unitsPerWorldUnit: 1 }, status: 'active', containsChildren: true },
      a: { id: 'a', name: '甲', kind: 'Site', parentId: 'root', coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 }, status: 'active', containsChildren: false },
      b: { id: 'b', name: '乙', kind: 'Site', parentId: 'root', coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 }, status: 'active', containsChildren: false },
      c: { id: 'c', name: '丙', kind: 'Site', parentId: 'root', coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 }, status: 'active', containsChildren: false },
    },
    links: {
      ab: { id: 'ab', fromNodeId: 'a', toNodeId: 'b', kind: 'road', distance: 2, bidirectional: true, status: 'active' },
      bc: { id: 'bc', fromNodeId: 'b', toNodeId: 'c', kind: 'road', distance: 3, bidirectional: true, status: 'active' },
      ac: { id: 'ac', fromNodeId: 'a', toNodeId: 'c', kind: 'road', distance: 10, bidirectional: true, status: 'active' },
    },
    features: {},
    deltas: [],
  };
}

describe('authoritative spatial travel', () => {
  it('finds a deterministic shortest route', () => {
    expect(findSpatialRoute(state(), 'a', 'c')?.map((segment) => segment.linkId)).toEqual(['ab', 'bc']);
  });

  it('keeps route segment direction correct while traversing bidirectional links in reverse', () => {
    expect(findSpatialRoute(state(), 'c', 'a')).toMatchObject([
      { linkId: 'bc', fromNodeId: 'c', toNodeId: 'b' },
      { linkId: 'ab', fromNodeId: 'b', toNodeId: 'a' },
    ]);
  });

  it('keeps the entity in transit until the absolute ETA', () => {
    const result = planSpatialTravel(state(), {
      travelId: 't1', entityId: 'player',
      origin: { nodeId: 'a', occupancy: 'stationary' },
      destination: { nodeId: 'c', occupancy: 'stationary' },
      movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.travel.estimatedArrivalAtMinutes).toBe(5 * 1_440);
    expect(result.travel.nextCheckpointAtMinutes).toBe(2 * 1_440);
    expect(advanceSpatialTravel(result.travel, 1_440).status).toBe('in_transit');
    expect(advanceSpatialTravel(result.travel, 5 * 1_440).status).toBe('arrived');
    expect(advanceSpatialTravel(result.travel, 1_440).remainingDistance).toBe(4);
  });

  it('freezes while paused, resumes from the same distance and can reverse from mid-segment', () => {
    const result = planSpatialTravel(state(), {
      travelId: 'pause-trip', entityId: 'player',
      origin: { nodeId: 'a', occupancy: 'stationary' },
      destination: { nodeId: 'c', occupancy: 'stationary' },
      movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paused = pauseSpatialTravel(result.travel, MINUTES_PER_DAY);
    expect(paused.status).toBe('paused');
    expect(advanceSpatialTravel(paused, 3 * MINUTES_PER_DAY).distanceTraveled).toBe(1);
    const resumed = resumeSpatialTravel(paused, 3 * MINUTES_PER_DAY);
    const progressed = advanceSpatialTravel(resumed, 4 * MINUTES_PER_DAY);
    expect(progressed.distanceTraveled).toBe(2);
    expect(evaluateSpatialTravelPosition(progressed).fromNodeId).toBe('b');

    const returning = reverseSpatialTravel(paused, 3 * MINUTES_PER_DAY);
    expect(returning.destination.nodeId).toBe('a');
    expect(returning.totalDistance).toBe(1);
    expect(advanceSpatialTravel(returning, 4 * MINUTES_PER_DAY).status).toBe('arrived');
  });

  it('does not invalidate a journey when an unrelated spatial revision changes', () => {
    const snapshot = state();
    const result = planSpatialTravel(snapshot, {
      travelId: 'stable-trip', entityId: 'player',
      origin: { nodeId: 'a', occupancy: 'stationary' },
      destination: { nodeId: 'c', occupancy: 'stationary' },
      movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    snapshot.revision += 1;
    expect(isTravelRouteValid(snapshot, result.travel, 0)).toBe(true);
  });

  it('does not resume an interrupted journey without replanning', () => {
    const result = planSpatialTravel(state(), {
      travelId: 'blocked-trip', entityId: 'player',
      origin: { nodeId: 'a', occupancy: 'stationary' },
      destination: { nodeId: 'c', occupancy: 'stationary' },
      movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const interrupted = { ...result.travel, status: 'interrupted' as const };
    expect(resumeSpatialTravel(interrupted, MINUTES_PER_DAY).status).toBe('interrupted');
  });

  it('restores progress anchors from an old v9 travel and evaluates local path coordinates', () => {
    const snapshot = state();
    const local = planSpatialTravel(snapshot, {
      travelId: 'legacy-local', entityId: 'player',
      origin: { nodeId: 'root', coordinate: { q: 0, r: 0 }, occupancy: 'stationary' },
      destination: { nodeId: 'root', coordinate: { q: 2, r: 0 }, occupancy: 'stationary' },
      movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
      routeOverride: [
        {
          linkId: 'local-1', fromNodeId: 'root', toNodeId: 'root', distance: 1, kind: 'local_path',
          fromCoordinate: { q: 0, r: 0 }, toCoordinate: { q: 1, r: 0 },
        },
        {
          linkId: 'local-2', fromNodeId: 'root', toNodeId: 'root', distance: 1, kind: 'local_path',
          fromCoordinate: { q: 1, r: 0 }, toCoordinate: { q: 2, r: 0 },
        },
      ],
    });
    expect(local.ok).toBe(true);
    if (!local.ok) return;
    const halfway = advanceSpatialTravel(local.travel, MINUTES_PER_DAY / 2);
    expect(evaluateSpatialTravelPosition(halfway).address.coordinate).toEqual({ q: 0.5, r: 0 });

    const legacy = {
      ...local.travel,
      distanceTraveled: undefined,
      currentSegmentIndex: undefined,
      distanceOnCurrentSegment: undefined,
      lastAdvancedAtMinutes: undefined,
      remainingDistance: 1,
    };
    expect(advanceSpatialTravel(legacy, 1.5 * MINUTES_PER_DAY).distanceTraveled).toBe(1.5);
  });

  it('computes local hex distance without interpreting every hex as a day', () => {
    expect(hexCoordinateDistance({ q: 2, r: -1 }, { q: -1, r: 2 })).toBe(3);
  });
});
