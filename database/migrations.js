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
        },
        {
            version: 4,
            name: '添加美化设置支持',
            up: () => {
                try {
                    // 检查personalization设置是否已存在
                    const currentSetting = DB.prepare("SELECT val FROM setting WHERE key=?").get('personalization');

                    // 如果不存在，则创建初始化结构
                    if (!currentSetting) {
                        const defaultPersonalization = {
                            background: {
                                type: "none",
                                blur: 5,
                                url: "",
                                darken: true,
                                blur_effect: false,
                                blur_amount: 5,
                                gradient_start: "#1e3a8a",
                                gradient_end: "#312e81",
                                gradient_direction: "to bottom"
                            },
                            pages: {
                                card: true,
                                list: true,
                                admin: true
                            }
                        };

                        // 存储默认设置
                        DB.prepare("INSERT INTO setting (key, val) VALUES (?, ?)").run(
                            'personalization',
                            JSON.stringify(defaultPersonalization)
                        );

                        console.log('已创建默认美化设置');
                    } else {
                        console.log('美化设置已存在，跳过初始化');
                    }

                    return true;
                } catch (err) {
                    console.error('创建美化设置失败:', err);
                    return false;
                }
            }
        },
        {
            version: 5,
            name: '添加主题模式和自定义CSS支持',
            up: () => {
                try {
                    // 检查现有的personalization设置
                    const currentSetting = DB.prepare("SELECT val FROM setting WHERE key=?").get('personalization');

                    if (currentSetting) {
                        // 解析当前设置
                        let personalization = JSON.parse(currentSetting.val);

                        // 添加主题模式设置（如果不存在）
                        if (!personalization.theme) {
                            personalization.theme = {
                                mode: "auto", // auto, light, dark
                                forceDark: false, // 是否强制夜间模式
                                accentColor: "#3b82f6", // 主题强调色
                                // 日间模式配色
                                light: {
                                    backgroundColor: "#f8fafc",
                                    cardBackgroundColor: "#ffffff",
                                    textColor: "#1e293b",
                                    secondaryTextColor: "#64748b",
                                    borderColor: "#e2e8f0",
                                    chartColors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]
                                },
                                // 夜间模式配色
                                dark: {
                                    backgroundColor: "#0f172a",
                                    cardBackgroundColor: "#1e293b",
                                    textColor: "#f1f5f9",
                                    secondaryTextColor: "#94a3b8",
                                    borderColor: "#334155",
                                    chartColors: ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa"]
                                }
                            };
                        }

                        // 添加自定义CSS支持（如果不存在）
                        if (!personalization.customCSS) {
                            personalization.customCSS = {
                                enabled: false,
                                code: ""
                            };
                        }

                        // 更新设置
                        DB.prepare("UPDATE setting SET val = ? WHERE key = ?").run(
                            JSON.stringify(personalization),
                            'personalization'
                        );

                        console.log('已更新personalization设置，添加主题模式和自定义CSS支持');
                    }

                    return true;
                } catch (err) {
                    console.error('添加主题模式和自定义CSS支持失败:', err);
                    return false;
                }
            }
        },
        {
            version: 6,
            name: '添加SVG背景支持',
            up: () => {
                try {
                    // 检查现有的personalization设置
                    const currentSetting = DB.prepare("SELECT val FROM setting WHERE key=?").get('personalization');

                    if (currentSetting) {
                        // 解析当前设置
                        let personalization = JSON.parse(currentSetting.val);

                        // 添加SVG背景支持（如果不存在）
                        if (personalization.background && !personalization.background.svg) {
                            personalization.background.svg = {
                                enabled: false,
                                code: "",
                                colors: ["#3b82f6", "#8b5cf6", "#ec4899"],
                                opacity: 0.3
                            };

                            // 更新设置
                            DB.prepare("UPDATE setting SET val = ? WHERE key = ?").run(
                                JSON.stringify(personalization),
                                'personalization'
                            );

                            console.log('已更新personalization设置，添加SVG背景支持');
                        }
                    }

                    return true;
                } catch (err) {
                    console.error('添加SVG背景支持失败:', err);
                    return false;
                }
            }
        },
        {
            version: 7,
            name: '简化个性化设置',
            up: () => {
                try {
                    // 获取当前设置
                    const currentSetting = DB.prepare("SELECT val FROM setting WHERE key=?").get('personalization');

                    if (currentSetting) {
                        // 解析当前设置
                        let personalization = JSON.parse(currentSetting.val);

                        // 只保留壁纸设置
                        const simplifiedSettings = {
                            wallpaper: {
                                enabled: personalization.wallpaper?.enabled || false,
                                url: personalization.wallpaper?.url || "",
                                brightness: personalization.wallpaper?.brightness || 75,
                                fixed: personalization.wallpaper?.fixed || false
                            }
                        };

                        // 更新设置
                        DB.prepare("UPDATE setting SET val = ? WHERE key = ?").run(
                            JSON.stringify(simplifiedSettings),
                            'personalization'
                        );

                        console.log('已简化个性化设置');
                    }

                    return true;
                } catch (err) {
                    console.error('简化个性化设置失败:', err);
                    return false;
                }
            }
        },
        // 位置数据结构迁移
        {
            version: 8,
            name: '统一位置数据结构',
            up: () => {
                try {
                    // 获取所有服务器
                    const servers = DB.prepare("SELECT sid, data FROM servers").all();
                    let migratedCount = 0;

                    // 遍历所有服务器
                    for (const server of servers) {
                        try {
                            // 解析服务器数据
                            const serverData = typeof server.data === 'object' ? server.data : JSON.parse(server.data);

                            // 检查是否有位置信息
                            if (serverData.location) {
                                // 检查是否有旧的数据结构
                                if (serverData.location.country && serverData.location.country.code && !serverData.location.code) {
                                    // 创建新的数据结构
                                    const newLocation = {
                                        code: serverData.location.country.code,
                                        flag: serverData.location.country.flag,
                                        country_name: serverData.location.country.name,
                                        name_zh: serverData.location.country.name_zh,
                                        auto_detect: serverData.location.country.auto_detect || true,
                                        manual: serverData.location.country.manual || false,
                                        updated_at: serverData.location.updated_at || Date.now()
                                    };

                                    // 更新数据
                                    serverData.location = newLocation;
                                    DB.prepare("UPDATE servers SET data = ? WHERE sid = ?").run(
                                        JSON.stringify(serverData),
                                        server.sid
                                    );
                                    migratedCount++;
                                }
                            }
                        } catch (error) {
                            console.error(`处理服务器 ${server.sid} 时出错:`, error);
                            // 单个服务器处理失败不应该影响整个迁移
                        }
                    }

                    console.log(`位置数据结构迁移完成: 已迁移 ${migratedCount} 条记录`);
                    return true;
                } catch (err) {
                    console.error('位置数据结构迁移失败:', err);
                    return false;
                }
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
