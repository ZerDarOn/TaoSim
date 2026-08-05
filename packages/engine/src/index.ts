// ============================================================
// Engine 索引 — 游戏引擎核心模块
// ============================================================

// World Engine (月度 Tick 驱动)
export { WorldEngine } from './world/world-engine.js';

// Combat Engine (Hex 战棋)
export { CombatEngine } from './combat/combat-engine.js';
export { DamagePipeline } from './combat/damage-pipeline.js';
export { NpcAI } from './combat/npc-ai.js';

// Lifecycle Manager (生死轮回)
export { LifecycleManager } from './lifecycle/lifecycle-manager.js';

// AI Service Facade
export { AIServiceFacade } from './ai/ai-service-facade.js';

// Economy Engine (灵石经济)
export { EconomyEngine } from './economy/economy-engine.js';

// Faction Engine (宗门管理)
export { FactionEngine } from './faction/faction-engine.js';

// Character Factory (角色创建)
export { CharacterFactory } from './character/character-factory.js';

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
