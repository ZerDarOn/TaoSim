import { describe, it, expect } from 'vitest';
import { NPCGenerator } from '../interaction/npc-generator.js';

describe('NPCGenerator', () => {
  it('tier 1 生成炼气境 NPC', () => {
    const npc = NPCGenerator.generate(1, 42);
    expect(npc.realm).toMatch(/^QiRefinement/);
  });

  it('tier 3 生成筑基或金丹 NPC', () => {
    const npc = NPCGenerator.generate(3, 123);
    const realm = npc.realm as string;
    expect(realm.startsWith('Foundation') || realm.startsWith('GoldenCore')).toBe(true);
  });

  it('相同 seed 生成相同 NPC', () => {
    const a = NPCGenerator.generate(2, 999);
    const b = NPCGenerator.generate(2, 999);
    expect(a.name).toBe(b.name);
    expect(a.realm).toBe(b.realm);
  });
});
