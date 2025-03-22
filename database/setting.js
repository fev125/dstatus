"use strict"
module.exports=(DB)=>{
// DB.prepare("DROP TABLE setting").run();
DB.prepare("CREATE TABLE IF NOT EXISTS setting (key,val,PRIMARY KEY(key))").run();
function S(val){return JSON.stringify(val);}
function P(pair){
    return pair?JSON.parse(pair.val):null;
}
const setting={
    ins(key,val){this._ins.run(key,S(val))},_ins:DB.prepare("INSERT INTO setting (key,val) VALUES (?,?)"),
    set(key,val){this._set.run(key,S(val));},_set:DB.prepare("REPLACE INTO setting (key,val) VALUES (?,?)"),
    get(key){return P(this._get.get(key));},_get:DB.prepare("SELECT * FROM setting WHERE key=?"),
    del(key){DB.prepare("DELETE FROM setting WHERE key=?").run(key);},
    all(){
        var s={};
        for(var {key,val} of this._all.all())s[key]=JSON.parse(val);
        return s;
    },_all:DB.prepare("SELECT * FROM setting"),
};
function init(key,val){if(setting.get(key)==undefined)setting.ins(key,val);}
init("listen",5555);
init("password","dstatus");
init("site",{
    name:"DStatus",
    url:"https://status.nekoneko.cloud",
});
init("neko_status_url","https://github.com/nkeonkeo/nekonekostatus/releases/download/v0.1/neko-status");
init("debug",0);
init("telegram", {
    enabled: false,
    token: "",
    chatIds: [],
    webhook: false,
    webhookPort: 443,
    // 默认使用官方 API 地址
    baseApiUrl: "https://api.telegram.org",
    lastTestTime: 0,
    notificationTypes: {
        serverOnline: true,
        serverOffline: true,
        trafficLimit: true,
        testNotification: true
    }
});

// 确保现有设置中的通知类型配置完整
const existingTelegram = setting.get("telegram");
if (existingTelegram) {
    const defaultNotificationTypes = {
        serverOnline: true,
        serverOffline: true,
        trafficLimit: true,
        testNotification: true
    };
    
    // 合并现有配置和默认配置
    existingTelegram.notificationTypes = {
        ...defaultNotificationTypes,
        ...(existingTelegram.notificationTypes || {})
    };
    
    // 更新设置
    setting.set("telegram", existingTelegram);
}

return {setting};
}