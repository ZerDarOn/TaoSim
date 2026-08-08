import type { WorldState, BigEventLog, NpcRecord, Faction } from '@taosim/contracts';
import { EconomyEngine } from '../economy/economy-engine.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { characterToNpcRecord } from './npc-record-mapper.js';

export interface MonthlyTickResult {
  updatedState: WorldState;
  events: BigEventLog[];
  npcPopulationChanged: boolean;
}

/**
 * 世界引擎 — 驱动月度 Tick（无 AI 涌现叙事）。
 * 负责：NPC 月度更新（寿元/人口）、宗门外交骰子、灵石产出、大事件生成。
 *
 * NPC 持久化（世界涌现叙事设计 §3.3/§9）：
 * - 状态只存精简 NpcRecord（this.state.npcs），随 WorldState 持久化
 * - 构造时从 state.npcs 恢复，推进后写回，getState() 带出 → 跨推进/跨会话连续
 */
export class WorldEngine {
  private state: WorldState;
  private npcCounter = 0;
  private eventCounter = 0;
  private factions: Map<string, Faction> = new Map();

  constructor(initialState: WorldState) {
    this.state = {
      ...initialState,
      npcs: { ...(initialState.npcs ?? {}) },
    };
  }

  /** 推进一个月，返回更新后的状态与事件列表 */
  public step(): MonthlyTickResult {
    this.advanceCalendar();

    const events: BigEventLog[] = [];
    let npcPopulationChanged = false;

    // 1. NPC 寿元检查（基于精简档案；元神不再老化）
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      npc.lifespan.age += 1 / 12;
      if (npc.lifespan.age >= npc.lifespan.maxLifespan) {
        npc.soulState = 'PrimordialSoul';
        npc.deathYear = this.state.currentYear;
        npc.deathMonth = this.state.currentMonth;
        npc.causeOfDeath = '寿元耗尽';
        npc.lastUpdate = { year: this.state.currentYear, month: this.state.currentMonth };
        npcPopulationChanged = true;
        events.push({
          id: this.generateEventId(),
          year: this.state.currentYear,
          month: this.state.currentMonth,
          isMajorEvent: false,
          category: 'world',
          title: `${npc.name} 坐化`,
          description: `${npc.name} 寿元耗尽，元神出窍，留下一段修行往事`,
          involvedCharacterIds: [id],
        });
      }
    }

    // 2. 清理已湮灭的 NPC
    const toRemove: string[] = [];
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState === 'Oblivion') toRemove.push(id);
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) delete this.state.npcs[id];
      npcPopulationChanged = true;
    }

    // 3. NPC 人口补充（低于 800 则生成散修，复用 NPCGenerator 的真实数据模型）
    if (Object.keys(this.state.npcs).length < 800) {
      const count = Math.min(10, 800 - Object.keys(this.state.npcs).length);
      for (let i = 0; i < count; i++) {
        const npc = this.spawnWildCultivator();
        this.state.npcs[npc.id] = npc;
        npcPopulationChanged = true;
        events.push({
          id: this.generateEventId(),
          year: this.state.currentYear,
          month: this.state.currentMonth,
          isMajorEvent: false,
          category: 'world',
          title: `散修 ${npc.name} 出世`,
          description: `${npc.name} 踏入修仙之路`,
          involvedCharacterIds: [npc.id],
        });
      }
    }

    // 4. 宗门月度维护
    for (const [, faction] of this.factions) {
      const maintenance = EconomyEngine.spiritVeinMaintenanceCost(faction.spiritVeinLevel);
      faction.treasurySpiritStones -= maintenance;
      if (faction.treasurySpiritStones < 0) {
        faction.treasurySpiritStones = 0;
        // 灵石枯竭降级灵脉
        if (faction.spiritVeinLevel > 1) {
          faction.spiritVeinLevel--;
          events.push({
            id: this.generateEventId(),
            year: this.state.currentYear, month: this.state.currentMonth,
            isMajorEvent: true,
            category: 'world',
            title: `${faction.name} 灵脉降级`,
            description: `${faction.name} 灵石耗尽，灵脉降至 ${faction.spiritVeinLevel} 阶`,
            involvedCharacterIds: [],
          });
        }
      }
    }

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
    return { ...this.state, npcs: { ...this.state.npcs } };
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

  private generateEventId(): string {
    this.eventCounter++;
    return `EVT_${this.state.currentYear}_${this.state.currentMonth}_${this.eventCounter}`;
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
