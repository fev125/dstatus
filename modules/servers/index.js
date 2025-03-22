"use strict";
const {initServer,updateServer}=require("./func"),
    ssh=require("../../ssh"),
    uuid = require('uuid');
module.exports=svr=>{
const {db,setting,pr,parseNumber}=svr.locals;
svr.post("/admin/servers/add",async(req,res)=>{
    try {
        const {
            sid,
            name,
            data,
            top,
            status,
            expire_time,
            group_id,
            traffic_limit,
            traffic_reset_day,
            traffic_alert_percent,
            traffic_calibration_date,
            traffic_calibration_value
        } = req.body;

        // 验证必要字段
        if (!name) {
            return res.json(pr(0, '服务器名称不能为空'));
        }

        // 生成服务器ID（如果未提供）
        const serverSid = sid || uuid.v1();

        // 添加服务器记录
        db.servers.ins(
            serverSid,
            name,
            data,
            top || 0,
            status || 1,
            expire_time || null,
            group_id || 'default',
            {
                traffic_limit,
                traffic_reset_day,
                traffic_alert_percent,
                traffic_calibration_date,
                traffic_calibration_value
            }
        );

        // 获取服务器IP地址
        const serverData = typeof data === 'string' ? JSON.parse(data) : data;
        const ip = serverData.ip || serverData.ssh?.host;

        // 如果有IP地址，尝试获取IP国家信息
        if (ip && svr.locals.stats && svr.locals.stats.ipLocationService) {
            try {
                console.log(`[${new Date().toISOString()}] 新增服务器，正在获取IP位置信息: ${name} (${ip})`);
                
                // 获取服务器完整信息
                const server = db.servers.get(serverSid);
                
                // 调用IP位置服务更新位置信息
                await svr.locals.stats.ipLocationService.updateServerLocation(server, db);
                
                console.log(`[${new Date().toISOString()}] 服务器IP位置信息获取完成: ${name} (${ip})`);
            } catch (locationError) {
                console.error(`[${new Date().toISOString()}] 获取服务器IP位置信息失败: ${name} (${ip})`, locationError);
                // 获取位置信息失败不影响服务器添加
            }
        }

        res.json(pr(1, serverSid));
    } catch (error) {
        console.error('添加服务器失败:', error);
        res.json(pr(0, '添加失败: ' + error.message));
    }
});
svr.get("/admin/servers/add",(req,res)=>{
    res.render(`admin/servers/add`,{});
});
/**
 * @description 修改服务器编辑API端点，在修改服务器时获取IP国家图标
 * 1. 为什么要修改：需要在修改服务器时自动获取IP国家图标
 * 2. 修改了什么：在更新服务器后，调用IP位置服务获取国家信息
 * 3. 可能的影响：服务器修改时会自动获取国家图标，提高用户体验
 * @modified 2023-11-15
 */
svr.post("/admin/servers/:sid/edit",async(req,res)=>{
    try {
        const {sid} = req.params;
        const {
            name, data, top, status, expire_time, group_id,
            traffic_limit, traffic_reset_day, traffic_alert_percent,
            traffic_calibration_date, traffic_calibration_value
        } = req.body;
        const server = db.servers.get(sid);
        
        if (!server) {
            return res.json(pr(0, '服务器不存在'));
        }
        
        // 准备更新的数据
        let updatedData = server.data;
        if (data) {
            updatedData = typeof data === 'string' ? JSON.parse(data) : data;
        }
        
        // 更新服务器信息
        db.servers.upd(
            sid,
            name || server.name,
            updatedData,
            top ?? server.top,
            expire_time || server.expire_time,
            group_id || server.group_id,
            traffic_limit,
            traffic_reset_day,
            traffic_alert_percent,
            traffic_calibration_date,
            traffic_calibration_value
        );
        
        // 更新状态
        if (status != null) {
            db.servers.upd_status(sid, status);
        }
        
        // 检查IP地址是否变更，如果变更则重新获取IP国家信息
        const oldIp = server.data.ip || server.data.ssh?.host;
        const newIp = updatedData.ip || updatedData.ssh?.host;
        
        if (newIp && (newIp !== oldIp || !server.data.location) && svr.locals.stats && svr.locals.stats.ipLocationService) {
            try {
                console.log(`[${new Date().toISOString()}] 修改服务器，正在获取IP位置信息: ${name || server.name} (${newIp})`);
                
                // 获取更新后的服务器完整信息
                const updatedServer = db.servers.get(sid);
                
                // 清除缓存，强制重新获取
                if (svr.locals.stats.ipLocationService.ipCache && svr.locals.stats.ipLocationService.ipCache[newIp]) {
                    delete svr.locals.stats.ipLocationService.ipCache[newIp];
                }
                
                // 清除失败记录
                svr.locals.stats.ipLocationService.updateFailures.delete(sid);
                
                // 调用IP位置服务更新位置信息
                await svr.locals.stats.ipLocationService.updateServerLocation(updatedServer, db);
                
                console.log(`[${new Date().toISOString()}] 服务器IP位置信息获取完成: ${name || server.name} (${newIp})`);
            } catch (locationError) {
                console.error(`[${new Date().toISOString()}] 获取服务器IP位置信息失败: ${name || server.name} (${newIp})`, locationError);
                // 获取位置信息失败不影响服务器编辑
            }
        }
        
        res.json(pr(1, '修改成功'));
    } catch (error) {
        console.error('更新服务器信息失败:', error);
        res.json(pr(0, '更新失败: ' + error.message));
    }
});
svr.post("/admin/servers/:sid/del",async(req,res)=>{
    var {sid}=req.params;
    db.servers.del(sid);
    res.json(pr(1,'删除成功'));
});
svr.post("/admin/servers/:sid/init",async(req,res)=>{
    var {sid}=req.params,
        server=db.servers.get(sid);    
    res.json(await initServer(server,db.setting.get("neko_status_url")));
});
svr.post("/admin/servers/:sid/update",async(req,res)=>{
    var {sid}=req.params,
        server=db.servers.get(sid);
    res.json(await updateServer(server,db.setting.get("neko_status_url")));
});
svr.get("/admin/servers",(req,res)=>{
    res.render("admin/servers",{
        servers:db.servers.all()
    })
});
svr.post("/admin/servers/ord",(req,res)=>{
    try {
        const {servers} = req.body;
        if (!Array.isArray(servers)) {
            return res.json(pr(0, '无效的服务器列表'));
        }
        
        // 使用时间戳作为基数，确保顺序正确
        const baseOrder = Date.now();
        
        // 更新排序 - 使用数组索引确保顺序正确
        servers.forEach((sid, index) => {
            const server = db.servers.get(sid);
            if (!server) {
                throw new Error(`服务器 ${sid} 不存在`);
            }
            // 使用 baseOrder - index 确保较新的排在前面
            db.servers.upd_top(sid, baseOrder - index);
        });
        
        res.json(pr(1, '排序更新成功'));
    } catch (error) {
        console.error('更新服务器排序失败:', error);
        res.json(pr(0, '排序更新失败: ' + error.message));
    }
});
svr.get("/admin/servers/:sid",(req,res)=>{
    var {sid}=req.params,server=db.servers.get(sid);
    res.render(`admin/servers/edit`,{
        server,
    });
});
svr.ws("/admin/servers/:sid/ws-ssh/:data",(ws,req)=>{
    var {sid,data}=req.params,server=db.servers.get(sid);
    if(data)data=JSON.parse(data);
    ssh.createSocket(server.data.ssh,ws,data);
})

svr.get("/get-neko-status",async(req,res)=>{
    var path=__dirname+'/neko-status';
    // if(!fs.existsSync(path)){
    //     await fetch("文件url", {
    //         method: 'GET',
    //         headers: { 'Content-Type': 'application/octet-stream' },
    //     }).then(res=>res.buffer()).then(_=>{
    //         fs.writeFileSync(path,_,"binary");
    //     });
    // }
    res.sendFile(path);
})

svr.put("/api/server/:sid", (req, res) => {
    const { sid } = req.params;
    const { group_id } = req.body;
    
    try {
        // 获取当前服务器信息
        const server = db.servers.get(sid);
        if (!server) {
            return res.status(404).json({ success: false, message: '服务器不存在' });
        }
        
        // 使用专门的方法更新 group_id
        try {
            db.servers.upd_group_id(sid, group_id);
            console.log(`Updated server ${sid} group_id to ${group_id}`);
            res.json({ success: true });
        } catch (error) {
            console.error('Failed to update group_id:', error);
            res.status(500).json({ success: false, message: '更新分组失败' });
        }
    } catch (error) {
        console.error('更新服务器信息失败:', error);
        res.status(500).json({ success: false, message: '更新服务器信息失败' });
    }
});

/**
 * 手动获取服务器位置信息的API
 * POST /api/admin/servers/:sid/fetch-location
 */
svr.post("/api/admin/servers/:sid/fetch-location", async (req, res) => {
    // 检查是否为管理员
    if (!req.admin) {
        return res.status(403).json({ success: false, message: '无权限执行此操作' });
    }
    
    const { sid } = req.params;
    
    try {
        // 获取服务器信息
        const server = db.servers.get(sid);
        if (!server) {
            return res.status(404).json({ success: false, message: '服务器不存在' });
        }
        
        // 获取服务器数据
        const serverData = server.data || {};
        
        // 使用与 IPLocationService 相同的逻辑获取IP地址
        const ip = serverData.ip || serverData.host || serverData.ssh?.host;
        if (!ip) {
            return res.status(400).json({ success: false, message: '服务器无有效IP地址' });
        }
        
        console.log(`[${new Date().toISOString()}] 手动触发获取服务器 ${server.name} (${ip}) 位置信息`);
        
        // 获取状态模块实例
        const statsModule = svr.locals.stats;
        if (!statsModule || !statsModule.ipLocationService) {
            return res.status(500).json({ success: false, message: 'IP位置服务不可用' });
        }
        
        // 清除缓存和失败计数，强制重新获取
        statsModule.ipLocationService.updateFailures.delete(sid);
        
        // 如果IP在缓存中，删除以强制刷新
        if (statsModule.ipLocationService.ipCache && statsModule.ipLocationService.ipCache[ip]) {
            delete statsModule.ipLocationService.ipCache[ip];
            console.log(`[${new Date().toISOString()}] 已清除 IP ${ip} 的缓存记录`);
        }
        
        // 调用IP位置服务更新位置信息
        const updatedData = await statsModule.ipLocationService.updateServerLocation(server, db);
        
        // 检查更新结果
        if (updatedData && updatedData.location) {
            console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息更新成功`);
            return res.json({
                success: true,
                message: '位置信息更新成功',
                location: updatedData.location
            });
        } else {
            // 检查服务器数据中是否有错误信息
            let errorMessage = '位置信息更新失败';
            if (server.data && server.data.location && server.data.location.error) {
                errorMessage = `位置信息更新失败: ${server.data.location.error}`;
            }
            
            console.log(`[${new Date().toISOString()}] 服务器 ${server.name} 位置信息更新失败: ${errorMessage}`);
            
            // 返回错误信息而不是抛出异常
            return res.json({
                success: false,
                message: errorMessage,
                server_data: {
                    name: server.name,
                    location: server.data?.location || null
                }
            });
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 手动获取位置信息失败:`, error);
        return res.status(500).json({ 
            success: false, 
            message: `获取位置信息失败: ${error.message}` 
        });
    }
});
}