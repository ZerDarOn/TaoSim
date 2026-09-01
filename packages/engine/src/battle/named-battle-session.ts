import type {
  BattleCommand,
  BattleSceneConfig,
  BattleStartOptions,
  BattleState,
  Character,
  HexBattleMap,
  NamedBattleParticipantResult,
  NamedBattleResolution,
  NamedEncounterContext,
} from '@taosim/contracts';
import { BattleEngine } from './battle-engine.js';

export interface NamedBattleSessionOptions {
  sceneConfig?: BattleSceneConfig;
  controllers?: BattleStartOptions['controllers'];
  initialGaugeById?: BattleStartOptions['initialGaugeById'];
}

/**
 * 具名战斗会话只编排 BattleEngine，不复制任何伤害或 AI 规则。
 * UI 可逐条 dispatch；后台可 runToCompletion，两者共享相同 seed、命令和状态机。
 */
export class NamedBattleSession {
  private readonly engine: BattleEngine;
  private readonly context: NamedEncounterContext;

  constructor(
    context: NamedEncounterContext,
    map: HexBattleMap,
    sideA: Character[],
    sideB: Character[],
    options: NamedBattleSessionOptions = {},
  ) {
    this.context = structuredClone(context);
    this.validateParticipants(sideA, sideB);
    this.engine = new BattleEngine(context.seed, context.encounterId);
    const started = this.engine.start(
      map,
      sideA,
      sideB,
      options.sceneConfig,
      { controllers: options.controllers, initialGaugeById: options.initialGaugeById },
    );
    if (started.error) throw new Error(`NamedBattleSession.start: ${started.error}`);
  }

  getState(): Readonly<BattleState> {
    return this.engine.getState();
  }

  dispatch(command: BattleCommand): { error?: string } {
    return this.engine.dispatch(command);
  }

  /** 后台确定性推进；达到 tick 上限只报告僵持，不虚构胜者。 */
  runToCompletion(): NamedBattleResolution {
    while (this.engine.getState().phase === 'Running'
      && this.engine.getState().tickNumber < this.context.maxTicks) {
      this.engine.dispatch({ type: 'AdvanceTick' });
    }
    return this.createResolution();
  }

  createResolution(): NamedBattleResolution {
    const state = this.engine.getState();
    const reachedTickLimit = state.phase === 'Running' && state.tickNumber >= this.context.maxTicks;
    const termination = reachedTickLimit
      ? 'stalemate'
      : state.endReason ?? (state.phase === 'BattleEnd' ? 'elimination' : 'stalemate');
    let winnerSide: 'A' | 'B' | null = state.winner === 'Player'
      ? 'A'
      : state.winner === 'Enemy' ? 'B' : null;
    if (!winnerSide && state.fledBy) {
      winnerSide = this.context.sideAIds.includes(state.fledBy) ? 'B' : 'A';
    }
    const eventCount = state.events.length > 0
      ? state.events[state.events.length - 1]!.sequence + 1
      : 0;
    return {
      encounterId: this.context.encounterId,
      battleId: state.battleId,
      termination,
      winnerSide,
      participants: this.participantResults(state),
      tickNumber: state.tickNumber,
      turnNumber: state.turnNumber,
      eventCount,
      reachedTickLimit,
    };
  }

  private validateParticipants(sideA: Character[], sideB: Character[]): void {
    const idsA = sideA.map((entry) => entry.id);
    const idsB = sideB.map((entry) => entry.id);
    const expectedA = [...this.context.sideAIds].sort();
    const expectedB = [...this.context.sideBIds].sort();
    if (sideA.length === 0 || sideB.length === 0
      || new Set([...idsA, ...idsB]).size !== idsA.length + idsB.length
      || JSON.stringify([...idsA].sort()) !== JSON.stringify(expectedA)
      || JSON.stringify([...idsB].sort()) !== JSON.stringify(expectedB)) {
      throw new Error('NamedBattleSession: participant_mismatch');
    }
  }

  private participantResults(state: Readonly<BattleState>): NamedBattleParticipantResult[] {
    return [...this.context.sideAIds, ...this.context.sideBIds].map((entityId) => {
      const character = state.characters[entityId]!;
      const side = this.context.sideAIds.includes(entityId) ? 'A' as const : 'B' as const;
      const result = state.fledBy === entityId
        ? 'fled' as const
        : state.surrenderedBy === entityId
          ? 'surrendered' as const
          : character.hp <= 0 ? 'down' as const : 'active' as const;
      return {
        entityId, side, hpAfter: character.hp, maxHp: character.maxHp,
        spiritEnergyAfter: character.spiritEnergy.current, result,
      };
    });
  }
}
