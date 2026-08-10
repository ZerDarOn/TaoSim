// ============================================================
// Phase 0.5 P5 测试：关注人物、事实保留与日志降噪
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  Watchlist,
  filterEventRelevance,
} from '../world/watchlist.js';
import type { NpcRecord, BigEventLog } from '@taosim/contracts';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_P5_1',
    name: '测试NPC',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 25, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1, birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<BigEventLog> = {}): BigEventLog {
  return {
    id: 'EVT_TEST',
    year: 1, month: 1,
    isMajorEvent: false,
    category: 'world',
    title: '测试事件',
    description: '测试摘要',
    involvedCharacterIds: [],
    severity: 'normal',
    visibility: 'world',
    source: 'engine',
    ...overrides,
  };
}

// ============================================================
// Watchlist 管理
// ============================================================
describe('P5 Watchlist 管理', () => {
  it('添加/移除关注 NPC', () => {
    const wl = new Watchlist();
    expect(wl.isWatched('NPC_A')).toBe(false);

    wl.add('NPC_A');
    expect(wl.isWatched('NPC_A')).toBe(true);

    wl.remove('NPC_A');
    expect(wl.isWatched('NPC_A')).toBe(false);
  });

  it('获取全部关注列表', () => {
    const wl = new Watchlist();
    wl.add('NPC_A');
    wl.add('NPC_B');

    const all = wl.getAll();
    expect(all).toContain('NPC_A');
    expect(all).toContain('NPC_B');
    expect(all.length).toBe(2);
  });
});

// ============================================================
// 事件相关性分层
// ============================================================
describe('P5 事件相关性分层', () => {
  it('关注人物的事件 → timeline 层（最高优先）', () => {
    const wl = new Watchlist();
    wl.add('NPC_A');

    const event = makeEvent({ involvedCharacterIds: ['NPC_A'], severity: 'minor' });
    const layer = filterEventRelevance(event, wl);

    expect(layer).toBe('timeline');
  });

  it('非关注人物的 normal 事件 → world 层', () => {
    const wl = new Watchlist();
    const event = makeEvent({ involvedCharacterIds: ['NPC_UNKNOWN'], severity: 'normal' });
    const layer = filterEventRelevance(event, wl);

    expect(layer).toBe('world');
  });

  it('非关注人物的 minor 事件 → filtered（降噪）', () => {
    const wl = new Watchlist();
    const event = makeEvent({ involvedCharacterIds: ['NPC_UNKNOWN'], severity: 'minor', category: 'world' });
    const layer = filterEventRelevance(event, wl);

    expect(layer).toBe('filtered');
  });

  it('epoch 世界事件 → world 层（无论关注与否）', () => {
    const wl = new Watchlist();
    const event = makeEvent({ severity: 'epoch', category: 'world' });
    const layer = filterEventRelevance(event, wl);

    expect(layer).toBe('world');
  });

  it('同地点 visible=local 事件 → local 层', () => {
    const wl = new Watchlist();
    const event = makeEvent({
      involvedCharacterIds: ['NPC_UNKNOWN'],
      severity: 'normal',
      visibility: 'local',
    });
    const layer = filterEventRelevance(event, wl);

    expect(layer).toBe('local');
  });
});

// ============================================================
// 红线 #7：关注人物不得获得剧情保护或概率特权
// ============================================================
describe('P5 红线：关注人物无特权', () => {
  it('watchlist 不提供任何数值修正', () => {
    const wl = new Watchlist();
    wl.add('NPC_A');

    // watchlist 不含任何概率/属性修正字段
    expect(wl.getBonus('NPC_A')).toBeUndefined();
  });
});
