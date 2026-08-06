<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Application, Graphics, Container, Text } from 'pixi.js';
import type { HexBattleMap, HexTile, TerrainType, Character } from '@taosim/contracts';

const props = defineProps<{
  map: HexBattleMap;
  playerId?: string;
  viewRadius?: number;
  characters?: Record<string, Character>;
}>();

const emit = defineEmits<{
  tileClick: [q: number, r: number];
}>();

const canvasRef = ref<HTMLDivElement>();
let app: Application | null = null;

const HEX_SIZE = 32;
const HEX_WIDTH = HEX_SIZE * Math.sqrt(3);

function hexToPixel(q: number, r: number): { x: number; y: number } {
  // 采用 odd-row offset 布局：奇数行整体右移半格（蜂窝交错），
  // 避免 axial 公式导致每行递增偏移、外轮廓呈平行四边形。
  // 注意：此函数仅用于渲染像素坐标；axial 坐标 (q,r) 本身保持不变，
  // 所有 hexDistance / hexNeighbors 等基于 axial 的逻辑不受影响。
  const x = HEX_WIDTH * q + (r % 2 !== 0 ? HEX_WIDTH / 2 : 0);
  const y = HEX_SIZE * 1.5 * r;
  return { x, y };
}

const TERRAIN_COLORS: Record<TerrainType, number> = {
  Plain: 0xc8d6a0, Forest: 0x4a7c3f, DeepWater: 0x2b5797,
  Swamp: 0x6b8e4e, Lava: 0xcc3333, Obstacle: 0x8b7355, Void: 0x1a1a2e,
};

const TERRAIN_LABELS: Record<TerrainType, string> = {
  Plain: '平地', Forest: '密林', DeepWater: '深水',
  Swamp: '沼泽', Lava: '熔岩', Obstacle: '障碍', Void: '虚空',
};

function findPlayerTile(): { q: number; r: number } | null {
  for (const tile of Object.values(props.map.tiles)) {
    if (tile.occupantId === props.playerId) return { q: tile.q, r: tile.r };
  }
  return null;
}

function isVisible(q: number, r: number): boolean {
  if (!props.playerId) return true;
  const pt = findPlayerTile();
  if (!pt) return true;
  const dx = q - pt.q; const dy = r - pt.r;
  const dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(-dx - dy));
  return dist <= (props.viewRadius ?? 3);
}

// 查找某个格子上的角色
function getCharacterOnTile(q: number, r: number): Character | null {
  if (!props.characters) return null;
  const tile = props.map.tiles[`${q},${r}`];
  if (!tile?.occupantId) return null;
  return props.characters[tile.occupantId] ?? null;
}

// 绘制时的整体偏移（render 时计算，供点击坐标换算使用）
let offsetX = 0;
let offsetY = 0;

function drawHex(tile: HexTile, g: Graphics, container: Container) {
  const { x, y } = hexToPixel(tile.q, tile.r);
  const cx = x + offsetX; const cy = y + offsetY;
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle));
  }

  // 战争迷雾：已揭示且处于视野内的格子才显示地形与单位，其余为暗格
  if (tile.isRevealed && isVisible(tile.q, tile.r)) {
    g.beginFill(TERRAIN_COLORS[tile.terrain] ?? 0x999999);
    g.drawPolygon(points); g.endFill();
    g.lineStyle(1, 0x333333, 0.3);
    g.drawPolygon(points); g.lineStyle(0);

    const label = new Text(TERRAIN_LABELS[tile.terrain] ?? '?', {
      fontSize: 8, fill: 0xffffff, fontFamily: 'sans-serif',
    });
    label.anchor.set(0.5); label.position.set(cx, cy - 12);
    container.addChild(label);
  } else {
    g.beginFill(0x111111, 0.8);
    g.drawPolygon(points); g.endFill();
  }

  // ---- 画角色棋子（仅在视野内） ----
  const char = getCharacterOnTile(tile.q, tile.r);
  if (char) {
    const isPlayer = char.id === props.playerId;
    const charColor = isPlayer ? 0xfbbf24 : 0xf87171;
    const nameColor = isPlayer ? 0xfbbf24 : 0xfca5a5;

    // 棋子底座（圆形）
    const tokenG = new Graphics();
    tokenG.beginFill(charColor, 0.9);
    tokenG.drawCircle(cx, cy + 2, 10);
    tokenG.endFill();
    tokenG.beginFill(0x1a1a2e, 0.8);
    tokenG.drawCircle(cx, cy + 2, 8);
    tokenG.endFill();
    container.addChild(tokenG);

    // 角色名字首字
    const charLabel = new Text(char.name.charAt(0), {
      fontSize: 10, fill: nameColor, fontFamily: 'sans-serif', fontWeight: 'bold',
    });
    charLabel.anchor.set(0.5); charLabel.position.set(cx, cy + 3);
    container.addChild(charLabel);

    // HP 条
    const hpRatio = Math.max(0, char.hp / char.maxHp);
    const barW = 22;
    const hpBg = new Graphics();
    hpBg.beginFill(0x333333, 0.8);
    hpBg.drawRect(cx - barW / 2, cy - 16, barW, 4);
    hpBg.endFill();
    hpBg.beginFill(hpRatio > 0.5 ? 0x22c55e : hpRatio > 0.25 ? 0xf59e0b : 0xef4444);
    hpBg.drawRect(cx - barW / 2, cy - 16, barW * hpRatio, 4);
    hpBg.endFill();
    container.addChild(hpBg);

    // HP 数值
    const hpText = new Text(`${Math.max(0, Math.ceil(char.hp))}`, {
      fontSize: 7, fill: 0xffffff, fontFamily: 'sans-serif',
    });
    hpText.anchor.set(0.5); hpText.position.set(cx, cy - 22);
    container.addChild(hpText);
  }
}

function render() {
  if (!app || !props.map) return;
  const container = app.stage; container.removeChildren();
  const g = new Graphics();
  const allCoords = Object.values(props.map.tiles).map(t => hexToPixel(t.q, t.r));
  const minX = Math.min(...allCoords.map(c => c.x));
  const minY = Math.min(...allCoords.map(c => c.y));
  offsetX = HEX_WIDTH / 2 - minX + 20;
  offsetY = HEX_SIZE * 2 / 2 - minY + 20;

  for (const tile of Object.values(props.map.tiles)) {
    drawHex(tile, g, container);
  }

  // 单一点击处理器：按最近格子判定目标（避免多格叠加同一 Graphics 导致事件串扰）
  g.interactive = true; g.cursor = 'pointer';
  g.on('click', (event: any) => {
    const local = g.toLocal(event.global);
    let best: HexTile | null = null;
    let bestDist = Infinity;
    for (const tile of Object.values(props.map.tiles)) {
      const p = hexToPixel(tile.q, tile.r);
      const cx = p.x + offsetX; const cy = p.y + offsetY;
      const d = (local.x - cx) ** 2 + (local.y - cy) ** 2;
      if (d < bestDist) { bestDist = d; best = tile; }
    }
    if (best) emit('tileClick', best.q, best.r);
  });

  container.addChildAt(g, 0);
}

onMounted(() => {
  if (!canvasRef.value) return;
  const w = Math.max(props.map.width * HEX_WIDTH + 40, 400);
  const h = Math.max(props.map.height * HEX_SIZE * 1.5 + 40, 400);
  app = new Application({
    width: w, height: h,
    backgroundColor: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  canvasRef.value.appendChild(app.view as HTMLCanvasElement);
  render();
});

onUnmounted(() => { if (app) { app.destroy(true); app = null; } });
watch(() => [props.map, props.characters], () => { if (app) render(); }, { deep: true });
</script>

<template>
  <div ref="canvasRef" class="hex-canvas-container rounded-lg overflow-hidden border border-line" />
</template>

<style scoped>
.hex-canvas-container {
  width: 100%; min-height: 400px;
  display: flex; justify-content: center; align-items: center;
  background: #1a1a2e;
}
</style>
