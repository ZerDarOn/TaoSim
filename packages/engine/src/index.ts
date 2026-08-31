// ============================================================
// Engine 索引 — 游戏引擎核心模块
// ============================================================

// World Engine (月度 Tick 驱动)
export { WorldEngine, trimEventLog, EVENT_LOG_MAX } from './world/world-engine.js';
export type { WorldEngineOptions, MonthlyTickResult } from './world/world-engine.js';

// Combat Engine (Hex 战棋)
export { CombatEngine } from './combat/combat-engine.js';
export { DamagePipeline } from './combat/damage-pipeline.js';
export { NpcAI } from './combat/npc-ai.js';
export { resolveBattleOutcome } from './combat/battle-resolver.js';
export type { BattleOutcome, BattleType } from './combat/battle-resolver.js';

// Battle System v2 (确定性状态机)
export * from './battle/index.js';

// Lifecycle Manager (生死轮回)
export { LifecycleManager } from './lifecycle/lifecycle-manager.js';
export { PlayerLifecycleService } from './lifecycle/player-lifecycle.js';

// AI Service Facade
export { AIServiceFacade } from './ai/ai-service-facade.js';
export type { AIRequest, AIResponse } from './ai/ai-service-facade.js';
export { NarrativeEnhancer } from './ai/narrative-enhancer.js';
export type { NarrativeRequest, NarrativeResult } from './ai/narrative-enhancer.js';

// Economy Engine (灵石经济)
export { EconomyEngine } from './economy/economy-engine.js';

// Faction Engine (宗门管理)
export { FactionEngine } from './faction/faction-engine.js';

// Character Factory (角色创建)
export { CharacterFactory, BIRTH_STORIES, TRANSMIGRATION_STORY } from './character/character-factory.js';
export type { ArrivalMode } from './character/character-factory.js';
export { computeDerivedStats } from './character/derived-stats.js';
export type { DerivedStats, DerivedStatsInput } from './character/derived-stats.js';
export { SpiritRootRoller } from './character/spirit-root-roller.js';

// Data Registries（数据表）
export { TRAIT_REGISTRY, getTraitsByQuality, getTraitById, rollTraits } from './data/trait-registry.js';
export { GRADE_MULTIPLIER, ELEMENT_COUNT_MODIFIER, VARIANT_MULTIPLIER, getSpiritRootMultiplier } from './data/spirit-root-table.js';
export { NPC_PERSONALITIES, resolvePersonalityId } from './data/npc-personalities.js';

// Tribulation Engine (渡劫突破)
export { TribulationEngine } from './tribulation/tribulation-engine.js';
// S8：渡劫 V1 最小世界闭环（TribulationService 包装 TribulationEngine + WorldOutcome）
export { TribulationService } from './tribulation/tribulation-service.js';
export type { TribulationServiceResult, TribulationScene } from './tribulation/tribulation-service.js';

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

// Hex Overworld (六边形世界网格)
export { generateWorldGrid, moveOneStep, autoTravel, findPath, findLandmarkPos, hexDistance, getHexNeighbors, applyExploredCache, collectExplored } from './overworld/hex-overworld-engine.js';
export type { WorldHexGrid, WorldHex, HexTerrain, HexMoveResult, HexMoveEvent } from './overworld/hex-overworld-engine.js';
export { TERRAIN_INFO } from './overworld/hex-overworld-engine.js';
export { npcHexPos, npcSpatialIndex, deriveNpcHexPos } from './overworld/npc-spatial.js';
export type { NpcHexDeriveResult } from './overworld/npc-spatial.js';

// Multi-layer Map Catalog (多层地图)
export { COSMOS_CATALOG, CONTINENT_CATALOG, TELEPORT_GRAPH, VENUE_CATALOG, getCosmos, getContinent, getContinentIdsByCosmos, getTeleportNode, getTeleportNodeAt, getVenuesByNode, getVenue, createInitialMapState } from './overworld/map-catalog.js';
export { TIANJI_SETTLEMENT, SETTLEMENT_REGISTRY, getSettlement, settlementDistance, getNpcsInVenue, getNpcsInSettlement, getNpcsAtSettlementNode } from './overworld/settlement-maps.js';
export type { SettlementNode, SettlementRoad, SettlementMap } from './overworld/settlement-maps.js';
export { TravelService } from './overworld/travel-service.js';
export { VenueService, VENUE_TYPE_LABEL, VENUE_TYPE_ICON } from './overworld/venue-service.js';

// Time System (季节 + 灵气浓度 + 统一时间推进 + 节气事件)
export { getSeason, getSeasonPhase, getSpiritDensityMultiplier, getSeasonDescription } from './time/season-system.js';
export { TimeAdvanceService } from './time/time-advance-service.js';
export type { TimeAdvanceResult } from './time/time-advance-service.js';
export { WorldClockService, projectTime, elapsedFromYearMonth, MINUTES_PER_DAY, MINUTES_PER_MONTH, MINUTES_PER_YEAR, DAYS_PER_MONTH, DAYS_PER_YEAR } from './time/world-clock.js';
export { CALENDAR_EVENTS, rollCalendarEvent, getExpectedCalendarEvent, WORLD_EVENTS, rollWorldEvent } from './time/calendar-event-scheduler.js';
export type { WorldEventDef } from './time/calendar-event-scheduler.js';

// World Emergence (涌现叙事：事件模板/出口/编年史/传闻/生平 — §5/§6)
export { buildChronicle, visibleToPlayer, rumorPool, npcTimeline } from './world/chronicle.js';
export type { YearChronicle, Rumor } from './world/chronicle.js';
export { isNearby, nodeOf } from './world/spatial.js';

// Legendary NPCs (开局世界背景先行 — §7.4)
export { generateLegendaryNpcs } from './world/legendary-npc-generator.js';

// Scene Projection (场景投影：NpcRecord → 临时 Character 的场景感知展开 — S2)
export { expandForScene } from './world/scene-projection.js';
export type { SceneType, ExpandOptions } from './world/scene-projection.js';

// World Outcome (跨实体原子事务提交 — S3)
export { commitOutcome } from './world/outcome-committer.js';

// NPC Query (按位置查 NPC — S5a：遭遇战优先选取真实世界 NPC)
export { npcsByVenue, pickNearbyNpc } from './world/npc-query.js';
export { generateInitialMind, tickNpcMind, computeNeeds, resolveNpcMindAction, resolveNpcCapabilityAction, commitMindAction, getNpcActionDuration } from './world/npc-mind.js';
export type { MindTickResult, NpcNeeds, NpcActionResolution, NpcActionResolutionOptions } from './world/npc-mind.js';
export { commitNpcBrainAction } from './world/npc-brain-action-commit.js';
export type { NpcBrainActionCommitResult } from './world/npc-brain-action-commit.js';
export { buildNpcPerceptionSnapshot, createNpcPerceptionIndex, updateNpcKnowledge } from './world/npc-perception.js';
export type { NpcKnowledgeUpdateResult, NpcPerceptionIndex } from './world/npc-perception.js';
export { prepareNpcExplorePlan } from './world/npc-explore-planner.js';
export type { PrepareNpcExplorePlanResult } from './world/npc-explore-planner.js';
export { tradeNpcInformation } from './world/npc-information-trade.js';
export type { NpcInformationTradeRequest, NpcInformationTradeResult, NpcInformationTradeFailureReason } from './world/npc-information-trade.js';
export { purchaseNpcAsset } from './world/npc-asset-purchase.js';
export type { NpcAssetPurchaseRequest, NpcAssetPurchaseResult, NpcAssetPurchaseFailureReason } from './world/npc-asset-purchase.js';
export { prepareNpcTargetTracking, resolveNpcTargetSearchAtLocation } from './world/npc-target-tracking.js';
export type { PrepareNpcTargetTrackingResult, ResolveNpcTargetTrackingResult, NpcTargetTrackingFailureReason } from './world/npc-target-tracking.js';
export { reserveWorldResources, expireWorldResourceReservations, pruneWorldResourceReservations, completeWorldResourceReservations } from './world/world-resource-reservation.js';
export type { ReserveWorldResourcesResult, ReservationFailureReason } from './world/world-resource-reservation.js';
export { NpcBrainNodeRegistry, createDefaultNpcBrainNodeRegistry } from './world/npc-brain-node-registry.js';
export type { NpcBrainCapabilityId, NpcBrainNodeDefinition, NpcBrainNodeContext } from './world/npc-brain-node-registry.js';
export { evaluateNpcBrainShadow, getNpcBrainCommitEligibility, NpcBrainShadowReportBuilder, mergeNpcBrainShadowReports, DEFAULT_NPC_BRAIN_SATISFACTION_THRESHOLD } from './world/npc-brain-shadow-scheduler.js';
export type { NpcBrainShadowDecision, NpcBrainCommitEligibility, NpcBrainShadowMonthlyReport, NpcBrainShadowAggregateReport, NpcBrainShadowDifference } from './world/npc-brain-shadow-scheduler.js';
export { Watchlist, filterEventRelevance } from './world/watchlist.js';
export type { EventRelevanceLayer } from './world/watchlist.js';
export { inspectWorldBrainInvariants } from './world/npc-brain-invariants.js';
export type { BrainInvariantIssue, BrainInvariantOptions } from './world/npc-brain-invariants.js';

// Sect Presets (宗门预设 — 社会轨道 §2.2)
export { SECT_PRESETS, createInitialFactions } from './world/sect-presets.js';

// AI 增强层预留 (上下文序列化 — §8)
export { serializeNpcBiography, serializeWorldDigest, serializeEventChain, buildAiNarrativePrompt } from './world/context-serializer.js';
export type { AiEnhancementKind } from './world/context-serializer.js';

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
