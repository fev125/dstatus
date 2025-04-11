"use strict";
const path = require('path');
const fs = require('fs');

/**
 * 数据库配置管理类
 * 统一管理数据库相关的路径和配置
 */
class DatabaseConfig {
    constructor() {
        // 基础配置
        this.BASE_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data');
        this.MAIN_DB = 'db.db';
        this.BACKUP_PREFIX = 'backup-';
        this.TEMP_PREFIX = 'temp-';

        // 初始化时验证路径
        this.validateAndCreatePaths();
    }

    /**
     * 获取所有数据库相关路径
     * @returns {Object} 包含所有相关路径的对象
     */
    getPaths() {
        return {
            base: this.BASE_PATH,
            main: path.join(this.BASE_PATH, this.MAIN_DB),
            backup: (timestamp) => path.join(this.BASE_PATH, 'backups', `${this.BACKUP_PREFIX}${timestamp}.db.db`),
            temp: (id) => path.join(this.BASE_PATH, 'temp', `${this.TEMP_PREFIX}${id}.db`),
            migration: path.join(this.BASE_PATH, 'migrations.json')
        };
    }

    /**
     * 验证并创建必要的目录
     */
    validateAndCreatePaths() {
        const paths = this.getPaths();
        const directories = [
            this.BASE_PATH,
            path.join(this.BASE_PATH, 'backups'),
            path.join(this.BASE_PATH, 'temp')
        ];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                try {
                    fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
                    console.log(`创建目录: ${dir}`);
                } catch (error) {
                    console.error(`创建目录失败 ${dir}: ${error.message}`);
                    // 尝试使用临时目录作为备选
                    try {
                        const tempDir = path.join(require('os').tmpdir(), 'dstatus', path.basename(dir));
                        fs.mkdirSync(tempDir, { recursive: true, mode: 0o777 });
                        console.log(`使用临时目录: ${tempDir}`);

                        // 更新路径
                        if (dir === this.BASE_PATH) {
                            this.BASE_PATH = path.join(require('os').tmpdir(), 'dstatus');
                        }
                    } catch (tempError) {
                        console.error(`创建临时目录也失败: ${tempError.message}`);
                        // 不抛出错误，而是继续运行，让应用程序尝试处理
                        console.warn('将继续运行，但某些功能可能不可用');
                    }
                }
            }
        });
    }

    /**
     * 验证数据库文件
     * @returns {boolean} 数据库文件是否存在且可访问
     */
    validateDatabase() {
        const paths = this.getPaths();
        const exists = fs.existsSync(paths.main);
        if (!exists) {
            console.warn(`数据库文件不存在: ${paths.main}`);
        }
        return exists;
    }

    /**
     * 清理临时文件
     * @param {number} maxAge 最大保留时间（毫秒）
     */
    cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) {
        try {
            const files = fs.readdirSync(this.BASE_PATH);
            const now = Date.now();

            files.forEach(file => {
                if (file.startsWith(this.TEMP_PREFIX) ||
                    (file.startsWith(this.BACKUP_PREFIX) && file.endsWith('.db.db'))) {
                    const filePath = path.join(this.BASE_PATH, file);
                    const stats = fs.statSync(filePath);

                    if (now - stats.mtimeMs > maxAge) {
                        fs.unlinkSync(filePath);
                        console.log(`清理过期文件: ${file}`);
                    }
                }
            });
        } catch (error) {
            console.error(`清理临时文件失败: ${error.message}`);
        }
    }

    /**
     * 获取数据库大小信息
     * @returns {Object} 包含数据库大小信息的对象
     */
    getDatabaseStats() {
        const paths = this.getPaths();
        try {
            const stats = fs.statSync(paths.main);
            return {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        } catch (error) {
            console.error(`获取数据库状态失败: ${error.message}`);
            return null;
        }
    }
}

// 导出单例实例
module.exports = new DatabaseConfig();