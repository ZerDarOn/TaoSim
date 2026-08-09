import type { WorldState, BigEventLog, NpcRecord, Faction } from '@taosim/contracts';
import { EconomyEngine } from '../economy/economy-engine.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { VENUE_CATALOG } from '../overworld/map-catalog.js';
import { characterToNpcRecord, realmTier } from './npc-record-mapper.js';
import { EventCollector } from './event-collector.js';
import type { EmitInput } from './event-collector.js';
import type { Rng } from './world-tick-rules.js';
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

/** 引擎事件流归档上限：保留最近条数 + 全部 major/epoch 大事 */
export const EVENT_LOG_MAX = 2000;

/** 死亡 NPC 从档案中除名（转 Oblivion）的宽限期（年） */
export const OBLIVION_GRACE_YEARS = 10;

/** 成名正反馈阈值：major/epoch 事件达到此数授予江湖绰号（§7.3） */
export const EPITHET_MAJOR_THRESHOLD = 3;

/** 量劫纪元间隔（月）：倒计时归零触发世界级事件后重置 */
export const TRIBULATION_INTERVAL_MONTHS = 600;

/** 坊市流动（§4.6）：坊市场所 NPC 月度参与灵石交易的概率 */
export const MARKET_TRADE_PROBABILITY = 0.4;

/** 坊市流通的突破材料（叙事实体，与玩家突破材料同源同名） */
const MARKET_MATERIALS = ['聚气丹', '凝神花', '妖丹', '玄铁精', '灵植种子', '筑基丹'] as const;

/** 江湖绰号池（成名正反馈授予，注入 rng 保证同种子同绰号） */
const EPITHET_POOL = ['云中仙', '焚天剑客', '孤月真人', '雷霆上人', '玄龟散人', '红尘客', '碧落仙君', '青莲剑仙'];

/**
 * 事件流归档策略：超限时保留最近 max 条，并把更早的 major/epoch 大事
 * 一并保留（编年史/传闻的数据基础不被滚动裁剪掉）。
 * 输入须为按时间正序（旧→新）的数组。
 */
export function trimEventLog(log: BigEventLog[], max = EVENT_LOG_MAX): BigEventLog[] {
  if (log.length <= max) return log;
  const tail = log.slice(-max);
  const preserved = log
    .slice(0, -max)
    .filter((e) => e.severity === 'major' || e.severity === 'epoch');
  return [...preserved, ...tail];
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
  private rng: Rng;
  /** 因果链（§2.4）：每 NPC 最近一条事件，新事件 relatedTo 指向前者 */
  private lastEventByNpc = new Map<string, BigEventLog>();
  /** 成名正反馈（§7.3）：每 NPC major/epoch 事件计数 */
  private majorCountByNpc = new Map<string, number>();

  constructor(
    initialState: WorldState,
    options: { rng?: Rng; factions?: Record<string, Faction> } = {},
  ) {
    this.state = {
      ...initialState,
      npcs: { ...(initialState.npcs ?? {}) },
      eventLog: [...(initialState.eventLog ?? [])],
      factions: { ...(initialState.factions ?? options.factions ?? {}) },
    };
    this.rng = options.rng ?? Math.random;
    this.factions = new Map(Object.entries(this.state.factions ?? {}));
    // 从现存 NPC id（NPC_<year>_<month>_<n>）恢复自增计数器，避免跨会话 id 冲突
    let maxCounter = 0;
    for (const id of Object.keys(this.state.npcs)) {
      const m = /^NPC_\d+_\d+_(\d+)$/.exec(id);
      if (m) maxCounter = Math.max(maxCounter, Number(m[1]));
    }
    this.npcCounter = maxCounter;
    // 因果链 + 成名正反馈恢复：从事件流重建每 NPC 最近事件与 major 计数（正序，后者覆盖）
    for (const e of this.state.eventLog) {
      if (e.isMajorEvent) {
        for (const id of e.involvedCharacterIds) {
          this.majorCountByNpc.set(id, (this.majorCountByNpc.get(id) ?? 0) + 1);
        }
      }
      for (const id of e.involvedCharacterIds) {
        this.lastEventByNpc.set(id, e);
      }
    }
  }

  /** 推进一个月，返回更新后的状态与事件列表 */
  public step(): MonthlyTickResult {
    this.advanceCalendar();

    // 云游回归：上月云游（locationId 清空）的 NPC 本月重新落脚，
    // 避免 '__wander__' 分组随云游积累而无限膨胀（真实节点系统接入前的临时策略）
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active' || npc.locationId !== undefined) continue;
      npc.locationId = this.pickVenueId();
    }

    const collector = new EventCollector(this.state.currentYear, this.state.currentMonth);
    const events: BigEventLog[] = [];

    // 天道量劫降临（§4.10 世界事件）：倒计时归零 → epoch 事件 + 开启新纪元
    if (this.state.catastropheCountdownMonths === 0) {
      events.push(
        collector.emit({ key: 'world.tribulation', vars: {}, involvedCharacterIds: [] }),
      );
      this.state.catastropheCountdownMonths = TRIBULATION_INTERVAL_MONTHS;
    }

    let npcPopulationChanged = false;

    // 事件出口（§2.4 因果链 + §7.3 成名正反馈）：串起同一 NPC 的连续经历
    const pushNpcEvent = (input: Omit<EmitInput, 'relatedTo'>, npcIds: string[]): BigEventLog => {
      const related = npcIds
        .map(id => this.lastEventByNpc.get(id))
        .find((e): e is BigEventLog => e !== undefined);
      const event = collector.emit({ ...input, relatedTo: related ? [related] : undefined });
      events.push(event);
      for (const id of npcIds) {
        this.lastEventByNpc.set(id, event);
        if (event.isMajorEvent) {
          const npc = this.state.npcs[id];
          if (!npc || npc.destiny.epithet) continue;
          const count = (this.majorCountByNpc.get(id) ?? 0) + 1;
          this.majorCountByNpc.set(id, count);
          if (count >= EPITHET_MAJOR_THRESHOLD) {
            const epithet = EPITHET_POOL[Math.floor(this.rng() * EPITHET_POOL.length)]!;
            npc.destiny.epithet = epithet;
            events.push(
              collector.emit({
                key: 'npc.epithet',
                vars: { npc: npc.name, epithet },
                involvedCharacterIds: [id],
                locationId: npc.locationId,
              }),
            );
          }
        }
      }
      return event;
    };

    // 1. NPC 月度推进（寿元 / 修炼 / 突破 / 奇遇 / 云游）— 无 AI 涌现规则集 §4
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      npc.lifespan.age += 1 / 12;
      npc.lastUpdate = { year: this.state.currentYear, month: this.state.currentMonth };

      // 寿元耗尽 → 坐化（按境界分流：金丹及以上留一念，低阶魂散为残魂）
      if (npc.lifespan.age >= npc.lifespan.maxLifespan) {
        const tier = realmTier(npc.realm);
        npc.soulState = tier >= 3 ? 'PrimordialSoul' : 'RemnantSoul';
        npc.deathYear = this.state.currentYear;
        npc.deathMonth = this.state.currentMonth;
        npc.causeOfDeath = '寿元耗尽';
        npcPopulationChanged = true;
        pushNpcEvent(
          { key: 'death.natural', vars: { npc: npc.name }, involvedCharacterIds: [id], locationId: npc.locationId },
          [id],
        );
        continue;
      }

      // 修炼增长
      cultivateNpc(npc);

      // 突破判定
      const breakthrough = tryBreakthrough(npc, this.rng);
      if (breakthrough.attempted) {
        if (breakthrough.succeeded) {
          const major = breakthrough.major;
          pushNpcEvent(
            {
              key: major ? 'breakthrough.major' : 'breakthrough.minor',
              vars: { npc: npc.name, realm: realmDisplay(npc.realm) },
              involvedCharacterIds: [id],
              locationId: npc.locationId,
            },
            [id],
          );
        } else {
          pushNpcEvent(
            {
              key: 'breakthrough.fail',
              vars: { npc: npc.name, realm: realmDisplay(breakthrough.nextRealm ?? npc.realm) },
              involvedCharacterIds: [id],
              locationId: npc.locationId,
            },
            [id],
          );
        }
      }

      // 奇遇判定
      const wonder = tryWonder(npc, this.rng);
      if (wonder.triggered) {
        const wonderKeys: Record<string, string> = {
          treasure: 'wonder.treasure',
          heritage: 'wonder.heritage',
          injury: 'wonder.injury',
        };
        pushNpcEvent(
          {
            key: wonderKeys[wonder.type] ?? 'wonder.treasure',
            vars: { npc: npc.name },
            involvedCharacterIds: [id],
            locationId: npc.locationId,
          },
          [id],
        );
      }

      // 云游判定
      if (tryWander(npc, this.rng)) {
        pushNpcEvent(
          { key: 'travel.wander', vars: { npc: npc.name }, involvedCharacterIds: [id], locationId: npc.locationId },
          [id],
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
      const pairs = samplePairs(list, this.rng, Math.max(1, Math.floor(list.length / 20)));
      for (const [a, b] of pairs) {
        // 防御：配对后若任一方已陨落（本步内致死），跳过社交/寻仇
        if (a.soulState !== 'Active' || b.soulState !== 'Active') continue;
        const encounter = socialEncounter(a, b, now, this.rng);
        if (encounter) {
          const vars = { npcA: a.name, npcB: b.name, npc: encounter.focalName ?? a.name };
          pushNpcEvent(
            {
              key: encounter.templateKey,
              vars,
              involvedCharacterIds: [a.id, b.id],
              locationId: a.locationId ?? b.locationId,
            },
            [a.id, b.id],
          );
        }
        const feud = tryFeud(a, b, now, this.rng);
        if (feud) {
          const winnerName = feud.attackerWins ? a.name : b.name;
          const loserName = feud.attackerWins ? b.name : a.name;
          pushNpcEvent(
            {
              key: feud.templateKey,
              vars: { winner: winnerName, loser: loserName, years: String(feud.injuryYears) },
              involvedCharacterIds: [a.id, b.id],
              locationId: a.locationId ?? b.locationId,
            },
            [a.id, b.id],
          );
          if (feud.lethal) npcPopulationChanged = true;
        }
      }
    }

    // 2b. 坊市流动（§4.6：灵石交易 / 突破材料流转 — 与玩家经济同一套数据）
    // 收入：境界俸禄水龙头（realmMonthlyIncome，与玩家一致）；交易：仅坊市场所参与，概率采购
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      const stones = (npc.spiritStones ?? 0) + EconomyEngine.realmMonthlyIncome(npc.realm);
      if (!npc.locationId) continue;
      const venue = VENUE_CATALOG.find((v) => v.id === npc.locationId);
      if (!venue || venue.type !== 'shop') {
        npc.spiritStones = stones;
        continue;
      }
      if (this.rng() >= MARKET_TRADE_PROBABILITY) {
        npc.spiritStones = stones;
        continue;
      }
      const item = MARKET_MATERIALS[Math.floor(this.rng() * MARKET_MATERIALS.length)]!;
      const spend = Math.min(EconomyEngine.realmMonthlyIncome(npc.realm) * 2, stones);
      if (spend <= 0) {
        npc.spiritStones = stones;
        continue;
      }
      npc.spiritStones = stones - spend;
      pushNpcEvent(
        { key: 'market.trade', vars: { npc: npc.name, item, stones: String(spend) }, involvedCharacterIds: [id], locationId: npc.locationId },
        [id],
      );
    }

    // 3. 清理已湮灭的 NPC（死亡超过宽限期 → 转 Oblivion 后除名）
    const toRemove: string[] = [];
    for (const [id, npc] of Object.entries(this.state.npcs)) {
      if (npc.soulState === 'Oblivion') {
        toRemove.push(id);
        continue;
      }
      if (npc.soulState !== 'Active' && npc.deathYear !== undefined && npc.deathMonth !== undefined) {
        const died = (npc.deathYear - 1) * 12 + npc.deathMonth;
        const nowM = (this.state.currentYear - 1) * 12 + this.state.currentMonth;
        if (nowM - died >= OBLIVION_GRACE_YEARS * 12) {
          npc.soulState = 'Oblivion'; // 记忆彻底消散（生命周期末端）
          toRemove.push(id);
        }
      }
    }
    if (toRemove.length > 0) {
      for (const id of toRemove) {
        delete this.state.npcs[id];
        this.lastEventByNpc.delete(id);
        this.majorCountByNpc.delete(id);
      }
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

    // 事件流持久化（编年史/传闻的数据基础）+ 归档裁剪（避免无上限增长）
    this.state.eventLog = trimEventLog([...this.state.eventLog, ...events]);

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
    return {
      ...this.state,
      npcs: { ...this.state.npcs },
      eventLog: [...this.state.eventLog],
      factions: this.state.factions ? { ...this.state.factions } : undefined,
    };
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
    const tierRoll = this.rng();
    const tier = tierRoll < 0.75 ? 1 : tierRoll < 0.95 ? 2 : 3;
    const seed = Math.floor(this.rng() * 1_000_000);
    const character = NPCGenerator.generate(tier, seed);

    const record = characterToNpcRecord(
      { ...character, id, name: character.name },
      this.state.currentYear,
      this.state.currentMonth,
    );
    // 真实地点引用：落脚于预设场所（社交配对按地点分组的数据基础）
    record.locationId = this.pickVenueId();

    // 命格（阶段 1 起影响奇遇/突破/死劫加权）：0.5% 天骄、2.5% 英才
    const destinyRoll = this.rng();
    record.destiny =
      destinyRoll < 0.005
        ? { tier: 'prodigy', luck: 95, hidden: true }
        : destinyRoll < 0.03
          ? { tier: 'talented', luck: 80, hidden: true }
          : { tier: 'common', luck: record.attributes.luck, hidden: false };
    return record;
  }

  /** 从预设场所中随机取一个地点 id（无预设场所时返回 undefined） */
  private pickVenueId(): string | undefined {
    if (VENUE_CATALOG.length === 0) return undefined;
    return VENUE_CATALOG[Math.floor(this.rng() * VENUE_CATALOG.length)]!.id;
  }
}
