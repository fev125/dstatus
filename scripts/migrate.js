/**
 * 数据库迁移执行脚本
 * 用于将迁移应用到实际数据库
 */

const Database = require('better-sqlite3');
const path = require('path');
const DatabaseMigration = require('../database/migrations');
const AddGroupField = require('../database/migrations/scripts/002_add_group_field');

async function migrate() {
    console.log('Starting database migration...');
    
    try {
        // 连接实际数据库
        const dbPath = path.join(__dirname, '../database/db.db');
        const db = new Database(dbPath);
        console.log('Connected to database:', dbPath);

        // 初始化迁移管理器
        const migration = new DatabaseMigration(db);
        await migration.init();
        
        // 注册迁移脚本
        migration.register(
            AddGroupField.version,
            AddGroupField.name,
            AddGroupField.up,
            AddGroupField.down
        );
        
        // 执行迁移
        await migration.migrate();
        
        // 验证迁移结果
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'").all();
        console.log('\nVerification results:');
        console.log('- Groups table exists:', tables.length > 0);
        
        if (tables.length > 0) {
            const defaultGroup = db.prepare("SELECT * FROM groups WHERE id = 'default'").get();
            console.log('- Default group exists:', !!defaultGroup);
            
            const columns = db.prepare("PRAGMA table_info(servers)").all();
            const hasGroupId = columns.some(col => col.name === 'group_id');
            console.log('- Group_id field exists:', hasGroupId);
            
            if (hasGroupId) {
                const servers = db.prepare("SELECT COUNT(*) as count FROM servers WHERE group_id IS NULL").get();
                console.log('- Servers without group:', servers.count);
            }
        }
        
        // 关闭数据库连接
        db.close();
        
        console.log('\nMigration completed successfully!');
    } catch (error) {
        console.error('\nMigration failed:', error);
        process.exit(1);
    }
}

// 执行迁移
migrate(); 