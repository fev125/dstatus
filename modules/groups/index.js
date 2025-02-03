/**
 * 分组管理路由模块
 * 提供分组管理的Web接口
 */
"use strict"
const uuid = require('uuid');

module.exports = svr => {
    const {db, pr} = svr.locals;
    
    // 分组列表页面
    svr.get("/admin/groups", (req, res) => {
        res.render("admin/groups", {
            groups: db.groups.getWithCount()
        });
    });
    
    // 添加分组
    svr.post("/admin/groups/add", (req, res) => {
        const {name} = req.body;
        const id = uuid.v4();
        const top = Date.now();
        
        try {
            db.groups.ins(id, name, top);
            res.json(pr(1, "添加成功"));
        } catch (error) {
            res.json(pr(0, "添加失败"));
        }
    });
    
    // 编辑分组
    svr.post("/admin/groups/:id/edit", (req, res) => {
        const {id} = req.params;
        const {name} = req.body;
        
        try {
            const group = db.groups.get(id);
            if (!group) {
                return res.json(pr(0, "分组不存在"));
            }
            
            db.groups.upd(id, name, group.top);
            res.json(pr(1, "修改成功"));
        } catch (error) {
            res.json(pr(0, "修改失败"));
        }
    });
    
    // 删除分组
    svr.post("/admin/groups/:id/del", (req, res) => {
        const {id} = req.params;
        
        try {
            // 检查是否为默认分组
            if (id === 'default') {
                return res.json(pr(0, "默认分组不能删除"));
            }
            
            // 将该分组的服务器移动到默认分组
            db.DB.prepare("UPDATE servers SET group_id = 'default' WHERE group_id = ?").run(id);
            
            // 删除分组
            db.groups.del(id);
            res.json(pr(1, "删除成功"));
        } catch (error) {
            res.json(pr(0, "删除失败"));
        }
    });
    
    // 保存分组排序
    svr.post("/admin/groups/order", (req, res) => {
        try {
            const {groups} = req.body;
            console.log('Received group order request:', groups); // 添加日志
            
            if (!Array.isArray(groups)) {
                console.error('Invalid groups data:', groups); // 添加日志
                return res.json(pr(0, '无效的分组列表'));
            }
            
            if (groups.length === 0) {
                console.error('Empty groups array'); // 添加日志
                return res.json(pr(0, '分组列表不能为空'));
            }
            
            // 验证所有分组是否存在
            for (const id of groups) {
                const group = db.groups.get(id);
                if (!group) {
                    console.error(`Group not found: ${id}`); // 添加日志
                    return res.json(pr(0, `分组 ${id} 不存在`));
                }
            }
            
            // 更新排序 - 注意这里使用数组长度作为基数，保持降序排序
            const baseOrder = Date.now(); // 使用时间戳作为基数，确保顺序正确
            groups.forEach((id, index) => {
                const group = db.groups.get(id);
                const newOrder = baseOrder - index;
                console.log(`Updating group ${id} order to ${newOrder}`); // 添加日志
                db.groups.upd(id, group.name, newOrder);
            });
            
            console.log('Group order updated successfully'); // 添加日志
            res.json(pr(1, "排序已保存"));
        } catch (error) {
            console.error('更新分组排序失败:', error);
            res.json(pr(0, '排序保存失败: ' + error.message));
        }
    });
};