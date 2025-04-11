"use strict";
const Database = require("better-sqlite3");
const dbConfig = require("./config");
const fs = require("fs");
const path = require("path");

module.exports = (conf = {}) => {
    // 获取数据库路径
    const paths = dbConfig.getPaths();

    // 输出详细的数据库目录信息
    console.log('=== 数据库初始化 ===');
    console.log('数据库主目录:', paths.base);
    console.log('数据库文件路径:', paths.main);
    console.log('备份目录:', path.join(paths.base, 'backups'));
    console.log('临时目录:', path.join(paths.base, 'temp'));

    // 检查目录权限
    try {
        const testFile = path.join(paths.base, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('目录写入测试: 成功');
    } catch (err) {
        console.error('目录写入测试: 失败 -', err.message);
        console.warn('请检查目录权限或使用 fix-docker-permissions.sh 脚本修复权限问题');
    }

    var DB = new Database(paths.main);

    try {
        const dbInfo = fs.statSync(paths.main);
        console.log('数据库文件信息:', {
            size: dbInfo.size,
            lastModified: dbInfo.mtime
        });
    } catch (err) {
        console.error('获取数据库信息错误:', err);
    }

    // 初始化数据库表结构
    function initDatabase() {
        // 创建服务器表
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS servers (
                sid TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                data TEXT NOT NULL,
                top INTEGER DEFAULT 0,
                status INTEGER DEFAULT 1,
                expire_time INTEGER,
                group_id TEXT DEFAULT 'default'
            )
        `).run();

        // 创建分组表
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                top INTEGER DEFAULT 0
            )
        `).run();

        // 创建流量统计表
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS traffic (
                sid TEXT PRIMARY KEY,
                hs TEXT,
                ds TEXT,
                ms TEXT
            )
        `).run();

        // 创建负载统计表（分钟级）
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS load_m (
                sid TEXT,
                cpu REAL,
                mem REAL,
                swap REAL,
                ibw REAL,
                obw REAL,
                expire_time INTEGER,
                PRIMARY KEY(sid)
            )
        `).run();

        // 创建负载统计表（小时级）
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS load_h (
                sid TEXT,
                cpu REAL,
                mem REAL,
                swap REAL,
                ibw REAL,
                obw REAL,
                expire_time INTEGER,
                PRIMARY KEY(sid)
            )
        `).run();

        // 创建SSH脚本表 - 使用简化结构与现有数据库兼容
        DB.prepare("CREATE TABLE IF NOT EXISTS ssh_scripts (id,name,content,PRIMARY KEY(id))").run();

        // 输出调试信息
        try {
            const tableInfo = DB.prepare("PRAGMA table_info(ssh_scripts)").all();
            console.log('[数据库初始化] SSH脚本表结构:', tableInfo);
        } catch (error) {
            console.error('[数据库初始化] 获取表结构失败:', error);
        }

        // 创建设置表
        DB.prepare(`
            CREATE TABLE IF NOT EXISTS setting (
                key TEXT PRIMARY KEY,
                val TEXT
            )
        `).run();

        // 检查并创建默认分组
        const defaultGroup = DB.prepare("SELECT * FROM groups WHERE id = 'default'").get();
        if (!defaultGroup) {
            DB.prepare("INSERT INTO groups (id, name, top) VALUES ('default', '默认分组', 0)").run();
        }
    }

    // 执行初始化
    initDatabase();

    const {servers} = require("./servers")(DB),
          autodiscovery = require("./autodiscovery")(DB),
        {traffic, lt} = require("./traffic")(DB),
        {load_m, load_h} = require("./load")(DB),
        {ssh_scripts} = require("./ssh_scripts")(DB),
        {setting} = require("./setting")(DB),
        {groups} = require("./groups")(DB);

    function getServers() { return servers.all(); }

    // 全局设置存储函数
    function set(key, value) {
        if (key === 'setting') {
            // 将整个设置对象保存，更新各个配置项
            for (const [settingKey, settingValue] of Object.entries(value)) {
                setting.set(settingKey, settingValue);
            }
            return;
        }

        // 处理其他键值存储
        if (setting && typeof setting.set === 'function') {
            setting.set(key, value);
        } else {
            console.error(`[数据库] 无法保存设置: ${key}, setting对象不可用`);
        }
    }

    return {
        DB,
        servers, getServers,
        traffic, lt,
        load_m, load_h,
        ssh_scripts,
        autodiscovery,
        setting,
        groups,
        // 导出配置实例以供其他模块使用
        config: dbConfig,
        // 添加全局设置函数
        set
    };
}