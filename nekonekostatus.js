#!/usr/bin/env node
"use strict"
const express=require('express'),
    bp=require('body-parser'),
    ckp=require("cookie-parser"),
    nunjucks=require("nunjucks"),
    fs=require("fs"),
    fileUpload=require('express-fileupload'),
    schedule=require("node-schedule"),
    path=require('path');
const core=require("./core"),
    db=require("./database/index")(),
    {pr,md5,uuid}=core;
var setting=db.setting.all();
var svr=express();

svr.use(bp.urlencoded({extended: false}));
svr.use(bp.json({limit:'100mb'}));
svr.use(ckp());
svr.use(express.json());
svr.use(express.static(__dirname+"/static"));

// 添加设备检测中间件
svr.use((req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    req.isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
    next();
});

// 添加文件上传中间件
svr.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB限制
    abortOnLimit: true
}));

svr.engine('html', nunjucks.render);
svr.set('view engine', 'html');
require('express-ws')(svr);

var env=nunjucks.configure(__dirname+'/views', {
    autoescape: true,
    express: svr,
    watch:setting.debug,
});

// 添加自定义过滤器
env.addFilter('date', function(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
});

env.addFilter('formatDate', function(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toISOString().split('T')[0];
});

env.addFilter('bytesToGB', function(bytes) {
    if (!bytes) return '0';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2);
});

env.addFilter('formatTimestamp', function(timestamp) {
    if (!timestamp) return '未校准';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
});

// 添加格式化百分比的过滤器
env.addFilter('formatPercentage', function(used, limit) {
    if (!limit || limit <= 0) return '0%';
    return ((used / limit * 100) || 0).toFixed(1) + '%';
});

var admin_tokens=new Set();
try{for(var token of require("./tokens.json"))admin_tokens.add(token);}catch{}
setInterval(()=>{
    var tokens=[];
    for(var token of admin_tokens.keys())tokens.push(token);
    fs.writeFileSync(__dirname+"/tokens.json",JSON.stringify(tokens));
},1000);
svr.all('*',(req,res,nxt)=>{
    if(admin_tokens.has(req.cookies.token))req.admin=true;
    nxt();
});
svr.get('/login',(req,res)=>{
    if(req.admin)res.redirect('/');
    else res.render('login',{});
});
svr.post('/login',(req,res)=>{
    var {password}=req.body;
    if(password==md5(db.setting.get("password"))){
        var token=uuid.v4();
        admin_tokens.add(token);
        res.cookie("token",token);
        res.json(pr(1,token));
    }
    else res.json(pr(0,"密码错误"));
});
svr.get('/logout',(req,res)=>{
    admin_tokens.delete(req.cookies.token);
    res.clearCookie("token");
    res.redirect("/login");
});
svr.all('/admin*',(req,res,nxt)=>{
    if(req.admin)nxt();
    else res.redirect('/login');
});

// 添加测试通知路由
svr.post('/admin/test-telegram', async (req, res) => {
    try {
        if (!req.admin) {
            return res.json(pr(0, '需要管理员权限'));
        }

        // 获取通知管理器实例
        const notificationManager = svr.locals.notification;
        if (!notificationManager) {
            return res.json(pr(0, '通知系统未初始化'));
        }

        // 获取Telegram设置
        const telegramSetting = svr.locals.db.setting.get('telegram');
        if (!telegramSetting?.enabled) {
            return res.json(pr(0, 'Telegram通知未启用'));
        }

        if (!telegramSetting?.chatIds?.length) {
            return res.json(pr(0, '未配置Chat ID'));
        }

        // 发送测试通知
        console.log('[通知系统] 发送测试通知...');
        const result = await notificationManager.sendNotification(
            '测试通知',
            '这是一条测试通知，如果您收到这条消息，说明通知系统工作正常。',
            telegramSetting.chatIds,
            { priority: 'normal' }
        );

        if (result.success) {
            console.log('[通知系统] 测试通知发送成功');
            return res.json(pr(1, '测试通知已发送'));
        } else {
            console.error('[通知系统] 测试通知发送失败:', result.error);
            return res.json(pr(0, `发送失败: ${result.error}`, { details: result.details }));
        }
    } catch (error) {
        console.error('[通知系统] 测试通知发送异常:', error);
        return res.json(pr(0, `发送异常: ${error.message}`));
    }
});

// 初始化 Telegram bot
var bot = null;
if (setting.telegram?.enabled && setting.telegram?.token) {
    try {
        // 传递webhook选项
        const botOptions = {
            webhook: setting.telegram.webhook || false,
            webhookPort: setting.telegram.webhookPort || 8443,
            baseApiUrl: setting.telegram.baseApiUrl || 'https://api.telegram.org'
        };
        
        console.log('[系统] 开始初始化 Telegram bot...');
        console.log('[系统] Bot 配置信息:', JSON.stringify({
            enabled: setting.telegram.enabled,
            hasToken: !!setting.telegram.token,
            webhook: setting.telegram.webhook || false,
            chatIdsCount: setting.telegram?.chatIds?.length || 0,
            baseApiUrl: botOptions.baseApiUrl
        }));
        
        const botWrapper = require("./bot")(setting.telegram.token, setting.telegram.chatIds, botOptions);
        // 确保我们获取了正确的bot对象
        if (botWrapper && botWrapper.bot) {
            bot = botWrapper.bot;  // 直接使用wrapper中的bot实例
            // 添加funcs到bot对象
            bot.funcs = botWrapper.funcs;
            console.log('[系统] Telegram bot 初始化成功');
            
            // 使用立即执行的异步函数(IIFE)包装await调用
            (async () => {
                try {
                    // 等待核心模块加载完成
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // 使用通知管理器发送测试消息
                    if (svr.locals.notification && setting.telegram?.chatIds?.length > 0) {
                        console.log('[系统] 使用通知管理器发送启动测试消息');
                        const result = await svr.locals.notification.sendNotification(
                            '测试通知',
                            '系统启动成功，正在准备状态报告',
                            setting.telegram.chatIds,
                            { priority: 'normal' }
                        );
                        
                        if (result.success) {
                            console.log('[系统] 启动测试消息发送成功');
                        } else {
                            console.error('[系统] 启动测试消息发送失败:', result.error);
                            // 如果通知管理器发送失败，尝试直接发送
                            if (bot && setting.telegram?.chatIds?.length > 0) {
                                const chatId = setting.telegram.chatIds[0];
                                await bot.sendMessage(chatId, "启动成功正在准备状态报告", {});
                                console.log('[系统] 直接发送测试消息成功');
                            }
                        }
                    } else {
                        // 如果通知管理器未就绪，使用直接发送
                        if (bot && setting.telegram?.chatIds?.length > 0) {
                            const chatId = setting.telegram.chatIds[0];
                            await bot.sendMessage(chatId, "启动成功正在准备状态报告", {});
                            console.log('[系统] 直接发送测试消息成功（通知管理器未就绪）');
                        }
                    }
                } catch (error) {
                    console.error('[系统] 发送启动测试消息失败:', error.message);
                }
            })().catch(err => console.error('[系统] 测试消息发送异步错误:', err));
        } else {
            console.error('[系统] Telegram bot 初始化失败: 未获取到有效的bot实例');
        }
    } catch (error) {
        console.error('[系统] Telegram bot 初始化失败:', error);
    }
}

// 设置全局变量
svr.locals={
    setting,
    db,
    bot,  // 确保bot实例正确设置
    ...core,
};

// 加载核心模块
console.log('[系统] 开始加载核心模块...');

// 创建已加载模块的跟踪集合
const loadedModules = new Set();

// 按顺序加载核心模块
async function loadCoreModule(moduleName) {
    if (loadedModules.has(moduleName)) {
        console.log(`[系统] 模块 ${moduleName} 已加载，跳过`);
        return;
    }
    
    console.log(`[系统] 加载${moduleName}模块...`);
    try {
        // 确保setting模块在其他模块之前加载
        if (moduleName !== 'setting' && !loadedModules.has('setting')) {
            await loadCoreModule('setting');
        }
        
        // 如果是notification模块，确保setting已经完全初始化
        if (moduleName === 'notification') {
            if (!svr.locals.setting) {
                console.error('[系统] notification模块加载失败: setting未初始化');
                return;
            }
        }
        
        const moduleExports = await require(`./modules/${moduleName}`)(svr, db);
        if (moduleExports) {
            svr.locals[moduleName] = moduleExports;
            
            // 如果是setting模块，将其导出的setting对象添加到svr.locals中
            if (moduleName === 'setting' && moduleExports.setting) {
                svr.locals.setting = moduleExports.setting;
            }
        }
        loadedModules.add(moduleName);
        console.log(`[系统] ${moduleName}模块加载成功`);
    } catch (error) {
        console.error(`[系统] ${moduleName}模块加载失败:`, error);
    }
}

// 按特定顺序加载核心模块
const coreModules = [
    'setting',      // 先加载设置模块
    'notification', // 提前加载通知模块
    'groups',       
    'servers',      
    'autodiscovery',
    'admin',        
    'restart',      
    'stats'         
];

// 加载核心模块
(async () => {
    for (const moduleName of coreModules) {
        await loadCoreModule(moduleName);
    }
    
    // 加载其他模块
    const modules = fs.readdirSync(__dirname+'/modules',{withFileTypes:1});
    for (const file of modules) {
        if (file.isFile() && file.name.endsWith('.js')) {
            const moduleName = file.name.slice(0, -3);
            if (!loadedModules.has(moduleName)) {
                await loadCoreModule(moduleName);
            }
        } else if (file.isDirectory()) {
            // 处理目录模块
            const indexFile = path.join(__dirname, 'modules', file.name, 'index.js');
            if (fs.existsSync(indexFile) && !loadedModules.has(file.name)) {
                await loadCoreModule(file.name);
            }
        }
    }
})();

// WebSocket连接管理
const wsClients = new Map(); // 存储WebSocket连接
const MAX_CONNECTIONS_PER_IP = 30; // 每个IP最大连接数
const UPDATE_INTERVAL = 1500; // 更新频率(ms)

// 添加WebSocket路由
svr.ws('/ws/stats', function(ws, req) {
    // 1. 安全性验证
    const isAdmin = admin_tokens.has(req.cookies.token);
    const clientIP = req.ip;
    
    // 2. 连接数量限制
    if(wsClients.has(clientIP)) {
        const existingConnections = wsClients.get(clientIP);
        if(existingConnections >= MAX_CONNECTIONS_PER_IP) {
            console.log(`[${new Date().toISOString()}] 连接被拒绝 - IP:${clientIP} 超出最大连接数`);
            ws.close();
            return;
        }
        wsClients.set(clientIP, existingConnections + 1);
    } else {
        wsClients.set(clientIP, 1);
    }
    
    console.log(`[${new Date().toISOString()}] WebSocket连接建立 - 管理员:${isAdmin} IP:${clientIP}`);
    
    // 3. 数据发送定时器
    const timer = setInterval(() => {
        try {
            if (ws.readyState === ws.OPEN && svr.locals.stats) {
                // 获取完整数据
                const statsData = svr.locals.stats.getStatsData(isAdmin, true);
                
                // 数据完整性检查
                if (!statsData || typeof statsData !== 'object') {
                    console.error(`[${new Date().toISOString()}] 无效的统计数据 - IP:${clientIP}`);
                    return;
                }

                const message = {
                    type: 'stats',
                    timestamp: Date.now(),
                    data: statsData
                };

                // 添加调试日志
                if (setting.debug) {
                    console.debug(`[${new Date().toISOString()}] 发送数据 - IP:${clientIP} 数据大小:${JSON.stringify(message).length} 节点数:${Object.keys(message.data).length}`);
                }
                
                // 检查WebSocket状态并发送数据
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify(message));
                } else {
                    console.warn(`[${new Date().toISOString()}] WebSocket未连接 - IP:${clientIP}`);
                }
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] WebSocket数据发送错误 - IP:${clientIP}:`, error);
        }
    }, UPDATE_INTERVAL);
    
    // 4. 连接关闭处理
    ws.on('close', () => {
        clearInterval(timer);
        // 清理连接计数
        const count = wsClients.get(clientIP);
        if(count <= 1) {
            wsClients.delete(clientIP);
        } else {
            wsClients.set(clientIP, count - 1);
        }
        console.log(`[${new Date().toISOString()}] WebSocket连接关闭 - IP:${clientIP}`);
    });
    
    // 5. 错误处理
    ws.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] WebSocket错误 - IP:${clientIP}:`, error);
        clearInterval(timer);
        // 清理连接计数
        const count = wsClients.get(clientIP);
        if(count <= 1) {
            wsClients.delete(clientIP);
        } else {
            wsClients.set(clientIP, count - 1);
        }
    });
});

const port=process.env.PORT||db.setting.get("listen"),host=process.env.HOST||'';
svr.server=svr.listen(port,host,()=>{console.log(`server running @ http://${host ? host : 'localhost'}:${port}`);})

// 添加主页路由处理
svr.get('/', (req, res) => {
    try {
        // 获取用户偏好主题
        let theme = req.query.theme || req.cookies.theme;
        const isAdmin = req.admin;
        
        // 如果是移动设备且没有明确指定主题或保存的偏好，默认使用列表视图
        if (req.isMobile && !theme) {
            theme = 'list';
        }
        
        // 如果还没有主题，使用系统默认主题
        theme = theme || setting.theme || 'card';
        
        console.log(`[${new Date().toISOString()}] 主页请求 - 主题:${theme} 管理员:${isAdmin} 移动端:${req.isMobile}`);
        
        // 渲染对应视图
        res.render(`stats/${theme}`, {
            stats: svr.locals.stats ? svr.locals.stats.getStatsData(isAdmin) : {},
            groups: db.groups.getWithCount(),
            theme,
            admin: isAdmin,
            setting
        });
    } catch (error) {
        console.error('主页渲染错误:', error);
        res.status(500).send('服务器内部错误');
    }
});