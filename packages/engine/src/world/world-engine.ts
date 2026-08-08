import type { WorldState, BigEventLog, NpcRecord, Faction } from '@taosim/contracts';
import { EconomyEngine } from '../economy/economy-engine.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { characterToNpcRecord } from './npc-record-mapper.js';
import { EventCollector } from './event-collector.js';
import {
  cultivateNpc,
  realmDisplay,
  tryBreakthrough,
  tryWander,
  tryWonder,
} from './world-tick-rules.js';
import { samplePairs, socialEncounter, tryFeud } from './world-social-rules.js';

export interface MonthlyTickResult {
  updatedState: WorldState;
  events: BigEventLog[];
  npcPopulationChanged: boolean;
}

/**
 * 世界引擎 — 驱动月度 Tick（无 AI 涌现叙事）。
 * 负责：NPC 月度更新（寿元/修炼/突破/奇遇/云游）、社交相遇与寻仇（关系轨道）、
 *       人口补充、宗门维护、大事件生成。
 *
 * 持久化（世界涌现叙事设计 §3.3/§5/§9）：
 * - 状态只存精简 NpcRecord（this.state.npcs）+ 全量事件流（this.state.eventLog）
 * - 构造时从 state 恢复，推进后写回，getState() 带出 → 跨推进/跨会话连续
 * - 所有事件经 EventCollector 出口（模板渲染 + 时间戳 + 自增 id）
 */
export class WorldEngine {
  private state: WorldState;
  private npcCounter = 0;
  private factions: Map<string, Faction> = new Map();

  constructor(initialState: WorldState) {
    this.state = {
      ...initialState,
      npcs: { ...(initialState.npcs ?? {}) },
      eventLog: [...(initialState.eventLog ?? [])],
    };
  }

  /** 推进一个月，返回更新后的状态与事件列表 */
  public step(): MonthlyTickResult {
    this.advanceCalendar();

    const collector = new EventCollector(this.state.currentYear, this.state.currentMonth);
    const events: BigEventLog[] = [];
    let npcPopulationChanged = false;

    // 1. NPC 月度推进（寿元 / 修炼 / 突破 / 奇遇 / 云游）— 无 AI 涌现规则集 §4
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      npc.lifespan.age += 1 / 12;
      npc.lastUpdate = { year: this.state.currentYear, month: this.state.currentMonth };

      // 寿元耗尽 → 坐化
      if (npc.lifespan.age >= npc.lifespan.maxLifespan) {
        npc.soulState = 'PrimordialSoul';
        npc.deathYear = this.state.currentYear;
        npc.deathMonth = this.state.currentMonth;
        npc.causeOfDeath = '寿元耗尽';
        npcPopulationChanged = true;
        events.push(
          collector.emit({ key: 'death.natural', vars: { npc: npc.name }, involvedCharacterIds: [id] }),
        );
        continue;
      }

      // 修炼增长
      cultivateNpc(npc);

      // 突破判定
      const breakthrough = tryBreakthrough(npc, Math.random);
      if (breakthrough.attempted) {
        if (breakthrough.succeeded) {
          const major = breakthrough.major;
          events.push(
            collector.emit({
              key: major ? 'breakthrough.major' : 'breakthrough.minor',
              vars: { npc: npc.name, realm: realmDisplay(npc.realm) },
              involvedCharacterIds: [id],
            }),
          );
        } else {
          events.push(
            collector.emit({
              key: 'breakthrough.fail',
              vars: { npc: npc.name, realm: realmDisplay(breakthrough.nextRealm ?? npc.realm) },
              involvedCharacterIds: [id],
            }),
          );
        }
      }

      // 奇遇判定
      const wonder = tryWonder(npc, Math.random);
      if (wonder.triggered) {
        const wonderKeys: Record<string, string> = {
          treasure: 'wonder.treasure',
          heritage: 'wonder.heritage',
          injury: 'wonder.injury',
        };
        events.push(
          collector.emit({
            key: wonderKeys[wonder.type] ?? 'wonder.treasure',
            vars: { npc: npc.name },
            involvedCharacterIds: [id],
          }),
        );
      }

      // 云游判定
      if (tryWander(npc, Math.random)) {
        events.push(
          collector.emit({ key: 'travel.wander', vars: { npc: npc.name }, involvedCharacterIds: [id] }),
        );
      }
    }

    // 2. 社交相遇 + 寻仇（同地点/云游配对，关系轨道 §4.3/§4.4 — 阶段 1b）
    const now = { year: this.state.currentYear, month: this.state.currentMonth };
    const groups = new Map<string, NpcRecord[]>();
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      const key = npc.locationId ?? '__wander__';
      const list = groups.get(key) ?? [];
      list.push(npc);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const pairs = samplePairs(list, Math.random, Math.max(1, Math.floor(list.length / 20)));
      for (const [a, b] of pairs) {
        const encounter = socialEncounter(a, b, now, Math.random);
        if (encounter) {
          const vars = { npcA: a.name, npcB: b.name, npc: encounter.focalName ?? a.name };
          events.push(
            collector.emit({
              key: encounter.templateKey,
              vars,
              involvedCharacterIds: [a.id, b.id],
            }),
          );
        }
        const feud = tryFeud(a, b, now, Math.random);
        if (feud) {
          const winnerName = feud.attackerWins ? a.name : b.name;
          const loserName = feud.attackerWins ? b.name : a.name;
          events.push(
            collector.emit({
              key: feud.templateKey,
              vars: { winner: winnerName, loser: loserName, years: String(feud.injuryYears) },
              involvedCharacterIds: [a.id, b.id],
            }),
          );
          if (feud.lethal) npcPopulationChanged = true;
        }
      }
    }

    // 3. 清理已湮灭的 NPC
    const toRemove: string[] = [];
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState === 'Oblivion') toRemove.push(id);
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) delete this.state.npcs[id];
      npcPopulationChanged = true;
    }

    // 4. NPC 人口补充（低于 800 则生成散修，复用 NPCGenerator 的真实数据模型）
    if (Object.keys(this.state.npcs).length < 800) {
      const count = Math.min(10, 800 - Object.keys(this.state.npcs).length);
      for (let i = 0; i < count; i++) {
        const npc = this.spawnWildCultivator();
        this.state.npcs[npc.id] = npc;
        npcPopulationChanged = true;
        events.push(
          collector.emit({ key: 'world.spawn', vars: { npc: npc.name }, involvedCharacterIds: [npc.id] }),
        );
      }
    }

    // 5. 宗门月度维护
    for (const [, faction] of this.factions) {
      const maintenance = EconomyEngine.spiritVeinMaintenanceCost(faction.spiritVeinLevel);
      faction.treasurySpiritStones -= maintenance;
      if (faction.treasurySpiritStones < 0) {
        faction.treasurySpiritStones = 0;
        // 灵石枯竭降级灵脉
        if (faction.spiritVeinLevel > 1) {
          faction.spiritVeinLevel--;
          events.push(
            collector.emit({
              key: 'faction.veinDegrade',
              vars: { faction: faction.name, level: String(faction.spiritVeinLevel) },
              involvedCharacterIds: [],
            }),
          );
        }
      }
    }

    // 事件流持久化（编年史/传闻的数据基础）
    this.state.eventLog.push(...events);

    return { updatedState: this.getState(), events, npcPopulationChanged };
  }

  /** 快速推进 N 个月（闭关），返回摘要 */
  public fastForward(months: number): { events: BigEventLog[]; progress: number } {
    const events: BigEventLog[] = [];
    for (let i = 0; i < months; i++) {
      const result = this.step();
      events.push(...result.events);
    }
    return { events, progress: 1.0 };
  }

  public getState(): WorldState {
    return { ...this.state, npcs: { ...this.state.npcs }, eventLog: [...this.state.eventLog] };
  }

  private advanceCalendar(): void {
    this.state.currentMonth++;
    if (this.state.currentMonth > 12) {
      this.state.currentMonth = 1;
      this.state.currentYear++;
    }
    if (this.state.catastropheCountdownMonths > 0) {
      this.state.catastropheCountdownMonths--;
    }
  }

  /** 生成一个散修 NPC 并归档为 NpcRecord（境界分布：炼气为主、少量筑基/金丹） */
  private spawnWildCultivator(): NpcRecord {
    this.npcCounter++;
    const id = `NPC_${this.state.currentYear}_${this.state.currentMonth}_${this.npcCounter}`;
    const tierRoll = Math.random();
    const tier = tierRoll < 0.75 ? 1 : tierRoll < 0.95 ? 2 : 3;
    const seed = Math.floor(Math.random() * 1_000_000);
    const character = NPCGenerator.generate(tier, seed);

    const record = characterToNpcRecord(
      { ...character, id, name: character.name },
      this.state.currentYear,
      this.state.currentMonth,
    );

    // 命格（阶段 1 起影响奇遇/突破/死劫加权）：0.5% 天骄、2.5% 英才
    const destinyRoll = Math.random();
    record.destiny =
      destinyRoll < 0.005
        ? { tier: 'prodigy', luck: 95, hidden: true }
        : destinyRoll < 0.03
          ? { tier: 'talented', luck: 80, hidden: true }
          : { tier: 'common', luck: record.attributes.luck, hidden: false };
    return record;
  }
}
