const path = require('path');
const fs = require('fs');

class NotificationManager {
    constructor(db, bot) {
        if (!db) {
            const error = new Error('[通知系统] 致命错误: 数据库实例未提供');
            console.error(error);
            throw error;
        }
        console.log(`[通知系统] 构造 NotificationManager 实例: bot=${!!bot}`);
        this.bot = bot;
        this.db = db;
        this.logDir = path.join(__dirname, '../../data/logs');
        this.ensureLogDirectory();
        this.initializeNotificationTypes();
        
        // 错误计数器
        this.errorCounts = {
            initialization: 0,
            sending: 0,
            bot: 0,
            database: 0
        };
        
        // 最后一次错误时间记录
        this.lastErrorTime = {
            initialization: null,
            sending: null,
            bot: null,
            database: null
        };
        
        // 错误阈值设置
        this.errorThresholds = {
            initialization: 3,
            sending: 5,
            bot: 3,
            database: 3
        };

        // 统一的消息图标定义
        this.messageIcons = {
            '服务器恢复': '🟢',
            '服务器掉线': '🔴',
            '流量超限': '⚠️',
            '测试通知': '🔔',
            '状态汇总': '📊',
            '系统错误': '⚠️'
        };

        // 添加通知防重复机制
        this.notificationDeduplication = {
            errors: new Map(),  // 存储错误消息的哈希
            summaries: new Map(), // 存储汇总通知的记录
            deduplicationWindow: 300000,  // 5分钟内的相同错误只发送一次
            summaryDeduplicationWindow: 60000, // 1分钟内的汇总通知去重
            maxErrorsPerWindow: 3,  // 每个时间窗口内最多发送3次相同类型的错误
            maxSummariesPerWindow: 1 // 每个时间窗口内最多发送1次汇总
        };

        // 添加系统状态跟踪
        this.systemState = {
            isHealthy: true,
            lastHealthCheck: Date.now(),
            healthCheckInterval: 60000,  // 1分钟检查一次
            consecutiveFailures: 0,
            maxConsecutiveFailures: 5
        };

        // 启动健康检查
        this.startHealthCheck();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    // 初始化通知类型配置
    initializeNotificationTypes() {
        const telegramSetting = this.db.setting.get('telegram') || {};
        console.log('[通知系统] 初始化通知类型配置...');
        
        // 确保notificationTypes对象存在
        if (!telegramSetting.notificationTypes) {
            console.log('[通知系统] 创建通知类型配置对象');
            telegramSetting.notificationTypes = {
                serverOnline: true,
                serverOffline: true,
                trafficLimit: true,
                testNotification: true,
                statusSummary: true,  // 状态汇总通知类型
                newServerDiscovered: true, // 新增：新服务器发现通知
                serverApproved: true  // 新增：服务器批准通知
            };
            this.db.setting.set('telegram', telegramSetting);
        } else {
            // 确保所有必要的通知类型都存在 
            let updated = false;
            const defaultTypes = {
                serverOnline: true,
                serverOffline: true,
                trafficLimit: true,
                testNotification: true,
                statusSummary: true,  // 状态汇总通知类型
                newServerDiscovered: true, // 新增：新服务器发现通知
                serverApproved: true  // 新增：服务器批准通知
            };
            
            // 遍历默认类型，添加缺失的类型
            for (const [type, enabled] of Object.entries(defaultTypes)) {
                if (telegramSetting.notificationTypes[type] === undefined) {
                    console.log(`[通知系统] 添加缺失的通知类型: ${type}`);
                    telegramSetting.notificationTypes[type] = enabled;
                    updated = true;
                }
            }
            
            // 如果有更新，保存设置
            if (updated) {
                console.log('[通知系统] 更新通知类型配置');
                this.db.setting.set('telegram', telegramSetting);
            }
        }
        
        // 输出当前通知类型设置情况
        console.log('[通知系统] 当前通知类型配置:', JSON.stringify(telegramSetting.notificationTypes));
    }

    setBot(bot) {
        console.log(`[通知系统] 设置 Bot: bot对象存在=${!!bot}`);
        if (!bot) {
            console.warn('[通知系统] 警告: 尝试设置空的bot对象');
            return;
        }
        this.bot = bot;
        console.log('[通知系统] Bot设置成功，尝试发送功能函数是否存在:', !!this.bot.sendMessage);
    }

    async sendNotification(type, content, chatIds, options = {}) {
        try {
            console.log(`[通知系统] 尝试发送 ${type} 通知: bot=${!!this.bot}, chatIds=${chatIds?.length || 0}`);
            
            // 检查汇总通知的去重
            if (type === '状态汇总' && !options.bypassDeduplication) {
                const now = Date.now();
                const lastSummary = this.notificationDeduplication.summaries.get('lastSummary');
                
                if (lastSummary && (now - lastSummary.timestamp < this.notificationDeduplication.summaryDeduplicationWindow)) {
                    console.log(`[通知系统] 汇总通知在去重窗口期内，跳过发送。距离上次发送: ${now - lastSummary.timestamp}ms`);
                    return {
                        success: false,
                        error: '汇总通知在去重窗口期内',
                        errorType: 'SUMMARY_DUPLICATE'
                    };
                }
                
                // 更新最后发送时间
                this.notificationDeduplication.summaries.set('lastSummary', {
                    timestamp: now,
                    content: content
                });
            }

            // 检查bot实例
            if (!this.bot) {
                const error = new Error('[通知系统] 错误: Bot实例不存在');
                this.handleSystemError('bot', error);
                return { success: false, error: error.message, errorType: 'BOT_MISSING' };
            }

            // 检查chatIds
            if (!chatIds || chatIds.length === 0) {
                const error = new Error('[通知系统] 错误: 未配置Chat ID');
                this.handleSystemError('sending', error);
                return { success: false, error: error.message, errorType: 'CHAT_IDS_MISSING' };
            }

            // 检查通知类型
            const typeMap = {
                '服务器恢复': 'serverOnline',
                '服务器掉线': 'serverOffline',
                '流量超限': 'trafficLimit',
                '测试通知': 'testNotification',
                '状态汇总': 'statusSummary',
                '系统错误': 'systemError',  // 系统错误通知类型
                '新服务器发现': 'newServerDiscovered', // 新增：新服务器发现通知
                '服务器批准': 'serverApproved'  // 新增：服务器批准通知
            };

            const notificationType = typeMap[type];
            if (!notificationType) {
                const error = new Error(`[通知系统] 错误: 未知的通知类型 "${type}"`);
                this.handleSystemError('sending', error);
                return { success: false, error: error.message, errorType: 'INVALID_TYPE' };
            }

            // 获取通知设置
            const telegramSetting = this.db.setting.get('telegram');
            if (!telegramSetting?.enabled) {
                console.log('[通知系统] 通知系统未启用，跳过发送');
                return { success: false, error: '通知系统未启用', errorType: 'SYSTEM_DISABLED' };
            }

            if (!telegramSetting?.notificationTypes?.[notificationType]) {
                console.log(`[通知系统] ${type} 通知已禁用，跳过发送`);
                return { success: false, error: '该类型的通知已禁用', errorType: 'TYPE_DISABLED' };
            }

            // 使用统一的格式化方法
            let message = this.formatMessage(type, content, options);
            
            // 确保消息不为空
            if (!message || message.trim().length === 0) {
                const error = new Error('[通知系统] 错误: 消息内容为空');
                this.handleSystemError('sending', error);
                return { success: false, error: error.message, errorType: 'EMPTY_MESSAGE' };
            }

            const results = [];
            const errors = [];

            // 发送消息
            for (const chatId of chatIds) {
                try {
                    console.log(`[通知系统] 尝试发送 ${type} 通知到 Chat ID: ${chatId}`);
                    
                    if (typeof this.bot.sendMessage === 'function') {
                        const result = await this.bot.sendMessage(chatId, message);
                        results.push({ chatId, success: true, result });
                        console.log(`[通知系统] 成功发送 ${type} 通知到 Chat ID: ${chatId}`);
                    } else if (this.bot.funcs && typeof this.bot.funcs.notice === 'function') {
                        const result = await this.bot.funcs.notice(message);
                        results.push({ chatId, success: true, result });
                        console.log(`[通知系统] 使用notice成功发送 ${type} 通知`);
                    } else {
                        throw new Error('Bot对象没有有效的发送方法');
                    }
                } catch (error) {
                    const errorDetail = {
                        chatId,
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        type: 'SEND_ERROR'
                    };
                    console.error(`[通知系统] 发送 ${type} 通知到 Chat ID: ${chatId} 失败:`, error);
                    errors.push(errorDetail);
                    this.handleSystemError('sending', error);
                }
            }

            // 处理发送结果
            if (errors.length === chatIds.length) {
                const error = new Error(errors.map(e => `Chat ID ${e.chatId}: ${e.error}`).join('\n'));
                this.logError(type, error.message);
                return { 
                    success: false, 
                    error: error.message, 
                    errorType: 'ALL_SENDS_FAILED',
                    details: errors 
                };
            }

            this.logSuccess(type, message, { results, errors });
            return { 
                success: true, 
                results, 
                errors: errors.length > 0 ? errors : undefined 
            };
        } catch (error) {
            this.handleSystemError('sending', error);
            return { 
                success: false, 
                error: error.message, 
                errorType: 'UNEXPECTED_ERROR',
                stack: error.stack 
            };
        }
    }

    handleSystemError(type, error) {
        // 更新错误计数和时间
        this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
        this.lastErrorTime[type] = new Date();

        // 生成错误消息哈希
        const errorHash = this.generateErrorHash(type, error.message);
        
        // 检查是否在去重窗口内
        const now = Date.now();
        const errorRecord = this.notificationDeduplication.errors.get(errorHash);
        
        if (errorRecord) {
            if (now - errorRecord.firstSeen < this.notificationDeduplication.deduplicationWindow) {
                if (errorRecord.count >= this.notificationDeduplication.maxErrorsPerWindow) {
                    console.log(`[通知系统] 错误通知已达到窗口限制: ${type}`);
                    return;
                }
                errorRecord.count++;
            } else {
                // 重置计数
                errorRecord.firstSeen = now;
                errorRecord.count = 1;
            }
        } else {
            // 新错误记录
            this.notificationDeduplication.errors.set(errorHash, {
                firstSeen: now,
                count: 1
            });
        }

        // 检查是否达到错误阈值
        if (this.errorCounts[type] >= this.errorThresholds[type]) {
            const errorMessage = this.formatSystemErrorMessage(type, this.errorCounts[type], error);
            
            // 发送系统错误通知
            this.sendSystemErrorNotification(errorMessage).catch(err => {
                console.error('[通知系统] 发送系统错误通知失败:', err);
            });

            // 重置错误计数
            this.errorCounts[type] = 0;
        }
    }

    generateErrorHash(type, message) {
        // 简单的哈希生成方法
        return `${type}:${message}`.slice(0, 100);
    }

    async sendSystemErrorNotification(errorMessage) {
        const telegramSetting = this.db.setting.get('telegram');
        if (telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0) {
            try {
                // 添加特殊标记防止递归
                await this.sendNotification('系统错误', errorMessage, telegramSetting.chatIds, {
                    parse_mode: 'HTML',
                    priority: 'high',
                    isSystemErrorNotification: true  // 特殊标记
                });
            } catch (error) {
                // 只记录日志，不再尝试发送通知
                console.error('[通知系统] 发送系统错误通知时发生错误:', error);
                this.logError('notification', error);
            }
        }
    }

    formatSystemErrorMessage(type, count, error) {
        const timestamp = new Date().toLocaleString();
        const errorTypes = {
            initialization: '初始化',
            sending: '消息发送',
            bot: 'Bot',
            database: '数据库'
        };

        let content = `错误类型: ${errorTypes[type] || type}\n`;
        content += `错误次数: ${count}\n`;
        content += `最后错误: ${error.message}`;

        if (error.stack) {
            content += `\n\n错误堆栈:\n${error.stack.split('\n').slice(0, 3).join('\n')}`;
        }

        return this.formatMessage('系统错误', content, {
            timestamp,
            priority: 'high'
        });
    }

    /**
     * 统一的消息格式化方法
     * @param {string} type - 消息类型
     * @param {string} content - 消息内容
     * @param {Object} options - 格式化选项
     * @param {string} [options.timestamp] - 自定义时间戳
     * @param {Object} [options.errorDetails] - 错误详情（用于系统错误）
     * @param {string} [options.priority] - 消息优先级
     * @returns {string} 格式化后的消息
     */
    formatMessage(type, content, options = {}) {
        const timestamp = options.timestamp || new Date().toLocaleString();
        const icon = this.messageIcons[type] || '📝';
        
        let message = `${icon} ${type}\n\n`;
        
        // 处理系统错误消息
        if (type === '系统错误') {
            message += `${content}\n`;
            if (options.errorDetails) {
                message += `\n详细信息:\n${options.errorDetails}\n`;
            }
        } else {
            message += `${content}\n`;
        }
        
        // 添加时间戳
        message += `\n发送时间: ${timestamp}`;
        
        // 添加优先级标记（如果有）
        if (options.priority === 'high') {
            message = `❗️ 优先级: 高\n${message}`;
        }
        
        return message;
    }

    logSuccess(type, message, result) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            status: 'success',
            message,
            result
        };
        this.writeLog(logEntry);
    }

    logError(type, error) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            status: 'error',
            error: typeof error === 'string' ? error : {
                message: error.message,
                stack: error.stack,
                type: error.constructor.name
            }
        };
        this.writeLog(logEntry);
    }

    writeLog(logEntry) {
        const date = new Date();
        const logFile = path.join(this.logDir, `notification-${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}.log`);
        const logLine = JSON.stringify(logEntry) + '\n';

        fs.appendFile(logFile, logLine, (err) => {
            if (err) {
                console.error('[日志写入失败]', err);
            }
        });
    }

    /**
     * 系统健康检查
     */
    startHealthCheck() {
        setInterval(() => {
            this.performHealthCheck();
        }, this.systemState.healthCheckInterval);
    }

    async performHealthCheck() {
        try {
            // 检查数据库连接
            const dbCheck = await this.checkDatabaseConnection();
            
            // 检查 Bot 状态
            const botCheck = await this.checkBotStatus();
            
            // 更新系统状态
            const isCurrentlyHealthy = dbCheck && botCheck;
            
            // 如果状态发生变化，记录并通知
            if (this.systemState.isHealthy !== isCurrentlyHealthy) {
                this.systemState.isHealthy = isCurrentlyHealthy;
                
                if (!isCurrentlyHealthy) {
                    this.systemState.consecutiveFailures++;
                    if (this.systemState.consecutiveFailures >= this.systemState.maxConsecutiveFailures) {
                        // 发送系统不健康通知
                        this.handleSystemStateChange(false);
                    }
                } else {
                    // 系统恢复健康，重置失败计数
                    this.systemState.consecutiveFailures = 0;
                    this.handleSystemStateChange(true);
                }
            }
            
            this.systemState.lastHealthCheck = Date.now();
        } catch (error) {
            console.error('[通知系统] 健康检查失败:', error);
        }
    }

    async checkDatabaseConnection() {
        try {
            // 修改原因：findOne 方法不存在，改用正确的 get 方法
            // 修改内容：使用 setting.get 方法检查数据库连接
            // 注意事项：确保返回布尔值表示连接状态
            const result = this.db.setting.get('telegram');
            return true;
        } catch (error) {
            console.error('[通知系统] 数据库连接检查失败:', error);
            return false;
        }
    }

    async checkBotStatus() {
        try {
            if (!this.bot) return false;
            
            // 检查基本方法是否存在
            const hasRequiredMethods = typeof this.bot.sendMessage === 'function' || 
                                    (this.bot.funcs && typeof this.bot.funcs.notice === 'function');
            
            if (!hasRequiredMethods) {
                console.error('[通知系统] Bot 缺少必要的方法');
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('[通知系统] Bot 状态检查失败:', error);
            return false;
        }
    }

    async handleSystemStateChange(isHealthy) {
        const message = isHealthy ? 
            '系统已恢复正常运行' : 
            `系统状态异常\n连续失败次数: ${this.systemState.consecutiveFailures}\n上次正常检查: ${new Date(this.systemState.lastHealthCheck).toLocaleString()}`;
        
        // 使用特殊标记防止递归
        await this.sendNotification(
            '系统状态',
            message,
            this.db.setting.get('telegram')?.chatIds || [],
            { 
                priority: isHealthy ? 'normal' : 'high',
                isSystemHealthNotification: true  // 特殊标记
            }
        );
    }
}

// 修改导出方式
module.exports = function(svr) {
    const { db, bot } = svr.locals;
    if (!db) {
        throw new Error('NotificationManager requires a db instance');
    }
    
    // 创建通知管理器实例
    const notificationManager = new NotificationManager(db, bot);
    
    // 如果bot实例存在，立即设置
    if (bot) {
        notificationManager.setBot(bot);
    }
    
    // 监听bot实例变化
    Object.defineProperty(svr.locals, 'bot', {
        set: function(newBot) {
            if (newBot) {
                console.log('[通知系统] 检测到新的bot实例，正在更新...');
                notificationManager.setBot(newBot);
            }
        },
        get: function() {
            return bot;
        }
    });
    
    return notificationManager;
};