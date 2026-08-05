// ============================================================
// LogFilter 战斗日志过滤器 — 架构规范 §31.3
// ============================================================

export interface LogFilterConfig {
  categories: {
    all: boolean;
    combat: boolean;     // 战斗日志
    sect: boolean;       // 宗门变故
    gossip: boolean;     // 八卦传闻
    personal: boolean;   // 个人修炼/突破
  };
  searchKeyword: string;
}
