import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdventureEngine } from '../adventure-engine.js';
import { ContentRegistry } from '../content-registry.js';
import type { AdventureEvent, AdventureChoice, AdventureOutcome } from '../../data/adventure-events.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'player_1', name: '测试者', gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [], equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, spiritStones: 0,
    wantedLevels: {}, unlockedRecipes: [],
    ...overrides,
  } as Character;
}

function makeEvent(overrides: Partial<AdventureEvent> = {}): AdventureEvent {
  return {
    id: 'EVT_TEST',
    title: '测试事件',
    category: 'fortune',
    description: '测试用奇遇事件',
    triggerCondition: { probability: 0.5 },
    choices: [
      {
        label: '接受',
        description: '接受命运的馈赠',
        outcomes: [{ type: 'exp', value: 100, probability: 1.0 }],
      },
      {
        label: '拒绝',
        description: '谨慎地走开',
        outcomes: [{ type: 'exp', value: 10, probability: 1.0 }],
      },
    ],
    ...overrides,
  };
}

function makeChoice(overrides: Partial<AdventureChoice> = {}): AdventureChoice {
  return {
    label: '测试选项',
    description: '测试选项描述',
    outcomes: [{ type: 'exp', value: 50, probability: 1.0 }],
    ...overrides,
  };
}

describe('AdventureEngine', () => {
  // 清空并注册事件池
  beforeEach(() => {
    ContentRegistry.reset();
  });

  afterEach(() => {
    ContentRegistry.reset();
  });

  describe('rollEvent', () => {
    it('事件池为空时返回 null', () => {
      const player = makePlayer();
      const result = AdventureEngine.rollEvent(player);
      expect(result).toBeNull();
    });

    it('有可用事件时返回事件（默认权重）', () => {
      ContentRegistry.registerAdventureEvent(makeEvent({ id: 'EVT_1' }));
      ContentRegistry.registerAdventureEvent(makeEvent({ id: 'EVT_2' }));

      const player = makePlayer();
      const result = AdventureEngine.rollEvent(player);
      expect(result).not.toBeNull();
      // 注册的只有两个事件，结果应该是其中之一
      expect(['EVT_1', 'EVT_2']).toContain(result!.id);
    });

    it('高概率事件更容易被选中', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_COMMON', triggerCondition: { probability: 1.0 } }),
      );
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_RARE', triggerCondition: { probability: 0.01 } }),
      );

      const player = makePlayer({ attributes: { ...makePlayer().attributes, luck: 1 } });

      // 多次采样，验证 EVT_COMMON 更频繁
      let commonCount = 0;
      const trials = 100;
      for (let i = 0; i < trials; i++) {
        const result = AdventureEngine.rollEvent(player);
        if (result?.id === 'EVT_COMMON') commonCount++;
      }

      // 高概率事件应占绝大多数（允许偶尔抽到低概率）
      expect(commonCount).toBeGreaterThan(trials * 0.7);
    });

    it('luckBonus 增加权重', () => {
      ContentRegistry.registerAdventureEvent(makeEvent({ id: 'EVT_1', triggerCondition: { probability: 0.3 } }));

      const player = makePlayer({ attributes: { ...makePlayer().attributes, luck: 10 } });
      // 高 luckBonus 应该增加权重，但仍应返回事件
      const result = AdventureEngine.rollEvent(player, undefined, 1000);
      expect(result).not.toBeNull();
    });
  });

  describe('getAvailableEvents', () => {
    it('无条件事件始终可用', () => {
      ContentRegistry.registerAdventureEvent(makeEvent({ id: 'EVT_FREE', triggerCondition: undefined }));
      const player = makePlayer();
      const events = AdventureEngine.getAvailableEvents(player);
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe('EVT_FREE');
    });

    it('minRealm 条件：境界不足时过滤', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_HIGH', triggerCondition: { minRealm: 'Foundation_1', probability: 0.5 } }),
      );
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_LOW', triggerCondition: { minRealm: 'QiRefinement_1', probability: 0.5 } }),
      );

      const qrPlayer = makePlayer({ realm: 'QiRefinement_1' });
      const events = AdventureEngine.getAvailableEvents(qrPlayer);
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe('EVT_LOW');
    });

    it('境界满足时 filter 通过', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_FOUNDATION', triggerCondition: { minRealm: 'Foundation_1', probability: 0.5 } }),
      );

      const player = makePlayer({ realm: 'Foundation_1' });
      const events = AdventureEngine.getAvailableEvents(player);
      expect(events).toHaveLength(1);
    });

    it('minLuck 条件：气运不足时过滤', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_LUCKY', triggerCondition: { minLuck: 50, probability: 0.5 } }),
      );

      const unlucky = makePlayer({ attributes: { ...makePlayer().attributes, luck: 10 } });
      expect(AdventureEngine.getAvailableEvents(unlucky)).toHaveLength(0);

      const lucky = makePlayer({ attributes: { ...makePlayer().attributes, luck: 60 } });
      expect(AdventureEngine.getAvailableEvents(lucky)).toHaveLength(1);
    });

    it('minCharm 条件：仙姿不足时过滤', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_CHARM', triggerCondition: { minCharm: 30, probability: 0.5 } }),
      );

      const ugly = makePlayer({ attributes: { ...makePlayer().attributes, charm: 10 } });
      expect(AdventureEngine.getAvailableEvents(ugly)).toHaveLength(0);

      const charming = makePlayer({ attributes: { ...makePlayer().attributes, charm: 40 } });
      expect(AdventureEngine.getAvailableEvents(charming)).toHaveLength(1);
    });

    it('nodeType 条件：节点类型不匹配时过滤', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_CITY', triggerCondition: { nodeType: 'City', probability: 0.5 } }),
      );
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_WILD', triggerCondition: { nodeType: 'Wilderness', probability: 0.5 } }),
      );

      const player = makePlayer();
      const cityEvents = AdventureEngine.getAvailableEvents(player, 'City');
      expect(cityEvents).toHaveLength(1);
      expect(cityEvents[0]!.id).toBe('EVT_CITY');
    });

    it('nodeType 为 undefined 时不按节点过滤', () => {
      ContentRegistry.registerAdventureEvent(
        makeEvent({ id: 'EVT_CITY', triggerCondition: { nodeType: 'City', probability: 0.5 } }),
      );

      const player = makePlayer();
      // 不传 nodeType，不按节点过滤
      const events = AdventureEngine.getAvailableEvents(player);
      expect(events).toHaveLength(1);
    });
  });

  describe('canChoose', () => {
    it('无条件选项始终可选', () => {
      const choice = makeChoice();
      expect(AdventureEngine.canChoose(makePlayer(), choice)).toBe(true);
    });

    it('minRealm 不足时不可选', () => {
      const choice = makeChoice({
        condition: { minRealm: 'Foundation_1' },
        outcomes: [],
      });
      const player = makePlayer({ realm: 'QiRefinement_1' });
      expect(AdventureEngine.canChoose(player, choice)).toBe(false);
    });

    it('境界满足时可选', () => {
      const choice = makeChoice({
        condition: { minRealm: 'Foundation_1' },
        outcomes: [],
      });
      const player = makePlayer({ realm: 'Foundation_1' });
      expect(AdventureEngine.canChoose(player, choice)).toBe(true);
    });

    it('minLuck 不足时不可选', () => {
      const choice = makeChoice({
        condition: { minLuck: 30 },
        outcomes: [],
      });
      const lowLuck = makePlayer({ attributes: { ...makePlayer().attributes, luck: 10 } });
      expect(AdventureEngine.canChoose(lowLuck, choice)).toBe(false);
    });

    it('minAttribute + minValue 检查属性', () => {
      const choice = makeChoice({
        condition: { minAttribute: 'physique', minValue: 20 },
        outcomes: [],
      });
      const weak = makePlayer({ attributes: { ...makePlayer().attributes, physique: 10 } });
      expect(AdventureEngine.canChoose(weak, choice)).toBe(false);

      const strong = makePlayer({ attributes: { ...makePlayer().attributes, physique: 25 } });
      expect(AdventureEngine.canChoose(strong, choice)).toBe(true);
    });
  });

  describe('resolveChoice', () => {
    it('probability 为 1.0 的 outcome 必定返回', () => {
      const choice = makeChoice({
        outcomes: [{ type: 'exp', value: 100, probability: 1.0 }],
      });
      const results = AdventureEngine.resolveChoice(choice);
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('exp');
      expect(results[0]!.value).toBe(100);
    });

    it('没有 outcomes 的选项返回空数组', () => {
      const choice = makeChoice({ outcomes: [] });
      const results = AdventureEngine.resolveChoice(choice);
      expect(results).toHaveLength(0);
    });

    it('probability 为 0 的 outcome 不返回但至少返回一个', () => {
      const choice = makeChoice({
        outcomes: [{ type: 'exp', value: 50, probability: 0 }],
      });
      const results = AdventureEngine.resolveChoice(choice);
      // 当所有概率性结果都不触发时，至少返回第一个
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('exp');
      expect(results[0]!.value).toBe(50);
    });

    it('多 outcomes 部分触发', () => {
      // Mock Math.random 来精确控制
      const origRandom = Math.random;
      let callCount = 0;
      Math.random = () => {
        callCount++;
        // 第一次调用（第一个 outcome，prob=0.5）：返回 0.6 → 不触发
        // 第二次调用（第二个 outcome，prob=0.5）：返回 0.3 → 触发
        return callCount === 1 ? 0.6 : 0.3;
      };

      const choice = makeChoice({
        outcomes: [
          { type: 'exp', value: 100, probability: 0.5 },
          { type: 'item', value: 'item_sword', probability: 0.5 },
        ],
      });

      const results = AdventureEngine.resolveChoice(choice);
      // 第一个不触发，第二个触发
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('item');

      Math.random = origRandom;
    });
  });
});
