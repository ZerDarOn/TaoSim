import { describe, it, expect } from 'vitest';
import { WorldEngine, trimEventLog, EVENT_LOG_MAX } from '../world/world-engine.js';
import { createSeededRng } from '../battle/seeded-rng.js';
import { generateWorldGrid, findLandmarkPos } from '../overworld/hex-overworld-engine.js';
import { initializePopulationGrid } from '../world/population.js';
import type { NpcRecord, WorldState, BigEventLog } from '@taosim/contracts';

const baseState: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
  eventLog: [],
};

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_TEST_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

/** 构造一条旧 major 事件（用于预置 eventLog，验证因果链/成名恢复） */
function makeMajorEvent(id: string, n: number): BigEventLog {
  return {
    id: `EVT_prior_${n}`,
    year: 1,
    month: 1,
    isMajorEvent: true,
    category: 'world',
    severity: 'major',
    visibility: 'regional',
    source: 'engine',
    title: `旧事${n}`,
    description: `旧事${n}`,
    involvedCharacterIds: [id],
  };
}

/** 确定性序列 rng（取模循环；0.9 抑制大部分随机，0.0 强制触发目标判定） */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('WorldEngine', () => {
  it('月度推进更新日历', () => {
    const engine = new WorldEngine({ ...baseState, currentMonth: 12 });
    engine.step();
    expect(engine.getState().currentYear).toBe(2);
    expect(engine.getState().currentMonth).toBe(1);
  });

  it('量劫倒计时递减', () => {
    const engine = new WorldEngine({ ...baseState, catastropheCountdownMonths: 10 });
    engine.step();
    expect(engine.getState().catastropheCountdownMonths).toBe(9);
  });

  it('fastForward 正确推进 N 个月', () => {
    const engine = new WorldEngine(baseState);
    engine.fastForward(24);
    expect(engine.getState().currentYear).toBe(3);
    expect(engine.getState().currentMonth).toBe(1);
  });

  it('step() 返回 MonthlyTickResult 含 events', () => {
    const engine = new WorldEngine(baseState);
    const result = engine.step();
    expect(result.updatedState).toBeDefined();
    expect(result.events).toBeDefined();
    expect(Array.isArray(result.events)).toBe(true);
  });

  it('NPC 人口补充：初始为空逐步生成散修', () => {
    const engine = new WorldEngine(baseState);
    const events: import('@taosim/contracts').BigEventLog[] = [];
    for (let i = 0; i < 80; i++) {
      const result = engine.step();
      events.push(...result.events);
    }
    const spawnEvents = events.filter(e => e.title.includes('散修'));
    expect(spawnEvents.length).toBeGreaterThan(0);
  });

  it('取名：百家姓 + 世界内不重名（30 年全量 NPC 名字唯一）', () => {
    const engine = new WorldEngine(baseState, { rng: createSeededRng(20260809) });
    engine.fastForward(360);
    const npcs = Object.values(engine.getState().npcs);
    expect(npcs.length).toBeGreaterThan(50);
    // 百家姓 1 字姓 + 2 字名 → 全名 3 字
    for (const npc of npcs) {
      expect(npc.name.length).toBe(3);
    }
    // 世界内不重名（含已陨落未除名者——名字需等记忆消散才归还）
    const names = npcs.map(n => n.name);
    expect(new Set(names).size).toBe(names.length);
  }, 10000);

  it('NPC 跨推进持久：重建引擎后 NPC 仍在（持久化语义）', () => {
    const npc = makeNpc();
    const engine = new WorldEngine({ ...baseState, npcs: { [npc.id]: npc } });
    engine.fastForward(12);

    const state = engine.getState();
    expect(state.npcs[npc.id]).toBeDefined();

    // 用状态重建引擎（模拟 存档→读档 → 下一次推进）
    const engine2 = new WorldEngine(state);
    expect(engine2.getState().npcs[npc.id]).toBeDefined();
    engine2.step();
    expect(engine2.getState().npcs[npc.id]).toBeDefined();
    expect(engine2.getState().npcs[npc.id]!.soulState).toBe('Active');
  });

  it('寿元耗尽：NPC 坐化并按境界分流（低阶残魂 / 高阶一念）', () => {
    const lowNpc = makeNpc({ id: 'NPC_LOW_1', realm: 'QiRefinement_1', lifespan: { age: 99.9, maxLifespan: 100 } });
    const highNpc = makeNpc({ id: 'NPC_HIGH_1', realm: 'GoldenCore_1', lifespan: { age: 99.9, maxLifespan: 100 } });
    // 固定 rng（恒 0.9 ≥ 死劫豁免上限 0.85）：该用例验证"寿元耗尽必坐化"，
    // 若用 Math.random 偶发触发 escapeDeath（N3 死劫豁免）延寿 → 测试 flaky
    const engine = new WorldEngine(
      { ...baseState, npcs: { [lowNpc.id]: lowNpc, [highNpc.id]: highNpc } },
      { rng: seqRng([0.9]) },
    );

    // 第一月：99.95 + 1/12 < 100，仍活着
    engine.step();
    expect(engine.getState().npcs[lowNpc.id]!.soulState).toBe('Active');
    expect(engine.getState().npcs[highNpc.id]!.soulState).toBe('Active');

    // 第二月：超过寿元 → 坐化（炼气残魂、金丹留一念）
    const result = engine.step();
    expect(engine.getState().npcs[lowNpc.id]!.soulState).toBe('RemnantSoul');
    const deadHigh = engine.getState().npcs[highNpc.id]!;
    expect(deadHigh.soulState).toBe('PrimordialSoul');
    expect(deadHigh.causeOfDeath).toBe('寿元耗尽');
    expect(deadHigh.deathYear).toBeDefined();
    expect(result.events.some(e => e.title.includes('坐化'))).toBe(true);
  });

  it('死亡超过宽限期的 NPC 从档案除名（Oblivion 清理激活）', () => {
    // 宽限期内：刚坐化（RemnantSoul）应保留
    const recent = makeNpc({
      id: 'NPC_RECENT_1',
      soulState: 'RemnantSoul',
      causeOfDeath: '寿元耗尽',
      deathYear: 12,
      deathMonth: 1,
    });
    // 超宽限期：11 年前陨落（> OBLIVION_GRACE_YEARS=10）应除名
    const ancient = makeNpc({
      id: 'NPC_ANCIENT_1',
      soulState: 'PrimordialSoul',
      causeOfDeath: '仇杀陨落',
      deathYear: 1,
      deathMonth: 1,
    });
    const engine = new WorldEngine({
      ...baseState,
      currentYear: 12,
      currentMonth: 1,
      npcs: { [recent.id]: recent, [ancient.id]: ancient },
    });
    engine.step();
    expect(engine.getState().npcs[recent.id]).toBeDefined();
    expect(engine.getState().npcs[ancient.id]).toBeUndefined();
  });

  it('人口补充生成含先天出身的 NPC；tier 出生一律 common（由事迹认定）', () => {
    const engine = new WorldEngine(baseState);
    engine.fastForward(80);
    const npcs = Object.values(engine.getState().npcs);
    expect(npcs.length).toBeGreaterThan(500);
    // 因：先天出身在出生时随机分配（气运之子/大能转世/逆天传承）
    const born = npcs.filter(n => n.destiny.born !== 'mortal');
    expect(born.length).toBeGreaterThan(0);
    // 果：tier 出生一律 common，不预置标签（认定升级只由演化产生——
    // 出生平凡者也能靠经历被认定，故此处仅验证出身分布，认定机制由史诗测试确定性覆盖）
  });

  it('因果链：事件 relatedTo 串联同一 NPC 的连续经历', () => {
    const npc = makeNpc({
      id: 'NPC_CHAIN_1',
      realm: 'QiRefinement_9',
      cultivation: { currentExp: 720, maxExp: 720 },
      destiny: { tier: 'common', born: 'mortal', luck: 90, hidden: false },
      // 逍遥志向：行为槽主动云游（保证本月产出 travel.wander 事件供因果链断言）
      aspiration: 'wander',
    });
    const prior = makeMajorEvent(npc.id, 1);
    const engine = new WorldEngine(
      { ...baseState, npcs: { [npc.id]: npc }, eventLog: [prior] },
      { rng: () => 0.01 },
    );

    const result = engine.step();
    const breakthrough = result.events.find(e => e.title.includes('突破'));
    expect(breakthrough).toBeDefined();
    expect(breakthrough!.relatedEventIds).toContain(prior.id);
    // 同月后续事件（云游）继续串联上一条
    const wander = result.events.find(e => e.title.includes('云游'));
    expect(wander?.relatedEventIds).toContain(breakthrough!.id);
  });

  it('量劫倒计时归零：触发世界级事件并开启新纪元', () => {
    const engine = new WorldEngine({ ...baseState, catastropheCountdownMonths: 1 });
    const result = engine.step();
    const tribulation = result.events.find(e => e.title.includes('天道量劫'));
    expect(tribulation).toBeDefined();
    expect(tribulation!.severity).toBe('epoch');
    expect(engine.getState().catastropheCountdownMonths).toBe(600);
  });

  it('成名正反馈：major 事件先达 2 件认定英才（果），再达 3 件授予江湖绰号', () => {
    const npc = makeNpc({
      id: 'NPC_FAME_1',
      realm: 'QiRefinement_9',
      cultivation: { currentExp: 720, maxExp: 720 },
      destiny: { tier: 'common', born: 'mortal', luck: 90, hidden: false },
    });
    // 预置 2 条 major 事件（恢复计数=2）→ 本次跨大境界突破 major = 3
    const engine = new WorldEngine(
      {
        ...baseState,
        npcs: { [npc.id]: npc },
        eventLog: [makeMajorEvent(npc.id, 1), makeMajorEvent(npc.id, 2)],
      },
      { rng: () => 0.01 },
    );

    const result = engine.step();
    const npcAfter = engine.getState().npcs[npc.id]!;
    // 果：先做到（major 累计），后成名——tier 由 common 升为英才并产出认定事件
    expect(npcAfter.destiny.tier).toBe('talented');
    expect(result.events.some(e => e.templateKey === 'npc.legend')).toBe(true);
    expect(npcAfter.destiny.epithet).toBeDefined();
    expect(result.events.some(e => e.title.includes('名动江湖'))).toBe(true);
  });

  it('社交/寻仇：同地点 NPC 关系沉淀并产生 social/combat 事件', () => {
    const strong = makeNpc({ id: 'NPC_S1', realm: 'GoldenCore_1', locationId: 'LOC_A', skillIds: ['SKILL_X'] });
    const weak = makeNpc({ id: 'NPC_S2', locationId: 'LOC_A' });
    const enemyEntry = { type: 'enemy' as const, bond: -40, trust: 5, events: ['结仇'], changedAt: { year: 1, month: 1 } };
    weak.relations[strong.id] = enemyEntry;
    strong.relations[weak.id] = enemyEntry;
    const engine = new WorldEngine({ ...baseState, npcs: { [strong.id]: strong, [weak.id]: weak } });

    const events: import('@taosim/contracts').BigEventLog[] = [];
    for (let i = 0; i < 240; i++) {
      const result = engine.step();
      events.push(...result.events);
    }

    const social = events.filter(e => e.category === 'social');
    const combat = events.filter(e => e.category === 'combat');
    expect(social.length + combat.length).toBeGreaterThan(0);

    const state = engine.getState();
    const s1 = state.npcs['NPC_S1']!;
    const s2 = state.npcs['NPC_S2']!;
    expect(s1.relations['NPC_S2'] || s2.relations['NPC_S1']).toBeDefined();
  });

  it('所有事件结构化：severity/visibility/source 且 isMajorEvent 与 severity 一致', () => {
    const engine = new WorldEngine(baseState);
    const events = engine.fastForward(24).events;
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(['minor', 'normal', 'major', 'epoch']).toContain(e.severity);
      expect(['local', 'regional', 'world']).toContain(e.visibility);
      expect(e.source).toBe('engine');
      expect(e.isMajorEvent).toBe(e.severity === 'major' || e.severity === 'epoch');
    }
  });

  it('事件流持久化：eventLog 累积且重建引擎后保留（编年史数据基础）', () => {
    const engine = new WorldEngine(baseState);
    const result = engine.step();
    const state = result.updatedState;

    expect(state.eventLog.length).toBeGreaterThan(0);
    // 事件流分层（涌现缺口 N1）：eventLog 只收 normal+（编年史），minor 例行事件仅在实时流
    expect(state.eventLog).toEqual(result.events.filter((e) => e.severity !== 'minor'));
    // 重建引擎后事件流仍在（持久化语义；注入固定 rng 保证世界事件持续产出 normal+）
    const engine2 = new WorldEngine(state, { rng: () => 0.01 });
    const before = engine2.getState().eventLog.length;
    engine2.step();
    expect(engine2.getState().eventLog.length).toBeGreaterThan(before);
  });

  it('trimEventLog：超限裁剪但保留 major/epoch 大事', () => {
    const normal: BigEventLog = {
      id: 'E', year: 1, month: 1, isMajorEvent: false, category: 'world',
      title: 'x', description: '', involvedCharacterIds: [], severity: 'normal',
      visibility: 'local', source: 'engine',
    };
    const major: BigEventLog = { ...normal, id: 'M', severity: 'major', isMajorEvent: true };
    const epoch: BigEventLog = { ...normal, id: 'EP', severity: 'epoch', isMajorEvent: true };
    const list: BigEventLog[] = [major, epoch, ...Array.from({ length: EVENT_LOG_MAX + 10 }, () => normal)];

    const trimmed = trimEventLog(list);
    expect(trimmed.length).toBeLessThanOrEqual(EVENT_LOG_MAX + 2); // 2 条大事被保留
    expect(trimmed.some((e) => e.id === 'M')).toBe(true);
    expect(trimmed.some((e) => e.id === 'EP')).toBe(true);
    // 顺序保持（旧→新）：大事在前，普通事件滚动窗口在后
    expect(trimmed[0]!.id).toBe('M');
  });

  it('NPC 拥有 hexPos 且 resident 时锚定场所格（空间链路）', () => {
    const npc = makeNpc({
      id: 'NPC_SPATIAL_1',
      locationId: 'VENUE_QINGYUN_HALL',
      aspiration: 'seekDao',
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [npc.id]: npc } },
      { rng: seqRng([0.5]) },
    );
    engine.step();
    const after = engine.getState().npcs[npc.id]!;
    expect(after.hexPos).toBeDefined();
    const grid = generateWorldGrid('CONT_EAST');
    const home = findLandmarkPos(grid, 'NODE_SECT_QINGYUN');
    expect(after.hexPos).toEqual(home);
    expect(after.moveState).toBe('resident');
  });

  it('氛围层初始化且月度增长（populationGrid 存在且凡人计数上升）', () => {
    const engine = new WorldEngine({ ...baseState }, { rng: seqRng([0.5]) });
    engine.step();
    const pop = engine.getState().populationGrid;
    expect(pop).toBeDefined();
    const mortalsBefore = Object.values(pop!).reduce((s, p) => s + p.mortals, 0);
    engine.step();
    const mortalsAfter = Object.values(engine.getState().populationGrid!).reduce(
      (s, p) => s + p.mortals,
      0,
    );
    expect(mortalsAfter).toBeGreaterThan(mortalsBefore);
  });

  it('凡人升格：氛围层凡人转化为档案 NPC（升阶通道）', () => {
    const base = new WorldEngine({ ...baseState }, { rng: seqRng([0.5]) });
    // 强化升格：全格满人口 + 高潜质（10000×0.05×0.0002=0.1/格 → 月升格 38 候选，上限 8）
    const grid = generateWorldGrid('CONT_EAST');
    const pop = initializePopulationGrid(grid);
    for (const cell of Object.values(pop)) {
      cell.mortals = 10000;
      cell.spiritRootPotential = 0.05;
    }
    // 经构造传入（getState() 为浅拷贝，写副本不生效）
    const boosted = new WorldEngine({ ...baseState, populationGrid: pop }, { rng: seqRng([0.5]) });
    base.fastForward(12);
    boosted.fastForward(12);
    // 活跃 NPC 总量受"目标规模 clamp"约束，无法用总量证明升格；
    // 改为统计传记含"自凡人踏上修途"里程碑的升格者（升格路径的确定性印记）
    const baseAscended = Object.values(base.getState().npcs).filter(n =>
      n.biography.milestones.some(ms => ms.title === '自凡人踏上修途'),
    ).length;
    const boostedAscended = Object.values(boosted.getState().npcs).filter(n =>
      n.biography.milestones.some(ms => ms.title === '自凡人踏上修途'),
    ).length;
    // 强升格引擎的升格者明显更多（默认引擎 12 个月仅约个位数）
    expect(boostedAscended).toBeGreaterThan(baseAscended);
  });
});

describe('动机与代际（§4.13：求偶→道侣→子嗣；道统传承）', () => {
  it('求偶：孤独驱动的 seekPartner 结为道侣——双向绑定、关系沉淀、成家转求道', () => {
    const male = makeNpc({
      id: 'NPC_MALE',
      name: '慕容郎',
      gender: 'Male',
      aspiration: 'seekPartner',
      locationId: 'VENUE_QINGYUN_HALL',
      lifespan: { age: 40, maxLifespan: 100 },
    });
    const female = makeNpc({
      id: 'NPC_FEMALE',
      name: '苏婉清',
      gender: 'Female',
      aspiration: 'seekDao',
      locationId: 'VENUE_TIANJI_TAVERN',
      lifespan: { age: 35, maxLifespan: 100 },
    });
    // 序列：世界事件/修炼/云游 0.9 抑制，候选挑选 0.9，求偶接受 0.0（魅力 5 → 接受线 0.1375），子嗣掷骰回 0.9
    const engine = new WorldEngine(
      { ...baseState, npcs: { [male.id]: male, [female.id]: female } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    const m = result.updatedState.npcs['NPC_MALE']!;
    const f = result.updatedState.npcs['NPC_FEMALE']!;
    expect(m.spouseId).toBe('NPC_FEMALE');
    expect(f.spouseId).toBe('NPC_MALE');
    expect(m.relations['NPC_FEMALE']!.type).toBe('spouse');
    expect(f.relations['NPC_MALE']!.type).toBe('spouse');
    // 成家后专心道途：双方执念转求道
    expect(m.aspiration).toBe('seekDao');
    expect(f.aspiration).toBe('seekDao');
    expect(m.biography.milestones.some((ms) => ms.title === '结为道侣')).toBe(true);
    expect(result.events.some((e) => e.title === '慕容郎 与 苏婉清 结为道侣')).toBe(true);
  });

  it.fails('结构靶标：NPC 一个月不得同时完成修炼与求偶两个主行动', () => {
    const seeker = makeNpc({
      id: 'NPC_SINGLE_ACTION_SEEKER',
      name: '求缘者',
      gender: 'Male',
      aspiration: 'seekPartner',
      locationId: 'VENUE_QINGYUN_HALL',
      lifespan: { age: 40, maxLifespan: 100 },
    });
    const candidate = makeNpc({
      id: 'NPC_SINGLE_ACTION_CANDIDATE',
      name: '候选道友',
      gender: 'Female',
      aspiration: 'seekDao',
      locationId: 'VENUE_TIANJI_TAVERN',
      lifespan: { age: 35, maxLifespan: 100 },
    });
    const expBefore = seeker.cultivation.currentExp;
    const engine = new WorldEngine(
      { ...baseState, npcs: { [seeker.id]: seeker, [candidate.id]: candidate } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );

    const after = engine.step().updatedState.npcs[seeker.id]!;
    const cultivated = after.cultivation.currentExp > expBefore;
    const coupled = after.spouseId === candidate.id;

    expect(cultivated && coupled).toBe(false);
  });

  it('子嗣：道侣喜得子嗣——血脉灵根/面板由父母继承（面板因果），代际可溯源', () => {
    const pa = makeNpc({
      id: 'NPC_PA',
      name: '慕容郎',
      gender: 'Male',
      aspiration: 'seekDao',
      locationId: 'VENUE_QINGYUN_HALL',
      lifespan: { age: 40, maxLifespan: 100 },
      spiritRoot: { grade: 'Earth', elements: ['Metal'], isVariant: false },
      attributes: { physique: 12, comprehension: 14, perception: 10, agility: 10, luck: 10, charm: 10 },
    });
    const pb = makeNpc({
      id: 'NPC_PB',
      name: '苏婉清',
      gender: 'Female',
      aspiration: 'seekDao',
      locationId: 'VENUE_TIANJI_TAVERN',
      lifespan: { age: 35, maxLifespan: 100 },
      spiritRoot: { grade: 'Profound', elements: ['Fire'], isVariant: false },
      attributes: { physique: 10, comprehension: 12, perception: 12, agility: 10, luck: 10, charm: 10 },
    });
    // 预置已结道侣（跳过求偶段）：双修 8 年冷却未触发（无 lastChildYear），掷骰 0.0 强制生育
    pa.spouseId = 'NPC_PB';
    pb.spouseId = 'NPC_PA';
    const engine = new WorldEngine(
      { ...baseState, npcs: { [pa.id]: pa, [pb.id]: pb } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    const state = result.updatedState;
    const child = Object.values(state.npcs).find((n) => n.id !== 'NPC_PA' && n.id !== 'NPC_PB');
    expect(child).toBeDefined();
    // 代际溯源：亲子双向记录
    expect(child!.parentIds).toEqual(expect.arrayContaining(['NPC_PA', 'NPC_PB']));
    expect(state.npcs['NPC_PA']!.childrenIds).toContain(child!.id);
    expect(state.npcs['NPC_PB']!.childrenIds).toContain(child!.id);
    // 血脉延续：子承父姓；世家出身（家学），tier 仍从零认定（果）
    expect(child!.name[0]).toBe('慕');
    expect(child!.origin.type).toBe('世家');
    expect(child!.destiny.born).toBe('inherited');
    expect(child!.destiny.tier).toBe('common');
    // 面板因果：灵根元素来自父母元素池，属性在父母均值附近（≥1）
    const parentElements = ['Metal', 'Fire'];
    for (const el of child!.spiritRoot.elements) {
      expect(parentElements).toContain(el);
    }
    expect(child!.attributes.comprehension).toBeGreaterThanOrEqual(1);
    // 双修冷却写入
    expect(state.npcs['NPC_PA']!.childbearing?.lastChildYear).toBe(1);
    expect(result.events.some((e) => e.title.includes('喜得子嗣'))).toBe(true);
  });

  it('道统传承：寿元将尽者收徒传衣钵——师徒双向绑定，了却心愿转求道', () => {
    const master = makeNpc({
      id: 'NPC_MASTER',
      name: '玄机子',
      aspiration: 'seekSuccessor',
      realm: 'GoldenCore_1',
      locationId: 'VENUE_QINGYUN_HALL',
      lifespan: { age: 86, maxLifespan: 100 }, // 寿元 86% → 传承压力触发
      attributes: { ...makeNpc().attributes, comprehension: 20 },
    });
    const disciple = makeNpc({
      id: 'NPC_DISC',
      name: '后起之秀',
      aspiration: 'seekDao',
      realm: 'QiRefinement_9',
      locationId: 'VENUE_TIANJI_TAVERN',
      attributes: { ...makeNpc().attributes, comprehension: 15 },
    });
    // 序列：各自修炼/云游 0.9，传道掷骰 0.0（< HERITAGE_TEACH_CHANCE=0.15）
    const engine = new WorldEngine(
      { ...baseState, npcs: { [master.id]: master, [disciple.id]: disciple } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    const m = result.updatedState.npcs['NPC_MASTER']!;
    const d = result.updatedState.npcs['NPC_DISC']!;
    expect(m.relations['NPC_DISC']!.type).toBe('master-disciple');
    expect(m.relations['NPC_DISC']!.direction).toBe('master');
    expect(d.relations['NPC_MASTER']!.direction).toBe('disciple');
    expect(m.aspiration).toBe('seekDao'); // 了却心愿
    expect(m.biography.milestones.some((ms) => ms.title === '传下道统')).toBe(true);
    expect(result.events.some((e) => e.title.includes('道统'))).toBe(true);
  });

  it('道统跨世代：师祖→师→徒继承同一道统线（heritageLineId 延续）', () => {
    const grandmaster = makeNpc({
      id: 'NPC_GM',
      name: '太虚真人',
      aspiration: 'seekSuccessor',
      heritageLineId: 'HL_太虚',
      realm: 'GoldenCore_1',
      locationId: 'VENUE_QINGYUN_HALL',
      lifespan: { age: 86, maxLifespan: 100 },
    });
    const disciple = makeNpc({
      id: 'NPC_GM_DISC',
      name: '青衫客',
      aspiration: 'seekDao',
      realm: 'QiRefinement_9',
      locationId: 'VENUE_TIANJI_TAVERN',
      attributes: { ...makeNpc().attributes, comprehension: 16 },
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [grandmaster.id]: grandmaster, [disciple.id]: disciple } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    expect(result.updatedState.npcs['NPC_GM_DISC']!.heritageLineId).toBe('HL_太虚');
  });

  it('动机寻仇：深仇者主动出手（实力足则一战），真实斗法结算（面板碾压者胜）', () => {
    const avenger = makeNpc({
      id: 'NPC_AVENGER',
      name: '血刃客',
      aspiration: 'seekRevenge',
      realm: 'GoldenCore_1',
      locationId: 'VENUE_QINGYUN_HALL',
      spiritStones: 100,
      attributes: { physique: 40, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      relations: {
        NPC_FOE: { type: 'enemy', bond: -60, trust: 0, events: ['血仇'], changedAt: { year: 1, month: 1 } },
      },
    });
    const foe = makeNpc({
      id: 'NPC_FOE',
      name: '仇三刀',
      aspiration: 'seekDao',
      realm: 'Foundation_3',
      locationId: 'VENUE_TIANJI_TAVERN',
      spiritStones: 1000,
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      relations: {
        NPC_AVENGER: { type: 'enemy', bond: -60, trust: 0, events: ['血仇'], changedAt: { year: 1, month: 1 } },
      },
    });
    // 序列：各自修炼/云游 0.9，动机寻仇触发 0.0（< REVENGE_DUEL_CHANCE=0.25）
    const engine = new WorldEngine(
      { ...baseState, npcs: { [avenger.id]: avenger, [foe.id]: foe } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    const combatEvent = result.events.find((e) => e.category === 'combat');
    expect(combatEvent).toBeDefined();
    expect(combatEvent!.involvedCharacterIds).toEqual(expect.arrayContaining(['NPC_AVENGER', 'NPC_FOE']));
  });
});

describe('宗门权力斗争（§2.2 权力轨道：让贤/夺位）', () => {
  function makeQingyunFaction(leaderId: string, members: string[]) {
    return {
      id: 'FACT_QINGYUN',
      name: '青云宗',
      alignment: 'Righteous' as const,
      leaderId,
      members,
      territories: ['NODE_SECT_QINGYUN'],
      spiritVeinLevel: 2,
      treasurySpiritStones: 8000,
      diplomacy: {},
      aiPolicy: { expansionism: 0.3, aggression: 0.2 },
    };
  }

  it('让贤：寿元将尽的宗主体面交班，退居长老（非死亡驱动的继任）', () => {
    const oldMaster = makeNpc({
      id: 'NPC_OLD_MASTER',
      name: '老掌门',
      aspiration: 'seekDao',
      realm: 'GoldenCore_1',
      socialRank: 'sectMaster',
      factionId: 'FACT_QINGYUN',
      locationId: 'VENUE_QINGYUN_HALL',
      lifespan: { age: 99, maxLifespan: 100 }, // 退意概率约 18.8%，固定 0.1 可稳定命中
    });
    const elder = makeNpc({
      id: 'NPC_ELDER_1',
      name: '大长老',
      aspiration: 'seekDao',
      realm: 'Foundation_3',
      socialRank: 'elder',
      factionId: 'FACT_QINGYUN',
      locationId: 'VENUE_TIANJI_TAVERN',
    });
    const faction = makeQingyunFaction('NPC_OLD_MASTER', ['NPC_OLD_MASTER', 'NPC_ELDER_1']);
    // 0.1 足以抑制稀有世界事件/奇遇，又低于该掌门的让贤概率；
    // 不再依赖让贤判定是本月第几次 rng 调用。
    const engine = new WorldEngine(
      { ...baseState, npcs: { [oldMaster.id]: oldMaster, [elder.id]: elder }, factions: { FACT_QINGYUN: faction } },
      { rng: () => 0.1 },
    );
    const result = engine.step();
    const q = result.updatedState.factions!['FACT_QINGYUN']!;
    expect(q.leaderId).toBe('NPC_ELDER_1');
    expect(result.updatedState.npcs['NPC_ELDER_1']!.socialRank).toBe('sectMaster');
    expect(result.updatedState.npcs['NPC_OLD_MASTER']!.socialRank).toBe('elder');
    expect(result.events.some((e) => e.title === '老掌门 传位于 大长老，执掌 青云宗')).toBe(true);
  });

  it('夺位成功：野心长老（seekFame）修为超越宗主，斗法夺权', () => {
    const leader = makeNpc({
      id: 'NPC_LEADER',
      name: '守成宗主',
      aspiration: 'seekDao',
      realm: 'GoldenCore_1',
      socialRank: 'sectMaster',
      factionId: 'FACT_QINGYUN',
      locationId: 'VENUE_QINGYUN_HALL',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    });
    const usurper = makeNpc({
      id: 'NPC_USURPER',
      name: '野心长老',
      aspiration: 'seekFame',
      realm: 'NascentSoul_1', // 修为高一境 → 有挑战资格
      socialRank: 'elder',
      factionId: 'FACT_QINGYUN',
      locationId: 'VENUE_TIANJI_TAVERN',
      attributes: { physique: 40, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    });
    const faction = makeQingyunFaction('NPC_LEADER', ['NPC_LEADER', 'NPC_USURPER']);
    // 序列：世界事件 0.9 + 2 NPC 修炼 4×0.9；第 6 次 0.0 落夺位判定（< USURP_CHANCE=0.15）；斗法面板碾压定胜负
    const engine = new WorldEngine(
      { ...baseState, npcs: { [leader.id]: leader, [usurper.id]: usurper }, factions: { FACT_QINGYUN: faction } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    const q = result.updatedState.factions!['FACT_QINGYUN']!;
    expect(q.leaderId).toBe('NPC_USURPER');
    expect(result.updatedState.npcs['NPC_USURPER']!.socialRank).toBe('sectMaster');
    expect(result.updatedState.npcs['NPC_LEADER']!.socialRank).toBe('elder'); // 败者保住性命与宗门身份
    expect(result.events.some((e) => e.title === '野心长老 夺位成功，执掌 青云宗')).toBe(true);
  });

  it('夺位失败：真实斗法面板定胜负，败者被逐出宗门（流放）', () => {
    const leader = makeNpc({
      id: 'NPC_LEADER',
      name: '守成宗主',
      aspiration: 'seekDao',
      realm: 'NascentSoul_1',
      socialRank: 'sectMaster',
      factionId: 'FACT_QINGYUN',
      locationId: 'VENUE_QINGYUN_HALL',
      attributes: { physique: 40, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    });
    const usurper = makeNpc({
      id: 'NPC_USURPER',
      name: '野心长老',
      aspiration: 'seekFame',
      realm: 'SoulFormation_1', // 境界更高但面板孱弱 → 真实斗法仍败
      socialRank: 'elder',
      factionId: 'FACT_QINGYUN',
      locationId: 'VENUE_TIANJI_TAVERN',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    });
    const faction = makeQingyunFaction('NPC_LEADER', ['NPC_LEADER', 'NPC_USURPER']);
    // 序列：世界事件 0.9 + 2 NPC 修炼 4×0.9；第 6 次 0.0 落夺位判定；斗法面板 5 vs 40 → 败
    const engine = new WorldEngine(
      { ...baseState, npcs: { [leader.id]: leader, [usurper.id]: usurper }, factions: { FACT_QINGYUN: faction } },
      { rng: seqRng([0.9, 0.9, 0.9, 0.9, 0.9, 0.0]) },
    );
    const result = engine.step();
    const q = result.updatedState.factions!['FACT_QINGYUN']!;
    // 夺位失败 → 逐出宗门：factionId/socialRank 清空，成员除名
    expect(q.leaderId).toBe('NPC_LEADER');
    expect(q.members).not.toContain('NPC_USURPER');
    expect(result.updatedState.npcs['NPC_USURPER']!.factionId).toBeUndefined();
    expect(result.updatedState.npcs['NPC_USURPER']!.socialRank).toBeUndefined();
    expect(result.events.some((e) => e.title === '野心长老 夺位失败，被逐出 青云宗')).toBe(true);
  });
});
