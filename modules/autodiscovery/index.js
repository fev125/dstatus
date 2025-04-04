/**
 * 服务器自动发现模块
 * 提供服务器自动注册和发现功能
 */

const crypto = require('crypto');
const schedule = require('node-schedule');
// 修正：不需要引入数据库，因为它已经在主程序中全局可用

module.exports = function(svr, db) {
    // 创建一个闭包内变量，确保模块内所有函数都能访问数据库对象
    // 如果 db 未定义，则使用 svr.locals.db
    const database = db || svr.locals.db;

    // 初始化自动发现模块
    console.log('[自动发现] 模块已加载');

    // 声明定时任务变量
    let summarySchedule = null;

    // 添加拦截器函数
    const interceptor = {
        /**
         * 检查IP是否已注册，如未注册则添加到自动发现队列
         * @param {object} req - 请求对象
         * @param {object} data - 状态上报数据
         * @returns {Promise<boolean>} - 是否为新发现的服务器
         */
        async checkAndRegisterIP(req, data) {
            try {
                // 获取请求的IP地址
                const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

                // 检查系统设置是否启用自动发现
                const allSettings = database.setting.all();
                const autodiscoverySetting = allSettings.autodiscovery;
                if (!autodiscoverySetting || !autodiscoverySetting.enabled) {
                    return false;
                }

                // 检查此IP是否已在系统中注册
                const allServers = database.servers.all();
                const existingServer = allServers.find(server =>
                    server.data && server.data.ssh && server.data.ssh.host === clientIP
                );
                if (existingServer) {
                    return false;
                }

                console.log(`[自动发现] 检测到新服务器: ${clientIP}`);

                // 生成唯一的服务器ID和API密钥
                const sid = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
                const apiKey = crypto.randomBytes(16).toString('hex');

                // 检查是否需要审核
                const needApproval = autodiscoverySetting.requireApproval !== false;

                // 从上报数据中提取有用信息
                const hostname = data.hostname || `Server-${sid.substring(0, 8)}`;
                const system = data.system || "Unknown";
                const version = data.version || "Unknown";

                // 创建服务器数据对象
                const serverData = {
                        ssh: {
                            host: clientIP,
                            port: 22,
                            username: "root"
                        },
                        api: {
                            mode: true, // 主动模式
                            key: apiKey,
                            port: 9999
                        },
                        device: data.device || "eth0",
                        system: system,
                        version: version,
                        autodiscovered: true, // 标记为自动发现的服务器
                        discoveryTime: new Date().toISOString(),
                        approved: !needApproval // 如果不需要审核，则自动批准
                };

                // 添加到数据库
                if (needApproval) {
                    // 添加到待审核队列
                    await database.autodiscovery.addServer({
                        id: sid,
                        hostname: hostname,
                        ip: clientIP,
                        system: system,
                        version: version,
                        device: data.device || "eth0",
                        api_key: apiKey,
                        status: 'pending'
                    });

                    // 发送新服务器发现通知
                    try {
                        if (svr.locals.notification) {
                            const telegramSetting = database.setting.get('telegram');
                            if (telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0 &&
                                telegramSetting?.notificationTypes?.newServerDiscovered) {

                                const notificationMessage = `
#新服务器注册
主机名: ${hostname}
IP地址: ${clientIP}
系统: ${system}
版本: ${version}
状态: 待审核
注册时间: ${new Date().toLocaleString()}
                                `;

                                await svr.locals.notification.sendNotification(
                                    '新服务器发现',
                                    notificationMessage,
                                    telegramSetting.chatIds
                                );

                                console.log(`[自动发现] 已发送新服务器注册通知: ${hostname} (${clientIP})`);
                            }
                        }
                    } catch (error) {
                        console.error('[自动发现] 发送新服务器注册通知失败:', error);
                    }

                    console.log(`[自动发现] 新服务器已添加到待审核队列: ${hostname} (${clientIP}), SID: ${sid}`);
                } else {
                    // 直接添加到服务器列表
                    database.servers.ins(
                        sid,
                        hostname,
                        serverData,
                        0, // top
                        1, // status
                        null, // expire_time
                        autodiscoverySetting.defaultGroup || "default" // group_id
                    );

                    // 获取IP国家信息
                    if (svr.locals.stats && svr.locals.stats.ipLocationService) {
                        try {
                            console.log(`[自动发现] 自动注册服务器后，正在获取IP位置信息: ${hostname} (${clientIP})`);

                            // 获取服务器完整信息
                            const registeredServer = database.servers.get(sid);

                            if (registeredServer) {
                                // 调用IP位置服务更新位置信息
                                await svr.locals.stats.ipLocationService.updateServerLocation(registeredServer, database);

                                console.log(`[自动发现] 服务器IP位置信息获取完成: ${hostname} (${clientIP})`);
                            } else {
                                console.error(`[自动发现] 无法获取注册后的服务器信息: ${sid}`);
                            }
                        } catch (locationError) {
                            console.error(`[自动发现] 获取服务器IP位置信息失败: ${hostname} (${clientIP})`, locationError);
                            // 获取位置信息失败不影响服务器注册
                        }
                    }

                    // 发送新服务器发现通知
                    try {
                        if (svr.locals.notification) {
                            const telegramSetting = database.setting.get('telegram');
                            if (telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0 &&
                                telegramSetting?.notificationTypes?.newServerDiscovered) {

                                // 获取分组信息
                                const group = database.groups.get(autodiscoverySetting.defaultGroup || "default");
                                const groupName = group ? group.name : "默认分组";

                                const notificationMessage = `
#新服务器注册
主机名: ${hostname}
IP地址: ${clientIP}
系统: ${system}
版本: ${version}
分组: ${groupName}
状态: 已自动添加
注册时间: ${new Date().toLocaleString()}
                                `;

                                await svr.locals.notification.sendNotification(
                                    '新服务器发现',
                                    notificationMessage,
                                    telegramSetting.chatIds
                                );

                                console.log(`[自动发现] 已发送新服务器注册通知: ${hostname} (${clientIP})`);
                            }
                        }
                    } catch (error) {
                        console.error('[自动发现] 发送新服务器注册通知失败:', error);
                    }

                    console.log(`[自动发现] 新服务器已自动添加: ${hostname} (${clientIP}), SID: ${sid}`);
                }

                return true;
            } catch (error) {
                console.error('[自动发现] 处理新服务器时出错:', error);
                return false;
            }
        }
    };
    // 获取本地变量
    const { pr } = svr.locals;

    // 检查服务器状态
    async function checkServerStatus(server) {
        if (!server || !server.ip) {
            console.error('[自动发现] 检查服务器状态失败: 无效的服务器数据');
            return { offline: true };
        }

        try {
            // 尝试通过API检查服务器状态
            const apiPort = server.api_port || 9999; // 默认API端口
            const apiKey = server.api_key || ''; // API密钥

            console.log(`[自动发现] 正在检查服务器状态: ${server.hostname || server.ip} (${server.ip}:${apiPort})`);

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

    // 自动发现页面
    svr.get('/admin/autodiscovery', (req, res) => {
        if (!req.admin) return res.redirect('/login');

        // 获取所有分组
        const groups = database.groups.all();

        // 获取设置
        const setting = database.setting.all();

        // 渲染页面
        res.render('admin/autodiscovery', {
            setting,
            groups // 传递分组数据
        });
    });

    // 修改获取待审核服务器列表的API端点，添加直接检查状态的逻辑
    svr.get('/admin/autodiscovery/pending', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            console.log('[自动发现] 获取待审核服务器列表');
            const pendingServers = await database.autodiscovery.findPendingServers();

            // 转换数据格式，确保与前端期望的格式一致
            const formattedServers = await Promise.all(pendingServers.map(async server => {
                // 检查服务器是否在线
                let serverStat = null;

                // 首先尝试从stats中获取状态
                const serverInStats = svr.locals.stats && svr.locals.stats.getStatsData
                    ? svr.locals.stats.getStatsData(true)[server.id]
                    : null;

                if (serverInStats && serverInStats.stat) {
                    serverStat = serverInStats.stat;
                } else {
                    // 如果在stats中找不到，直接检查服务器状态
                    serverStat = await database.autodiscovery.checkServerStatus(server);
                }

                return {
                    _id: server.id,
                    id: server.id,
                    name: server.hostname,
                    hostname: server.hostname,
                    ip: server.ip,
                    system: server.system,
                    version: server.version,
                    device: server.device,
                    stat: serverStat, // 添加stat属性，与card.html保持一致
                    data: {
                        ssh: { host: server.ip },
                        system: server.system,
                        version: server.version,
                        device: server.device,
                        discoveryTime: new Date(server.created_at * 1000).toISOString(),
                        api: { key: server.api_key }
                    }
                };
            }));

            return res.json({ success: true, message: '获取成功', data: formattedServers || [] });
        } catch (error) {
            console.error('[自动发现] 获取待审核服务器列表失败:', error);
            return res.status(500).json({ success: false, message: '获取待审核服务器列表失败: ' + error.message });
        }
    });

    // 修改获取已发现服务器列表的API端点，添加直接检查状态的逻辑
    svr.get('/admin/autodiscovery/discovered', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            console.log('[自动发现] 获取已发现服务器列表');
            const discoveredServers = await database.autodiscovery.findDiscoveredServers();

            // 转换数据格式，确保与前端期望的格式一致
            const formattedServers = await Promise.all(discoveredServers.map(async server => {
                // 检查服务器是否在线
                let serverStat = null;

                // 首先尝试从stats中获取状态
                const serverInStats = svr.locals.stats && svr.locals.stats.getStatsData
                    ? svr.locals.stats.getStatsData(true)[server.id]
                    : null;

                if (serverInStats && serverInStats.stat) {
                    serverStat = serverInStats.stat;
                } else {
                    // 如果在stats中找不到，直接检查服务器状态
                    serverStat = await database.autodiscovery.checkServerStatus(server);
                }

                return {
                    _id: server.id,
                    id: server.id,
                    name: server.hostname,
                    hostname: server.hostname,
                    ip: server.ip,
                    system: server.system,
                    version: server.version,
                    device: server.device,
                    stat: serverStat, // 添加stat属性，与card.html保持一致
                    data: {
                        ssh: { host: server.ip },
                        system: server.system,
                        version: server.version,
                        device: server.device,
                        discoveryTime: new Date(server.created_at * 1000).toISOString(),
                        api: { key: server.api_key }
                    }
                };
            }));

            return res.json({ success: true, message: '获取成功', data: formattedServers || [] });
        } catch (error) {
            console.error('[自动发现] 获取已发现服务器列表失败:', error);
            return res.status(500).json({ success: false, message: '获取已发现服务器列表失败: ' + error.message });
        }
    });

    // 修改获取单个待审核服务器详情的API端点，添加直接检查状态的逻辑
    svr.get('/admin/autodiscovery/pending/:id', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            const serverId = req.params.id;
            console.log(`[自动发现] 获取待审核服务器详情: ${serverId}`);

            const server = await database.autodiscovery.findPendingServerById(serverId);
            if (!server) {
                return res.status(404).json({ success: false, message: '服务器不存在' });
            }

            // 检查服务器是否在线
            let serverStat = null;

            // 首先尝试从stats中获取状态
            const serverInStats = svr.locals.stats && svr.locals.stats.getStatsData
                ? svr.locals.stats.getStatsData(true)[serverId]
                : null;

            if (serverInStats && serverInStats.stat) {
                serverStat = serverInStats.stat;
            } else {
                // 如果在stats中找不到，直接检查服务器状态
                serverStat = await database.autodiscovery.checkServerStatus(server);
            }

            // 转换数据格式，确保与前端期望的格式一致
            const formattedServer = {
                _id: server.id,
                id: server.id,
                name: server.hostname,
                hostname: server.hostname,
                ip: server.ip,
                system: server.system,
                version: server.version,
                device: server.device,
                stat: serverStat, // 添加stat属性，与card.html保持一致
                data: {
                    ssh: { host: server.ip },
                    system: server.system,
                    version: server.version,
                    device: server.device,
                    discoveryTime: new Date(server.created_at * 1000).toISOString(),
                    api: { key: server.api_key }
                }
            };

            return res.json({ success: true, message: '获取成功', data: formattedServer });
        } catch (error) {
            console.error('[自动发现] 获取待审核服务器详情失败:', error);
            return res.status(500).json({ success: false, message: '获取待审核服务器详情失败: ' + error.message });
        }
    });

    // 修改获取单个已发现服务器详情的API端点，添加直接检查状态的逻辑
    svr.get('/admin/autodiscovery/server/:id', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            const serverId = req.params.id;
            console.log(`[自动发现] 获取已发现服务器详情: ${serverId}`);

            const server = await database.autodiscovery.findDiscoveredServerById(serverId);
            if (!server) {
                return res.status(404).json({ success: false, message: '服务器不存在' });
            }

            // 检查服务器是否在线
            let serverStat = null;

            // 首先尝试从stats中获取状态
            const serverInStats = svr.locals.stats && svr.locals.stats.getStatsData
                ? svr.locals.stats.getStatsData(true)[serverId]
                : null;

            if (serverInStats && serverInStats.stat) {
                serverStat = serverInStats.stat;
            } else {
                // 如果在stats中找不到，直接检查服务器状态
                serverStat = await database.autodiscovery.checkServerStatus(server);
            }

            // 转换数据格式，确保与前端期望的格式一致
            const formattedServer = {
                _id: server.id,
                id: server.id,
                name: server.hostname,
                hostname: server.hostname,
                ip: server.ip,
                system: server.system,
                version: server.version,
                device: server.device,
                stat: serverStat, // 添加stat属性，与card.html保持一致
                data: {
                    ssh: { host: server.ip },
                    system: server.system,
                    version: server.version,
                    device: server.device,
                    discoveryTime: new Date(server.created_at * 1000).toISOString(),
                    api: { key: server.api_key }
                }
            };

            return res.json({ success: true, message: '获取成功', data: formattedServer });
        } catch (error) {
            console.error('[自动发现] 获取已发现服务器详情失败:', error);
            return res.status(500).json({ success: false, message: '获取已发现服务器详情失败: ' + error.message });
        }
    });

    // 批准服务器
    svr.post("/admin/autodiscovery/approve/:id", async (req, res) => {
        try {
            const { id } = req.params;
            const { group_id } = req.body; // 从请求体中获取分组ID

            // 获取服务器信息用于通知
            const server = await database.autodiscovery.findPendingServerById(id);
            if (!server) {
                return res.json({ success: false, message: "服务器不存在" });
            }

            // 批准服务器，传递分组ID
            const approveResult = await database.autodiscovery.approveServer(id, group_id);

            if (!approveResult.success) {
                return res.json({ success: false, message: approveResult.message || "批准失败" });
            }

            // 获取IP国家信息
            if (svr.locals.stats && svr.locals.stats.ipLocationService) {
                try {
                    console.log(`[自动发现] 批准服务器后，正在获取IP位置信息: ${server.hostname} (${server.ip})`);

                    // 获取服务器完整信息
                    const approvedServer = database.servers.get(id);

                    if (approvedServer) {
                        // 调用IP位置服务更新位置信息
                        await svr.locals.stats.ipLocationService.updateServerLocation(approvedServer, database);

                        console.log(`[自动发现] 服务器IP位置信息获取完成: ${server.hostname} (${server.ip})`);
                    } else {
                        console.error(`[自动发现] 无法获取批准后的服务器信息: ${id}`);
                    }
                } catch (locationError) {
                    console.error(`[自动发现] 获取服务器IP位置信息失败: ${server.hostname} (${server.ip})`, locationError);
                    // 获取位置信息失败不影响服务器批准
                }
            }

            // 发送通知
            try {
                if (svr.locals.notification) {
                    const telegramSetting = database.setting.get('telegram');
                    if (telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0 &&
                        telegramSetting?.notificationTypes?.serverApproved) {

                        // 获取分组信息
                        // 使用请求体中的分组ID，如果没有则使用默认分组
                        const allSettings = database.setting.get('autodiscovery');
                        const groupId = req.body.group_id || allSettings?.defaultGroup || "default";
                        const group = database.groups.get(groupId);
                        const groupName = group ? group.name : "默认分组";

                        const notificationMessage = `
#服务器批准
主机名: ${server.hostname}
IP地址: ${server.ip}
系统: ${server.system || "Unknown"}
版本: ${server.version || "Unknown"}
分组: ${groupName}
批准时间: ${new Date().toLocaleString()}
                        `;

                        await svr.locals.notification.sendNotification(
                            '服务器批准',
                            notificationMessage,
                            telegramSetting.chatIds
                        );

                        console.log(`[自动发现] 已发送服务器批准通知: ${server.hostname} (${server.ip})`);
                    }
                }
            } catch (error) {
                console.error('[自动发现] 发送服务器批准通知失败:', error);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('[自动发现] 批准服务器失败:', error);
            res.json({ success: false, message: error.message });
        }
    });

    // 拒绝服务器
    svr.post('/admin/autodiscovery/reject/:id', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            const serverId = req.params.id;
            console.log(`[自动发现] 拒绝服务器: ${serverId}`);

            const result = await database.autodiscovery.rejectServer(serverId);
            if (!result) {
                return res.status(404).json({ success: false, message: '服务器不存在或拒绝失败' });
            }

            return res.json({ success: true, message: '服务器已拒绝' });
        } catch (error) {
            console.error('[自动发现] 拒绝服务器失败:', error);
            return res.status(500).json({ success: false, message: '拒绝服务器失败: ' + error.message });
        }
    });

    /**
     * 清空离线的待审核节点
     * @description 删除所有离线的待审核服务器
     * @route POST /admin/autodiscovery/clear-offline
     * @returns {object} 操作结果
     */
    svr.post('/admin/autodiscovery/clear-offline', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            console.log('[自动发现] 开始清空离线的待审核节点');

            // 获取所有待审核服务器
            const pendingServers = await database.autodiscovery.findPendingServers();
            if (!pendingServers || pendingServers.length === 0) {
                return res.json({ success: true, message: '没有待审核的服务器', count: 0 });
            }

            // 检查每个服务器的在线状态并删除离线的服务器
            let deletedCount = 0;
            for (const server of pendingServers) {
                // 检查服务器状态
                const status = await database.autodiscovery.checkServerStatus(server);

                // 如果服务器离线，则删除
                if (status.offline) {
                    await database.autodiscovery.deleteServer(server.id);
                    console.log(`[自动发现] 已删除离线的待审核服务器: ${server.hostname} (${server.ip})`);
                    deletedCount++;
                }
            }

            return res.json({
                success: true,
                message: `已清空 ${deletedCount} 个离线的待审核节点`,
                count: deletedCount
            });
        } catch (error) {
            console.error('[自动发现] 清空离线的待审核节点失败:', error);
            return res.status(500).json({ success: false, message: '清空离线的待审核节点失败: ' + error.message });
        }
    });

    /**
     * 清空所有待审核节点
     * @description 删除所有待审核服务器
     * @route POST /admin/autodiscovery/clear-all-pending
     * @returns {object} 操作结果
     */
    svr.post('/admin/autodiscovery/clear-all-pending', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            console.log('[自动发现] 开始清空所有待审核节点');

            // 获取所有待审核服务器
            const pendingServers = await database.autodiscovery.findPendingServers();
            if (!pendingServers || pendingServers.length === 0) {
                return res.json({ success: true, message: '没有待审核的服务器', count: 0 });
            }

            // 删除所有待审核服务器
            let deletedCount = 0;
            for (const server of pendingServers) {
                await database.autodiscovery.deleteServer(server.id);
                console.log(`[自动发现] 已删除待审核服务器: ${server.hostname} (${server.ip})`);
                deletedCount++;
            }

            return res.json({
                success: true,
                message: `已清空 ${deletedCount} 个待审核节点`,
                count: deletedCount
            });
        } catch (error) {
            console.error('[自动发现] 清空所有待审核节点失败:', error);
            return res.status(500).json({ success: false, message: '清空所有待审核节点失败: ' + error.message });
        }
    });

    /**
     * 清空离线的已发现节点
     * @description 删除所有离线的已发现服务器
     * @route POST /admin/autodiscovery/clear-offline-discovered
     * @returns {object} 操作结果
     */
    svr.post('/admin/autodiscovery/clear-offline-discovered', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            console.log('[自动发现] 开始清空离线的已发现节点');

            // 获取所有已发现服务器
            const discoveredServers = await database.autodiscovery.findDiscoveredServers();
            if (!discoveredServers || discoveredServers.length === 0) {
                return res.json({ success: true, message: '没有已发现的服务器', count: 0 });
            }

            // 检查每个服务器的在线状态并删除离线的服务器
            let deletedCount = 0;
            for (const server of discoveredServers) {
                // 检查服务器状态
                const status = await database.autodiscovery.checkServerStatus(server);

                // 如果服务器离线，则删除
                if (status.offline) {
                    await database.autodiscovery.deleteServer(server.id);
                    console.log(`[自动发现] 已删除离线的已发现服务器: ${server.hostname} (${server.ip})`);
                    deletedCount++;
                }
            }

            return res.json({
                success: true,
                message: `已清空 ${deletedCount} 个离线的已发现节点`,
                count: deletedCount
            });
        } catch (error) {
            console.error('[自动发现] 清空离线的已发现节点失败:', error);
            return res.status(500).json({ success: false, message: '清空离线的已发现节点失败: ' + error.message });
        }
    });

    /**
     * 删除已发现服务器
     * @description 从系统中删除已发现的服务器
     * @route POST /admin/autodiscovery/delete/:id
     * @param {string} id - 服务器ID
     * @returns {object} 操作结果
     */
    svr.post('/admin/autodiscovery/delete/:id', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            const serverId = req.params.id;
            console.log(`[自动发现] 删除已发现服务器: ${serverId}`);

            // 先检查服务器是否存在
            const server = await database.autodiscovery.findDiscoveredServerById(serverId);
            if (!server) {
                return res.status(404).json({ success: false, message: '服务器不存在' });
            }

            // 删除服务器
            const result = await database.autodiscovery.deleteServer(serverId);
            if (!result) {
                return res.status(500).json({ success: false, message: '删除服务器失败' });
            }

            console.log(`[自动发现] 服务器已删除: ${server.hostname} (${server.ip}), SID: ${serverId}`);
            return res.json({ success: true, message: '服务器已删除' });
        } catch (error) {
            console.error('[自动发现] 删除服务器失败:', error);
            return res.status(500).json({ success: false, message: '删除服务器失败: ' + error.message });
        }
    });

    // 服务器自动注册接口
    svr.post("/autodiscovery/register", async (req, res) => {
        try {
            // 获取客户端提交的基本信息
            const {hostname, ip, system, version, device, registrationKey} = req.body;

            // 获取系统配置 - 修正方法调用
            const allSettings = database.setting.all();
            const autodiscoverySetting = allSettings.autodiscovery;

            // 检查是否启用了自动发现功能
            if (!autodiscoverySetting || !autodiscoverySetting.enabled) {
                return res.json({success: false, message: "自动发现功能未启用"});
            }

            // 验证注册密钥
            if (autodiscoverySetting.requireKey &&
                registrationKey !== autodiscoverySetting.registrationKey) {
                return res.json({success: false, message: "注册密钥无效"});
            }

            // 生成唯一的服务器ID和API密钥
            const sid = crypto.randomUUID();
            const apiKey = crypto.randomBytes(16).toString('hex');

            // 检查是否需要审核
            const needApproval = autodiscoverySetting.requireApproval || false;

            // 创建服务器数据对象
            const serverData = {
                    ssh: {
                        host: ip,
                        port: 22,
                        username: "root"
                    },
                    api: {
                        mode: true, // 主动模式
                        key: apiKey,
                        port: 9999
                    },
                    device: device || "eth0",
                    system: system || "Unknown",
                    version: version || "Unknown",
                    autodiscovered: true, // 标记为自动发现的服务器
                    discoveryTime: new Date().toISOString(),
                    approved: !needApproval // 如果不需要审核，则自动批准
            };

            // 服务器名称
            const name = hostname || `Server-${sid.substring(0, 8)}`;

            // 分组ID
            const groupId = autodiscoverySetting.defaultGroup || "default";

            /**
             * 修改部分开始：根据是否需要审核决定将服务器添加到哪个表
             * @description 修改说明：
             * 1. 修改原因：原代码无论是否需要审核都将服务器添加到servers表，导致需要审核的服务器不会出现在待审核列表中
             * 2. 修改内容：如果需要审核，将服务器添加到autodiscovery_servers表；如果不需要审核，直接添加到servers表
             * 3. 可能影响：使注册接口的逻辑与拦截器保持一致，确保需要审核的服务器正确地出现在待审核列表中
             * @modified 2023-11-15
             */

            // 添加到数据库
            if (needApproval) {
                // 添加到待审核队列
                await database.autodiscovery.addServer({
                    id: sid,
                    hostname: name,
                    ip: ip,
                    system: system || "Unknown",
                    version: version || "Unknown",
                    device: device || "eth0",
                    api_key: apiKey,
                    status: 'pending'
                });

                // 发送新服务器发现通知
                try {
                    if (svr.locals.notification) {
                        const telegramSetting = database.setting.get('telegram');
                        if (telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0 &&
                            telegramSetting?.notificationTypes?.newServerDiscovered) {

                            const notificationMessage = `
#新服务器注册
主机名: ${name}
IP地址: ${ip}
系统: ${system || "Unknown"}
版本: ${version || "Unknown"}
状态: 待审核
注册时间: ${new Date().toLocaleString()}
                            `;

                            await svr.locals.notification.sendNotification(
                                '新服务器发现',
                                notificationMessage,
                                telegramSetting.chatIds
                            );

                            console.log(`[自动发现] 已发送新服务器注册通知: ${name} (${ip})`);
                        }
                    }
                } catch (error) {
                    console.error('[自动发现] 发送新服务器注册通知失败:', error);
                }

                console.log(`[自动发现] 新服务器已添加到待审核队列: ${name} (${ip}), SID: ${sid}`);
            } else {
                // 直接添加到服务器列表
                database.servers.ins(
                    sid,           // 服务器ID
                    name,          // 服务器名称
                    serverData,    // 服务器数据
                    0,             // 排序权重
                    1,             // 状态（1:启用）
                    null,          // 过期时间
                    groupId        // 分组ID
                );

                // 获取IP国家信息
                if (svr.locals.stats && svr.locals.stats.ipLocationService) {
                    try {
                        console.log(`[自动发现] 自动注册服务器后，正在获取IP位置信息: ${name} (${ip})`);

                        // 获取服务器完整信息
                        const registeredServer = database.servers.get(sid);

                        if (registeredServer) {
                            // 调用IP位置服务更新位置信息
                            await svr.locals.stats.ipLocationService.updateServerLocation(registeredServer, database);

                            console.log(`[自动发现] 服务器IP位置信息获取完成: ${name} (${ip})`);
                        } else {
                            console.error(`[自动发现] 无法获取注册后的服务器信息: ${sid}`);
                        }
                    } catch (locationError) {
                        console.error(`[自动发现] 获取服务器IP位置信息失败: ${name} (${ip})`, locationError);
                        // 获取位置信息失败不影响服务器注册
                    }
                }

                // 发送新服务器发现通知
                try {
                    if (svr.locals.notification) {
                        const telegramSetting = database.setting.get('telegram');
                        if (telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0 &&
                            telegramSetting?.notificationTypes?.newServerDiscovered) {

                            // 获取分组信息
                            const group = database.groups.get(groupId);
                            const groupName = group ? group.name : "默认分组";

                            const notificationMessage = `
#新服务器注册
主机名: ${name}
IP地址: ${ip}
系统: ${system || "Unknown"}
版本: ${version || "Unknown"}
分组: ${groupName}
状态: 已自动添加
注册时间: ${new Date().toLocaleString()}
                            `;

                            await svr.locals.notification.sendNotification(
                                '新服务器发现',
                                notificationMessage,
                                telegramSetting.chatIds
                            );

                            console.log(`[自动发现] 已发送新服务器注册通知: ${name} (${ip})`);
                        }
                    }
                } catch (error) {
                    console.error('[自动发现] 发送新服务器注册通知失败:', error);
                }

                console.log(`[自动发现] 新服务器已自动添加: ${name} (${ip}), SID: ${sid}`);
            }

            // 返回服务器ID和API密钥给客户端
            res.json({
                success: true,
                data: {
                    sid: sid,
                    apiKey: apiKey,
                    serverUrl: `${req.protocol}://${req.get('host')}/stats/update`,
                    approved: !needApproval
                }
            });
        } catch (error) {
            console.error('[自动发现] 注册错误:', error);
            res.json({success: false, message: "服务器内部错误"});
        }
    });

    // 获取待审核的服务器列表
    svr.get("/api/admin/autodiscovery/pending", async (req, res) => {
        try {
            // 使用正确的方法获取服务器列表
            const allServers = database.servers.all();

            // 过滤出自动发现且未批准的服务器
            const pendingServers = allServers.filter(server =>
                server.data &&
                server.data.autodiscovered === true &&
                server.data.approved === false
            );

            res.json({success: true, data: pendingServers});
        } catch (error) {
            console.error('[自动发现] 获取待审核服务器失败:', error);
            res.json({success: false, message: "获取待审核服务器失败"});
        }
    });

    // 审核服务器
    svr.post("/api/admin/autodiscovery/approve/:sid", async (req, res) => {
        try {
            const sid = req.params.sid;
            const {approved} = req.body;

            // 获取服务器信息
            const server = database.servers.get(sid);

            if (!server) {
                return res.json({success: false, message: "服务器不存在"});
            }

            if (approved) {
                // 批准服务器 - 更新服务器数据
                const serverData = server.data;
                serverData.approved = true;

                // 更新服务器状态
                database.servers.upd(
                    sid,
                    server.name,
                    serverData,
                    server.top,
                    server.expire_time,
                    server.group_id
                );

                // 更新服务器状态为启用
                database.servers.upd_status(sid, 1);

                console.log(`[自动发现] 服务器已批准: ${sid}`);
                res.json({success: true, message: "服务器已批准"});
            } else {
                // 拒绝并删除服务器
                database.servers.del(sid);
                console.log(`[自动发现] 服务器已拒绝并删除: ${sid}`);
                res.json({success: true, message: "服务器已拒绝并删除"});
            }
        } catch (error) {
            console.error('[自动发现] 审核服务器失败:', error);
            res.json({success: false, message: "审核服务器失败"});
        }
    });

    // 获取自动发现配置
    svr.get("/api/admin/autodiscovery/config", async (req, res) => {
        try {
            // 使用正确的方法获取设置
            const allSettings = database.setting.all();
            const config = allSettings.autodiscovery || {
                enabled: false,
                requireKey: true,
                registrationKey: crypto.randomBytes(8).toString('hex'),
                requireApproval: true,
                defaultGroup: "default"
            };

            res.json({success: true, data: config});
        } catch (error) {
            console.error('[自动发现] 获取配置失败:', error);
            res.json({success: false, message: "获取配置失败"});
        }
    });

    // 更新自动发现配置
    svr.post("/api/admin/autodiscovery/config", async (req, res) => {
        try {
            const config = req.body;

            // 使用正确的方法更新设置
            database.setting.set('autodiscovery', config);

            console.log('[自动发现] 配置已更新');
            res.json({success: true, message: "配置已更新"});
        } catch (error) {
            console.error('[自动发现] 更新配置失败:', error);
            res.json({success: false, message: "更新配置失败"});
        }
    });

    /**
     * 发送服务器状态汇总通知
     * 在服务启动后延迟调用，汇总所有服务器的在线/离线状态
     */
    async function sendStatusSummaryNotification(options = {}) {
        try {
            console.log('[自动发现] 准备发送服务器状态汇总通知...');

            // 等待通知系统初始化完成
            let retryCount = 0;
            const maxRetries = 5;
            let notification = null;

            while (retryCount < maxRetries) {
                notification = svr.locals.notification;
                if (notification && notification.bot) {
                    break;
                }
                console.log(`[自动发现] 等待通知系统初始化... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                retryCount++;
            }

            if (!notification || !notification.bot) {
                console.error('[自动发现] 通知系统未初始化，无法发送汇总通知');
                return;
            }

            // 使用模块闭包中的 database 对象访问设置
            const telegramSetting = database.setting.get('telegram');
            console.log('[自动发现] Telegram设置:', JSON.stringify({
                enabled: telegramSetting?.enabled,
                hasToken: !!telegramSetting?.token,
                chatIdsCount: telegramSetting?.chatIds?.length || 0,
                notificationType: {
                    statusSummary: telegramSetting?.notificationTypes?.statusSummary
                }
            }));

            // 检查通知设置
            if (!telegramSetting?.enabled || !telegramSetting?.chatIds?.length ||
                !telegramSetting?.notificationTypes?.statusSummary) {
                console.log('[自动发现] 通知未启用或配置不正确，跳过汇总通知');
                return;
            }

            // 从 svr.locals.db 获取服务器列表
            const allServers = database.servers.all().filter(server => server.status > 0);
            if (!allServers.length) {
                console.log('[自动发现] 没有启用的服务器，跳过汇总通知');
                return;
            }

            // 统计在线和离线服务器
            const stats = svr.locals.stats;
            if (!stats || !stats.getStatsData) {
                console.log('[自动发现] 状态数据不可用，跳过汇总通知');
                return;
            }

            // 获取状态数据并确保有足够时间让服务器状态更新
            const statusData = stats.getStatsData(true);
            console.log('[自动发现] 获取到状态数据，服务器数量:', Object.keys(statusData).length);

            const onlineServers = [];
            const offlineServers = [];

            for (const server of allServers) {
                const serverStatus = statusData[server.sid];

                // 改进服务器在线状态判断逻辑
                let isOnline = false;

                if (serverStatus && serverStatus.stat) {
                    // 判断是否为对象且有必要的属性
                    if (typeof serverStatus.stat === 'object') {
                        // 如果有明确的offline标志，直接使用
                        if (typeof serverStatus.stat.offline === 'boolean') {
                            isOnline = !serverStatus.stat.offline;
                        }
                        // 否则检查是否有CPU和内存数据
                        else if (serverStatus.stat.cpu && serverStatus.stat.mem) {
                            isOnline = true;
                        }
                    }
                    // 如果stat是正数，表示在线
                    else if (typeof serverStatus.stat === 'number' && serverStatus.stat > 0) {
                        isOnline = true;
                    }
                }

                if (isOnline) {
                    onlineServers.push(server.name);
                } else {
                    offlineServers.push(server.name);
                }
            }

            // 使用更丰富的文本格式，但避免使用可能导致问题的特殊字符
            // 格式化汇总消息 - 使用简单但信息丰富的格式

            // 创建一个更详细的消息
            let summaryMessage = "服务器状态汇总\n";
            summaryMessage += "====================\n";
            summaryMessage += `在线服务器: ${onlineServers.length}/${allServers.length}\n`;
            summaryMessage += `离线服务器: ${offlineServers.length}/${allServers.length}\n`;

            // 添加在线服务器列表（如果数量合理）
            if (onlineServers.length > 0 && onlineServers.length <= 10) {
                summaryMessage += "\n在线服务器列表:\n";
                onlineServers.forEach((name, index) => {
                    summaryMessage += `${index + 1}. ${name}\n`;
                });
            }

            // 添加离线服务器列表（如果数量合理）
            if (offlineServers.length > 0 && offlineServers.length <= 10) {
                summaryMessage += "\n离线服务器列表:\n";
                offlineServers.forEach((name, index) => {
                    summaryMessage += `${index + 1}. ${name}\n`;
                });
            }

            summaryMessage += "\n====================";

            // 打印调试信息，确保消息内容非空
            console.log('[自动发现] 汇总消息内容长度:', summaryMessage.length);
            console.log('[自动发现] 汇总消息内容:', summaryMessage);
            console.log('[自动发现] 汇总消息内容(字节):', Buffer.from(summaryMessage).toString('hex'));
            console.log('[自动发现] 汇总消息内容(字节长度):', Buffer.from(summaryMessage).length);

            // 发送汇总通知时传递选项
            console.log('[自动发现] 发送服务器状态汇总通知');

            try {
                // 在发送前检查消息是否为空
                if (!summaryMessage || summaryMessage.trim().length === 0) {
                    console.error('[自动发现] 汇总消息内容为空，无法发送通知');
                    return { success: false, error: '汇总消息内容为空' };
                }

                // 使用最简单的方式发送通知，传递bypassDeduplication选项
                const notificationResult = await notification.sendNotification(
                    '状态汇总',
                    summaryMessage,
                    telegramSetting.chatIds,
                    { bypassDeduplication: options.bypassDeduplication }
                );

                console.log('[自动发现] 服务器状态汇总通知结果:',
                    notificationResult.success ? '发送成功' :
                    `发送失败: ${notificationResult.error || JSON.stringify(notificationResult)}`);

                return notificationResult;
            } catch (error) {
                console.error('[自动发现] 发送状态汇总通知失败:', error);
                throw error;
            }
        } catch (error) {
            console.error('[自动发现] 发送状态汇总通知失败:', error);
            throw error;
        }
    }

    // 修改定时任务的启动方式
    // 系统启动后延迟一定时间再设置定时任务，确保通知系统已经初始化
    setTimeout(() => {
        console.log('[自动发现] 开始设置状态汇总定时任务...');

        // 每天早上8点和晚上8点发送汇总
        summarySchedule = schedule.scheduleJob('0 0 8,20 * * *', async () => {
            console.log('[自动发现] 开始执行定时状态汇总任务');
            try {
                // 添加bypassDeduplication选项，允许定时任务发送
                await sendStatusSummaryNotification({ bypassDeduplication: true });
                console.log('[自动发现] 定时状态汇总任务完成');
            } catch (error) {
                console.error('[自动发现] 定时状态汇总任务失败:', error);
            }
        });

        // 将定时任务对象保存到模块导出中
        if (svr.locals.autodiscovery) {
            svr.locals.autodiscovery.summarySchedule = summarySchedule;
        }

        console.log('[自动发现] 状态汇总定时任务设置完成');

        // 立即发送一次初始汇总，但不绕过去重机制
        console.log('[自动发现] 准备发送系统启动后的初始状态汇总');
        sendStatusSummaryNotification()
            .then(() => console.log('[自动发现] 系统启动后的初始状态汇总发送完成'))
            .catch(error => console.error('[自动发现] 系统启动后的初始状态汇总发送失败:', error));

    }, 45000);

    // 添加手动触发汇总通知的API端点
    svr.get('/admin/trigger-summary', async (req, res) => {
        try {
            if (!req.admin) {
                return res.status(403).json({ success: false, message: '需要管理员权限' });
            }

            console.log('[自动发现] 通过API手动触发状态汇总通知');
            const result = await sendStatusSummaryNotification();

            return res.json({
                success: true,
                message: '已触发状态汇总通知',
                result: result
            });
        } catch (error) {
            console.error('[自动发现] 手动触发汇总通知失败:', error);
            return res.status(500).json({
                success: false,
                message: '触发汇总通知失败',
                error: error.message
            });
        }
    });

    // 将模块功能暴露给svr.locals，以便其他模块可以调用
    svr.locals.autodiscovery = {
        name: "autodiscovery",
        interceptor: interceptor,
        sendStatusSummary: sendStatusSummaryNotification,
        summarySchedule  // 导出定时任务对象，以便需要时可以控制
    };

    // 添加数据库方法，用于支持API端点
    if (!database.autodiscovery) {
        database.autodiscovery = {
            // 查找待审核的服务器
            async findPendingServers() {
                try {
                    console.log('[自动发现] 查询待审核服务器');
                    // 使用服务器表查询状态为pending的服务器
                    return database.servers.find({ status: 'pending' }) || [];
                } catch (error) {
                    console.error('[自动发现] 查询待审核服务器失败:', error);
                    return [];
                }
            },

            // 查找已发现的服务器
            async findDiscoveredServers() {
                try {
                    console.log('[自动发现] 查询已发现服务器');
                    // 使用服务器表查询状态为discovered的服务器
                    return database.servers.find({ status: 'discovered' }) || [];
                } catch (error) {
                    console.error('[自动发现] 查询已发现服务器失败:', error);
                    return [];
                }
            },

            // 根据ID查找待审核服务器
            async findPendingServerById(id) {
                try {
                    console.log(`[自动发现] 查询待审核服务器: ${id}`);
                    return database.servers.findOne({ _id: id, status: 'pending' });
                } catch (error) {
                    console.error(`[自动发现] 查询待审核服务器失败: ${id}`, error);
                    return null;
                }
            },

            // 根据ID查找已发现服务器
            async findDiscoveredServerById(id) {
                try {
                    console.log(`[自动发现] 查询已发现服务器: ${id}`);
                    return database.servers.findOne({ _id: id, status: 'discovered' });
                } catch (error) {
                    console.error(`[自动发现] 查询已发现服务器失败: ${id}`, error);
                    return null;
                }
            },

            // 批准服务器
            async approveServer(id) {
                try {
                    console.log(`[自动发现] 批准服务器: ${id}`);
                    const server = await database.servers.findOne({ _id: id, status: 'pending' });
                    if (!server) {
                        console.error(`[自动发现] 批准服务器失败: 服务器不存在或状态不是待审核 ${id}`);
                        return null;
                    }

                    // 更新服务器状态为已批准
                    const result = await database.servers.update(id, { status: 'approved' });
                    return result ? server : null;
                } catch (error) {
                    console.error(`[自动发现] 批准服务器失败: ${id}`, error);
                    return null;
                }
            },

            // 拒绝服务器
            async rejectServer(id) {
                try {
                    console.log(`[自动发现] 拒绝服务器: ${id}`);
                    const server = await database.servers.findOne({ _id: id, status: 'pending' });
                    if (!server) {
                        console.error(`[自动发现] 拒绝服务器失败: 服务器不存在或状态不是待审核 ${id}`);
                        return null;
                    }

                    /**
                     * 修改部分：完全删除被拒绝的服务器，而不是仅更改状态
                     * @description 修改说明：
                     * 1. 为什么要修改：原代码只是将服务器状态更改为rejected，但服务器仍然存在于数据库中
                     * 2. 修改了什么：将更新状态的操作改为直接从数据库中删除服务器
                     * 3. 可能的影响：被拒绝的服务器将不再存在于数据库中，无法恢复，但可以减少数据库存储压力
                     * @modified 当前日期
                     */
                    // 删除服务器而不是更新状态
                    const result = await database.servers.delete(id);

                    // 记录删除操作
                    console.log(`[自动发现] 服务器已被拒绝并从数据库中删除: ${id}, 主机名: ${server.hostname || 'unknown'}, IP: ${server.ip || 'unknown'}`);

                    return result ? server : null;
                } catch (error) {
                    console.error(`[自动发现] 拒绝服务器失败: ${id}`, error);
                    return null;
                }
            },

            // 检查服务器状态
            async checkServerStatus(server) {
                return await checkServerStatus(server);
            }
        };
    }

    return {
        name: "autodiscovery",
        interceptor: interceptor,
        sendStatusSummary: sendStatusSummaryNotification,
        summarySchedule  // 导出定时任务对象，以便需要时可以控制
    };
};

