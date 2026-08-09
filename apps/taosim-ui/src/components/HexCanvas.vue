<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Application, Graphics, Container, Text } from 'pixi.js';
import type { HexBattleMap, HexTile, TerrainType, Character } from '@taosim/contracts';
import type { FloatingText } from '@/battle/types';

const props = defineProps<{
  map: HexBattleMap;
  playerId?: string;
  viewRadius?: number;
  characters?: Record<string, Character>;
  moveRange?: { q: number; r: number }[];
  attackRange?: { q: number; r: number }[];
  selectedTile?: { q: number; r: number } | null;
  floatingTexts?: FloatingText[];
}>();

const emit = defineEmits<{
  tileClick: [q: number, r: number];
  tileHover: [info: { q: number; r: number; characterId?: string } | null];
  floatingTextDone: [id: number];
}>();

const canvasRef = ref<HTMLDivElement>();
let app: Application | null = null;

const HEX_SIZE = 32;
const HEX_WIDTH = HEX_SIZE * Math.sqrt(3);
const HEX_SCALE_MIN = 0.6;
const HEX_SCALE_MAX = 2.0;
const DRAG_THRESHOLD = 6;

// ---- 视口状态（平移/缩放/高亮/飘字动画） ----
let viewX = 0;
let viewY = 0;
let scale = 1;
let worldContainer: Container | null = null;
let fxLayer: Container | null = null;
let hoverTile: { q: number; r: number } | null = null;
let pendingDrag: { startX: number; startY: number; dragged: boolean } | null = null;
let anims: { id: number; text: Text; t: number }[] = [];
let tickRegistered = false;
let removeViewListeners: (() => void) | null = null;

function hexToPixel(q: number, r: number): { x: number; y: number } {
  // 采用 odd-row offset 布局：奇数行整体右移半格（蜂窝交错），
  // 避免 axial 公式导致每行递增偏移、外轮廓呈平行四边形。
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

// 绘制时的整体偏移（render 时计算，供点击/高亮/飘字坐标换算使用）
let offsetX = 0;
let offsetY = 0;

/** 六边形顶点像素坐标（世界坐标，含整体偏移；高亮/飘字复用） */
function hexPoly(q: number, r: number): number[] {
  const { x, y } = hexToPixel(q, r);
  const cx = x + offsetX; const cy = y + offsetY;
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(cx + HEX_SIZE * Math.cos(a), cy + HEX_SIZE * Math.sin(a));
  }
  return pts;
}

/** 屏幕局部坐标 → 最近格（世界坐标换算，与现有点击判定逻辑一致） */
function tileAtLocal(localX: number, localY: number): { q: number; r: number } | null {
  let best: { q: number; r: number } | null = null;
  let bestDist = Infinity;
  for (const tile of Object.values(props.map.tiles)) {
    const p = hexToPixel(tile.q, tile.r);
    const cx = p.x + offsetX; const cy = p.y + offsetY;
    const d = (localX - cx) ** 2 + (localY - cy) ** 2;
    if (d < bestDist) { bestDist = d; best = { q: tile.q, r: tile.r }; }
  }
  return best;
}

/** 地形层：战争迷雾 + 地形底色 + 地形标签（不含单位） */
function drawTerrain(tile: HexTile, g: Graphics, container: Container) {
  const pts = hexPoly(tile.q, tile.r);
  if (tile.isRevealed && isVisible(tile.q, tile.r)) {
    g.beginFill(TERRAIN_COLORS[tile.terrain] ?? 0x999999);
    g.drawPolygon(pts); g.endFill();
    g.lineStyle(1, 0x333333, 0.3);
    g.drawPolygon(pts); g.lineStyle(0);

    const label = new Text(TERRAIN_LABELS[tile.terrain] ?? '?', {
      fontSize: 8, fill: 0xffffff, fontFamily: 'sans-serif',
    });
    const { x, y } = hexToPixel(tile.q, tile.r);
    label.anchor.set(0.5); label.position.set(x + offsetX, y + offsetY - 12);
    container.addChild(label);
  } else {
    g.beginFill(0x111111, 0.8);
    g.drawPolygon(pts); g.endFill();
  }
}

/** 单位层：棋子圆底 + 名字首字 + HP 条 + HP 数值 */
function drawToken(tile: HexTile, container: Container) {
  const char = getCharacterOnTile(tile.q, tile.r);
  if (!char) return;
  const { x, y } = hexToPixel(tile.q, tile.r);
  const cx = x + offsetX; const cy = y + offsetY;
  const isPlayer = char.id === props.playerId;
  const charColor = isPlayer ? 0xfbbf24 : 0xf87171;
  const nameColor = isPlayer ? 0xfbbf24 : 0xfca5a5;

  const tokenG = new Graphics();
  tokenG.beginFill(charColor, 0.9);
  tokenG.drawCircle(cx, cy + 2, 10);
  tokenG.endFill();
  tokenG.beginFill(0x1a1a2e, 0.8);
  tokenG.drawCircle(cx, cy + 2, 8);
  tokenG.endFill();
  container.addChild(tokenG);

  const charLabel = new Text(char.name.charAt(0), {
    fontSize: 10, fill: nameColor, fontFamily: 'sans-serif', fontWeight: 'bold',
  });
  charLabel.anchor.set(0.5); charLabel.position.set(cx, cy + 3);
  container.addChild(charLabel);

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

  const hpText = new Text(`${Math.max(0, Math.ceil(char.hp))}`, {
    fontSize: 7, fill: 0xffffff, fontFamily: 'sans-serif',
  });
  hpText.anchor.set(0.5); hpText.position.set(cx, cy - 22);
  container.addChild(hpText);
}

/** 高亮层：移动绿/攻击红 + 悬停白描边 + 选中金边（地形之上、单位之下） */
function drawHighlights(g: Graphics, container: Container) {
  const moveKeys = new Set((props.moveRange ?? []).map(t => `${t.q},${t.r}`));
  const atkKeys = new Set((props.attackRange ?? []).map(t => `${t.q},${t.r}`));

  for (const tile of Object.values(props.map.tiles)) {
    const key = `${tile.q},${tile.r}`;
    const pts = hexPoly(tile.q, tile.r);
    if (moveKeys.has(key)) { g.beginFill(0x22c55e, 0.35); g.drawPolygon(pts); g.endFill(); }
    if (atkKeys.has(key)) { g.beginFill(0xef4444, 0.35); g.drawPolygon(pts); g.endFill(); }
  }

  if (hoverTile) {
    const t = props.map.tiles[`${hoverTile.q},${hoverTile.r}`];
    if (t) { g.lineStyle(2, 0xffffff, 0.9); g.drawPolygon(hexPoly(t.q, t.r)); g.lineStyle(0); }
  }
  if (props.selectedTile) {
    const t = props.map.tiles[`${props.selectedTile.q},${props.selectedTile.r}`];
    if (t) { g.lineStyle(3, 0xfbbf24, 1); g.drawPolygon(hexPoly(t.q, t.r)); g.lineStyle(0); }
  }
}

function render() {
  if (!app || !props.map || !worldContainer) return;
  // 重建世界层：地形+高亮+单位（fxLayer 恒在最上，动画对象保留）
  worldContainer.removeChildren();
  worldContainer.position.set(viewX, viewY);
  worldContainer.scale.set(scale);

  const allCoords = Object.values(props.map.tiles).map(t => hexToPixel(t.q, t.r));
  const minX = Math.min(...allCoords.map(c => c.x));
  const minY = Math.min(...allCoords.map(c => c.y));
  offsetX = HEX_WIDTH / 2 - minX + 20;
  offsetY = HEX_SIZE * 2 / 2 - minY + 20;

  const g = new Graphics();
  for (const tile of Object.values(props.map.tiles)) drawTerrain(tile, g, worldContainer);
  drawHighlights(g, worldContainer);
  bindViewportEvents(g);
  worldContainer.addChildAt(g, 0);

  for (const tile of Object.values(props.map.tiles)) drawToken(tile, worldContainer);
  worldContainer.addChild(fxLayer!); // 置顶飘字层
}

/** 视口交互：滚轮缩放（围绕指针）/拖拽平移（6px 阈值）/悬停/点击/右键取消 */
function bindViewportEvents(g: Graphics) {
  g.eventMode = 'static';
  g.cursor = 'grab';

  g.on('pointerdown', (e: any) => {
    pendingDrag = { startX: e.global.x, startY: e.global.y, dragged: false };
    g.cursor = 'grabbing';
  });
  g.on('pointermove', (e: any) => {
    const local = g.toLocal(e.global);
    const tile = tileAtLocal(local.x, local.y);
    if (pendingDrag) {
      const dx = e.global.x - pendingDrag.startX;
      const dy = e.global.y - pendingDrag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) pendingDrag.dragged = true;
      if (pendingDrag.dragged) {
        viewX += dx; viewY += dy;
        pendingDrag.startX = e.global.x; pendingDrag.startY = e.global.y;
        worldContainer!.position.set(viewX, viewY);
        return; // 拖拽中不更新悬停
      }
    }
    const key = tile ? `${tile.q},${tile.r}` : '';
    const tileObj = key ? props.map.tiles[key] : undefined;
    emit('tileHover', tile && tileObj ? { q: tile.q, r: tile.r, characterId: tileObj.occupantId } : null);
    if (tile && (hoverTile?.q !== tile.q || hoverTile?.r !== tile.r)) {
      hoverTile = tile; render();
    } else if (!tile && hoverTile) {
      hoverTile = null; render();
    }
  });
  g.on('pointerup', (e: any) => {
    g.cursor = 'grab';
    if (!pendingDrag) return;
    const wasDrag = pendingDrag.dragged;
    pendingDrag = null;
    if (wasDrag) return; // 拖拽不触发点击
    const local = g.toLocal(e.global);
    const tile = tileAtLocal(local.x, local.y);
    if (tile) emit('tileClick', tile.q, tile.r);
  });
  g.on('pointerupoutside', () => { pendingDrag = null; g.cursor = 'grab'; });
  g.on('rightdown', () => {
    pendingDrag = null;
    g.cursor = 'grab';
    emit('tileClick', -1, -1);
  }); // 右键取消（-1 哨兵）
}

/** 飘字：监听 floatingTexts 新增项，创建 Pixi Text 并驱动 1.2s 上浮淡出动画 */
function spawnFloatTexts() {
  const pending = props.floatingTexts ?? [];
  const existing = new Set(anims.map(a => a.id));
  let added = false;
  for (const f of pending) {
    if (existing.has(f.id)) continue;
    const { x, y } = hexToPixel(f.q, f.r);
    const t = new Text(f.text, {
      fontSize: f.kind === 'crit' ? 16 : 13,
      // crit 暴击橙红大字 / damage 金色伤害 / dodge 蓝色闪避 / block 白色格挡 / info 灰色提示
      fill: f.kind === 'info' ? 0x94a3b8
        : f.kind === 'damage' ? 0xffd700
        : f.kind === 'crit' ? 0xff6b35
        : f.kind === 'dodge' ? 0x60a5fa
        : f.kind === 'block' ? 0xe2e8f0
        : 0xef4444,
      fontWeight: 'bold', fontFamily: 'sans-serif',
    });
    t.anchor.set(0.5);
    t.position.set(x + offsetX, y + offsetY - 10);
    (t as any)._ftId = f.id;
    fxLayer!.addChild(t);
    anims.push({ id: f.id, text: t, t: 0 });
    added = true;
  }
  if (added && !tickRegistered) { app!.ticker.add(tickAnim); tickRegistered = true; }
}

function tickAnim() {
  const done: number[] = [];
  const step = app!.ticker.deltaMS / 1200;
  for (const a of anims) {
    a.t += step;
    a.text.alpha = Math.max(0, 1 - a.t);
    a.text.y -= 40 * step;
    if (a.t >= 1) done.push(a.id);
  }
  if (done.length === 0) return;
  anims = anims.filter(a => !done.includes(a.id));
  for (const id of done) {
    const child = fxLayer!.children.find(c => (c as any)._ftId === id);
    if (child) child.destroy();
    emit('floatingTextDone', id);
  }
  if (anims.length === 0) { app!.ticker.remove(tickAnim); tickRegistered = false; }
}

/** 缩放按钮（围绕中心） */
function zoomBy(factor: number) {
  const next = Math.min(HEX_SCALE_MAX, Math.max(HEX_SCALE_MIN, scale * factor));
  if (next === scale) return;
  scale = next;
  worldContainer!.scale.set(scale);
  render();
}

function resetView() {
  scale = 1; viewX = 0; viewY = 0;
  render();
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

  worldContainer = new Container();
  fxLayer = new Container();
  app.stage.addChild(worldContainer);
  worldContainer.addChild(fxLayer);

  const viewEl = app.view as HTMLCanvasElement;
  const wheelHandler = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(HEX_SCALE_MAX, Math.max(HEX_SCALE_MIN, scale * factor));
    if (newScale === scale) return;
    // 围绕指针缩放：保持指针下的世界坐标不动（offsetX/Y 为 CSS 像素，需 ×resolution 换算物理像素）
    const dpr = app!.renderer.resolution;
    const local = worldContainer!.toLocal({ x: e.offsetX * dpr, y: e.offsetY * dpr });
    scale = newScale;
    worldContainer!.scale.set(scale);
    const back = worldContainer!.toGlobal(local);
    viewX += e.offsetX * dpr - back.x;
    viewY += e.offsetY * dpr - back.y;
    worldContainer!.position.set(viewX, viewY);
    render();
  };
  viewEl.addEventListener('wheel', wheelHandler, { passive: false });
  const ctxHandler = (e: Event) => e.preventDefault();
  viewEl.addEventListener('contextmenu', ctxHandler);
  removeViewListeners = () => {
    viewEl.removeEventListener('wheel', wheelHandler);
    viewEl.removeEventListener('contextmenu', ctxHandler);
  };

  render();
});

onUnmounted(() => {
  if (app) { app.destroy(true); app = null; }
  if (removeViewListeners) { removeViewListeners(); removeViewListeners = null; }
  worldContainer = null; fxLayer = null;
  hoverTile = null; pendingDrag = null; anims = [];
});

watch(() => [props.map, props.characters], () => { if (app) render(); }, { deep: true });
watch(() => [props.moveRange, props.attackRange, props.selectedTile],
  () => { if (app) render(); }, { deep: true });
watch(() => props.floatingTexts, spawnFloatTexts, { deep: true });
</script>

<template>
  <div ref="canvasRef" class="relative hex-canvas-container rounded-lg overflow-hidden border border-line">
    <div class="absolute bottom-2 left-2 flex gap-1 z-10">
      <button class="zoom-btn" @click="zoomBy(1.2)">+</button>
      <button class="zoom-btn" @click="zoomBy(1 / 1.2)">−</button>
      <button class="zoom-btn" @click="resetView">重置</button>
    </div>
  </div>
</template>

<style scoped>
.hex-canvas-container {
  width: 100%; min-height: 400px;
  display: flex; justify-content: center; align-items: center;
  background: #1a1a2e;
}
.zoom-btn {
  padding: 2px 10px; border-radius: 6px;
  background: rgba(15, 23, 42, 0.85); color: #cbd5e1;
  border: 1px solid #334155; font-size: 14px; line-height: 1.4;
  cursor: pointer;
}
.zoom-btn:hover { color: #fbbf24; border-color: #fbbf24; }
</style>
