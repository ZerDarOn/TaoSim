import type { SavePayload, SaveHeader } from '@taosim/contracts';

/**
 * 持久化层抽象接口。
 *
 * Tauri 环境：SQLite 实现
 * Web 降级：IndexedDB 实现
 */
export interface IStorageAdapter {
  /** 保存存档 */
  save(payload: SavePayload): Promise<void>;
  /** 加载存档 */
  load(saveId: string): Promise<SavePayload | null>;
  /** 列出所有存档元数据 */
  listHeaders(): Promise<SaveHeader[]>;
  /** 删除存档 */
  deleteSave(saveId: string): Promise<void>;
  /** 打开/初始化存储 */
  initialize(): Promise<void>;
}

/**
 * In-Memory Storage Adapter（测试/Mock 用）。
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  private store: Map<string, SavePayload> = new Map();

  async save(payload: SavePayload): Promise<void> {
    this.store.set(payload.header.saveId, payload);
  }

  async load(saveId: string): Promise<SavePayload | null> {
    return this.store.get(saveId) ?? null;
  }

  async listHeaders(): Promise<SaveHeader[]> {
    return Array.from(this.store.values()).map(p => p.header);
  }

  async deleteSave(saveId: string): Promise<void> {
    this.store.delete(saveId);
  }

  async initialize(): Promise<void> {
    // no-op
  }
}
