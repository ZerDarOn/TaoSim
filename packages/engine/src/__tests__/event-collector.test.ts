import { describe, it, expect } from 'vitest';
import { findTemplate, renderTemplate, EVENT_TEMPLATES } from '../world/event-templates.js';
import { EventCollector } from '../world/event-collector.js';

describe('event-templates', () => {
  it('渲染占位符（缺失变量原样保留）', () => {
    expect(renderTemplate('{npc} 突破至{realm}！', { npc: '张三', realm: '筑基' })).toBe('张三 突破至筑基！');
    expect(renderTemplate('{npc} 于 {location}', { npc: '张三' })).toBe('张三 于 {location}');
  });

  it('模板键唯一且覆盖世界引擎全部事件类型', () => {
    const keys = EVENT_TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of [
      'death.natural', 'breakthrough.major', 'breakthrough.minor', 'breakthrough.fail',
      'wonder.treasure', 'wonder.heritage', 'wonder.injury', 'travel.wander',
      'social.meet', 'social.dao', 'social.spar', 'social.grudge',
      'combat.feed.win', 'combat.feed.lethal', 'world.spawn', 'faction.veinDegrade',
    ]) {
      expect(findTemplate(key)).toBeDefined();
    }
  });

  it('unknown key 返回 undefined', () => {
    expect(findTemplate('not.exist')).toBeUndefined();
  });
});

describe('EventCollector', () => {
  it('按模板生成事件：id/时间/severity/visibility/source', () => {
    const collector = new EventCollector(3, 5);
    const evt = collector.emit({
      key: 'breakthrough.major',
      vars: { npc: '张三', realm: '金丹' },
      involvedCharacterIds: ['NPC_1'],
    });
    expect(evt.year).toBe(3);
    expect(evt.month).toBe(5);
    expect(evt.id).toMatch(/^EVT_3_5_\d+$/);
    expect(evt.title).toBe('张三 突破至金丹！');
    expect(evt.category).toBe('cultivation');
    expect(evt.severity).toBe('major');
    expect(evt.visibility).toBe('regional');
    expect(evt.source).toBe('engine');
    expect(evt.isMajorEvent).toBe(true);
  });

  it('未知模板键抛错（杜绝手拼事件文本）', () => {
    const collector = new EventCollector(1, 1);
    expect(() =>
      collector.emit({ key: 'no.such.template', vars: {}, involvedCharacterIds: [] }),
    ).toThrow(/未知事件模板/);
  });

  it('setTime 同步时间戳，relatedTo 串因果链', () => {
    const collector = new EventCollector(1, 1);
    const first = collector.emit({ key: 'wonder.heritage', vars: { npc: '张三' }, involvedCharacterIds: ['NPC_1'] });
    collector.setTime(1, 2);
    const second = collector.emit({
      key: 'breakthrough.major',
      vars: { npc: '张三', realm: '筑基' },
      involvedCharacterIds: ['NPC_1'],
      relatedTo: [first],
    });
    expect(second.year).toBe(1);
    expect(second.month).toBe(2);
    expect(second.relatedEventIds).toEqual([first.id]);
  });

  it('minor 事件 isMajorEvent=false', () => {
    const collector = new EventCollector(1, 1);
    const evt = collector.emit({ key: 'travel.wander', vars: { npc: '张三' }, involvedCharacterIds: ['NPC_1'] });
    expect(evt.severity).toBe('minor');
    expect(evt.isMajorEvent).toBe(false);
  });
});
