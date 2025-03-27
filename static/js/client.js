/**
 * DStatus 客户端
 * 用于收集系统信息并上报到服务器
 * 版本：1.0.0
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');

// 读取配置文件
let config;
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (err) {
    console.error('无法读取配置文件:', err.message);
    process.exit(1);
}

// 默认配置
const defaultConfig = {
    server: 'http://localhost:5555',
    apiKey: '',
    interval: 5,
    device: 'eth0',
    port: 9999
};

// 合并配置
config = { ...defaultConfig, ...config };

// 验证配置
if (!config.server) {
    console.error('服务器地址未配置');
    process.exit(1);
}

if (!config.apiKey) {
    console.error('API密钥未配置');
    process.exit(1);
}

// 去除服务器URL末尾的斜杠
config.server = config.server.replace(/\/$/, '');

console.log('DStatus 客户端启动');
console.log('服务器地址:', config.server);
console.log('上报间隔:', config.interval, '秒');
console.log('监控网卡:', config.device);
console.log('API端口:', config.port);

// 获取系统信息
function getSystemInfo() {
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus().length
    };
}

// 获取网络流量
function getNetworkTraffic(callback) {
    const device = config.device;
    
    // 读取 /proc/net/dev 文件获取网络流量
    fs.readFile('/proc/net/dev', 'utf8', (err, data) => {
        if (err) {
            console.error('读取网络流量失败:', err.message);
            return callback({});
        }
        
        const lines = data.split('\n');
        let traffic = {};
        
        for (const line of lines) {
            if (line.includes(device)) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 10) {
                    traffic = {
                        rx: parseInt(parts[1], 10),
                        tx: parseInt(parts[9], 10)
                    };
                    break;
                }
            }
        }
        
        callback(traffic);
    });
}

// 获取CPU使用率
function getCpuUsage(callback) {
    exec('top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk \'{print 100 - $1}\'', (err, stdout) => {
        if (err) {
            console.error('获取CPU使用率失败:', err.message);
            return callback(0);
        }
        
        const cpuUsage = parseFloat(stdout.trim());
        callback(isNaN(cpuUsage) ? 0 : cpuUsage);
    });
}

// 获取磁盘使用情况
function getDiskUsage(callback) {
    exec('df -h / | tail -n 1 | awk \'{print $5}\'', (err, stdout) => {
        if (err) {
            console.error('获取磁盘使用率失败:', err.message);
            return callback(0);
        }
        
        const diskUsage = parseInt(stdout.trim().replace('%', ''), 10);
        callback(isNaN(diskUsage) ? 0 : diskUsage);
    });
}

// 收集所有状态信息
function collectStats(callback) {
    const systemInfo = getSystemInfo();
    
    getCpuUsage((cpuUsage) => {
        getDiskUsage((diskUsage) => {
            getNetworkTraffic((networkTraffic) => {
                const stats = {
                    ...systemInfo,
                    cpu: cpuUsage,
                    disk: diskUsage,
                    network: networkTraffic,
                    timestamp: Date.now()
                };
                
                callback(stats);
            });
        });
    });
}

// 上报状态到服务器
function reportStats(stats) {
    const data = JSON.stringify({
        apiKey: config.apiKey,
        stats: stats
    });
    
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };
    
    const url = `${config.server}/stats/update`;
    const req = url.startsWith('https') ? https.request(url, options) : http.request(url, options);
    
    req.on('error', (err) => {
        console.error('上报状态失败:', err.message);
    });
    
    req.write(data);
    req.end();
}

// 创建HTTP服务器，用于接收服务器的请求
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/status') {
        collectStats((stats) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', stats }));
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(config.port, () => {
    console.log(`HTTP服务器已启动，监听端口: ${config.port}`);
});

// 定时上报状态
setInterval(() => {
    collectStats((stats) => {
        reportStats(stats);
    });
}, config.interval * 1000);

// 立即上报一次状态
collectStats((stats) => {
    reportStats(stats);
    console.log('初始状态已上报');
});

// 处理进程退出
process.on('SIGINT', () => {
    console.log('正在关闭客户端...');
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('正在关闭客户端...');
    server.close();
    process.exit(0);
}); 