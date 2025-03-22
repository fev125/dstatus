/**
 * 重启管理模块
 * 提供系统重启相关的功能
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const RestartManager = {
    // 状态常量
    STATUS: {
        READY: 'ready',           // 准备就绪
        PREPARING: 'preparing',    // 准备重启
        RESTARTING: 'restarting', // 重启中
        FAILED: 'failed'          // 重启失败
    },

    // 当前状态
    currentStatus: 'ready',
    
    // 状态锁，防止重复重启
    restartLock: false,

    // 事件监听器
    listeners: new Set(),

    // 注册状态变更监听器
    onStatusChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },

    // 状态变更通知
    notifyStatusChange(status, details = {}) {
        this.currentStatus = status;
        this.listeners.forEach(listener => listener(status, details));
    },

    // 检测运行环境
    detectEnvironment() {
        if (process.env.DOCKER) return 'docker';
        if (process.env.PM2_HOME) return 'pm2';
        if (process.env.FOREVER_ROOT) return 'forever';
        if (process.env.NODE_ENV === 'development') return 'development';
        
        try {
            if (process.env.npm_lifecycle_script?.includes('nodemon')) return 'nodemon';
        } catch (e) {}
        
        return 'unknown';
    },

    // 资源清理
    async cleanup() {
        const cleanupTasks = [];

        // 1. 数据库连接清理
        if (global.db && global.db.DB) {
            cleanupTasks.push(
                new Promise((resolve) => {
                    try {
                        global.db.DB.close();
                        console.log('数据库连接已关闭');
                        resolve();
                    } catch (err) {
                        console.error('关闭数据库连接失败:', err);
                        resolve();
                    }
                })
            );
        }

        // 2. 定时任务清理
        if (global.schedule && global.schedule.scheduledJobs) {
            cleanupTasks.push(
                new Promise((resolve) => {
                    try {
                        Object.values(global.schedule.scheduledJobs)
                              .forEach(job => job.cancel());
                        console.log('定时任务已清理');
                        resolve();
                    } catch (err) {
                        console.error('清理定时任务失败:', err);
                        resolve();
                    }
                })
            );
        }

        // 3. 临时文件清理
        cleanupTasks.push(
            new Promise((resolve) => {
                const tempDir = path.join(process.cwd(), 'database');
                fs.readdir(tempDir, (err, files) => {
                    if (err) {
                        console.error('读取临时目录失败:', err);
                        return resolve();
                    }
                    
                    files.filter(f => f.startsWith('temp-'))
                         .forEach(f => {
                             try {
                                 fs.unlinkSync(path.join(tempDir, f));
                             } catch (e) {
                                 console.error('删除临时文件失败:', e);
                             }
                         });
                    resolve();
                });
            })
        );

        await Promise.all(cleanupTasks);
    },

    // 触发文件变更（用于 nodemon 环境）
    async triggerChange() {
        const triggerFile = path.join(process.cwd(), 'nekonekostatus.js');
        const backupFile = path.join(process.cwd(), '.backup-main.js');
        
        try {
            // 1. 备份主文件
            if (fs.existsSync(triggerFile)) {
                fs.copyFileSync(triggerFile, backupFile);
            }
            
            // 2. 添加一个空行到文件末尾
            fs.appendFileSync(triggerFile, '\n// ' + new Date().toISOString() + '\n');
            
            // 3. 等待 nodemon 检测到变化
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 4. 恢复原始文件
            if (fs.existsSync(backupFile)) {
                fs.copyFileSync(backupFile, triggerFile);
                fs.unlinkSync(backupFile);
            }
            
            return true;
        } catch (e) {
            console.error('触发重启失败:', e);
            // 确保清理备份文件
            try {
                if (fs.existsSync(backupFile)) {
                    fs.copyFileSync(backupFile, triggerFile);
                    fs.unlinkSync(backupFile);
                }
            } catch {}
            return false;
        }
    },

    // 执行重启
    async restart() {
        // 防止重复重启
        if (this.restartLock) {
            throw new Error('重启已在进行中');
        }
        
        this.restartLock = true;
        
        try {
            // 1. 准备阶段
            this.notifyStatusChange(this.STATUS.PREPARING);
            await this.cleanup();

            // 2. 重启阶段
            this.notifyStatusChange(this.STATUS.RESTARTING);
            
            // 确保响应已发送
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 3. 根据环境执行不同的重启策略
            const env = this.detectEnvironment();
            console.log('当前运行环境:', env);
            
            switch (env) {
                case 'nodemon':
                    // 先触发文件变更，然后正常退出
                    await this.triggerChange();
                    // 使用 SIGTERM 信号退出，这样 nodemon 会自动重启
                    process.kill(process.pid, 'SIGTERM');
                    break;
                    
                case 'pm2':
                    exec('pm2 restart nekonekostatus', (error) => {
                        if (error) {
                            console.error('PM2重启失败:', error);
                            process.exit(1);
                        }
                    });
                    break;
                    
                case 'forever':
                    exec('forever restart nekonekostatus.js', (error) => {
                        if (error) {
                            console.error('Forever重启失败:', error);
                            process.exit(1);
                        }
                    });
                    break;
                    
                case 'development':
                    // 开发环境下使用 SIGTERM 信号
                    process.kill(process.pid, 'SIGTERM');
                    break;
                    
                default:
                    // 其他环境使用 SIGTERM 信号
                    process.kill(process.pid, 'SIGTERM');
            }

        } catch (error) {
            this.notifyStatusChange(this.STATUS.FAILED, { error });
            this.restartLock = false;
            throw error;
        }
    }
};

module.exports = function(app) {
    // 添加健康检查端点
    app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // 导出 RestartManager 供其他模块使用
    app.locals.RestartManager = RestartManager;
}; 