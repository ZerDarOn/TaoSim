import type { WorldState, BigEventLog, Character, RealmFullPath, Faction } from '@taosim/contracts';
import { LifecycleManager } from '../lifecycle/lifecycle-manager.js';
import { EconomyEngine } from '../economy/economy-engine.js';

export interface MonthlyTickResult {
  updatedState: WorldState;
  events: BigEventLog[];
  npcPopulationChanged: boolean;
}

/**
 * 世界引擎 — 驱动月度 Tick。
 * 负责：NPC 月度更新、宗门外交骰子、灵石产出、大事件生成。
 */
export class WorldEngine {
  private state: WorldState;
  private activeNPCs: Map<string, Character> = new Map();
  private npcCounter = 0;
  private factions: Map<string, Faction> = new Map();

  constructor(initialState: WorldState) {
    this.state = { ...initialState };
  }

  /** 推进一个月，返回更新后的状态与事件列表 */
  public step(): MonthlyTickResult {
    this.advanceCalendar();

    const events: BigEventLog[] = [];
    let npcPopulationChanged = false;

    // 1. NPC 寿元检查
    for (const [id, npc] of this.activeNPCs) {
      const lifespanResult = LifecycleManager.checkLifespan(npc);
      if (lifespanResult.willDie) {
        const deathResult = LifecycleManager.handleDeath(npc, '寿元耗尽');
        npcPopulationChanged = true;
        events.push({
          id: this.generateEventId(),
          year: this.state.currentYear,
          month: this.state.currentMonth,
          isMajorEvent: false,
          title: `${npc.name} 坐化`,
          description: `${npc.name} 寿元耗尽，${deathResult.newSoulState === 'PrimordialSoul' ? '元神出窍' : '残魂消散'}`,
          involvedCharacterIds: [id],
        });
        npc.soulState = deathResult.newSoulState;
      } else {
        npc.lifespan.age += 1 / 12;
      }
    }

    // 2. 清理已湮灭的 NPC
    for (const [id, npc] of this.activeNPCs) {
      if (npc.soulState === 'Oblivion') {
        this.activeNPCs.delete(id);
        npcPopulationChanged = true;
      }
    }

    // 3. NPC 人口补充（低于 800 则生成散修）
    if (this.activeNPCs.size < 800) {
      const count = Math.min(10, 800 - this.activeNPCs.size);
      for (let i = 0; i < count; i++) {
        const npc = this.generateWildCultivator();
        this.activeNPCs.set(npc.id, npc);
        npcPopulationChanged = true;
        events.push({
          id: this.generateEventId(),
          year: this.state.currentYear,
          month: this.state.currentMonth,
          isMajorEvent: false,
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
    return { ...this.state };
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
    return `EVT_${this.state.currentYear}_${this.state.currentMonth}_${Math.random().toString(36).slice(2, 6)}`;
  }

  private generateWildCultivator(): Character {
    this.npcCounter++;
    const id = `NPC_${this.state.currentYear}_${this.state.currentMonth}_${this.npcCounter}`;
    const realms: RealmFullPath[] = ['QiRefinement_1', 'QiRefinement_3', 'QiRefinement_5', 'QiRefinement_7', 'QiRefinement_9', 'Foundation_1'];
    const names = ['散修·李四', '散修·王五', '散修·赵六', '散修·陈七', '散修·刘八', '散修·周九'];
    const realm = realms[Math.floor(Math.random() * realms.length)]!;
    const age = 20 + Math.floor(Math.random() * 60);

    return {
      id, name: names[Math.floor(Math.random() * names.length)]!,
      gender: 'Male',
      realm,
      soulState: 'Active',
      cultivation: { currentExp: Math.floor(Math.random() * 500), maxExp: 500 },
      lifespan: { age, maxLifespan: 100 },
      spiritEnergy: { current: 100, max: 100 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes: {
        physique: 1 + Math.floor(Math.random() * 10),
        comprehension: 1 + Math.floor(Math.random() * 10),
        perception: 1 + Math.floor(Math.random() * 10),
        agility: 1 + Math.floor(Math.random() * 10),
        luck: 1 + Math.floor(Math.random() * 10),
      },
      hp: 100, maxHp: 100, ap: 3,
      canFly: typeof realm === 'string' && realm.startsWith('Foundation'),
      spiritStones: 0,
      inventory: [],
      equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
      skills: [],
      skillCooldowns: {},
      traits: [],
      factionId: undefined,
      factionRank: undefined,
      relations: {},
      wantedLevels: {},
    };
  }
}
