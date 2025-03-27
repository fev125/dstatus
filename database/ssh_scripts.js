"use strict"
module.exports=(DB)=>{
// 使用简化的表结构，与现有数据库兼容
DB.prepare("CREATE TABLE IF NOT EXISTS ssh_scripts (id,name,content,PRIMARY KEY(id))").run();

// 检查表结构，输出调试信息
try {
    const tableInfo = DB.prepare("PRAGMA table_info(ssh_scripts)").all();
    console.log('[数据库] SSH脚本表结构:', tableInfo);
} catch (error) {
    console.error('[数据库] 获取表结构失败:', error);
}
const ssh_scripts={
    ins(id,name,content){this._ins.run({id,name,content})},_ins: DB.prepare("INSERT INTO ssh_scripts (id,name,content) VALUES (@id,@name,@content)"),
    get(id){return this._get.get(id);},_get:DB.prepare("SELECT * FROM ssh_scripts WHERE id=? LIMIT 1"),
    upd(id,name,content){this._upd.run({id,name,content});},_upd:DB.prepare("UPDATE ssh_scripts set name=@name,content=@content WHERE id=@id"),
    del(id){this._del.run(id)},_del:DB.prepare("DELETE FROM ssh_scripts WHERE id=?"),
    all(all=1){return all?this._all.all():this._all.get()},_all:DB.prepare("SELECT * FROM ssh_scripts"),
};
return {
    ssh_scripts
};
}