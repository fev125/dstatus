'use strict'

/**
 * 负载统计数据管理模块
 * 负责服务器CPU、内存、带宽等负载数据的存储和统计
 */

/**
 * 填充数组到指定长度
 * @param {Array} arr - 需要填充的数组
 * @param {number} len - 目标长度
 * @returns {Array} 填充后的数组
 */
function pad(arr, len) {
    for(var i = arr.length; i < len; ++i)
        arr.unshift({cpu: 0, mem: 0, swap: 0, ibw: 0, obw: 0});
    return arr;
}

module.exports = (DB) => {
    /**
     * 生成负载统计表及其操作方法
     * @param {string} table - 表名
     * @param {number} len - 保留的记录数量
     * @returns {Object} 表操作方法集合
     */
    function gen(table, len) {
        // 检查是否需要迁移
        const needMigration = !DB.prepare(`PRAGMA table_info(${table})`).all()
            .some(col => col.name === 'id');

        if (needMigration) {
            console.log(`开始迁移表 ${table} ...`);
            // 开始事务
            DB.prepare('BEGIN').run();
            try {
                // 创建新表
                DB.prepare(`
                    CREATE TABLE IF NOT EXISTS ${table}_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sid TEXT NOT NULL,
                        cpu REAL,
                        mem REAL,
                        swap REAL,
                        ibw REAL,
                        obw REAL,
                        expire_time INTEGER,
                        created_at INTEGER DEFAULT (strftime('%s', 'now'))
                    )
                `).run();

                // 创建索引
                DB.prepare(`
                    CREATE INDEX IF NOT EXISTS idx_${table}_sid_time 
                    ON ${table}_new(sid, created_at)
                `).run();

                // 如果旧表存在，迁移数据
                const oldTableExists = DB.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name=?
                `).get(table);

                if (oldTableExists) {
                    // 复制数据
                    DB.prepare(`
                        INSERT INTO ${table}_new (
                            sid, cpu, mem, swap, ibw, obw, expire_time, created_at
                        )
                        SELECT 
                            sid, cpu, mem, swap, ibw, obw, expire_time, 
                            strftime('%s', 'now')
                        FROM ${table}
                    `).run();

                    // 删除旧表
                    DB.prepare(`DROP TABLE ${table}`).run();
                }

                // 重命名新表
                DB.prepare(`ALTER TABLE ${table}_new RENAME TO ${table}`).run();

                // 提交事务
                DB.prepare('COMMIT').run();
                console.log(`表 ${table} 迁移完成`);
            } catch (err) {
                // 发生错误时回滚
                DB.prepare('ROLLBACK').run();
                console.error(`迁移表 ${table} 失败:`, err);
                throw err;
            }
        }

        return {
            len,
            /**
             * 插入新的负载记录
             * @param {string} sid - 服务器ID
             */
            ins(sid) {
                this._ins.run({sid, cpu: 0, mem: 0, swap: 0, ibw: 0, obw: 0});
            },
            _ins: DB.prepare(`
                INSERT INTO ${table} (
                    sid, cpu, mem, swap, ibw, obw, expire_time
                ) VALUES (
                    @sid, @cpu, @mem, @swap, @ibw, @obw, 
                    strftime('%s', 'now') + 86400
                )
            `),

            /**
             * 获取服务器的负载记录
             * @param {string} sid - 服务器ID
             * @returns {Array} 负载记录数组
             */
            select(sid) {
                return pad(this._select.all(sid, this.len), this.len);
            },
            _select: DB.prepare(`
                SELECT * FROM ${table} 
                WHERE sid = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `),

            /**
             * 获取服务器的记录数量
             * @param {string} sid - 服务器ID
             * @returns {number} 记录数量
             */
            count(sid) {
                return this._count.get(sid)[`COUNT(*)`];
            },
            _count: DB.prepare(`SELECT COUNT(*) FROM ${table} WHERE sid = ?`),

            /**
             * 更新服务器的负载记录
             * @param {string} sid - 服务器ID
             * @param {Object} stats - 负载数据
             */
            shift(sid, {cpu, mem, swap, ibw, obw}) {
                try {
                    // 开始事务
                    DB.prepare('BEGIN').run();
                    
                    // 删除最老的记录，保持记录数量不超过len
                    this._del_old.run(sid, this.len - 1);
                    
                    // 插入新记录
                    this._ins.run({sid, cpu, mem, swap, ibw, obw});
                    
                    // 提交事务
                    DB.prepare('COMMIT').run();
                } catch (err) {
                    // 发生错误时回滚
                    DB.prepare('ROLLBACK').run();
                    console.error(`Error in shift operation for ${table}:`, err);
                    throw err;
                }
            },

            /**
             * 删除最老的记录
             */
            _del_old: DB.prepare(`
                DELETE FROM ${table} 
                WHERE id IN (
                    SELECT id FROM ${table}
                    WHERE sid = ?
                    ORDER BY created_at DESC
                    LIMIT -1 OFFSET ?
                )
            `),

            /**
             * 删除服务器的所有记录
             * @param {string} sid - 服务器ID
             */
            del_sid(sid) {
                DB.prepare(`DELETE FROM ${table} WHERE sid = ?`).run(sid);
            },

            /**
             * 清理过期数据
             */
            cleanup() {
                const now = Math.floor(Date.now() / 1000);
                DB.prepare(`DELETE FROM ${table} WHERE expire_time < ?`).run(now);
            }
        };
    }

    // 定期清理过期数据
    setInterval(() => {
        const load_m = gen('load_m', 60);
        const load_h = gen('load_h', 24);
        load_m.cleanup();
        load_h.cleanup();
    }, 3600000); // 每小时清理一次

    return {
        load_m: gen('load_m', 60),  // 分钟级统计，保留60条记录
        load_h: gen('load_h', 24),  // 小时级统计，保留24条记录
    };
}