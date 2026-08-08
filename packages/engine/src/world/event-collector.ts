// ============================================================
// EventCollector — 引擎统一事件出口（世界涌现叙事设计 §5）
//
// - 所有世界事件经此生成：模板渲染 + 时间戳 + 自增 id + 因果链
// - UI 只导入展示，不手拼事件文本
// - 后续 TimeAdvanceService 聚合：世界事件 + 玩家生命周期事件 + 经济事件
// ============================================================

import type { BigEventLog, EventSeverity, EventVisibility } from '@taosim/contracts';
import { findTemplate, renderTemplate } from './event-templates.js';

export interface EmitInput {
  /** 模板键（见 event-templates.ts） */
  key: string;
  /** 模板变量（真实实体引用） */
  vars: Record<string, string>;
  involvedCharacterIds: string[];
  /** 真实地点引用 */
  locationId?: string;
  /** 因果链：关联到先前事件 */
  relatedTo?: BigEventLog[];
}

export class EventCollector {
  private counter = 0;

  constructor(
    public year: number,
    public month: number,
  ) {}

  /** 推进后同步世界时间 */
  setTime(year: number, month: number): void {
    this.year = year;
    this.month = month;
  }

  /**
   * 按模板生成并返回一条事件（不自动入池，由调用方决定流向）。
   * 未知模板键直接抛错——模板是唯一文本来源，不允许手拼。
   */
  emit(input: EmitInput): BigEventLog {
    const tpl = findTemplate(input.key);
    if (!tpl) {
      throw new Error(`未知事件模板: ${input.key}`);
    }
    const major = tpl.severity === 'major' || tpl.severity === 'epoch';
    this.counter++;
    return {
      id: `EVT_${this.year}_${this.month}_${this.counter}`,
      year: this.year,
      month: this.month,
      isMajorEvent: major,
      category: tpl.category,
      severity: tpl.severity,
      visibility: tpl.visibility,
      source: 'engine',
      title: renderTemplate(tpl.titlePattern, input.vars),
      description: renderTemplate(tpl.descriptionPattern, input.vars),
      involvedCharacterIds: input.involvedCharacterIds,
      locationId: input.locationId,
      relatedEventIds: input.relatedTo?.length ? input.relatedTo.map(e => e.id) : undefined,
    };
  }

  /** 便捷：将严重度映射为模板的 isMajor 语义一致（保留给外部自定义严重度时用） */
  static severityToVisibility(severity: EventSeverity): EventVisibility {
    if (severity === 'epoch') return 'world';
    if (severity === 'major') return 'regional';
    return 'local';
  }
}
