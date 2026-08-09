import type { Character, Skill } from '@taosim/contracts';
import { hexDistance } from '@taosim/contracts';
import type { CombatEngine } from './combat-engine.js';

export interface NpcAction {
  type: 'attack' | 'move' | 'skip';
  skill?: Skill;
  targetId?: string;
  toQ?: number;
  toR?: number;
}

export class NpcAI {
  static decide(
    actor: Character,
    target: Character,
    engine: CombatEngine,
    characters: Record<string, Character>,
  ): NpcAction {
    const availableSkills = actor.skills.filter(s => {
      const cd = actor.skillCooldowns[s.id];
      if (cd && cd > 0) return false;
      if (actor.spiritEnergy.current < s.cost.spiritEnergy) return false;
      if (actor.ap < s.cost.ap) return false;
      return true;
    });

    const bestSkill = availableSkills[0] ?? null;
    const skillRange = 1;

    const actorPos = engine.findCharacterPosition(actor.id);
    const targetPos = engine.findCharacterPosition(target.id);
    if (!actorPos) return { type: 'skip' };

    let inRange = false;
    if (targetPos) {
      const dist = hexDistance(actorPos.q, actorPos.r, targetPos.q, targetPos.r);
      inRange = dist <= skillRange;
    }

    if (inRange && bestSkill) {
      return { type: 'attack', skill: bestSkill, targetId: target.id };
    }

    // 无可用技能（无技能/灵力不足/冷却中）但仍有 AP 时贴身退化普攻——
    // 避免"近身却干瞪眼空过回合"的无效 AI
    if (inRange && actor.ap >= 1) {
      return { type: 'attack', targetId: target.id };
    }

    if (targetPos) {
      const movePos = NpcAI.findBestMoveToward(actorPos, targetPos, engine, characters, actor);
      if (movePos) return { type: 'move', toQ: movePos.q, toR: movePos.r };
    }

    return { type: 'skip' };
  }

  private static findBestMoveToward(
    from: { q: number; r: number },
    to: { q: number; r: number },
    engine: CombatEngine,
    _characters: Record<string, Character>,
    actor: Character,
  ): { q: number; r: number } | null {
    const MAX_MOVE = 3;
    let best: { q: number; r: number } | null = null;
    let bestDist = Infinity;

    for (let dq = -MAX_MOVE; dq <= MAX_MOVE; dq++) {
      for (let dr = -MAX_MOVE; dr <= MAX_MOVE; dr++) {
        const q = from.q + dq;
        const r = from.r + dr;
        const dist = hexDistance(from.q, from.r, q, r);
        if (dist > MAX_MOVE) continue;

        const map = engine.getMap();
        const tile = map.tiles[`${q},${r}`];
        if (!tile || tile.isBlocked) continue;
        if (tile.isWater && !actor.canFly) continue;
        if (tile.occupantId && tile.occupantId !== actor.id) continue;

        const d = hexDistance(q, r, to.q, to.r);
        if (d < bestDist) {
          bestDist = d;
          best = { q, r };
        }
      }
    }
    return best;
  }
}
