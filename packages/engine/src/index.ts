// ============================================================
// Engine 索引 — 游戏引擎核心模块
// ============================================================

// World Engine (月度 Tick 驱动)
export { WorldEngine } from './world/world-engine.js';

// Combat Engine (Hex 战棋)
export { CombatEngine } from './combat/combat-engine.js';
export { DamagePipeline } from './combat/damage-pipeline.js';
export { NpcAI } from './combat/npc-ai.js';
export { resolveBattleOutcome } from './combat/battle-resolver.js';
export type { BattleOutcome, BattleType } from './combat/battle-resolver.js';

// Lifecycle Manager (生死轮回)
export { LifecycleManager } from './lifecycle/lifecycle-manager.js';
export { PlayerLifecycleService } from './lifecycle/player-lifecycle.js';

// AI Service Facade
export { AIServiceFacade } from './ai/ai-service-facade.js';

// Economy Engine (灵石经济)
export { EconomyEngine } from './economy/economy-engine.js';

// Faction Engine (宗门管理)
export { FactionEngine } from './faction/faction-engine.js';

// Character Factory (角色创建)
export { CharacterFactory, BIRTH_STORIES, TRANSMIGRATION_STORY } from './character/character-factory.js';
export type { ArrivalMode } from './character/character-factory.js';
export { SpiritRootRoller } from './character/spirit-root-roller.js';

// Data Registries（数据表）
export { TRAIT_REGISTRY, getTraitsByQuality, getTraitById, rollTraits } from './data/trait-registry.js';
export { GRADE_MULTIPLIER, ELEMENT_COUNT_MODIFIER, VARIANT_MULTIPLIER, getSpiritRootMultiplier } from './data/spirit-root-table.js';

// Tribulation Engine (渡劫突破)
export { TribulationEngine } from './tribulation/tribulation-engine.js';

// Map Generator (程序化 Hex 地图生成)
export { MapGenerator } from './world/map-generator.js';

// Crafting (炼丹炼器)
export { RecipeRegistry } from './crafting/recipe-registry.js';
export { AlchemyEngine } from './crafting/alchemy-engine.js';
export { ForgeEngine } from './crafting/forge-engine.js';

// Equipment (装备管理)
export { EquipmentManager } from './equipment/equipment-manager.js';

// Overworld (大世界旅行)
export { OverworldEngine } from './overworld/overworld-engine.js';
export { OverworldMapGenerator } from './overworld/overworld-map-generator.js';
export { PRESET_MAP, getNeighbors, getEdge } from './overworld/preset-map.js';

// Interaction (NPC 交互)
export { NPCGenerator } from './interaction/npc-generator.js';
export { NPCInteractionEngine } from './interaction/npc-interaction-engine.js';

// Market (坊市交易)
export { MarketPricing } from './market/market-pricing.js';
export { ItemFactory } from './market/item-factory.js';
export { DEFAULT_ITEM_TEMPLATES } from './market/default-templates.js';
export { MarketEngine } from './market/market-engine.js';
export { NPCTradeEngine } from './market/npc-trade-engine.js';
export { MarketTransaction } from './market/market-transaction.js';

// Quality & Upgrade (品质锻造与升品)
export { QualityCalculator } from './crafting/quality-calculator.js';
export { UpgradeEngine } from './crafting/upgrade-engine.js';

// Content Registry (内容注册中心 — 自动收集 data/ 目录数据)
import { ContentRegistry } from './content/content-registry.js';
export { ContentRegistry } from './content/content-registry.js';
export { AdventureEngine } from './content/adventure-engine.js';
export type { AdventureEvent, AdventureChoice, AdventureOutcome } from './content/content-registry.js';
export type { AdventureResult } from './content/adventure-engine.js';
export type { NpcPersonality, NpcDialogue } from './content/content-registry.js';
export type { ChildhoodEvent } from './content/content-registry.js';

// 启动时自动加载所有内置数据
ContentRegistry.loadAll();
