import { describe, expect, it } from 'vitest';
import {
  resolveSpatialAncestors,
  validateSpatialState,
  type SpatialState,
} from '@taosim/contracts';

function makeState(): SpatialState {
  return {
    schemaVersion: 1,
    baseMapId: 'test-map',
    baseMapSeed: 7,
    revision: 3,
    nodes: {
      root: {
        id: 'root', name: '根', kind: 'Plane',
        coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 },
        status: 'active', containsChildren: true,
      },
      area: {
        id: 'area', name: '地方', kind: 'LocalArea', parentId: 'root',
        coordinateScale: { unit: 'hex', unitsPerWorldUnit: 1 },
        status: 'active', containsChildren: true,
      },
      venue: {
        id: 'venue', name: '场所', kind: 'Venue', parentId: 'area',
        coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 },
        status: 'active', containsChildren: false,
      },
    },
    links: {
      road: {
        id: 'road', fromNodeId: 'area', toNodeId: 'venue', kind: 'road',
        distance: 2, bidirectional: true, status: 'active',
      },
    },
    features: {},
    deltas: [],
  };
}

describe('SpatialState contracts', () => {
  it('resolves containment ancestors from the concrete node to the root', () => {
    expect(resolveSpatialAncestors(makeState(), 'venue')).toEqual(['venue', 'area', 'root']);
  });

  it('reports dangling parents, links and feature scopes before runtime use', () => {
    const state = makeState();
    state.nodes.venue!.parentId = 'missing';
    state.links.road!.toNodeId = 'missing';
    state.features.rift = {
      id: 'rift', type: 'rift', lifecycle: 'active',
      scope: { nodeIds: ['missing'] },
      createdAtMinutes: 0, startsAtMinutes: 0, nextTransitionAtMinutes: 10,
      visibility: 'public', effects: {},
    };

    expect(validateSpatialState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_parent', id: 'venue' }),
      expect.objectContaining({ code: 'missing_link_endpoint', id: 'road' }),
      expect.objectContaining({ code: 'missing_feature_scope', id: 'rift' }),
    ]));
  });

  it('detects containment cycles instead of looping during address resolution', () => {
    const state = makeState();
    state.nodes.root!.parentId = 'venue';

    expect(validateSpatialState(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'containment_cycle' }),
    ]));
    expect(resolveSpatialAncestors(state, 'venue')).toEqual(['venue', 'area', 'root']);
  });
});
