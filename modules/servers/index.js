"use strict";
const {initServer,updateServer}=require("./func"),
    ssh=require("../../ssh");
module.exports=svr=>{
const {db,setting,pr,parseNumber}=svr.locals;
svr.post("/admin/servers/add",async(req,res)=>{
    var {sid,name,data,top,status}=req.body;
    if(!sid)sid=uuid.v1();
    db.servers.ins(sid,name,data,top,status);
    res.json(pr(1,sid));
});
svr.get("/admin/servers/add",(req,res)=>{
    res.render(`admin/servers/add`,{});
});
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
}