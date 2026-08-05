// ============================================================
// EventLog 大事件日志模型 — 架构规范 §30
// ============================================================

export interface BigEventLog {
  id: string;
  year: number;
  month: number;
  isMajorEvent: boolean;
  title: string;
  description: string;
  involvedCharacterIds: string[];
}
