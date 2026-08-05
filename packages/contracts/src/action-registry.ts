// ============================================================
// ActionRegistry 与事件模型 — 架构规范 §28
// ============================================================

import type { Character } from './character.js';
import type { WorldState } from './world-state.js';

export interface ActionContext {
  actor: Character;
  target: Character;
  worldState: WorldState;
}

export interface RegisteredAction {
  id: string;
  priority: number;                          // 数值越大越优先执行
  condition: (context: ActionContext) => boolean;
  execute: (context: ActionContext) => void;
}

export class ActionRegistry {
  private actions: Map<string, RegisteredAction> = new Map();

  public registerAction(action: RegisteredAction): void {
    this.actions.set(action.id, action);
  }

  public unregisterAction(id: string): void {
    this.actions.delete(id);
  }

  public getSortedActions(context: ActionContext): RegisteredAction[] {
    return Array.from(this.actions.values())
      .filter(a => a.condition(context))
      .sort((a, b) => b.priority - a.priority);
  }
}
