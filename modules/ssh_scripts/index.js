"use strict"
module.exports = (svr) => {
    const { db } = svr.locals;
    
    // 获取所有脚本
    svr.get('/admin/ssh_scripts', (req, res) => {
        try {
            const scripts = db.ssh_scripts.all();
            res.render('admin/ssh_scripts.html', { ssh_scripts: scripts });
        } catch (error) {
            console.error('[SSH脚本] 获取脚本列表失败:', error);
            res.status(500).send('获取脚本列表失败');
        }
    });

    // 获取单个脚本
    svr.post('/admin/ssh_scripts/get', (req, res) => {
        try {
            const script = db.ssh_scripts.get(req.body.id);
            if (!script) {
                res.json({ status: false, data: '脚本不存在' });
                return;
            }
            res.json({ status: true, data: script });
        } catch (error) {
            console.error('[SSH脚本] 获取脚本详情失败:', error);
            res.json({ status: false, data: '获取脚本详情失败' });
        }
    });

    // 添加脚本
    svr.post('/admin/ssh_scripts/add', (req, res) => {
        try {
            const { name, content } = req.body;
            
            // 参数完整性验证
            if (!name || !content) {
                const error = {
                    message: '参数不完整',
                    details: {
                        name: name ? '已提供' : '缺失',
                        content: content ? '已提供' : '缺失'
                    }
                };
                console.error('[SSH脚本] 添加失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            // 参数格式验证
            if (typeof name !== 'string' || typeof content !== 'string') {
                const error = {
                    message: '参数格式错误',
                    details: {
                        name: `期望类型: string, 实际类型: ${typeof name}`,
                        content: `期望类型: string, 实际类型: ${typeof content}`
                    }
                };
                console.error('[SSH脚本] 添加失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            // 参数内容验证
            if (name.trim().length === 0 || content.trim().length === 0) {
                const error = {
                    message: '脚本名称和内容不能为空',
                    details: {
                        name: name.trim().length === 0 ? '为空' : '有效',
                        content: content.trim().length === 0 ? '为空' : '有效'
                    }
                };
                console.error('[SSH脚本] 添加失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            // 生成唯一ID
            const id = Date.now().toString();
            
            // 记录操作日志
            console.log('[SSH脚本] 准备添加新脚本:', {
                id: id,
                name: name,
                contentLength: content.length
            });
            
            try {
                // 保存到数据库
                db.ssh_scripts.ins(id, name.trim(), content.trim());
                
                // 验证保存结果
                const saved = db.ssh_scripts.get(id);
                if (!saved) {
                    throw new Error('数据库保存失败：无法验证保存结果');
                }
                
                // 记录成功日志
                console.log('[SSH脚本] 添加成功:', { 
                    id: id, 
                    name: name,
                    saved: true
                });
                
                res.json({ 
                    status: true, 
                    data: '添加成功',
                    details: { id: id }
                });
            } catch (dbError) {
                // 数据库操作错误
                console.error('[SSH脚本] 数据库操作失败:', dbError);
                res.json({ 
                    status: false, 
                    data: '数据库操作失败',
                    details: dbError.message
                });
            }
        } catch (error) {
            // 详细错误日志
            console.error('[SSH脚本] 添加失败:', error);
            res.json({ 
                status: false, 
                data: '添加脚本失败',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    // 更新脚本
    svr.post('/admin/ssh_scripts/upd', (req, res) => {
        try {
            const { id, name, content } = req.body;
            
            // 参数完整性验证
            if (!id || !name || !content) {
                const error = {
                    message: '参数不完整',
                    details: {
                        id: id ? '已提供' : '缺失',
                        name: name ? '已提供' : '缺失',
                        content: content ? '已提供' : '缺失'
                    }
                };
                console.error('[SSH脚本] 更新失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            // 参数格式验证
            if (typeof id !== 'string' || typeof name !== 'string' || typeof content !== 'string') {
                const error = {
                    message: '参数格式错误',
                    details: {
                        id: `期望类型: string, 实际类型: ${typeof id}`,
                        name: `期望类型: string, 实际类型: ${typeof name}`,
                        content: `期望类型: string, 实际类型: ${typeof content}`
                    }
                };
                console.error('[SSH脚本] 更新失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            // 参数内容验证
            if (id.trim().length === 0 || name.trim().length === 0 || content.trim().length === 0) {
                const error = {
                    message: '参数内容不能为空',
                    details: {
                        id: id.trim().length === 0 ? '为空' : '有效',
                        name: name.trim().length === 0 ? '为空' : '有效',
                        content: content.trim().length === 0 ? '为空' : '有效'
                    }
                };
                console.error('[SSH脚本] 更新失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            // 检查脚本是否存在
            const existing = db.ssh_scripts.get(id);
            if (!existing) {
                const error = {
                    message: '脚本不存在',
                    details: { id: id }
                };
                console.error('[SSH脚本] 更新失败:', error);
                res.json({ 
                    status: false, 
                    data: error.message,
                    details: JSON.stringify(error.details)
                });
                return;
            }
            
            try {
                // 更新数据库
                db.ssh_scripts.upd(id, name.trim(), content.trim());
                
                // 验证更新结果
                const updated = db.ssh_scripts.get(id);
                if (!updated || updated.name !== name.trim() || updated.content !== content.trim()) {
                    throw new Error('数据库更新失败：更新结果验证失败');
                }
                
                // 记录成功日志
                console.log('[SSH脚本] 更新成功:', { 
                    id: id, 
                    name: name,
                    updated: true
                });
                
                res.json({ 
                    status: true, 
                    data: '更新成功',
                    details: { id: id }
                });
            } catch (dbError) {
                // 数据库操作错误
                console.error('[SSH脚本] 数据库操作失败:', dbError);
                res.json({ 
                    status: false, 
                    data: '数据库操作失败',
                    details: dbError.message
                });
            }
        } catch (error) {
            // 详细错误日志
            console.error('[SSH脚本] 更新失败:', error);
            res.json({ 
                status: false, 
                data: '更新脚本失败',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    // 删除脚本
    svr.post('/admin/ssh_scripts/del', (req, res) => {
        try {
            const { id } = req.body;
            if (!id) {
                res.json({ status: false, data: '参数不完整' });
                return;
            }
            db.ssh_scripts.del(id);
            res.json({ status: true, data: '删除成功' });
        } catch (error) {
            console.error('[SSH脚本] 删除脚本失败:', error);
            res.json({ status: false, data: '删除脚本失败' });
        }
    });
};