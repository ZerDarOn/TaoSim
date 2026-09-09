import { describe, expect, it } from 'vitest';
import {
  createLegacySpatialState,
  legacyLocationRefToSpatialAddress,
  legacyNpcRecordToSpatialAddress,
  legacyPlayerMapStateToSpatialAddress,
  migrateLegacySpatialSavePayload,
  reconcileSpatialCatalog,
  SPATIAL_CATALOG_VERSION,
} from '../overworld/spatial-catalog.js';
import type { NpcRecord, PlayerMapState, SavePayload } from '@taosim/contracts';
import { validateSpatialState } from '@taosim/contracts';

describe('legacy spatial catalog adapter', () => {
  it('builds one valid containment tree and link graph from the existing real catalog', () => {
    const state = createLegacySpatialState();

    expect(validateSpatialState(state)).toEqual([]);
    expect(state.nodes.NODE_CITY_TIANJI?.parentId).toBe('LOCAL_CONT_EAST_OVERWORLD');
    expect(state.nodes.TIANJI_MAIN_STREET?.parentId).toBe('NODE_CITY_TIANJI');
    expect(state.nodes.VENUE_TIANJI_TAVERN?.parentId).toBe('TIANJI_ZUIXIAN_LOU');
    expect(state.nodes.QINGYUN_MOUNTAIN_GATE?.parentId).toBe('NODE_SECT_QINGYUN');
    expect(state.nodes.VENUE_QINGYUN_HALL?.parentId).toBe('QINGYUN_HALL');
    expect(state.links.LINK_NODE_SECT_QINGYUN_NODE_CITY_TIANJI?.distance).toBe(3);
    expect(state.catalogVersion).toBe(SPATIAL_CATALOG_VERSION);
    expect(state.nodes.NODE_CITY_TIANJI?.kind).toBe('Settlement');
    expect(Object.values(state.links).some((link) =>
      link.fromNodeId === 'TIANJI_MAIN_STREET' && link.toNodeId === 'TIANJI_BAIBAO_GE')).toBe(true);
  });

  it('reconciles stable child nodes into an old v9 spatial snapshot without replacing dynamic state', () => {
    const old = createLegacySpatialState();
    delete old.nodes.TIANJI_MAIN_STREET;
    delete old.nodes.QINGYUN_MOUNTAIN_GATE;
    old.nodes.TIANJI_DARK_ALLEY!.status = 'archived';
    const blockedLink = Object.values(old.links).find((link) =>
      link.fromNodeId === 'TIANJI_MAIN_STREET' && link.toNodeId === 'TIANJI_BAIBAO_GE');
    expect(blockedLink).toBeDefined();
    blockedLink!.status = 'blocked';
    old.features.keep = {
      id: 'keep', type: 'barrier', lifecycle: 'active',
      scope: { nodeIds: ['NODE_CITY_TIANJI'] },
      createdAtMinutes: 0, startsAtMinutes: 0, visibility: 'public', effects: {},
    };
    const reconciled = reconcileSpatialCatalog(old);
    expect(reconciled.nodes.TIANJI_MAIN_STREET).toBeDefined();
    expect(reconciled.nodes.QINGYUN_MOUNTAIN_GATE).toBeDefined();
    expect(reconciled.nodes.TIANJI_DARK_ALLEY?.status).toBe('archived');
    expect(reconciled.links[blockedLink!.id]?.status).toBe('blocked');
    expect(reconciled.features.keep).toBeDefined();
    expect(reconcileSpatialCatalog(reconciled)).toBe(reconciled);
  });

  it('maps old player and NPC references without inventing an unknown formal place', () => {
    const state = createLegacySpatialState();
    const playerMap: PlayerMapState = {
      activeLayer: 'Region',
      activeCosmosId: 'COSMOS_DEFAULT',
      activeContinentId: 'CONTINENT_CANGZHOU',
      activeVenueId: null,
      exploredHexes: {},
      hexPos: { q: 10, r: 10 },
    };
    const npc = { id: 'npc_1', locationId: 'VENUE_TIANJI_TAVERN' } as NpcRecord;

    expect(legacyPlayerMapStateToSpatialAddress(playerMap, state)).toMatchObject({
      nodeId: 'LOCAL_CONT_EAST_OVERWORLD',
      coordinate: { q: 10, r: 10 },
      occupancy: 'stationary',
    });
    expect(legacyNpcRecordToSpatialAddress(npc, state)).toMatchObject({
      nodeId: 'VENUE_TIANJI_TAVERN',
      occupancy: 'stationary',
    });
    expect(legacyLocationRefToSpatialAddress({ continentId: 'CONT_EAST', nodeId: 'NODE_CITY_TIANJI' }, state))
      .toMatchObject({ nodeId: 'NODE_CITY_TIANJI' });
    expect(legacyLocationRefToSpatialAddress({ continentId: 'CONT_EAST', nodeId: 'missing' }, state)).toBeNull();
  });

  it('hydrates old save entities into the same spatial state and preserves legacy fields', () => {
    const payload = {
      header: { schemaVersion: 9 },
      worldState: {
        currentYear: 1, currentMonth: 1, elapsedMinutes: 0,
        activeContinentIds: ['CONT_EAST'], globalFlags: {}, npcs: {
          npc_1: { id: 'npc_1', locationId: 'VENUE_TIANJI_TAVERN' },
        }, eventLog: [],
      },
      player: { id: 'player_1' },
      playerMapState: {
        activeLayer: 'Region', activeCosmosId: 'COSMOS_TAIYANG', activeContinentId: 'CONT_EAST',
        activeVenueId: null, exploredHexes: {}, hexPos: { q: 2, r: 3 },
      },
      graveyard: [],
    } as unknown as SavePayload;

    const migrated = migrateLegacySpatialSavePayload(payload);

    expect(migrated.worldState.spatialState?.nodes.LOCAL_CONT_EAST_OVERWORLD).toBeDefined();
    expect(migrated.player.spatialAddress?.nodeId).toBe('LOCAL_CONT_EAST_OVERWORLD');
    expect(migrated.worldState.npcs.npc_1?.spatialAddress?.nodeId).toBe('VENUE_TIANJI_TAVERN');
    expect(migrated.worldState.npcs.npc_1?.locationId).toBe('VENUE_TIANJI_TAVERN');
  });
});
