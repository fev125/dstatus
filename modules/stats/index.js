"use strict";
const fetch=require("node-fetch"),
    schedule=require("node-schedule"),
    { IPLocationService } = require('./iplocation');
const createNotificationManager = require('../notification');
const MonthlyTraffic = require('./monthly-traffic');

// 创建IP地理位置服务实例
const ipLocationService = new IPLocationService();

function sleep(ms){return new Promise(resolve=>setTimeout(()=>resolve(),ms));};
module.exports=async(svr)=>{
const {db,pr,bot,setting}=svr.locals;
var stats={},fails={},highcpu={},highDown={},updating=new Set(),noticed={};

// 记录服务器状态
const serverStatusCache = {};
// 记录系统启动时间，用于特殊处理启动初始阶段
const SYSTEM_START_TIME = Date.now();
// 系统初始化阶段标志（启动后30秒内视为初始化阶段）
const INITIALIZATION_PERIOD = 30 * 1000; 
// 在初始化阶段，记录服务器的初始状态，但不发送通知
let initialStatusCollectionComplete = false;
// 存储初始化定时器的引用，便于在需要时清除
let initializationTimer = null;

// 清除可能存在的旧定时器
if (initializationTimer) {
    clearTimeout(initializationTimer);
    console.log(`[状态监控] 清除旧的初始化定时器`);
}

// 在初始化阶段结束后自动标记状态收集完成
console.log(`[状态监控] 开始服务器状态初始化阶段 (${INITIALIZATION_PERIOD/1000}秒)`);
initializationTimer = setTimeout(() => {
    console.log(`[状态监控] 服务器初始状态收集完成，后续状态变化将正常发送通知`);
    initialStatusCollectionComplete = true;
    
    // 输出当前收集到的服务器状态摘要
    const onlineCount = Object.values(serverStatusCache).filter(status => status === true).length;
    const offlineCount = Object.values(serverStatusCache).filter(status => status === false).length;
    const unknownCount = Object.values(serverStatusCache).filter(status => status === null).length;
    console.log(`[状态监控] 初始状态统计: 在线=${onlineCount}, 离线=${offlineCount}, 未知=${unknownCount}, 总计=${Object.keys(serverStatusCache).length}`);
}, INITIALIZATION_PERIOD);

// 将通知管理器添加到 svr.locals 中
if (!svr.locals.notification) {
    console.log('[状态监控] 初始化通知管理器...');
    svr.locals.notification = createNotificationManager(db);
    if (svr.locals.notification && svr.locals.bot) {
        svr.locals.notification.setBot(svr.locals.bot);
        console.log('[状态监控] 通知管理器Bot设置成功');
    } else {
        console.warn('[状态监控] 警告: Bot未设置，通知将不可用');
    }
}

// 使用 svr.locals 中的通知管理器
const notification = svr.locals.notification;

/**
 * 统一的状态数据获取接口
 * @param {boolean} isAdmin - 是否为管理员
 * @param {boolean} shouldFilter - 是否需要过滤敏感数据
 * @returns {Object} 处理后的状态数据
 */
function getStatsData(isAdmin = false, shouldFilter = true) {
    try {
        const statsData = getStats(isAdmin);
        
        // 处理每个节点的数据
        Object.entries(statsData).forEach(([sid, node]) => {
            // 过滤敏感数据
            if (shouldFilter && node.data) {
                let processedData = null;
                
                // 管理员可以看到更多信息，但需要过滤敏感数据
                if (isAdmin) {
                    processedData = {...node.data};
                    
                    // 处理SSH信息 - 移除所有敏感凭据
                    if (processedData.ssh) {
                        const ssh = {...processedData.ssh};
                        // 移除SSH敏感信息
                        if (ssh.password) delete ssh.password;
                        if (ssh.privateKey) delete ssh.privateKey;
                        if (ssh.passphrase) delete ssh.passphrase;
                        if (ssh.pri) delete ssh.pri; // 一些旧版本可能使用pri字段
                        processedData.ssh = ssh;
                    }
                    
                    // 处理API信息 - 部分模糊API密钥
                    if (processedData.api && processedData.api.key) {
                        const api = {...processedData.api};
                        // 只保留API密钥的前4个和后4个字符，中间用*替代
                        const key = api.key;
                        if (key.length > 8) {
                            api.key = key.slice(0, 4) + '********' + key.slice(-4);
                        } else if (key.length > 0) {
                            api.key = key.slice(0, 1) + '****' + (key.length > 1 ? key.slice(-1) : '');
                        }
                        processedData.api = api;
                    }
                } else {
                    // 非管理员只保留地区信息
                    let locationCode = null;
                    if (node.data.location) {
                        locationCode = node.data.location.code || 
                                     (node.data.location.country ? node.data.location.country.code : null);
                    }
                    
                    // 替换data对象，只保留地区信息
                    processedData = locationCode ? {
                        location: {
                            code: locationCode
                        }
                    } : null;
                }
                
                // 更新node.data
                node.data = processedData;
            }
            
            // 处理stat对象
            if (typeof node.stat === 'number' || !node.stat) {
                // 如果stat是数字或不存在，转换为标准对象结构
                const isOffline = !node.stat || node.stat <= 0;
                statsData[sid] = {
                    ...node,
                    stat: {
                        cpu: { multi: 0 },
                        mem: {
                            virtual: {
                                used: 0,
                                total: 1,
                                usedPercent: 0
                            }
                        },
                        net: {
                            delta: { in: 0, out: 0 },
                            total: { in: 0, out: 0 }
                        },
                        offline: isOffline
                    }
                };
            } else if (typeof node.stat === 'object') {
                // 确保对象结构完整性并处理无效值
                const cpuMulti = Number(node.stat.cpu?.multi) || 0;
                const memUsed = Number(node.stat.mem?.virtual?.used) || 0;
                const memTotal = Number(node.stat.mem?.virtual?.total) || 1;
                const memPercent = Number(node.stat.mem?.virtual?.usedPercent) || (memTotal > 0 ? (memUsed / memTotal * 100) : 0);

                statsData[sid] = {
                    ...node,
                    stat: {
                        ...node.stat,
                        cpu: {
                            multi: cpuMulti >= 0 ? cpuMulti : 0,
                            single: Array.isArray(node.stat.cpu?.single) ? 
                                   node.stat.cpu.single.map(v => Number(v) >= 0 ? Number(v) : 0) : 
                                   [0]
                        },
                        mem: {
                            virtual: {
                                used: memUsed,
                                total: memTotal,
                                usedPercent: memPercent >= 0 ? memPercent : 0
                            }
                        },
                        net: {
                            delta: {
                                in: Math.max(0, Number(node.stat.net?.delta?.in) || 0),
                                out: Math.max(0, Number(node.stat.net?.delta?.out) || 0)
                            },
                            total: {
                                in: Math.max(0, Number(node.stat.net?.total?.in) || 0),
                                out: Math.max(0, Number(node.stat.net?.total?.out) || 0)
                            }
                        }
                    }
                };
            }
        });
        
        // 添加详细的数据日志
        if (setting.debug) {
            const sampleNode = Object.values(statsData)[0];
            console.log(`[${new Date().toISOString()}] 状态数据示例:`, {
                name: sampleNode?.name,
                stat: sampleNode?.stat ? {
                    cpu: sampleNode.stat.cpu?.multi,
                    mem: sampleNode.stat.mem?.virtual?.usedPercent,
                    net_in: sampleNode.stat.net?.delta?.in,
                    net_out: sampleNode.stat.net?.delta?.out
                } : '不存在'
            });
        }
        
        return statsData;
    } catch (error) {
        console.error('获取状态数据失败:', error);
        return {};
    }
}

function getStats(isAdmin=false){
    let Stats = {};
    for(let server of db.servers.all()) {
        if(server.status == 1 || (server.status == 2 && isAdmin)){
            const serverStats = stats[server.sid];
            // 状态判断逻辑：
            // - 如果没有stats记录，返回-1（初始状态）
            // - 如果stats.stat === false，说明连接失败
            // - 如果有具体数据，说明在线
            const stat = !serverStats ? -1 : 
                        serverStats.stat === false ? 0 :
                        serverStats.stat;
            
            Stats[server.sid] = {
                name: server.name,
                stat: stat,
                expire_time: server.expire_time,
                group_id: server.group_id,
                top: server.top,
                traffic_used: serverStats?.traffic_used || 0,
                traffic_limit: server.traffic_limit || 0,
                traffic_reset_day: server.traffic_reset_day || 1,
                traffic_calibration_date: server.traffic_calibration_date || 0,
                traffic_calibration_value: server.traffic_calibration_value || 0,
                calibration_base_traffic: serverStats?.calibration_base_traffic || null,
                data: server.data
            };
        }
    }
    return Stats;
}

// 将getStats、getStatsData和ipLocationService添加到svr.locals中
svr.locals.stats = { getStats, getStatsData, ipLocationService };

// 更新路由处理
svr.get("/",(req,res)=>{
    try {
        const theme = req.query.theme || db.setting.get("theme") || "card";
        const isAdmin = req.admin;
        
        console.log(`[${new Date().toISOString()}] 首页请求 - 主题:${theme} 管理员:${isAdmin}`);
        
        res.render(`stats/${theme}`,{
            stats: getStatsData(isAdmin),
            groups: db.groups.getWithCount(),
            theme,
            admin: isAdmin
        });
    } catch (error) {
        console.error('首页渲染错误:', error);
        res.status(500).send('服务器内部错误');
    }
});

svr.get("/stats/data",(req,res)=>{
    try {
        const isAdmin = req.admin;
        console.log(`[${new Date().toISOString()}] 数据API请求 - 管理员:${isAdmin}`);
        
        res.json(getStatsData(isAdmin));
    } catch (error) {
        console.error('数据API错误:', error);
        res.status(500).json({ error: '获取数据失败' });
    }
});

svr.get("/stats/:sid",(req,res)=>{
    let {sid}=req.params;
    const statsData = getStats(req.admin);
    const node = statsData[sid];
    if (!node) {
        return res.status(404).send('Node not found');
    }
    
    // 获取服务器完整信息
    const server = db.servers.get(sid);
    if (server) {
        // 添加校准数据到node对象
        node.traffic_calibration_date = server.traffic_calibration_date || 0;
        node.traffic_calibration_value = server.traffic_calibration_value || 0;
        node.traffic_limit = server.traffic_limit || 0;
        node.traffic_reset_day = server.traffic_reset_day || 1;
        
        // 预处理数据，确保所有值都有默认值
        node.traffic_used = node.traffic_used || 0;
        node.traffic_limit = node.traffic_limit || 0;
        node.traffic_reset_day = node.traffic_reset_day || 1;
    }
    
    // 添加预处理的JSON数据
    const preProcessedData = {
        traffic_used: node.traffic_used || 0,
        traffic_limit: node.traffic_limit || 0,
        traffic_reset_day: node.traffic_reset_day || 1,
        traffic_calibration_date: node.traffic_calibration_date || 0,
        traffic_calibration_value: node.traffic_calibration_value || 0,
        calibration_base_traffic: node.calibration_base_traffic || null
    };
    
    res.render('stat',{
        sid,
        node,
        preProcessedData: JSON.stringify(preProcessedData),
        traffic: db.traffic.get(sid),
        load_m: db.load_m.select(sid),
        load_h: db.load_h.select(sid),
        admin: req.admin
    });
});
svr.get("/stats/:sid/data",(req,res)=>{
    let {sid}=req.params;
    res.json({sid,...stats[sid]});
});

// 流量统计API
svr.get("/stats/:sid/traffic", async (req, res) => {
    const { sid } = req.params;
    const server = db.servers.get(sid);
    
    if (!server) {
        return res.json({
            error: '服务器不存在',
            data: null
        });
    }
    
    try {
        // 获取traffic表中的完整数据
        const trafficData = await db.traffic.get(sid);
        
        // 计算月度流量使用情况
        const monthlyTraffic = MonthlyTraffic.calculateMonthlyUsage({
            ds: trafficData?.ds || [],
            traffic_reset_day: server.traffic_reset_day || 1,
            traffic_limit: server.traffic_limit || 0,
            calibration_date: server.traffic_calibration_date || 0,
            calibration_value: server.traffic_calibration_value || 0
        });
        
        res.json({
            data: {
                // 基础流量数据
                ds: trafficData?.ds || [],  // 天级流量记录数据（31天）
                hs: trafficData?.hs || [],  // 小时流量记录数据（24小时）
                ms: trafficData?.ms || [],  // 月度流量记录数据（12个月）
                
                // 月度流量统计结果
                monthly: monthlyTraffic
            }
        });
    } catch (error) {
        console.error('获取流量统计失败:', error);
        res.status(500).json({
            error: '获取流量统计失败',
            message: error.message
        });
    }
});

svr.post("/stats/update", async (req, res) => {
    let {sid, data} = req.body;
    stats[sid] = data;
    
    // 调用自动发现拦截器
    try {
        if (svr.locals.autodiscovery && svr.locals.autodiscovery.interceptor) {
            await svr.locals.autodiscovery.interceptor.checkAndRegisterIP(req, data);
        }
    } catch (error) {
        console.error('[自动发现] 拦截器错误:', error);
        // 不影响正常状态上报
    }
    
    res.json(pr(1, 'update success'));
});

async function getStat(server){
    let res;
    try{
        res=await fetch(`http://${server.data.ssh.host}:${server.data.api.port}/stat`,{
            method:"GET",
            headers:{key:server.data.api.key},
            timeout:15000,
        }).then(res=>res.json());
    }catch(e){
        // console.log(e);
        res={success:false,msg:'timeout'};
    }
    if(res.success)return res.data;
    else return false;
}
async function update(server){
    let {sid}=server;
    
    // 如果是首次更新，初始化服务器状态缓存
    if (serverStatusCache[sid] === undefined) {
        if (stats[sid] && stats[sid].stat !== false) {
            serverStatusCache[sid] = true;
            console.log(`[状态监控] 初始化服务器状态: ${server.name} => 在线`);
        } else {
            // 假设初始状态未知，设置为null以避免错误的通知
            serverStatusCache[sid] = null;
            console.log(`[状态监控] 初始化服务器状态: ${server.name} => 未知`);
        }
    }
    
    // 如果服务器状态为禁用，删除状态并返回
    if(server.status<=0){
        delete stats[sid];
        // 也要更新状态缓存，但不触发通知
        serverStatusCache[sid] = null;
        return;
    }
    
    let stat=await getStat(server);
    if(stat){
        let notice = false;
        // 检查是否需要发送上线通知：之前状态为离线或初始状态，现在状态为在线
        if(!stats[sid] || stats[sid].stat === false) notice = true;
        
        // 1. 确保基础网络数据结构完整
        if (!stat.net || typeof stat.net !== 'object') {
            stat.net = {
                delta: { in: 0, out: 0 },
                total: { in: 0, out: 0 },
                devices: {}
            };
        }

        // 2. 处理网络设备数据
        let deviceData = null;
        if (stat.net.devices && server.data.device) {
            deviceData = stat.net.devices[server.data.device];
            if (deviceData) {
                // 深拷贝设备数据，避免引用问题
                deviceData = {
                    total: {
                        in: Number(deviceData.total?.in || 0),
                        out: Number(deviceData.total?.out || 0)
                    },
                    delta: {
                        in: Number(deviceData.delta?.in || 0),
                        out: Number(deviceData.delta?.out || 0)
                    }
                };
            }
        }

        // 3. 构建标准化的网络数据结构
        const networkData = {
            delta: {
                in: deviceData ? deviceData.delta.in : Number(stat.net.delta?.in || 0),
                out: deviceData ? deviceData.delta.out : Number(stat.net.delta?.out || 0)
            },
            total: {
                in: deviceData ? deviceData.total.in : Number(stat.net.total?.in || 0),
                out: deviceData ? deviceData.total.out : Number(stat.net.total?.out || 0)
            },
            // 保留原始devices数据，确保前端可以访问网络设备信息
            devices: stat.net.devices || {}
        };
        
        // 4. 更新服务器状态
        stats[sid] = {
            name: server.name,
            stat: {
                ...stat,
                net: networkData  // 使用标准化后的网络数据
            },
            expire_time: server.expire_time,
            traffic_used: stats[sid]?.traffic_used || 0,
            traffic_limit: server.traffic_limit || 0,
            traffic_reset_day: server.traffic_reset_day || 1,
            traffic_calibration_date: server.traffic_calibration_date || 0,
            traffic_calibration_value: server.traffic_calibration_value || 0,
            calibration_base_traffic: stats[sid]?.calibration_base_traffic || null
        };
        
        fails[sid]=0;
        if(notice) {
            const notifyMessage = `#恢复 ${server.name} ${new Date().toLocaleString()}`;
            const telegramSetting = db.setting.get('telegram');
            
            // 判断是否需要发送通知
            const currentTime = Date.now();
            
            // 判断是否处于初始化阶段
            const isInitialPeriod = !initialStatusCollectionComplete;
            
            // 更新状态缓存前的旧状态
            const oldStatus = serverStatusCache[sid];
            
            // 更新状态缓存
            serverStatusCache[server.sid] = true;
            
            // 修改通知条件：
            // 1. 初始化阶段已完成
            // 2. 从离线到在线状态变化，或者是首次检测到在线状态
            const shouldNotify = !isInitialPeriod && // 初始化阶段结束后才发送通知
                                (oldStatus === false || oldStatus === null); // 状态从离线变为在线，或者是首次检测到在线状态
            
            if (shouldNotify && telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0) {
                // 检查服务器上线通知是否启用
                if (telegramSetting?.notificationTypes?.serverOnline) {
                    console.log(`[状态监控] 发送服务器恢复通知(状态从离线变为在线): ${server.name}`);
                    if (notification && notification.bot) {
                        try {
                            // 添加重试机制
                            const maxRetries = 3;
                            let retryCount = 0;
                            let success = false;
                            
                            while (!success && retryCount < maxRetries) {
                                try {
                                    // 修改：正确处理通知系统的返回值
                                    const notificationResult = await notification.sendNotification('服务器恢复', notifyMessage, telegramSetting.chatIds);
                                    
                                    // 检查通知系统返回的结果
                                    if (notificationResult.success) {
                                        success = true;
                                        console.log(`[状态监控] 服务器恢复通知发送成功: ${server.name}`);
                                    } else {
                                        // 通知系统返回失败
                                        throw new Error(notificationResult.error || '通知系统返回失败');
                                    }
                                } catch (err) {
                                    retryCount++;
                                    console.error(`[状态监控] 服务器恢复通知发送失败(尝试 ${retryCount}/${maxRetries}): ${server.name}`, err.message);
                                    // 短暂等待后重试
                                    await sleep(2000);
                                }
                            }
                            
                            // 恢复重要日志信息
                            if (!success) {
                                console.error(`[状态监控] 服务器恢复通知发送失败，已达到最大重试次数: ${server.name}`);
                            }
                        } catch (error) {
                            console.error(`[状态监控] 服务器恢复通知处理错误: ${server.name}`, error);
                        }
                    } else {
                        console.log(`[状态监控] 通知系统未初始化，跳过发送: ${server.name}`);
                    }
                } else {
                    console.log(`[状态监控] 服务器恢复通知已禁用，跳过发送: ${server.name}`);
                }
            } else if (!shouldNotify && notice) {
                if (isInitialPeriod) {
                    console.log(`[状态监控] 系统初始化阶段，记录服务器在线状态但不发送通知: ${server.name}`);
                } else {
                    console.log(`[状态监控] 服务器恢复但跳过通知 (状态未变化): ${server.name}`);
                }
            }
        }
    } else {
        let notice = false;
        fails[sid] = (fails[sid] || 0) + 1;
        
        // 不再记录掉线计数到日志
        // console.log(`[状态监控] 服务器 ${server.name} 掉线计数: ${fails[sid]}/5`);
        
        if(fails[sid] > 5) {
            if(stats[sid] && stats[sid].stat !== false) notice = true;
            stats[sid] = {
                name: server.name,
                stat: false,
                expire_time: server.expire_time,
                traffic_used: stats[sid]?.traffic_used || 0
            };
        }
        if(notice) {
            const notifyMessage = `#掉线 ${server.name} ${new Date().toLocaleString()}`;
            const telegramSetting = db.setting.get('telegram');
            
            // 判断是否需要发送通知
            const currentTime = Date.now();
            
            // 判断是否处于初始化阶段
            const isInitialPeriod = !initialStatusCollectionComplete;
            
            // 更新状态缓存前的旧状态
            const oldStatus = serverStatusCache[sid];
            
            // 更新状态缓存
            serverStatusCache[server.sid] = false;
            
            // 简化通知条件：
            // 1. 初始化阶段已完成
            // 2. 从在线到离线状态变化
            const shouldNotify = !isInitialPeriod && // 初始化阶段结束后才发送通知
                                oldStatus === true; // 状态从在线变为离线
            
            if (shouldNotify && telegramSetting?.enabled && telegramSetting?.chatIds?.length > 0) {
                // 检查服务器下线通知是否启用
                if (telegramSetting?.notificationTypes?.serverOffline) {
                    console.log(`[状态监控] 发送服务器掉线通知(状态从在线变为离线): ${server.name}`);
                    if (notification && notification.bot) {
                        try {
                            // 添加重试机制
                            const maxRetries = 3;
                            let retryCount = 0;
                            let success = false;
                            
                            while (!success && retryCount < maxRetries) {
                                try {
                                    // 修改：正确处理通知系统的返回值
                                    const notificationResult = await notification.sendNotification('服务器掉线', notifyMessage, telegramSetting.chatIds);
                                    
                                    // 检查通知系统返回的结果
                                    if (notificationResult.success) {
                                        success = true;
                                        console.log(`[状态监控] 服务器掉线通知发送成功: ${server.name}`);
                                    } else {
                                        // 通知系统返回失败
                                        throw new Error(notificationResult.error || '通知系统返回失败');
                                    }
                                } catch (err) {
                                    retryCount++;
                                    console.error(`[状态监控] 服务器掉线通知发送失败(尝试 ${retryCount}/${maxRetries}): ${server.name}`, err.message);
                                    // 短暂等待后重试
                                    await sleep(2000);
                                }
                            }
                            
                            // 恢复重要日志信息
                            if (!success) {
                                console.error(`[状态监控] 服务器掉线通知发送失败，已达到最大重试次数: ${server.name}`);
                            }
                        } catch (error) {
                            console.error(`[状态监控] 服务器掉线通知处理错误: ${server.name}`, error);
                        }
                    } else {
                        console.log(`[状态监控] 通知系统未初始化，跳过发送: ${server.name}`);
                    }
                } else {
                    console.log(`[状态监控] 服务器掉线通知已禁用，跳过发送: ${server.name}`);
                }
            } else if (!shouldNotify && notice) {
                if (isInitialPeriod) {
                    console.log(`[状态监控] 系统初始化阶段，记录服务器离线状态但不发送通知: ${server.name}`);
                } else {
                    console.log(`[状态监控] 服务器掉线但跳过通知 (状态未变化): ${server.name}`);
                }
            }
        }
    }
}

async function get() {
    let s = new Set(), wl = [];
    for(let server of db.servers.all()) if(server.status > 0) {
        s.add(server.sid);
        if(updating.has(server.sid)) continue;
        wl.push((async(server) => {
            updating.add(server.sid);
            await update(server);
            updating.delete(server.sid);
        })(server));
    }
    for(let sid in stats) if(!s.has(sid)) delete stats[sid];
    return Promise.all(wl);
}
function calc(){
    for(let server of db.servers.all()){
        let {sid}=server,stat=stats[sid];
        if(!stat||!stat.stat||stat.stat==-1)continue;
        let ni=stat.stat.net.total.in,
            no=stat.stat.net.total.out,
            t=db.lt.get(sid)||db.lt.ins(sid);
        let ti=ni<t.traffic[0]?ni:ni-t.traffic[0],
            to=no<t.traffic[1]?no:no-t.traffic[1];
        db.lt.set(sid,[ni,no]);
        db.traffic.add(sid,[ti,to]);
    }
}
get();
setInterval(get,1500);
// sleep(10000).then(calc);
setInterval(calc,30*1000);

schedule.scheduleJob({second:0},()=>{
    for(let {sid} of db.servers.all()){
        let cpu=-1,mem=-1,swap=-1,ibw=-1,obw=-1;
        let stat=stats[sid];
        if(stat&&stat.stat&&stat.stat!=-1){
            cpu=stat.stat.cpu.multi*100;
            mem=stat.stat.mem.virtual.usedPercent;
            swap=stat.stat.mem.swap.usedPercent;
            ibw=stat.stat.net.delta.in;
            obw=stat.stat.net.delta.out;
        }
        db.load_m.shift(sid,{cpu,mem,swap,ibw,obw});
    }
});
schedule.scheduleJob({minute:0,second:1},()=>{
    db.traffic.shift_hs();
    for(let {sid} of db.servers.all()){
        let Cpu=0,Mem=0,Swap=0,Ibw=0,Obw=0,tot=0;
        for(let {cpu,mem,swap,ibw,obw} of db.load_m.select(sid))if(cpu!=-1){
            ++tot;
            Cpu+=cpu,Mem+=mem,Swap+=swap,Ibw+=ibw,Obw+=obw;
        }
        if(tot==0)db.load_h.shift(sid,{cpu:-1,mem:-1,swap:-1,ibw:-1,obw:-1});
        else db.load_h.shift(sid,{cpu:Cpu/tot,mem:Mem/tot,swap:Swap/tot,ibw:Ibw/tot,obw:Obw/tot});
    }
});
schedule.scheduleJob({hour:4,minute:0,second:2},()=>{db.traffic.shift_ds();});
schedule.scheduleJob({date:1,hour:4,minute:0,second:3},()=>{db.traffic.shift_ms();});

// 获取校准日期后的流量数据
async function getTrafficAfterCalibration(sid, calibrationDate) {
    try {
        // 获取traffic表中的ds数据
        const trafficData = await db.traffic.get(sid);
        if (!trafficData || !trafficData.ds) {
            return 0;
        }

        // 计算校准日期后的总流量
        let totalTraffic = 0;
        for (const record of trafficData.ds) {
            if (record.timestamp > calibrationDate) {
                // ds中的数据是[入站, 出站]格式
                totalTraffic += (record[0] + record[1]);
            }
        }
        return totalTraffic;
    } catch (error) {
        console.error('获取流量数据失败:', error);
        return 0;
    }
}

// 每小时更新一次流量统计
schedule.scheduleJob('0 * * * *', async () => {
    console.log('Updating traffic stats...');
    for(let server of db.servers.all()) {
        if(server.status <= 0) continue;
        
        // 更新流量统计
        const currentStats = stats[server.sid] || {};
        stats[server.sid] = {
            ...currentStats,
            traffic_used: currentStats.traffic_used || 0,
            traffic_limit: server.traffic_limit || 0
        };
    }
});

/**
 * 初始化所有服务器的IP位置信息
 * 在服务启动时执行一次
 */
async function initializeServerLocations() {
    console.log(`[${new Date().toISOString()}] 开始初始化服务器IP位置信息...`);
    
    try {
        // 使用新添加的 checkAndUpdateMissingLocations 方法检查并更新没有位置信息的服务器
        const result = await ipLocationService.checkAndUpdateMissingLocations(db);
        
        console.log(`[${new Date().toISOString()}] 服务器IP位置初始化完成，共检查 ${result.totalChecked} 个服务器，更新 ${result.totalUpdated} 个，成功 ${result.totalSuccess} 个`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 初始化服务器IP位置失败:`, error);
    }
}

/**
 * 定期重试失败的IP位置查询
 * 每 30 分钟执行一次
 */
schedule.scheduleJob('*/30 * * * *', async () => {
    console.log(`[${new Date().toISOString()}] 开始重试失败的IP位置查询...`);
    await ipLocationService.retryFailedUpdates(db);
});

// 服务启动时初始化IP位置
// 延迟 10 秒执行，确保其他服务已经初始化
sleep(10000).then(() => {
    initializeServerLocations();
});

// 添加手动刷新IP位置的API
svr.get("/stats/refresh-ip/:sid", async (req, res) => {
    try {
        const { sid } = req.params;
        const isAdmin = req.admin;
        
        // 调用 iplocation.js 中的 refreshServerLocation 方法处理 IP 位置更新
        const result = await ipLocationService.refreshServerLocation(sid, db, isAdmin);
        
        // 处理返回结果
        if (result.status) {
            // 如果有状态码，说明是错误状态
            return res.status(result.status).json({ success: false, message: result.message });
        }
        
        // 判断是否成功获取了位置信息
        if (result.server_data && result.server_data.location && result.server_data.location.code) {
            // 如果返回了位置信息，则认为更新成功，即使 result.success 为 false
            console.log(`[${new Date().toISOString()}] API 返回成功更新位置信息: ${result.server_data.name} -> ${result.server_data.location.code}`);
            return res.json({ 
                success: true, 
                message: '刷新成功', 
                server_data: result.server_data 
            });
        }
        
        // 返回原始处理结果
        res.json(result);
    } catch (error) {
        console.error('刷新IP位置失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});
}
