import { describe, expect, it } from 'vitest';
import { generateLegendaryNpcs } from '../world/legendary-npc-generator.js';

describe('generateLegendaryNpcs（开局传奇 NPC — §7.4 世界背景先行）', () => {
  const npcs = generateLegendaryNpcs();

  it('产出至少 3 名传奇 NPC，id 唯一且非空', () => {
    expect(npcs.length).toBeGreaterThanOrEqual(3);
    const ids = npcs.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of npcs) {
      expect(n.id).toBeTruthy();
      expect(n.name).toBeTruthy();
    }
  });

  it('境界覆盖高境界（含元婴及以上），且全部 Active', () => {
    const hasHighRealm = npcs.some(
      (n) => n.realm.startsWith('NascentSoul') || n.realm.startsWith('SoulFormation'),
    );
    expect(hasHighRealm).toBe(true);
    for (const n of npcs) expect(n.soulState).toBe('Active');
  });

  it('事迹认定：tier 出生一律 common（果），先天出身（因）不隐藏，luck 高', () => {
    for (const n of npcs) {
      // tier（果）必须由"做到的事"认定，出生不得预置天骄/传奇标签
      expect(n.destiny.tier).toBe('common');
      expect(n.destiny.born).toBeDefined();
      expect(n.destiny.luck).toBeGreaterThanOrEqual(70);
      expect(n.destiny.hidden).toBe(false);
    }
  });

  it('余寿充足且修为未满：age < maxLifespan，currentExp < maxExp，出生年与年龄自洽', () => {
    for (const n of npcs) {
      expect(n.lifespan.age).toBeLessThan(n.lifespan.maxLifespan);
      expect(n.cultivation.currentExp).toBeLessThan(n.cultivation.maxExp);
      // 元年正月开局：出生年 = 1 - 年龄
      expect(n.birthYear).toBe(1 - Math.round(n.lifespan.age));
    }
  });

  it('生平完整：summary 与 milestones 非空', () => {
    for (const n of npcs) {
      expect(n.biography.summary.length).toBeGreaterThan(0);
      expect(n.biography.milestones.length).toBeGreaterThan(0);
    }
  });

  it('境界越高寿元越长（化神 > 元婴 > 金丹）', () => {
    const maxByRealm = new Map<string, number>();
    for (const n of npcs) {
      const major = n.realm.split('_')[0]!;
      maxByRealm.set(major, Math.max(maxByRealm.get(major) ?? 0, n.lifespan.maxLifespan));
    }
    expect(maxByRealm.get('SoulFormation')!).toBeGreaterThan(maxByRealm.get('NascentSoul')!);
    expect(maxByRealm.get('NascentSoul')!).toBeGreaterThan(maxByRealm.get('GoldenCore')!);
  });

  it('宗门恩怨关系双向互引且指向真实传奇 NPC', () => {
    const byId = new Map(npcs.map((n) => [n.id, n]));
    for (const n of npcs) {
      for (const targetId of Object.keys(n.relations)) {
        const target = byId.get(targetId);
        expect(target).toBeDefined(); // 引用真实传奇 NPC
        expect(target!.relations[n.id]).toBeDefined(); // 双向互引
      }
    }
  });
});
