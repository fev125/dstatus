"use strict";

/**
 * 自动发现模块数据库操作
 * 提供自动发现相关的数据库操作函数
 */
module.exports = (DB) => {
    // 创建自动发现表
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS autodiscovery_servers (
            id TEXT PRIMARY KEY,
            hostname TEXT NOT NULL,
            ip TEXT NOT NULL,
            system TEXT,
            version TEXT,
            device TEXT,
            api_key TEXT NOT NULL,
            status TEXT DEFAULT 'pending', -- pending, approved, rejected
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `).run();

    // 输出调试信息
    try {
        const tableInfo = DB.prepare("PRAGMA table_info(autodiscovery_servers)").all();
        console.log('[数据库] 自动发现服务器表结构:', tableInfo);
    } catch (error) {
        console.error('[数据库] 获取表结构失败:', error);
    }

    // 自动发现模块数据库操作
    const autodiscovery = {
        // 添加新的服务器记录
        async addServer(server) {
            try {
                const { id, hostname, ip, system, version, device, api_key } = server;
                const stmt = DB.prepare(`
                    INSERT INTO autodiscovery_servers 
                    (id, hostname, ip, system, version, device, api_key) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                stmt.run(id, hostname, ip, system, version, device, api_key);
                return true;
            } catch (error) {
                console.error('[自动发现] 添加服务器记录失败:', error);
                return false;
            }
        },

        // 查找待审核的服务器
        async findPendingServers() {
            try {
                const stmt = DB.prepare(`
                    SELECT * FROM autodiscovery_servers 
                    WHERE status = 'pending'
                    ORDER BY created_at DESC
                `);
                return stmt.all();
            } catch (error) {
                console.error('[自动发现] 查询待审核服务器失败:', error);
                return [];
            }
        },

        // 查找已发现的服务器（已批准的）
        async findDiscoveredServers() {
            try {
                const stmt = DB.prepare(`
                    SELECT * FROM autodiscovery_servers 
                    WHERE status = 'approved'
                    ORDER BY hostname ASC
                `);
                return stmt.all();
            } catch (error) {
                console.error('[自动发现] 查询已发现服务器失败:', error);
                return [];
            }
        },

        // 获取服务器详情
        async getServerById(id) {
            try {
                const stmt = DB.prepare(`
                    SELECT * FROM autodiscovery_servers 
                    WHERE id = ?
                `);
                return stmt.get(id);
            } catch (error) {
                console.error('[自动发现] 获取服务器详情失败:', error);
                return null;
            }
        },

        // 更新服务器状态
        async updateServerStatus(id, status) {
            try {
                const stmt = DB.prepare(`
                    UPDATE autodiscovery_servers 
                    SET status = ?, updated_at = strftime('%s', 'now')
                    WHERE id = ?
                `);
                stmt.run(status, id);
                return true;
            } catch (error) {
                console.error('[自动发现] 更新服务器状态失败:', error);
                return false;
            }
        },

        // 删除服务器记录
        async deleteServer(id) {
            try {
                const stmt = DB.prepare(`
                    DELETE FROM autodiscovery_servers 
                    WHERE id = ?
                `);
                stmt.run(id);
                return true;
            } catch (error) {
                console.error('[自动发现] 删除服务器记录失败:', error);
                return false;
            }
        },

        // 根据ID查找待审核服务器
        async findPendingServerById(id) {
            try {
                console.log(`[自动发现] 查询待审核服务器: ${id}`);
                const stmt = DB.prepare(`
                    SELECT * FROM autodiscovery_servers 
                    WHERE id = ? AND status = 'pending'
                `);
                return stmt.get(id);
            } catch (error) {
                console.error(`[自动发现] 查询待审核服务器失败: ${id}`, error);
                return null;
            }
        },

        // 根据ID查找已发现服务器
        async findDiscoveredServerById(id) {
            try {
                console.log(`[自动发现] 查询已发现服务器: ${id}`);
                const stmt = DB.prepare(`
                    SELECT * FROM autodiscovery_servers 
                    WHERE id = ? AND status = 'approved'
                `);
                return stmt.get(id);
            } catch (error) {
                console.error(`[自动发现] 查询已发现服务器失败: ${id}`, error);
                return null;
            }
        },

        /**
         * 批准服务器
         * @description 将待审核服务器批准并添加到servers表
         * @param {string} id - 服务器ID
         * @returns {Promise<object>} - 操作结果，包含成功状态和服务器ID
         */
        async approveServer(id) {
            try {
                console.log(`[自动发现] 批准服务器: ${id}`);
                
                // 查询待审核服务器
                const server = await this.findPendingServerById(id);
                if (!server) {
                    console.error(`[自动发现] 批准服务器失败: 服务器不存在 ${id}`);
                    return { success: false, message: '服务器不存在' };
                }
                
                // 创建服务器数据对象
                const serverData = {
                    ssh: {
                        host: server.ip,
                        port: 22,
                        username: "root"
                    },
                    api: {
                        mode: true, // 主动模式
                        key: server.api_key,
                        port: 9999
                    },
                    device: server.device || "eth0",
                    system: server.system || "Unknown",
                    version: server.version || "Unknown",
                    autodiscovered: true, // 标记为自动发现的服务器
                    discoveryTime: new Date(server.created_at * 1000).toISOString(),
                    approved: true // 已批准
                };
                
                // 获取系统配置
                const allSettings = DB.prepare("SELECT val FROM setting WHERE key = 'autodiscovery'").get();
                const autodiscoverySetting = allSettings ? JSON.parse(allSettings.val) : { defaultGroup: "default" };
                
                // 添加到服务器表
                const stmtIns = DB.prepare(`
                    INSERT INTO servers 
                    (sid, name, data, top, status, expire_time, group_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                stmtIns.run(
                    server.id,
                    server.hostname,
                    JSON.stringify(serverData),
                    0, // top
                    1, // status
                    null, // expire_time
                    autodiscoverySetting.defaultGroup || "default" // group_id
                );
                
                // 更新autodiscovery_servers表中的状态
                await this.updateServerStatus(id, 'approved');
                
                console.log(`[自动发现] 服务器已批准: ${server.hostname} (${server.ip}), SID: ${id}`);
                return { success: true, serverId: id, ip: server.ip, hostname: server.hostname };
            } catch (error) {
                console.error(`[自动发现] 批准服务器失败: ${id}`, error);
                return { success: false, message: error.message };
            }
        },

        /**
         * 拒绝服务器
         * @description 拒绝待审核服务器
         * @param {string} id - 服务器ID
         * @returns {Promise<boolean>} - 是否成功
         */
        async rejectServer(id) {
            try {
                console.log(`[自动发现] 拒绝服务器: ${id}`);
                
                // 查询待审核服务器
                const server = await this.findPendingServerById(id);
                if (!server) {
                    console.error(`[自动发现] 拒绝服务器失败: 服务器不存在 ${id}`);
                    return false;
                }
                
                // 从autodiscovery_servers表中删除服务器
                await this.deleteServer(id);
                
                console.log(`[自动发现] 服务器已拒绝并从数据库中删除: ${server.hostname} (${server.ip}), SID: ${id}`);
                return true;
            } catch (error) {
                console.error(`[自动发现] 拒绝服务器失败: ${id}`, error);
                return false;
            }
        },

        /**
         * 检查服务器在线状态
         * @description 直接通过API检查服务器状态，不依赖于stats模块
         * @param {object} server - 服务器对象
         * @returns {Promise<object>} - 服务器状态对象
         */
        async checkServerStatus(server) {
            if (!server || !server.ip) {
                console.error('[自动发现] 检查服务器状态失败: 无效的服务器数据');
                return { offline: true };
            }
            
            try {
                // 尝试通过API检查服务器状态
                const apiPort = 9999; // 默认API端口
                const apiKey = server.api_key || ''; // API密钥
                
                console.log(`[自动发现] 正在检查服务器状态: ${server.hostname || server.ip} (${server.ip}:${apiPort})`);
                
                // 使用node-fetch或内置的fetch API
                const fetch = require('node-fetch');
                const response = await fetch(`http://${server.ip}:${apiPort}/stat`, {
                    method: 'GET',
                    headers: { key: apiKey },
                    timeout: 5000, // 5秒超时
                });
                
                if (!response.ok) {
                    console.log(`[自动发现] 服务器响应错误: ${server.ip}:${apiPort}, 状态码: ${response.status}`);
                    return { offline: true };
                }
                
                const data = await response.json();
                
                if (data.success && data.data) {
                    console.log(`[自动发现] 服务器在线: ${server.hostname || server.ip} (${server.ip}:${apiPort})`);
                    return data.data; // 返回服务器状态数据
                } else {
                    console.log(`[自动发现] 服务器离线或返回无效数据: ${server.ip}:${apiPort}`);
                    return { offline: true };
                }
            } catch (error) {
                console.log(`[自动发现] 检查服务器状态出错: ${server.ip}, 错误: ${error.message}`);
                return { offline: true };
            }
        }
    };

    return autodiscovery;
};
