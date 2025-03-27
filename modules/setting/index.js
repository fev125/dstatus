"use strict";
const express=require("express");
module.exports=async(svr)=>{
const {db,pr}=svr.locals;
var rt=express.Router();
rt.get("/admin/setting",(req,res)=>{
    res.render("admin/setting",{
        setting:db.setting.all()
    });
})
rt.post("/admin/setting",(req,res)=>{
    try {
        // 保存所有设置
        for(var [key,val] of Object.entries(req.body)){
            db.setting.set(key,val);
            svr.locals.setting[key]=val;
        }
        
        // 如果修改了监听端口，需要重启服务器
        if(req.body.listen && req.body.listen !== svr.locals.setting.listen){
            res.json({code: 1, msg: "修改成功，服务器将在1秒后重启"});
            setTimeout(() => {
                svr.server.close(()=>{
                    svr.server=svr.listen(req.body.listen,'',()=>{
                        console.log(`server restart @ http://localhost:${req.body.listen}`);
                    });
                });
            }, 1000);
        } else {
            res.json({code: 1, msg: "修改成功"});
        }
    } catch (error) {
        console.error('保存设置失败:', error);
        res.json({code: 0, msg: "保存失败: " + error.message});
    }
});
svr.use(rt);
}