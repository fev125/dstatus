/**
 * 数据库迁移测试脚本
 */

const Database = require('better-sqlite3');
const DatabaseMigration = require('../database/migrations');
const AddGroupField = require('../database/migrations/scripts/002_add_group_field');

async function runTest() {
    console.log('Starting migration test...');
    
    try {
        // 创建测试数据库连接
        const db = new Database(':memory:'); // 使用内存数据库进行测试
        
        // 创建初始表结构
        db.prepare(`
            CREATE TABLE IF NOT EXISTS servers (
                sid TEXT PRIMARY KEY,
                name TEXT,
                data TEXT,
                top INTEGER,
                status INTEGER,
                expire_time INTEGER
            )
        `).run();
        
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
        
        console.log('\n=== Testing migrations up ===');
        // 执行迁移
        await migration.migrate();
        
        // 验证分组表是否创建
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'").all();
        console.log('Groups table exists:', tables.length > 0);
        
        // 验证默认分组是否创建
        const defaultGroup = db.prepare("SELECT * FROM groups WHERE id = 'default'").get();
        console.log('Default group exists:', !!defaultGroup);
        
        // 验证服务器表是否有分组字段
        const columns = db.prepare("PRAGMA table_info(servers)").all();
        const hasGroupId = columns.some(col => col.name === 'group_id');
        console.log('Group_id field exists:', hasGroupId);
        
        console.log('\n=== Testing migrations down ===');
        // 测试回滚
        await migration.rollback(0);
        
        // 验证分组表是否删除
        const tablesAfterRollback = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'").all();
        console.log('Groups table exists after rollback:', tablesAfterRollback.length > 0);
        
        // 验证服务器表是否还有分组字段
        const columnsAfterRollback = db.prepare("PRAGMA table_info(servers)").all();
        const hasGroupIdAfterRollback = columnsAfterRollback.some(col => col.name === 'group_id');
        console.log('Group_id field exists after rollback:', hasGroupIdAfterRollback);
        
        // 关闭数据库连接
        db.close();
        
        console.log('\nMigration test completed successfully!');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

// 运行测试
runTest(); 