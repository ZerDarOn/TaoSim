import { describe, it, expect } from 'vitest';
import type { BigEventLog, Character } from '@taosim/contracts';
import { buildChronicle, npcTimeline, rumorPool, visibleToPlayer } from '../world/chronicle.js';

function makeEvent(overrides: Partial<BigEventLog> = {}): BigEventLog {
  return {
    id: 'EVT_1',
    year: 1,
    month: 1,
    isMajorEvent: false,
    category: 'world',
    title: '事件',
    description: '',
    involvedCharacterIds: [],
    severity: 'normal',
    visibility: 'local',
    source: 'engine',
    ...overrides,
  };
}

function makePlayer(id = 'PLAYER_1'): Character {
  return {
    id, name: '玩家', gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    spiritStones: 0, inventory: [],
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
  } as Character;
}

describe('buildChronicle', () => {
  it('按年分组并提炼 major 大事记', () => {
    const events = [
      makeEvent({ id: 'A', year: 1, severity: 'major' }),
      makeEvent({ id: 'B', year: 1, severity: 'minor' }),
      makeEvent({ id: 'C', year: 2, severity: 'epoch' }),
      makeEvent({ id: 'D', year: 2, severity: 'normal' }),
    ];
    const chronicle = buildChronicle(events);
    expect(chronicle.map(c => c.year)).toEqual([1, 2]);
    expect(chronicle[0]!.totalEvents).toBe(2);
    expect(chronicle[0]!.highlights.map(e => e.id)).toEqual(['A']);
    expect(chronicle[1]!.highlights.map(e => e.id)).toEqual(['C']);
  });

  it('空事件流返回空数组', () => {
    expect(buildChronicle([])).toEqual([]);
  });
});

describe('visibleToPlayer', () => {
  it('玩家直接参与 → 可见（即使 local 且 minor）', () => {
    const e = makeEvent({ involvedCharacterIds: ['PLAYER_1'], severity: 'minor', visibility: 'local' });
    expect(visibleToPlayer(e, makePlayer())).toBe(true);
  });

  it('world + major → 可见', () => {
    expect(visibleToPlayer(makeEvent({ severity: 'major', visibility: 'world' }), makePlayer())).toBe(true);
  });

  it('regional + normal → 可见', () => {
    expect(visibleToPlayer(makeEvent({ severity: 'normal', visibility: 'regional' }), makePlayer())).toBe(true);
  });

  it('local / 影响力不足 → 不可见（信息不对称）', () => {
    expect(visibleToPlayer(makeEvent({ severity: 'minor', visibility: 'local' }), makePlayer())).toBe(false);
    expect(visibleToPlayer(makeEvent({ severity: 'minor', visibility: 'regional' }), makePlayer())).toBe(false);
    expect(visibleToPlayer(makeEvent({ severity: 'major', visibility: 'local' }), makePlayer())).toBe(false);
  });
});

describe('npcTimeline', () => {
  it('只返回涉及其的事件，并按时间升序', () => {
    const events = [
      makeEvent({ id: 'E3', year: 2, month: 1, involvedCharacterIds: ['NPC_A'] }),
      makeEvent({ id: 'E1', year: 1, month: 3, involvedCharacterIds: ['NPC_A', 'NPC_B'] }),
      makeEvent({ id: 'E2', year: 1, month: 8, involvedCharacterIds: ['NPC_B'] }),
    ];
    expect(npcTimeline('NPC_A', events).map(e => e.id)).toEqual(['E1', 'E3']);
    expect(npcTimeline('NPC_B', events).map(e => e.id)).toEqual(['E1', 'E2']);
  });

  it('无涉及事件返回空数组', () => {
    expect(npcTimeline('NPC_X', [makeEvent({ involvedCharacterIds: ['NPC_A'] })])).toEqual([]);
  });
});

describe('rumorPool', () => {
  const now = { year: 3, month: 6 }; // 月序 30

  it('local 事件不扩散', () => {
    const events = [makeEvent({ id: 'L', year: 3, month: 1, severity: 'normal', visibility: 'local' })];
    expect(rumorPool(events, now)).toHaveLength(0);
  });

  it('regional/world 事件进入传闻池（world 当月可闻、regional 隔月可闻）', () => {
    const events = [
      makeEvent({ id: 'W', year: 3, month: 6, severity: 'major', visibility: 'world' }),
      makeEvent({ id: 'R', year: 3, month: 5, severity: 'major', visibility: 'regional' }),
    ];
    const rumors = rumorPool(events, now);
    expect(rumors.map(r => r.event.id).sort()).toEqual(['R', 'W']);
    const world = rumors.find(r => r.event.id === 'W')!;
    const regional = rumors.find(r => r.event.id === 'R')!;
    expect(world.heardAt).toEqual({ year: 3, month: 6 });
    expect(regional.heardAt).toEqual({ year: 3, month: 6 });
  });

  it('超出窗口的传闻淡出', () => {
    const events = [
      makeEvent({ id: 'OLD', year: 1, month: 1, severity: 'major', visibility: 'world' }), // 月序 1，窗口外
      makeEvent({ id: 'NEW', year: 3, month: 1, severity: 'major', visibility: 'world' }), // 月序 25，窗口内（cutoff=6）
    ];
    const rumors = rumorPool(events, now, 24);
    expect(rumors.map(r => r.event.id)).toEqual(['NEW']);
  });
});
