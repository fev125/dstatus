"use strict";
/**
 * 版本号更新脚本
 * 用于更新数据库中的版本号设置
 * 使用方法: node update-version.js [版本号]
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// 获取命令行参数
const args = process.argv.slice(2);
const newVersion = args[0] || "2.5.0"; // 默认版本号

// 数据库路径
const dbPath = path.join(process.cwd(), "data", "db.db");

// 检查数据库文件是否存在
if (!fs.existsSync(dbPath)) {
    console.error(`错误: 数据库文件不存在: ${dbPath}`);
    console.log("请确保应用程序已正确安装并运行过");
    process.exit(1);
}

try {
    // 连接数据库
    const db = new Database(dbPath);
    
    // 检查setting表是否存在
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='setting'").get();
    if (!tableExists) {
        console.error("错误: 数据库中没有setting表");
        process.exit(1);
    }
    
    // 检查是否已存在版本号设置
    const existingVersion = db.prepare("SELECT val FROM setting WHERE key='version'").get();
    
    if (existingVersion) {
        // 更新版本号
        console.log(`更新版本号: ${JSON.parse(existingVersion.val)} -> ${newVersion}`);
        db.prepare("UPDATE setting SET val=? WHERE key='version'").run(JSON.stringify(newVersion));
    } else {
        // 插入版本号
        console.log(`设置版本号: ${newVersion}`);
        db.prepare("INSERT INTO setting (key, val) VALUES (?, ?)").run("version", JSON.stringify(newVersion));
    }
    
    console.log("版本号更新成功!");
    
    // 关闭数据库连接
    db.close();
} catch (error) {
    console.error(`更新版本号时出错: ${error.message}`);
    process.exit(1);
}
