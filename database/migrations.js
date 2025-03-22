"use strict";

/**
 * 数据库迁移管理模块
 * 用于管理数据库结构的版本控制和安全迁移
 */
module.exports = (DB) => {
    // 初始化迁移版本表
    function initMigrationTable() {
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS db_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                executed_at INTEGER DEFAULT (strftime('%s', 'now')),
                status TEXT CHECK(status IN ('pending', 'success', 'failed')) DEFAULT 'pending'
            )
        `).run();
    }

    // 获取当前数据库版本
    function getCurrentVersion() {
        const result = DB.prepare("SELECT MAX(version) as version FROM db_migrations WHERE status = 'success'").get();
        return result ? result.version : 0;
    }

    // 记录迁移执行状态
    function recordMigration(version, name, status) {
        DB.prepare(`
            REPLACE INTO db_migrations (version, name, status)
            VALUES (?, ?, ?)
        `).run(version, name, status);
    }

    // 安全执行SQL语句
    function safeExecute(sql) {
        try {
            DB.prepare(sql).run();
            return true;
        } catch (err) {
            console.error('执行SQL失败:', err);
            return false;
        }
    }

    // 检查列是否存在
    function columnExists(table, column) {
        const columns = DB.prepare(`PRAGMA table_info(${table})`).all();
        return columns.some(col => col.name === column);
    }

    // 迁移操作列表
    const migrations = [
        {
            version: 1,
            name: '添加流量限制相关字段',
            up: () => {
                const operations = [
                    // 添加流量限制字段
                    !columnExists('servers', 'traffic_limit') ?
                    `ALTER TABLE servers ADD COLUMN traffic_limit BIGINT;` : null,

                    // 设置流量限制默认值
                    !columnExists('servers', 'traffic_limit') ?
                    `UPDATE servers SET traffic_limit = 0 WHERE traffic_limit IS NULL;` : null,

                    // 添加流量重置日字段
                    !columnExists('servers', 'traffic_reset_day') ?
                    `ALTER TABLE servers ADD COLUMN traffic_reset_day INTEGER;` : null,

                    // 设置流量重置日默认值
                    !columnExists('servers', 'traffic_reset_day') ?
                    `UPDATE servers SET traffic_reset_day = 1 WHERE traffic_reset_day IS NULL;` : null,

                    // 添加流量预警阈值字段
                    !columnExists('servers', 'traffic_alert_percent') ?
                    `ALTER TABLE servers ADD COLUMN traffic_alert_percent INTEGER;` : null,

                    // 设置流量预警阈值默认值
                    !columnExists('servers', 'traffic_alert_percent') ?
                    `UPDATE servers SET traffic_alert_percent = 80 WHERE traffic_alert_percent IS NULL;` : null,

                    // 添加上次重置时间字段
                    !columnExists('servers', 'traffic_last_reset') ?
                    `ALTER TABLE servers ADD COLUMN traffic_last_reset INTEGER;` : null,

                    // 设置上次重置时间默认值
                    !columnExists('servers', 'traffic_last_reset') ?
                    `UPDATE servers SET traffic_last_reset = strftime('%s', 'now') WHERE traffic_last_reset IS NULL;` : null
                ].filter(sql => sql !== null);

                // 执行所有操作
                return operations.every(sql => safeExecute(sql));
            }
        },
        {
            version: 2,
            name: '添加分组字段',
            up: () => {
                const operations = [
                    // 添加分组字段
                    !columnExists('servers', 'group_id') ?
                    `ALTER TABLE servers ADD COLUMN group_id TEXT;` : null,

                    // 设置分组默认值
                    !columnExists('servers', 'group_id') ?
                    `UPDATE servers SET group_id = 'default' WHERE group_id IS NULL;` : null
                ].filter(sql => sql !== null);

                // 执行所有操作
                return operations.every(sql => safeExecute(sql));
            }
        },
        {
            version: 3,
            name: '添加流量校准字段',
            up: () => {
                const operations = [
                    // 添加流量校准日期字段
                    !columnExists('servers', 'traffic_calibration_date') ?
                    `ALTER TABLE servers ADD COLUMN traffic_calibration_date INTEGER;` : null,

                    // 设置流量校准日期默认值
                    !columnExists('servers', 'traffic_calibration_date') ?
                    `UPDATE servers SET traffic_calibration_date = strftime('%s', 'now') WHERE traffic_calibration_date IS NULL;` : null,

                    // 添加流量校准值字段
                    !columnExists('servers', 'traffic_calibration_value') ?
                    `ALTER TABLE servers ADD COLUMN traffic_calibration_value BIGINT;` : null,

                    // 设置流量校准值默认值
                    !columnExists('servers', 'traffic_calibration_value') ?
                    `UPDATE servers SET traffic_calibration_value = 0 WHERE traffic_calibration_value IS NULL;` : null
                ].filter(sql => sql !== null);

                // 执行所有操作
                return operations.every(sql => safeExecute(sql));
            }
        }
        // 在这里添加更多的迁移版本
    ];

    // 执行迁移
    function migrate() {
        // 初始化迁移表
        initMigrationTable();

        // 获取当前版本
        const currentVersion = getCurrentVersion();
        console.log('当前数据库版本:', currentVersion);

        // 执行待迁移的版本
        for (const migration of migrations) {
            if (migration.version > currentVersion) {
                console.log(`开始执行迁移: ${migration.name} (版本 ${migration.version})`);
                try {
                    // 开始事务
                    DB.prepare('BEGIN').run();

                    // 执行迁移
                    const success = migration.up();

                    if (success) {
                        // 记录成功状态
                        recordMigration(migration.version, migration.name, 'success');
                        DB.prepare('COMMIT').run();
                        console.log(`迁移成功: ${migration.name}`);
                    } else {
                        // 记录失败状态并回滚
                        recordMigration(migration.version, migration.name, 'failed');
                        DB.prepare('ROLLBACK').run();
                        console.error(`迁移失败: ${migration.name}`);
                    }
                } catch (err) {
                    // 发生错误时回滚
                    DB.prepare('ROLLBACK').run();
                    console.error(`迁移出错: ${migration.name}`, err);
                    recordMigration(migration.version, migration.name, 'failed');
                }
            }
        }
    }

    return {
        migrate,
        getCurrentVersion
    };
};
