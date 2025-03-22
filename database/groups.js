/**
 * 分组管理数据库模块
 * 提供分组的基本CRUD操作和统计功能
 */
"use strict"
module.exports=(DB)=>{
    const groups = {
        _ins: DB.prepare("INSERT INTO groups (id, name, top) VALUES (@id, @name, @top)"),
        ins(id, name, top = 0) {
            this._ins.run({id, name, top});
        },
        
        _get: DB.prepare("SELECT * FROM groups WHERE id = ?"),
        get(id) {
            return this._get.get(id);
        },
        
        _upd: DB.prepare("UPDATE groups SET name = ?, top = ? WHERE id = ?"),
        upd(id, name, top) {
            this._upd.run(name, top, id);
        },
        
        _del: DB.prepare("DELETE FROM groups WHERE id = ?"),
        del(id) {
            if (id === 'default') {
                throw new Error('不能删除默认分组');
            }
            // 将该分组的服务器移动到默认分组
            DB.prepare("UPDATE servers SET group_id = 'default' WHERE group_id = ?").run(id);
            this._del.run(id);
        },
        
        _all: DB.prepare("SELECT * FROM groups ORDER BY top DESC"),
        all() {
            return this._all.all();
        },
        
        // 获取分组及其服务器数量
        _getWithCount: DB.prepare(`
            SELECT g.*, COUNT(s.sid) as server_count 
            FROM groups g 
            LEFT JOIN servers s ON g.id = s.group_id 
            GROUP BY g.id 
            ORDER BY g.top DESC
        `),
        getWithCount() {
            return this._getWithCount.all();
        }
    };
    return {groups};
}; 