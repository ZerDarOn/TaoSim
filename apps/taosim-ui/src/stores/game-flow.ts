// apps/taosim-ui/src/stores/game-flow.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 游戏阶段状态机
 *
 * title       → 首页（开始新游戏/读取存档/设置）
 * worldInit   → 世界初始化配置（世界规模/预演化年数/难度）
 * character   → 角色卡创建（单页：姓名+性别+背景+词条+属性+灵根）
 * generating  → 世界生成中（加载画面：地图诞生→NPC涌现→秘境形成）
 * playing     → 游戏中
 * gameover    → 游戏结束
 */
export type GamePhase = 'title' | 'worldInit' | 'character' | 'generating' | 'playing' | 'gameover';

/** 世界初始化配置 */
export interface WorldInitConfig {
  /** 世界规模：初始NPC数量 */
  npcScale: 'small' | 'medium' | 'large';
  /** 预演化年数（世界开局前自动推进多少年） */
  preEvolveYears: number;
  /** 难力 */
  difficulty: 'easy' | 'normal' | 'hard';
}

export const useGameFlowStore = defineStore('game-flow', () => {
  const phase = ref<GamePhase>('title');
  const deathMessage = ref<string | null>(null);
  const worldConfig = ref<WorldInitConfig>({
    npcScale: 'medium',
    preEvolveYears: 50,
    difficulty: 'normal',
  });

  /** 世界生成进度（0-100），供 WorldGeneratingScreen 使用 */
  const generatingProgress = ref(0);
  const generatingStage = ref<string>('');

  function enterTitle() {
    phase.value = 'title';
    deathMessage.value = null;
    generatingProgress.value = 0;
    generatingStage.value = '';
  }

  function enterWorldInit() {
    phase.value = 'worldInit';
  }

  function enterCharacter() {
    phase.value = 'character';
  }

  function enterGenerating() {
    phase.value = 'generating';
    generatingProgress.value = 0;
  }

  function setGeneratingProgress(pct: number, stage: string) {
    generatingProgress.value = pct;
    generatingStage.value = stage;
  }

  function enterPlaying() {
    phase.value = 'playing';
  }

  function enterGameOver(message?: string) {
    phase.value = 'gameover';
    if (message) deathMessage.value = message;
  }

  function setWorldConfig(config: Partial<WorldInitConfig>) {
    worldConfig.value = { ...worldConfig.value, ...config };
  }

  return {
    phase,
    deathMessage,
    worldConfig,
    generatingProgress,
    generatingStage,
    enterTitle,
    enterWorldInit,
    enterCharacter,
    enterGenerating,
    setGeneratingProgress,
    enterPlaying,
    enterGameOver,
    setWorldConfig,
  };
});
