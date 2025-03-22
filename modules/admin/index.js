const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const schedule = require('node-schedule');

// 格式化时间为人类可读格式
function formatDateTime(date = new Date()) {
    return date.toISOString().replace(/[T:]/g, '-').slice(0, 19);
}

module.exports = function(svr, db) {
    if (!db || !db.config) {
        console.error('[Admin模块] 数据库配置未正确初始化');
        return;
    }

    const { pr } = svr.locals;
    const dbConfig = db.config;  // 获取数据库配置实例
    
    // 数据库备份
    router.get('/db/backup', async (req, res) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const paths = dbConfig.getPaths();
        const backupPath = paths.backup(timestamp);
        
        console.log('===== 数据库备份开始 =====');
        console.log('时间:', new Date().toLocaleString());
        console.log('用户IP:', req.ip);
        console.log('备份路径:', backupPath);
        
        try {
            // 获取原始数据库大小
            const dbStats = dbConfig.getDatabaseStats();
            console.log('原始数据库大小:', (dbStats.size / 1024 / 1024).toFixed(2) + 'MB');

            // 创建备份
            console.log('开始创建备份文件...');
            await db.DB.backup(backupPath);
            
            // 获取备份文件大小
            const backupSize = fs.statSync(backupPath).size;
            console.log('备份文件创建成功');
            console.log('备份文件大小:', (backupSize / 1024 / 1024).toFixed(2) + 'MB');

            // 发送文件并在发送后删除
            console.log('开始发送备份文件...');
            res.download(backupPath, `dstatus-backup-${timestamp}.db.db`, (err) => {
                if (err) {
                    console.error('下载过程出错:', err);
                    console.log('===== 数据库备份失败 =====\n');
                } else {
                    console.log('文件发送成功');
                    console.log('===== 数据库备份完成 =====\n');
                }
                // 删除临时文件
                fs.unlink(backupPath, (unlinkErr) => {
                    if (unlinkErr) {
                        console.error('清理临时文件失败:', unlinkErr);
                    } else {
                        console.log('临时文件已清理:', backupPath);
                    }
                });
            });
        } catch (error) {
            console.error('备份过程出错:', error);
            console.log('===== 数据库备份失败 =====\n');
            res.status(500).json(pr(0, '备份失败: ' + error.message));
        }
    });

    // 数据库恢复
    router.post('/db/restore', async (req, res) => {
        const paths = dbConfig.getPaths();
        
        try {
            // 检查文件上传
            if (!req.files || !req.files.database) {
                return res.json(pr(0, "请选择数据库文件"));
            }
            
            const file = req.files.database;
            if (!file.name.endsWith('.db')) {
                return res.json(pr(0, "请上传.db格式的数据库文件"));
            }
            
            if (file.size === 0) {
                return res.json(pr(0, "上传的文件为空"));
            }
            
            const backupPath = paths.backup(formatDateTime());
            
            // 确保临时文件存在
            if (!file.tempFilePath || !fs.existsSync(file.tempFilePath)) {
                const tempPath = paths.temp(Date.now());
                await file.mv(tempPath);
                file.tempFilePath = tempPath;
            }

            // 验证上传的文件
            let testDb;
            try {
                testDb = new Database(file.tempFilePath, { verbose: console.log });
                // 验证表结构等...
                testDb.close();
            } catch (error) {
                if (testDb) testDb.close();
                throw new Error('数据库验证失败: ' + error.message);
            }

            // 备份当前数据库
            fs.copyFileSync(paths.main, backupPath);
            console.log('已创建当前数据库备份:', backupPath);

            // 替换数据库文件
            fs.copyFileSync(file.tempFilePath, paths.main);
            console.log('已替换数据库文件');

            res.json(pr(1, "数据库恢复成功，请手动重启系统以使更改生效"));

        } catch (error) {
            console.error('恢复过程出错:', error);
            // 如果出错，尝试恢复备份
            const backupPath = paths.backup(formatDateTime());
            if (fs.existsSync(backupPath)) {
                try {
                    fs.copyFileSync(backupPath, paths.main);
                    console.log('已恢复到备份数据库');
                } catch (restoreError) {
                    console.error('恢复备份失败:', restoreError);
                }
            }
            res.json(pr(0, error.message));
        }
    });

    // 定期清理临时文件（每天凌晨执行）
    schedule.scheduleJob('0 0 * * *', () => {
        dbConfig.cleanupTempFiles();
    });

    // 管理页面路由
    // 自动发现管理页面
    router.get('/autodiscovery', (req, res) => {
        if (!req.admin) return res.redirect('/login');
        res.render('admin/autodiscovery', {
            groups: svr.locals.db.groups.all()
        });
    });
    
    // SSH脚本管理页面
    router.get('/ssh_scripts', (req, res) => {
        if (!req.admin) return res.redirect('/login');
        try {
            const scripts = svr.locals.db.ssh_scripts.all();
            res.render('admin/ssh_scripts', { ssh_scripts: scripts });
        } catch (error) {
            console.error('[SSH脚本] 获取脚本列表失败:', error);
            res.status(500).send('获取脚本列表失败');
        }
    });
    
    // 通知日志路由
    router.get('/notification-logs', async (req, res) => {
        if (!req.admin) return res.json({ code: 0, msg: '未授权的访问' });

        const month = req.query.month;
        const type = req.query.type || 'all';
        const logDir = path.join(__dirname, '../../data/logs');
        const logFile = path.join(logDir, `notification-${month}.log`);

        try {
            if (!fs.existsSync(logFile)) {
                return res.json([]);
            }

            const content = fs.readFileSync(logFile, 'utf8');
            const logs = content.split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .filter(log => type === 'all' || log.status === type)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            res.json(logs);
        } catch (error) {
            console.error('读取通知日志失败:', error);
            res.status(500).json({ error: '读取日志失败' });
        }
    });

    // 通知日志页面路由
    router.get('/notification-logs-page', (req, res) => {
        if (!req.admin) return res.redirect('/login');
        res.render('admin/notification_logs');
    });

    // 确保路由正确注册到Express应用
    svr.use('/admin', router);
    
    // 直接添加路由，以防router中间件不生效
    svr.get('/admin/notification-logs-page', (req, res) => {
        if (!req.admin) return res.redirect('/login');
        res.render('admin/notification_logs');
    });
    
    svr.get('/admin/autodiscovery', (req, res) => {
        if (!req.admin) return res.redirect('/login');
        res.render('admin/autodiscovery', {
            groups: svr.locals.db.groups.all()
        });
    });
};