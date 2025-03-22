/**
 * 系统信息处理模块
 * 用于处理和显示服务器的基本系统信息
 */

// 格式化工具函数
function formatSystemSize(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * 更新系统信息显示
 * @param {Object} data - 服务器状态数据
 */
function updateSystemInfo(data) {
    // 数据有效性检查
    if (!data || !data.stat || !data.stat.host || !data.stat.mem) {
        console.warn('Invalid system data received');
        return;
    }
    
    try {
        // 更新静态系统信息
        const staticInfo = {
            'system-hostname': data.stat.host.hostname,
            'system-os': `${data.stat.host.platform} ${data.stat.host.platformVersion}`,
            'system-cpu-cores': `${data.stat.cpu.single.length}核`,
            'mem-total': `总内存: ${formatSystemSize(data.stat.mem.virtual.total)}`
        };
        
        // 更新显示
        Object.entries(staticInfo).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    } catch (error) {
        console.error('Error updating system info:', error);
    }
}

// 在页面加载完成后初始化系统信息
document.addEventListener('DOMContentLoaded', () => {
    try {
        const nodeData = JSON.parse(document.getElementById('node-data').value || '{}');
        updateSystemInfo(nodeData);
    } catch (error) {
        console.error('Error initializing system info:', error);
    }
});

// 工具函数
function E(id) {
    return document.getElementById(id);
}

var KB=1024,MB=KB*1024,GB=MB*1024,TB=GB*1024;
function strB(b){
    if(b<KB)return b.toFixed(2)+'B';
    if(b<MB)return (b/KB).toFixed(2)+'KB';
    if(b<GB)return (b/MB).toFixed(2)+'MB';
    if(b<TB)return (b/GB).toFixed(2)+'GB';
    else return (b/TB).toFixed(2)+'TB';
}
var Kbps=128,Mbps=Kbps*1000,Gbps=Mbps*1000,Tbps=Gbps*1000;
function strbps(b){
    if(b<Kbps)return b.toFixed(2)+'bps';
    if(b<Mbps)return (b/Kbps).toFixed(2)+'Kbps';
    if(b<Gbps)return (b/Mbps).toFixed(2)+'Mbps';
    if(b<Tbps)return (b/Gbps).toFixed(2)+'Gbps';
    else return (b/Tbps).toFixed(2)+'Tbps';
}

// 使用原生 title 属性来显示提示信息
function updateTooltip(elementId, content) {
    const element = E(elementId);
    if (element) {
        element.title = content;
    }
}

// 更新进度条
function updateProgress(elementId, percentage) {
    const element = E(elementId);
    if (element) {
        // 直接设置width属性，而不是使用CSS变量
        element.style.width = `${Math.max(0, Math.min(percentage, 100))}%`;
    }
}

// 更新文本内容
function updateText(elementId, text) {
    const element = E(elementId);
    if (element) {
        element.innerText = text;
    }
}

// 清除所有数据显示
function clearAllData() {
    // CPU
    updateText('CPU', '0.00%');
    const cpuElements = document.querySelectorAll('[id^="CPU"][id$="_progress"]');
    cpuElements.forEach(el => updateProgress(el.id, 0));

    // Memory
    updateText('MEM', '0.00%');
    updateProgress('MEM_progress', 0);
    updateProgress('SWAP_progress', 0);
    updateTooltip('MEM_item', 'virtual: 0B/0B\nswap: 0B/0B');

    // Network
    updateText('NET_IN', '0bps');
    updateText('NET_OUT', '0bps');
    updateText('NET_IN_TOTAL', '0B');
    updateText('NET_OUT_TOTAL', '0B');

    // Network devices
    const netElements = document.querySelectorAll('[id^="net_"]');
    netElements.forEach(el => {
        if (el.id.includes('delta')) {
            updateText(el.id, '0bps');
        } else {
            updateText(el.id, '0B');
        }
    });
}

// 从 URL 获取节点 ID
function getNodeIdFromUrl() {
    try {
        const path = window.location.pathname;
        // 优先使用正则匹配
        const matches = path.match(/\/stats\/([^\/]+)/);
        if (matches) return matches[1];
        
        // 备用方案：分割路径
        const parts = path.split('/');
        const lastPart = parts[parts.length - 1];
        return lastPart || null;
    } catch (error) {
        console.error('Error getting node ID:', error);
        return null;
    }
}

/**
 * 验证系统数据
 * @param {Object} data - 原始数据
 * @param {string} nodeId - 节点ID
 * @returns {Object|null} - 验证后的数据或null
 */
function validateSystemData(data, nodeId) {
    // 基础验证
    if (!data || typeof data !== 'object') {
        console.warn('Invalid data format');
        return null;
    }

    // 节点数据验证
    const node = data[nodeId];
    if (!node || !node.stat) {
        console.warn(`No stat data for node: ${nodeId}`);
        return null;
    }

    // 允许部分数据缺失，返回有效数据
    return {
        cpu: node.stat.cpu,
        mem: node.stat.mem,
        net: node.stat.net,
        host: node.stat.host
    };
}

/**
 * 更新CPU信息
 * @param {Object} cpu - CPU数据
 */
function updateCPUInfo(cpu) {
    if (!cpu) return;
    
    if (typeof cpu.multi === 'number') {
        updateText('CPU', (cpu.multi*100).toFixed(2)+'%');
    }
    
    if (Array.isArray(cpu.single)) {
        cpu.single.forEach((usage, index) => {
            if (typeof usage === 'number') {
                updateProgress(`CPU${index + 1}_progress`, usage*100);
            }
        });
    }
}

/**
 * 更新内存信息
 * @param {Object} mem - 内存数据
 */
function updateMemInfo(mem) {
    if (!mem) return;
    
    if (mem.virtual) {
        const {used: vUsed = 0, total: vTotal = 0} = mem.virtual;
        const vUsage = vTotal ? vUsed/vTotal : 0;
        updateText('MEM', (vUsage*100).toFixed(2)+'%');
        updateProgress('MEM_progress', vUsage*100);
    }
    
    if (mem.swap) {
        const {used: sUsed = 0, total: sTotal = 0} = mem.swap;
        const sUsage = sTotal ? sUsed/sTotal : 0;
        updateProgress('SWAP_progress', sUsage*100);
    }
    
    const memTooltip = `virtual: ${strB(mem.virtual?.used || 0)}/${strB(mem.virtual?.total || 0)}\nswap: ${strB(mem.swap?.used || 0)}/${strB(mem.swap?.total || 0)}`;
    updateTooltip('MEM_item', memTooltip);
}

/**
 * 更新网络信息
 * @param {Object} net - 网络数据
 */
function updateNetInfo(net) {
    if (!net) return;
    
    // 更新总体网络统计
    if (net.delta) {
        updateText('NET_IN', strbps(net.delta.in || 0));
        updateText('NET_OUT', strbps(net.delta.out || 0));
    }
    
    if (net.total) {
        updateText('NET_IN_TOTAL', strB(net.total.in || 0));
        updateText('NET_OUT_TOTAL', strB(net.total.out || 0));
    }
    
    // 更新各设备网络信息
    if (net.devices) {
        for (const [device, Net] of Object.entries(net.devices)) {
            if (Net.delta) {
                updateText(`net_${device}_delta_in`, strbps(Net.delta.in || 0));
                updateText(`net_${device}_delta_out`, strbps(Net.delta.out || 0));
            }
            if (Net.total) {
                updateText(`net_${device}_total_in`, strB(Net.total.in || 0));
                updateText(`net_${device}_total_out`, strB(Net.total.out || 0));
            }
        }
    }
}

/**
 * 更新主机信息
 * @param {Object} host - 主机数据
 */
function updateHostInfo(host) {
    if (!host) return;
    
    const hostContent = 
`系统: ${host.os || 'Unknown'}
平台: ${host.platform || 'Unknown'}
内核版本: ${host.kernelVersion || 'Unknown'}
内核架构: ${host.kernelArch || 'Unknown'}
启动: ${host.bootTime ? new Date(host.bootTime*1000).toLocaleString() : 'Unknown'}
在线: ${host.uptime ? (host.uptime/86400).toFixed(2) : '0.00'}天`;
    
    updateTooltip('host', hostContent);
}

/**
 * 处理错误
 * @param {Error|string} error - 错误信息
 * @param {boolean} clearData - 是否清除数据
 */
function handleError(error, clearData = true) {
    console.error('System stats error:', error);
    if (clearData) clearAllData();
}

/**
 * 更新系统组件
 * @param {Object} data - 系统数据
 */
function updateSystemComponents(data) {
    const components = [
        { name: 'cpu', updater: updateCPUInfo },
        { name: 'mem', updater: updateMemInfo },
        { name: 'net', updater: updateNetInfo },
        { name: 'host', updater: updateHostInfo }
    ];

    components.forEach(({ name, updater }) => {
        if (data[name]) {
            try {
                updater(data[name]);
            } catch (error) {
                console.warn(`Error updating ${name}:`, error);
            }
        }
    });
}

async function get(){
    try {
        const nodeId = getNodeIdFromUrl();
        if (!nodeId) return handleError('No node ID found');

        const response = await fetch("/stats/data");
        if (!response.ok) return handleError(`HTTP error: ${response.status}`);

        const data = await response.json();
        const validData = validateSystemData(data, nodeId);
        
        if (validData) {
            updateSystemComponents(validData);
        } else {
            handleError('Invalid system data');
        }
    } catch (error) {
        handleError(error);
    }
}

/**
 * 流量数据处理模块
 */

// 流量数据缓存
let trafficCache = {
    used: 0,
    limit: 0,
    remaining: 0,
    lastUpdate: 0
};

/**
 * 更新流量统计显示
 */
async function updateTrafficStats() {
    try {
        // 1. 获取节点ID
        const pathParts = window.location.pathname.split('/');
        const nodeId = pathParts[pathParts.length - 1];
        if (!nodeId) return;

        // 2. 获取流量数据
        const response = await fetch(`/stats/${nodeId}/traffic`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 3. 数据验证和缓存
        if (isValidTrafficData(data)) {
            trafficCache = {
                used: data.traffic_used || 0,
                limit: data.traffic_limit || 0,
                remaining: data.traffic_remaining || 0,
                lastUpdate: Date.now()
            };
        }
        
        // 4. 更新显示
        updateTrafficUI();
        
    } catch (error) {
        console.warn('Failed to update traffic stats:', error);
        // 发生错误时仍然尝试用缓存数据更新UI
        updateTrafficUI();
    }
}

/**
 * 验证流量数据
 */
function isValidTrafficData(data) {
    return data && 
           typeof data.traffic_used === 'number' && 
           typeof data.traffic_limit === 'number' &&
           data.traffic_used >= 0 && 
           data.traffic_limit >= 0;
}

/**
 * 更新流量显示UI
 */
function updateTrafficUI() {
    try {
        // 更新文本显示
        const elements = {
            'traffic-used': trafficCache.used,
            'traffic-remaining': trafficCache.remaining,
            'traffic-limit': trafficCache.limit
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = strB(value);
            }
        });
        
        // 更新进度条 - 使用width属性而不是transform
        const progressBar = document.getElementById('traffic-progress-bar');
        if (progressBar && trafficCache.limit > 0) {
            const ratio = Math.min(trafficCache.used / trafficCache.limit, 1);
            progressBar.style.width = `${ratio * 100}%`;
        }
    } catch (error) {
        console.error('Error updating traffic UI:', error);
    }
}

// 初始化流量数据
document.addEventListener('DOMContentLoaded', () => {
    try {
        // 从预处理数据初始化
        const preProcessedData = JSON.parse(
            document.getElementById('preprocessed-data').value || '{}'
        );
        
        if (preProcessedData) {
            trafficCache = {
                used: preProcessedData.traffic_used || 0,
                limit: preProcessedData.traffic_limit || 0,
                remaining: preProcessedData.traffic_remaining || 0,
                lastUpdate: Date.now()
            };
            
            // 立即更新显示
            updateTrafficUI();
        }
        
        // 启动定时更新
        updateTrafficStats();
        setInterval(updateTrafficStats, 30000); // 每30秒更新一次
        
    } catch (error) {
        console.error('Error initializing traffic data:', error);
    }
});
// 初始化
let updateInterval;
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

function startUpdating() {
    get().catch(error => {
        console.error('Initial fetch failed:', error);
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retrying in ${RETRY_DELAY/1000} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
            setTimeout(startUpdating, RETRY_DELAY);
        }
    });
    updateInterval = setInterval(get, 1000);
}

function stopUpdating() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    retryCount = 0;
}

// 当页面可见性改变时处理更新
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopUpdating();
    } else {
        startUpdating();
    }
});

// 页面加载完成后开始更新
document.addEventListener('DOMContentLoaded', () => {
    startUpdating();
    
    // 初始更新流量统计
    updateTrafficStats();
});

