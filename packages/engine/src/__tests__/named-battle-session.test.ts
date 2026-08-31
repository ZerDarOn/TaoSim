import { describe, expect, it } from 'vitest';
import type { Character, HexBattleMap, NamedEncounterContext } from '@taosim/contracts';
import { NamedBattleSession } from '../battle/named-battle-session.js';

function character(id: string, physique = 12): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 }, lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 30, max: 30 }, monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 40, maxHp: 40, ap: 3, canFly: false, inventory: [],
    equipmentSlots: {
      weapon: { id: `${id}_weapon`, name: '剑', tier: 1, type: 'Equipment', attributes: { attack: 20 } },
      treasures: [],
    },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, spiritStones: 0,
    wantedLevels: {}, unlockedRecipes: [],
  };
}

function map(): HexBattleMap {
  const tiles: HexBattleMap['tiles'] = {};
  for (let q = 0; q < 7; q++) for (let r = 0; r < 7; r++) {
    tiles[`${q},${r}`] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
  }
  return { width: 7, height: 7, tiles };
}

function context(id: string): NamedEncounterContext {
  return {
    encounterId: id, kind: 'deadly', seed: 42, locationId: 'arena',
    startedAt: { year: 1, month: 1 }, sideAIds: ['a'], sideBIds: ['b'], maxTicks: 500,
  };
}

describe('NamedBattleSession', () => {
  it('相同 seed、参与者与全 AI 控制产生完全相同结果和诊断轨迹', () => {
    const run = () => {
      const session = new NamedBattleSession(context('same_battle'), map(), [character('a')], [character('b')], {
        sceneConfig: { fleeEnabled: false, surrenderEnabled: false },
        controllers: { a: 'AI', b: 'AI' },
      });
      const resolution = session.runToCompletion();
      return { resolution, state: session.getState() };
    };

    const first = run();
    const second = run();
    expect(first.resolution).toEqual(second.resolution);
    expect(first.state.characters).toEqual(second.state.characters);
    expect(first.state.events).toEqual(second.state.events);
    expect(first.resolution.reachedTickLimit).toBe(false);
    expect(first.state.events.some((event) => event.type === 'ai_decision')).toBe(true);
  });

  it('任意阵营都能投降，并由内核记录结束原因和胜方', () => {
    const session = new NamedBattleSession(context('surrender_battle'), map(), [character('a')], [character('b')], {
      sceneConfig: { fleeEnabled: false, surrenderEnabled: true },
      controllers: { a: 'Human', b: 'AI' },
    });
    while (session.getState().currentTurnId !== 'a') session.dispatch({ type: 'AdvanceTick' });

    expect(session.dispatch({ type: 'Surrender', actorId: 'a' }).error).toBeUndefined();
    expect(session.getState()).toMatchObject({
      phase: 'BattleEnd', winner: 'Enemy', surrenderedBy: 'a', endReason: 'surrender', currentTurnId: null,
    });
    expect(session.createResolution()).toMatchObject({ termination: 'surrender', winnerSide: 'B' });
  });
});
