import { describe, expect, it } from 'vitest';
import {
  clampMapZoom,
  semanticMapScale,
  shouldProjectNpcRoute,
  zoomViewportAt,
} from '../map-observation-projection';

describe('map observation projection', () => {
  it('keeps the cursor world point stable while zooming', () => {
    const next = zoomViewportAt(
      { zoom: 1, pan: { x: 20, y: 10 } },
      2,
      { x: 120, y: 80 },
    );
    expect(next).toEqual({ zoom: 2, pan: { x: -80, y: -60 } });
  });

  it('clamps zoom and uses non-overlapping semantic thresholds', () => {
    expect(clampMapZoom(0.1)).toBe(0.65);
    expect(clampMapZoom(9)).toBe(3);
    expect(semanticMapScale(0.89)).toBe('macro');
    expect(semanticMapScale(0.9)).toBe('region');
    expect(semanticMapScale(1.8)).toBe('place');
  });

  it('does not turn a watched NPC into remote live tracking', () => {
    expect(shouldProjectNpcRoute({
      mode: 'focused',
      isGodObserver: false,
      isCurrentlyObservable: false,
      isSelected: false,
      isWatched: true,
    })).toBe(false);
    expect(shouldProjectNpcRoute({
      mode: 'focused',
      isGodObserver: false,
      isCurrentlyObservable: true,
      isSelected: true,
      isWatched: false,
    })).toBe(true);
    expect(shouldProjectNpcRoute({
      mode: 'all_known',
      isGodObserver: true,
      isCurrentlyObservable: false,
      isSelected: false,
      isWatched: false,
    })).toBe(true);
  });
});
