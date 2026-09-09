import { SaveMigrationRunner, type SavePayload } from '@taosim/contracts';

/**
 * 存档迁移服务。
 * 加载存档时自动执行版本迁移链。
 */
export class MigrationService {
  /**
   * 加载并自动迁移存档到当前 schema 版本。
   */
  public static loadWithMigration(
    rawPayload: unknown,
    postMigration?: (payload: SavePayload) => SavePayload,
  ): SavePayload {
    const migrated = SaveMigrationRunner.migrate(rawPayload);
    return postMigration ? postMigration(migrated) : migrated;
  }

  /**
   * 注册新的迁移步骤。
   */
  public static registerMigration(fromVersion: number, fn: (oldData: any) => any): void {
    SaveMigrationRunner.registerMigration(fromVersion, fn);
  }
}
