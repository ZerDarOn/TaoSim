import type { NpcRouteDisplayMode } from '@taosim/contracts';

export const MAP_MIN_ZOOM = 0.65;
export const MAP_MAX_ZOOM = 3;

export type SemanticMapScale = 'macro' | 'region' | 'place';

export interface MapViewportProjection {
  zoom: number;
  pan: { x: number; y: number };
}

export function clampMapZoom(zoom: number): number {
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, zoom));
}

/** 保持屏幕锚点下的世界坐标不变。 */
export function zoomViewportAt(
  current: MapViewportProjection,
  targetZoom: number,
  anchor: { x: number; y: number },
): MapViewportProjection {
  const zoom = clampMapZoom(targetZoom);
  const ratio = zoom / current.zoom;
  return {
    zoom,
    pan: {
      x: anchor.x - (anchor.x - current.pan.x) * ratio,
      y: anchor.y - (anchor.y - current.pan.y) * ratio,
    },
  };
}

export function semanticMapScale(zoom: number): SemanticMapScale {
  if (zoom < 0.9) return 'macro';
  if (zoom < 1.8) return 'region';
  return 'place';
}

/**
 * 角色视角只有当前可感知的行程才是实时知识；关注不会变成远程 GPS。
 * 上帝模式将所有 NPC 视为可知，但仍受显示模式控制。
 */
export function shouldProjectNpcRoute(input: {
  mode: NpcRouteDisplayMode;
  isGodObserver: boolean;
  isCurrentlyObservable: boolean;
  isSelected: boolean;
  isWatched: boolean;
}): boolean {
  if (input.mode === 'off') return false;
  const isKnownNow = input.isGodObserver || input.isCurrentlyObservable;
  if (!isKnownNow) return false;
  if (input.mode === 'focused') return input.isSelected || input.isWatched;
  return true;
}
