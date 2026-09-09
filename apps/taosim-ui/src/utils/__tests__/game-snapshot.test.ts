import { isProxy, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { createGameSnapshot } from '../game-snapshot';

describe('createGameSnapshot', () => {
  it('unwraps a reactive world root and returns an independent plain snapshot', () => {
    const source = reactive({ nested: { value: 1 }, list: [{ id: 'npc-1' }] });
    const snapshot = createGameSnapshot(source);

    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.nested)).toBe(false);
    snapshot.nested.value = 2;
    snapshot.list[0]!.id = 'npc-2';
    expect(source).toEqual({ nested: { value: 1 }, list: [{ id: 'npc-1' }] });
  });
});
