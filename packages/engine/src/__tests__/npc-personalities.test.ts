import { describe, it, expect } from 'vitest';
import { NPC_PERSONALITIES, resolvePersonalityId } from '../data/npc-personalities.js';

const ALL_IDS = NPC_PERSONALITIES.map(p => p.id);

describe('resolvePersonalityId', () => {
  it('同 id 恒得到同一个性格（确定性）', () => {
    const id = 'NPC_GEN_12345';
    expect(resolvePersonalityId(id)).toBe(resolvePersonalityId(id));
    const id2 = 'NPC_MEET_9988';
    expect(resolvePersonalityId(id2)).toBe(resolvePersonalityId(id2));
  });

  it('不同 id 允许不同性格', () => {
    // 10 个不同 id 至少应产生 2 种以上性格（碰撞概率验证分布不是恒定的）
    const results = new Set(
      Array.from({ length: 20 }, (_, i) => resolvePersonalityId(`NPC_GEN_${i * 7919}`)),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it('返回值始终在性格池内', () => {
    expect(ALL_IDS).toContain(resolvePersonalityId('whatever-id'));
  });
});
