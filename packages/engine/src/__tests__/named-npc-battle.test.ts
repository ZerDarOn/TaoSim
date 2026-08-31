import { describe, expect, it } from 'vitest';
import { createInitialBrainState, type NpcRecord, type WorldState } from '@taosim/contracts';
import { commitNamedNpcBattleSimulation, simulateNamedNpcBattle } from '../world/named-npc-battle.js';

function npc(id: string, physique: number): NpcRecord {
  const record = {
    id, name: id, gender: 'Male', personalityId: 'cautious', origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false }, realm: 'QiRefinement_1',
    soulState: 'Active', cultivation: { currentExp: 0, maxExp: 100 }, locationId: 'arena',
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    attributes: { physique, comprehension: physique, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 20, maxLifespan: 100 }, skillIds: [], spiritStones: id === 'defender' ? 100 : 0,
    birthYear: 1, birthMonth: 1, aspiration: 'seekRevenge', relations: {},
    biography: { milestones: [], summary: '' }, lastUpdate: { year: 1, month: 1 },
  } as NpcRecord;
  record.brain = createInitialBrainState({
    npcId: id, personalityId: record.personalityId, aspiration: record.aspiration,
    birthYear: 1, birthMonth: 1,
  }, { year: 1, month: 1 });
  return record;
}

function world(): WorldState {
  const attacker = npc('attacker', 80);
  const defender = npc('defender', 2);
  return {
    currentYear: 1, currentMonth: 2, catastropheCountdownMonths: 600,
    activeContinentIds: [], globalFlags: {}, npcs: { attacker, defender }, eventLog: [],
    worldRevision: 0, facts: [],
  };
}

describe('named NPC battle world closure', () => {
  it('生死战先模拟后原子回写死亡、灵石、关系、事实和双方记忆', () => {
    const state = world();
    const request = {
      encounterId: 'feud_1', attackerId: 'attacker', defenderId: 'defender',
      kind: 'deadly' as const, locationId: 'arena', seed: 7,
      allowFlee: false, allowSurrender: false,
      lootPolicy: 'all_on_elimination' as const, relationPolicy: 'hostile' as const,
    };
    const simulated = simulateNamedNpcBattle(state, request);
    expect(simulated.status).toBe('simulated');
    if (simulated.status !== 'simulated') return;
    expect(simulated.simulation.resolution.reachedTickLimit).toBe(false);

    const committed = commitNamedNpcBattleSimulation(state, request, simulated.simulation);

    expect(committed.status).toBe('committed');
    expect(state.npcs.defender!.soulState).toBe('RemnantSoul');
    expect(state.npcs.attacker!.spiritStones).toBe(100);
    expect(state.npcs.defender!.spiritStones).toBe(0);
    expect(state.npcs.attacker!.relations.defender?.type).toBe('enemy');
    expect(state.facts).toEqual([expect.objectContaining({ type: 'battle', outcomeId: 'feud_1' })]);
    expect(state.npcs.attacker!.brain!.memories).toEqual([
      expect.objectContaining({ factId: 'fact:battle:feud_1', kind: 'success' }),
    ]);
    expect(state.npcs.defender!.brain!.memories).toEqual([
      expect.objectContaining({ factId: 'fact:battle:feud_1', kind: 'trauma' }),
    ]);

    expect(commitNamedNpcBattleSimulation(state, request, simulated.simulation).status).toBe('already_committed');
    expect(state.npcs.attacker!.spiritStones).toBe(100);
  });

  it('切磋落败不会杀死 NPC，只留下短期轻伤', () => {
    const state = world();
    const request = {
      encounterId: 'duel_1', attackerId: 'attacker', defenderId: 'defender',
      kind: 'duel' as const, locationId: 'arena', seed: 7,
      allowFlee: false, allowSurrender: false,
      lootPolicy: 'none' as const, relationPolicy: 'preserve' as const,
    };
    const simulated = simulateNamedNpcBattle(state, request);
    expect(simulated.status).toBe('simulated');
    if (simulated.status !== 'simulated') return;

    expect(commitNamedNpcBattleSimulation(state, request, simulated.simulation).status).toBe('committed');
    expect(state.npcs.defender!.soulState).toBe('Active');
    expect(state.conditions?.defender?.injuries).toEqual([
      expect.objectContaining({ level: 'minor', source: 'named_duel' }),
    ]);
    expect(state.npcs.attacker!.relations.defender).toBeUndefined();
  });
});
