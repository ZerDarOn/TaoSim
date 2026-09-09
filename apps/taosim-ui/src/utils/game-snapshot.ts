import { toRaw } from 'vue';

/**
 * 游戏存档契约使用 JSON 数据。引擎入口复制快照，移除嵌套 Vue Proxy，
 * 同时避免引擎在结果发布之前修改 Pinia 中的原始状态。
 * 不用于含 Map、Set、类实例或函数的运行时对象。
 */
export function createGameSnapshot<T>(value: T): T {
  // Pinia 的大世界对象是深响应式代理。直接 JSON.stringify(proxy) 会在每个字段
  // 触发 Vue get trap；先回到其原始根对象，仍通过 JSON 边界产生完全独立的引擎快照。
  return value == null ? value : JSON.parse(JSON.stringify(toRaw(value))) as T;
}
