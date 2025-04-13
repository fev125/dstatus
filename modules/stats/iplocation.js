"use strict";

/**
 * IP地理位置查询模块
 * 提供IP地址的地理位置查询功能
 */

const fetch = require('node-fetch');

/**
 * IP地理位置查询类
 */
class IPLocation {
    /**
     * 初始化IP地理位置查询
     * @param {Object} options - 配置选项
     * @param {string} options.apiUrl - IP查询API地址
     * @param {number} options.timeout - 请求超时时间（毫秒）
     */
    constructor(options = {}) {
        this.apiUrl = options.apiUrl || 'https://vps8.de/api.php?ip=';
        this.timeout = options.timeout || 5000;
    }

    /**
     * 查询IP地理位置信息
     * @param {string} ip - IP地址
     * @returns {Promise<Object>} 地理位置信息
     */
    async query(ip) {
        try {
            const response = await fetch(`${this.apiUrl}${ip}`, {
                timeout: this.timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return {
                country: data.country_name || 'Unknown',
                countryCode: data.country_code || '--',
                flag: data.flag_url || '',
                success: true
            };
        } catch (error) {
            console.error(`IP查询失败 (${ip}):`, error.message);
            return {
                country: 'Unknown',
                countryCode: '--',
                flag: '',
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 批量查询IP地理位置信息
     * @param {string[]} ips - IP地址数组
     * @returns {Promise<Object>} 批量查询结果
     */
    async batchQuery(ips) {
        const results = {};
        for (const ip of ips) {
            results[ip] = await this.query(ip);
        }
        return results;
    }
}

/**
 * IP地理位置服务类
 * 提供IP地理位置查询、缓存和服务器位置更新功能
 */
class IPLocationService {
    /**
     * 初始化IP地理位置服务
     * @param {Object} options - 配置选项
     * @param {IPLocation} options.ipLocator - IP地理位置查询实例
     * @param {number} options.cacheTTL - 缓存过期时间（毫秒）
     * @param {number} options.retryInterval - 重试间隔时间（毫秒）
     * @param {number} options.maxRetries - 最大重试次数
     */
    constructor(options = {}) {
        this.ipLocator = options.ipLocator || new IPLocation();
        this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24小时
        this.retryInterval = options.retryInterval || 30 * 60 * 1000; // 默认30分钟重试一次
        this.maxRetries = options.maxRetries || 5; // 默认最大重试5次

        // IP缓存
        this.ipCache = {};
        // 更新失败记录 - 改为Map以存储更多信息
        this.updateFailures = new Map(); // sid -> {retries, lastTry, error}

        // 初始化定时任务
        this.retryTimer = null;
        this.startRetryTimer();
    }

    /**
     * 启动定时重试任务
     * 定期尝试重新获取失败的IP位置信息
     */
    startRetryTimer() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
        }

        this.retryTimer = setInterval(() => {
            this.retryFailedUpdates();
        }, this.retryInterval);

        console.log(`[${new Date().toISOString()}] IP位置服务定时重试任务已启动，间隔: ${this.retryInterval / 1000 / 60}分钟`);
    }

    /**
     * 重试失败的更新
     * @param {Object} db - 数据库对象，如果提供则会更新数据库
     */
    async retryFailedUpdates(db = null) {
        if (this.updateFailures.size === 0) {
            return;
        }

        console.log(`[${new Date().toISOString()}] 开始重试失败的IP位置更新，共${this.updateFailures.size}个`);

        // 复制失败记录，避免迭代过程中修改
        const failures = [...this.updateFailures.entries()];

        for (const [sid, failInfo] of failures) {
            // 检查重试次数是否超过最大值
            if (failInfo.retries >= this.maxRetries) {
                console.log(`[${new Date().toISOString()}] 服务器 ${sid} 的IP位置更新已达最大重试次数，不再重试`);
                continue;
            }

            // 检查上次尝试时间，避免频繁重试
            const now = Date.now();
            const timeSinceLastTry = now - failInfo.lastTry;
            if (timeSinceLastTry < this.retryInterval) {
                continue;
            }

            // 如果有数据库对象，尝试更新服务器位置
            if (db) {
                const server = db.servers.get(sid);
                if (server) {
                    console.log(`[${new Date().toISOString()}] 重试更新服务器 ${server.name} 的位置信息`);

                    // 更新重试计数
                    failInfo.retries++;
                    failInfo.lastTry = now;
                    this.updateFailures.set(sid, failInfo);

                    // 尝试更新
                    await this.updateServerLocation(server, db);
                }
            }
        }
    }

    /**
     * 检查是否为本地IP或局域网IP
     * @param {string} ip - IP地址
     * @returns {boolean} 是否为本地IP或局域网IP
     */
    isLocalOrPrivateIP(ip) {
        // 检查是否为本地IP
        if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
            return true;
        }

        // 检查是否为局域网IP
        // 10.0.0.0/8
        if (ip.startsWith('10.')) {
            return true;
        }

        // 172.16.0.0/12
        if (ip.startsWith('172.')) {
            const secondPart = parseInt(ip.split('.')[1], 10);
            if (secondPart >= 16 && secondPart <= 31) {
                return true;
            }
        }

        // 192.168.0.0/16
        if (ip.startsWith('192.168.')) {
            return true;
        }

        // fc00::/7 (IPv6 ULA)
        if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) {
            return true;
        }

        // fe80::/10 (IPv6 link-local)
        if (ip.toLowerCase().startsWith('fe8') || ip.toLowerCase().startsWith('fe9') ||
            ip.toLowerCase().startsWith('fea') || ip.toLowerCase().startsWith('feb')) {
            return true;
        }

        return false;
    }

    /**
     * 获取IP地理位置信息
     * @param {string} ip - IP地址
     * @returns {Promise<Object>} 地理位置信息
     */
    async getIPLocation(ip) {
        // 检查是否为本地IP或局域网IP
        if (this.isLocalOrPrivateIP(ip)) {
            console.log(`[${new Date().toISOString()}] 检测到本地或局域网IP: ${ip}，设置为本地网络`);

            // 返回本地网络的位置信息
            const localNetworkData = {
                success: true,
                country: '本地网络',
                countryCode: 'LO',  // LO 代表 Local
                flag: ''
            };

            // 更新缓存
            this.ipCache[ip] = {
                timestamp: Date.now(),
                data: localNetworkData
            };

            return localNetworkData;
        }

        // 检查缓存
        if (this.ipCache[ip] && this.ipCache[ip].timestamp > Date.now() - this.cacheTTL) {
            console.log(`[${new Date().toISOString()}] 使用缓存的IP位置信息: ${ip}`);
            return this.ipCache[ip].data;
        }

        try {
            // 查询IP位置
            const locationData = await this.ipLocator.query(ip);

            // 检查查询是否成功
            if (!locationData || !locationData.success) {
                const errorMsg = locationData?.error || '未知错误';
                console.error(`[${new Date().toISOString()}] IP位置查询失败: ${ip}, 错误: ${errorMsg}`);

                // 返回带有错误信息的结果
                return {
                    success: false,
                    error: errorMsg,
                    country: 'Unknown',
                    countryCode: '--',
                    flag: ''
                };
            }

            // 更新缓存
            this.ipCache[ip] = {
                timestamp: Date.now(),
                data: locationData
            };

            return locationData;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] 获取IP位置失败: ${ip}`, error);

            // 返回带有错误信息的结果
            return {
                success: false,
                error: error.message || '未知错误',
                country: 'Unknown',
                countryCode: '--',
                flag: ''
            };
        }
    }

    /**
     * 更新服务器的位置信息
     * @param {Object} server - 服务器对象
     * @param {Object} db - 数据库对象
     * @returns {Promise<Object>} 更新后的服务器数据
     */
    async updateServerLocation(server, db) {
        const { sid } = server;
        const now = Date.now();
        // 使用 let 而不是 const，因为我们可能需要重新赋值
        let serverData = server.data || {};

        try {
            // 获取IP地址
            const ip = serverData.ip || serverData.host || serverData.ssh?.host;
            if (!ip) {
                const error = '服务器无有效IP地址';
                console.error(`[${new Date().toISOString()}] ${error}: ${server.name}`);

                // 记录失败信息
                this.updateFailures.set(sid, {
                    retries: 1,
                    lastTry: now,
                    error: error
                });

                // 更新服务器数据
                if (!serverData.location) serverData.location = {};
                serverData.location.error = error;
                serverData.location.updated_at = now;

                // 保存到数据库
                db.servers.upd_data(sid, serverData);

                return {
                    success: false,
                    data: serverData,
                    error: error,
                    message: error
                };
            }

            // 获取IP位置
            const locationData = await this.getIPLocation(ip);

            // 判断是否获取到了有效的国家代码
            if (locationData && locationData.countryCode && locationData.countryCode !== '--') {
                // 检查现有位置信息是否与新获取的一致
                const currentLocation = serverData.location || {};
                const currentCode = currentLocation.code || currentLocation.country?.code;

                if (currentCode === locationData.countryCode) {
                    console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息未变化: ${locationData.countryCode}`);

                    // 更新时间戳
                    if (!serverData.location) serverData.location = {};
                    serverData.location.updated_at = now;

                    // 保存到数据库
                    db.servers.upd_data(sid, serverData);

                    // 从失败记录中移除
                    this.updateFailures.delete(sid);

                    return {
                        success: true,
                        data: serverData,
                        unchanged: true,
                        message: '位置信息未变化'
                    };
                }

                // 更新位置信息
                console.log(`[${new Date().toISOString()}] 获取到新的位置信息: ${server.name} (${ip}) -> ${locationData.countryCode}`);

                if (!serverData.location) {
                    serverData.location = {};
                }

                // 更新位置信息
                serverData.location = {
                    code: locationData.countryCode,
                    country: {
                        code: locationData.countryCode,
                        name: locationData.country,
                        name_zh: this.getCountryNameZh(locationData.countryCode),
                        flag: this.getCountryFlag(locationData.countryCode, locationData.flag),
                        auto_detect: true,
                        manual: false
                    },
                    updated_at: now
                };

                // 清除错误信息
                delete serverData.location.error;

                // 保存到数据库
                db.servers.upd_data(sid, serverData);

                // 从失败记录中移除
                this.updateFailures.delete(sid);

                console.log(`[${new Date().toISOString()}] 更新服务器位置成功: ${server.name} (${locationData.country || locationData.countryCode})`);
                return {
                    success: true,
                    data: serverData,
                    message: '位置信息更新成功'
                };
            } else {
                const errorMsg = locationData?.error ?
                    `获取位置信息失败: ${locationData.error}` :
                    '无法获取有效的位置信息';

                console.error(`[${new Date().toISOString()}] ${errorMsg}: ${server.name} (${ip})`);

                // 记录失败信息
                const failInfo = this.updateFailures.get(sid) || { retries: 0, lastTry: 0 };
                this.updateFailures.set(sid, {
                    retries: failInfo.retries + 1,
                    lastTry: now,
                    error: errorMsg
                });

                // 更新服务器数据
                if (!serverData.location) serverData.location = {};
                serverData.location.error = errorMsg;
                serverData.location.updated_at = now;

                // 保存到数据库
                db.servers.upd_data(sid, serverData);

                return {
                    success: false,
                    data: serverData,
                    error: errorMsg,
                    message: errorMsg
                };
            }
        } catch (error) {
            const errorMsg = `更新位置信息时发生错误: ${error.message || '未知错误'}`;
            console.error(`[${new Date().toISOString()}] ${errorMsg}: ${server.name}`);

            // 记录失败信息
            this.updateFailures.set(sid, {
                retries: (this.updateFailures.get(sid)?.retries || 0) + 1,
                lastTry: now,
                error: errorMsg
            });

            // 更新服务器数据
            try {
                // 确保 serverData 是一个对象
                if (typeof serverData === 'string') {
                    try {
                        serverData = JSON.parse(serverData);
                    } catch (parseError) {
                        console.error(`[${new Date().toISOString()}] 无法解析服务器数据: ${parseError.message}`);
                        serverData = {};
                    }
                }

                if (!serverData) serverData = {};
                if (!serverData.location) serverData.location = {};
                serverData.location.error = errorMsg;
                serverData.location.updated_at = now;
            } catch (updateError) {
                console.error(`[${new Date().toISOString()}] 更新服务器位置数据时出错: ${updateError.message}`);
                serverData = { location: { error: errorMsg, updated_at: now } };
            }

            // 保存到数据库
            db.servers.upd_data(sid, serverData);

            return {
                success: false,
                error: errorMsg,
                message: errorMsg,
                data: serverData
            };
        }
    }

    /**
     * 获取国家中文名
     * @param {string} countryCode - 国家代码
     * @returns {string} 国家中文名
     */
    getCountryNameZh(countryCode) {
        const countryMap = {
            'CN': '中国',
            'HK': '香港',
            'TW': '台湾',
            'JP': '日本',
            'KR': '韩国',
            'SG': '新加坡',
            'US': '美国',
            'CA': '加拿大',
            'UK': '英国',
            'DE': '德国',
            'FR': '法国',
            'AU': '澳大利亚',
            'RU': '俄罗斯',
            'UA': '乌克兰',
            'BR': '巴西',
            'IN': '印度',
            'ZA': '南非',
            'LO': '本地网络',
            'OT': '其他地区'
        };

        return countryMap[countryCode] || `未知(${countryCode})`;
    }

    /**
     * 获取国家旗帜
     * @param {string} countryCode - 国家代码
     * @param {string} flagUrl - 旗帜图片URL
     * @returns {string} 国家旗帜表情
     */
    getCountryFlag(countryCode, flagUrl) {
        // 如果有旗帜图片URL，优先使用
        if (flagUrl) {
            return flagUrl;
        }

        // 否则使用emoji旗帜
        const flagMap = {
            'CN': '🇨🇳',
            'HK': '🇭🇰',
            'TW': '🇹🇼',
            'JP': '🇯🇵',
            'KR': '🇰🇷',
            'SG': '🇸🇬',
            'US': '🇺🇸',
            'CA': '🇨🇦',
            'UK': '🇬🇧',
            'DE': '🇩🇪',
            'FR': '🇫🇷',
            'AU': '🇦🇺',
            'RU': '🇷🇺',
            'UA': '🇺🇦',
            'BR': '🇧🇷',
            'IN': '🇮🇳',
            'ZA': '🇿🇦',
            'LO': '🏠',
            'OT': '🌍'
        };

        return flagMap[countryCode] || '🌎';
    }

    /**
     * 清除IP缓存
     * @param {string} ip - 要清除的IP地址，如果不提供则清除所有缓存
     */
    clearCache(ip) {
        if (ip) {
            delete this.ipCache[ip];
            console.log(`[${new Date().toISOString()}] 已清除IP缓存: ${ip}`);
        } else {
            this.ipCache = {};
            console.log(`[${new Date().toISOString()}] 已清除所有IP缓存`);
        }
    }

    /**
     * 清除失败记录
     * @param {string} sid - 要清除的服务器ID，如果不提供则清除所有失败记录
     */
    clearFailures(sid) {
        if (sid) {
            this.updateFailures.delete(sid);
            console.log(`[${new Date().toISOString()}] 已清除服务器失败记录: ${sid}`);
        } else {
            this.updateFailures.clear();
            console.log(`[${new Date().toISOString()}] 已清除所有服务器失败记录`);
        }
    }

    /**
     * 检查并更新没有位置信息的服务器
     * @param {Object} db - 数据库对象
     * @returns {Promise<Object>} 处理结果，包含更新数量和成功数量
     */
    async checkAndUpdateMissingLocations(db) {
        try {
            console.log(`[${new Date().toISOString()}] 开始检查没有位置信息的服务器`);

            let totalChecked = 0;
            let totalUpdated = 0;
            let totalSuccess = 0;

            // 获取所有服务器
            const servers = db.servers.all();

            for (const server of servers) {
                totalChecked++;

                // 检查服务器是否有位置信息
                const hasValidLocation = server.data &&
                                       server.data.location &&
                                       server.data.location.code &&
                                       server.data.location.code !== '--';

                if (!hasValidLocation) {
                    console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 没有有效的位置信息，尝试更新`);

                    // 清除缓存和失败记录
                    if (server.data && server.data.ssh && server.data.ssh.host) {
                        this.clearCache(server.data.ssh.host);
                    }
                    this.clearFailures(server.sid);

                    // 更新位置信息
                    totalUpdated++;
                    const result = await this.updateServerLocation(server, db);

                    // 检查更新是否成功
                    if ((result && result.success) ||
                        (result && result.data && result.data.location && result.data.location.code)) {
                        totalSuccess++;
                        console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息更新成功: ${result.data.location.code}`);
                    } else {
                        console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息更新失败`);
                    }
                }
            }

            console.log(`[${new Date().toISOString()}] 检查完成: 共检查 ${totalChecked} 个服务器，更新 ${totalUpdated} 个，成功 ${totalSuccess} 个`);

            return {
                success: true,
                totalChecked,
                totalUpdated,
                totalSuccess
            };
        } catch (error) {
            console.error(`[${new Date().toISOString()}] 检查和更新位置信息失败:`, error);
            return {
                success: false,
                error: error.message,
                totalChecked: 0,
                totalUpdated: 0,
                totalSuccess: 0
            };
        }
    }

    /**
     * 刷新服务器位置信息（处理手动刷新请求）
     * @param {string} sid - 服务器ID
     * @param {Object} db - 数据库对象
     * @param {boolean} isAdmin - 是否为管理员
     * @returns {Promise<Object>} 处理结果
     */
    async refreshServerLocation(sid, db, isAdmin = true) {
        try {
            // 只允许管理员刷新IP
            if (!isAdmin) {
                return { success: false, message: '权限不足', status: 403 };
            }

            // 获取服务器
            const server = db.servers.get(sid);
            if (!server) {
                return { success: false, message: '服务器不存在', status: 404 };
            }

            // 清除缓存
            if (server.data && server.data.ssh && server.data.ssh.host) {
                this.clearCache(server.data.ssh.host);
                console.log(`[${new Date().toISOString()}] 手动触发获取服务器 ${server.name} (${server.data.ssh.host}) 位置信息`);
            }

            // 清除失败记录
            this.clearFailures(sid);

            // 更新位置
            const result = await this.updateServerLocation(server, db);

            // 判断是否成功获取了位置信息
            if (result && result.data && result.data.location && result.data.location.code) {
                // 如果有位置信息，则认为更新成功，即使 result.success 为 false
                console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息更新成功: ${result.data.location.code}`);
                return { success: true, message: '刷新成功', data: result.data };
            } else if (result && result.success) {
                // 原来的成功判断逻辑
                return { success: true, message: '刷新成功', data: result.data };
            } else {
                // 使用返回的错误信息或默认错误信息
                let errorMessage = '位置信息更新失败';
                if (result && result.error) {
                    errorMessage = `${result.error}`;
                } else if (server.data && server.data.location && server.data.location.error) {
                    errorMessage = `${server.data.location.error}`;
                }

                console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息更新失败: ${errorMessage}`);

                return {
                    success: false,
                    message: errorMessage,
                    server_data: {
                        name: server.name,
                        location: result ? result.data.location : (server.data?.location || null)
                    }
                };
            }
        } catch (error) {
            console.error('刷新IP位置失败:', error);
            return { success: false, message: '服务器错误', status: 500 };
        }
    }
}

// 导出IPLocation类、IPLocationService类和一些工具函数
module.exports = {
    IPLocation,
    IPLocationService,

    /**
     * 创建默认的IP地理位置查询实例
     * @returns {IPLocation} IP地理位置查询实例
     */
    createDefault() {
        return new IPLocation();
    },

    /**
     * 创建默认的IP地理位置服务实例
     * @returns {IPLocationService} IP地理位置服务实例
     */
    createService() {
        return new IPLocationService();
    }
};
