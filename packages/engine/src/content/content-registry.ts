/**
 * ContentRegistry — 内容注册中心
 *
 * 引擎启动时调用 ContentRegistry.loadAll() 自动收集 data/ 目录下所有约定导出。
 * 后续新增数据文件只需：
 *   1. 在 data/ 下创建文件，导出约定名称的数组
 *   2. 在 data/index.ts 中 re-export
 * 不需要修改任何引擎逻辑代码。
 *
 * 约定导出名：
 *   RECIPES_PILL     → PillRecipe[]
 *   RECIPES_FORGE    → ForgeRecipe[]
 *   SKILLS           → Skill[]
 *   ADVENTURE_EVENTS → AdventureEvent[]
 *   NPC_PERSONALITIES→ NpcPersonality[]
 *   NPC_DIALOGUES    → NpcDialogue[]
 *   CHILDHOOD_EVENTS → ChildhoodEvent[]
 *   TRAITS           → Trait[]
 */

import { PILL_RECIPES_EXPANSION, FORGE_RECIPES_EXPANSION } from '../data/recipe-expansion.js';
import { SKILL_REGISTRY } from '../data/skill-registry.js';
import { ADVENTURE_EVENTS } from '../data/adventure-events.js';
import { NPC_PERSONALITIES, NPC_DIALOGUES } from '../data/npc-personalities.js';
import { CHILDHOOD_EVENTS } from '../data/childhood-events.js';
import { TRAIT_REGISTRY } from '../data/trait-registry.js';

import type { PillRecipe, ForgeRecipe } from '../crafting/recipe-registry.js';
import type { Skill } from '@taosim/contracts';

// ---- 数据类型 re-export（供外部消费者使用）----
export type { AdventureEvent, AdventureChoice, AdventureOutcome } from '../data/adventure-events.js';
export type { NpcPersonality, NpcDialogue } from '../data/npc-personalities.js';
export type { ChildhoodEvent } from '../data/childhood-events.js';

interface ContentState {
  pillRecipes: PillRecipe[];
  forgeRecipes: ForgeRecipe[];
  skills: Skill[];
  adventureEvents: import('../data/adventure-events.js').AdventureEvent[];
  npcPersonalities: import('../data/npc-personalities.js').NpcPersonality[];
  npcDialogues: import('../data/npc-personalities.js').NpcDialogue[];
  childhoodEvents: import('../data/childhood-events.js').ChildhoodEvent[];
  traits: import('@taosim/contracts').Trait[];
}

const state: ContentState = {
  pillRecipes: [],
  forgeRecipes: [],
  skills: [],
  adventureEvents: [],
  npcPersonalities: [],
  npcDialogues: [],
  childhoodEvents: [],
  traits: [],
};

let loaded = false;

export const ContentRegistry = {
  /** 加载所有内置数据。幂等，多次调用安全。 */
  loadAll(): void {
    if (loaded) return;

    // 注册内置配方（recipe-expansion.ts）
    for (const r of PILL_RECIPES_EXPANSION) {
      state.pillRecipes.push(r);
    }
    for (const r of FORGE_RECIPES_EXPANSION) {
      state.forgeRecipes.push(r);
    }

    // 注册技能库
    state.skills.push(...SKILL_REGISTRY);

    // 注册奇遇事件
    state.adventureEvents.push(...ADVENTURE_EVENTS);

    // 注册 NPC 性格与对话
    state.npcPersonalities.push(...NPC_PERSONALITIES);
    state.npcDialogues.push(...NPC_DIALOGUES);

    // 注册童年事件
    state.childhoodEvents.push(...CHILDHOOD_EVENTS);

    // 注册天赋
    state.traits.push(...TRAIT_REGISTRY);

    loaded = true;
  },

  /** 动态注册单个配方（运行时 / DB 加载用） */
  registerPillRecipe(recipe: PillRecipe): void {
    if (!state.pillRecipes.some(r => r.id === recipe.id)) {
      state.pillRecipes.push(recipe);
    }
  },

  registerForgeRecipe(recipe: ForgeRecipe): void {
    if (!state.forgeRecipes.some(r => r.id === recipe.id)) {
      state.forgeRecipes.push(recipe);
    }
  },

  registerSkill(skill: Skill): void {
    if (!state.skills.some(s => s.id === skill.id)) {
      state.skills.push(skill);
    }
  },

  registerAdventureEvent(event: import('../data/adventure-events.js').AdventureEvent): void {
    if (!state.adventureEvents.some(e => e.id === event.id)) {
      state.adventureEvents.push(event);
    }
  },

  // ---- 只读访问器 ----

  get pillRecipes(): readonly PillRecipe[] { return state.pillRecipes; },
  get forgeRecipes(): readonly ForgeRecipe[] { return state.forgeRecipes; },
  get skills(): readonly Skill[] { return state.skills; },
  get adventureEvents(): readonly import('../data/adventure-events.js').AdventureEvent[] { return state.adventureEvents; },
  get npcPersonalities(): readonly import('../data/npc-personalities.js').NpcPersonality[] { return state.npcPersonalities; },
  get npcDialogues(): readonly import('../data/npc-personalities.js').NpcDialogue[] { return state.npcDialogues; },
  get childhoodEvents(): readonly import('../data/childhood-events.js').ChildhoodEvent[] { return state.childhoodEvents; },
  get traits(): readonly import('@taosim/contracts').Trait[] { return state.traits; },

  /** 重置（仅测试用） */
  reset(): void {
    state.pillRecipes = [];
    state.forgeRecipes = [];
    state.skills = [];
    state.adventureEvents = [];
    state.npcPersonalities = [];
    state.npcDialogues = [];
    state.childhoodEvents = [];
    state.traits = [];
    loaded = false;
  },
};
