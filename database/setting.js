"use strict"
module.exports=(DB)=>{
// DB.prepare("DROP TABLE setting").run();
DB.prepare("CREATE TABLE IF NOT EXISTS setting (key,val,PRIMARY KEY(key))").run();
function S(val){return JSON.stringify(val);}
function P(pair){
    return pair?JSON.parse(pair.val):null;
}
const setting={
    ins(key,val){
        console.log(`正在插入设置: ${key}`, val);
        this._ins.run(key,S(val));
    },
    _ins:DB.prepare("INSERT INTO setting (key,val) VALUES (?,?)"),
    
    set(key,val){
        console.log(`正在保存设置: ${key}`, JSON.stringify(val));
        try {
            // 检查设置是否存在
            const existing = this._get.get(key);
            if (existing) {
                // 如果存在，使用UPDATE
                DB.prepare("UPDATE setting SET val = ? WHERE key = ?").run(S(val), key);
                console.log(`已更新设置: ${key}`);
            } else {
                // 如果不存在，使用INSERT
                this._ins.run(key, S(val));
                console.log(`已插入设置: ${key}`);
            }
        } catch (err) {
            console.error(`保存设置失败: ${key}`, err);
            throw err;
        }
    },
    _set:DB.prepare("REPLACE INTO setting (key,val) VALUES (?,?)"),
    
    get(key){
        const result = P(this._get.get(key));
        console.log(`获取设置: ${key}`, result ? '成功' : '失败');
        return result;
    },
    _get:DB.prepare("SELECT * FROM setting WHERE key=?"),
    
    del(key){
        console.log(`删除设置: ${key}`);
        DB.prepare("DELETE FROM setting WHERE key=?").run(key);
    },
    
    all(){
        var s={};
        for(var {key,val} of this._all.all())s[key]=JSON.parse(val);
        console.log('获取所有设置', Object.keys(s));
        return s;
    },
    _all:DB.prepare("SELECT * FROM setting"),
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

// 初始化美化设置
init("personalization", {
    wallpaper: {
        enabled: false,
        url: "",
        brightness: 75,
        fixed: false,
        blur: {
            enabled: false,
            amount: 5
        }
    },
    // 添加 blur 默认配置
    blur: {
        enabled: false,
        amount: 5,
        quality: 'normal'
    },
    // 添加卡片美化配置
    card: {
        backgroundColor: "#1e293b",
        backgroundOpacity: 0.95,
        backgroundImage: {
            enabled: false,
            url: "",
            opacity: 0.8
        }
    }
});

// 确保现有设置中的personalization配置完整
const existingPersonalization = setting.get("personalization");
if (existingPersonalization) {
    // 默认壁纸配置
    const defaultWallpaper = {
        enabled: false,
        url: "",
        brightness: 75,
        fixed: false,
        blur: {
            enabled: false,
            amount: 5
        }
    };
    
    // 默认模糊效果配置
    const defaultBlur = {
        enabled: false,
        amount: 5,
        quality: 'normal'
    };
    
    // 默认卡片美化配置
    const defaultCard = {
        backgroundColor: "#1e293b",
        backgroundOpacity: 0.95,
        backgroundImage: {
            enabled: false,
            url: "",
            opacity: 0.8
        }
    };
    
    // 合并现有配置和默认配置
    existingPersonalization.wallpaper = {
        ...defaultWallpaper,
        ...(existingPersonalization.wallpaper || {})
    };
    
    // 添加模糊效果配置
    existingPersonalization.blur = {
        ...defaultBlur,
        ...(existingPersonalization.blur || {})
    };
    
    // 添加卡片美化配置
    existingPersonalization.card = {
        ...defaultCard,
        ...(existingPersonalization.card || {})
    };
    
    // 更新设置
    setting.set("personalization", existingPersonalization);
    console.log('已更新personalization设置:', existingPersonalization);
}

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