/**
 * 日期格式化扩展
 * 为Date对象添加Format方法，用于格式化日期时间
 * 支持的格式：
 * y: 年, M: 月, d: 日
 * H: 时, m: 分, s: 秒, S: 毫秒
 */
Date.prototype.Format = function(fmt) {
    const o = {
        'M+': this.getMonth() + 1,
        'd+': this.getDate(),
        'H+': this.getHours(),
        'm+': this.getMinutes(),
        's+': this.getSeconds(),
        'S+': this.getMilliseconds()
    };
    // 处理年份
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + '').substr(4 - RegExp.$1.length));
    }
    // 处理其他时间元素
    for (let k in o) {
        if (new RegExp('(' + k + ')').test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (('00' + o[k]).substr(String(o[k]).length)));
        }
    }
    return fmt;
};

/**
 * 安全的JSON解析函数
 * @param {string} elementId - 需要解析的DOM元素ID
 * @param {Array} defaultValue - 解析失败时的默认返回值
 * @returns {Array} 解析结果或默认值
 */
function safeParseJSON(elementId, defaultValue = []) {
    try {
        const element = document.getElementById(elementId);
        if (!element || !element.value) {
            console.warn(`Element ${elementId} not found or empty`);
            return defaultValue;
        }
        return JSON.parse(element.value);
    } catch (e) {
        console.error(`Error parsing JSON from ${elementId}:`, e);
        return defaultValue;
    }
}

/**
 * 数值安全格式化函数
 * @param {number} value - 需要格式化的数值
 * @param {number} decimals - 保留的小数位数
 * @returns {number} 格式化后的数值
 */
function safeFormatNumber(value, decimals = 2) {
    if (value === null || value === undefined || value === -1) {
        return 0;
    }
    try {
        const num = Number(value);
        if (isNaN(num) || !isFinite(num)) {
            return 0;
        }
        return Number(num.toFixed(decimals));
    } catch (e) {
        console.error('Error formatting number:', e);
        return 0;
    }
}

// 从页面加载初始数据
const load_m = safeParseJSON('load_m_data', []);
const load_h = safeParseJSON('load_h_data', []);

/**
 * 60分钟数据存储对象
 * 用于存储过去60分钟的系统负载和网络数据
 */
const minuteData = {
    cpu: [],
    mem: [],
    swap: [],
    ibw: [],
    obw: [],
    labels: []
};

// 处理60分钟数据
for (const data of load_m) {
    if (!data) continue;
    const {cpu = -1, mem = -1, swap = -1, ibw = -1, obw = -1} = data;
    
    // 带宽转换为Mbps
    const safeIbw = ibw === -1 ? 0 : Number((ibw / 128 / 1024).toFixed(2));
    const safeObw = obw === -1 ? 0 : Number((obw / 128 / 1024).toFixed(2));
    
    minuteData.cpu.push(safeFormatNumber(cpu));
    minuteData.mem.push(safeFormatNumber(mem));
    minuteData.swap.push(safeFormatNumber(swap));
    minuteData.ibw.push(safeIbw);
    minuteData.obw.push(safeObw);
}

// 填充不足60个点的数据
while (minuteData.cpu.length < 60) {
    minuteData.cpu.push(0);
    minuteData.mem.push(0);
    minuteData.swap.push(0);
    minuteData.ibw.push(0);
    minuteData.obw.push(0);
}

// 生成60分钟的时间标签
const now = new Date();
for (let i = 0; i < 60; i++) {
    try {
        const time = new Date(now);
        time.setMinutes(time.getMinutes() - i);
        minuteData.labels.push(time.Format('HH:mm'));
    } catch (e) {
        console.error('Error generating time label:', e);
        minuteData.labels.push('--:--');
    }
}
minuteData.labels.reverse();

/**
 * 24小时数据存储对象
 * 用于存储过去24小时的系统负载和网络数据
 */
const hourData = {
    cpu: [],
    mem: [],
    swap: [],
    ibw: [],
    obw: [],
    labels: []
};

// 处理24小时数据
for (const data of load_h) {
    if (!data) continue;
    const {cpu = -1, mem = -1, swap = -1, ibw = -1, obw = -1} = data;
    
    const safeIbw = ibw === -1 ? null : Number((ibw / 128 / 1024).toFixed(2));
    const safeObw = obw === -1 ? null : Number((obw / 128 / 1024).toFixed(2));
    
    hourData.cpu.push(safeFormatNumber(cpu));
    hourData.mem.push(safeFormatNumber(mem));
    hourData.swap.push(safeFormatNumber(swap));
    hourData.ibw.push(safeIbw);
    hourData.obw.push(safeObw);
}

// 生成24小时的时间标签
for (let i = 0, time = new Date(); i < 24; time.setHours(time.getHours() - 1), ++i) {
    hourData.labels.push(time.Format('HH:00'));
}
hourData.labels.reverse();

/**
 * 创建负载图表配置
 * @param {Object} data - 图表数据对象
 * @param {string} title - 图表标题
 * @returns {Object} 图表配置对象
 */
function createLoadChartOptions(data, title = '') {
    // 确保数据安全性
    const safeData = {
        cpu: Array.isArray(data.cpu) ? data.cpu.map(v => v === null ? 0 : v) : [],
        mem: Array.isArray(data.mem) ? data.mem.map(v => v === null ? 0 : v) : [],
        swap: Array.isArray(data.swap) ? data.swap.map(v => v === null ? 0 : v) : [],
        labels: Array.isArray(data.labels) ? data.labels : []
    };

    return {
        ...baseChartOptions,
        colors: [
            '#3b82f6',  // CPU - 蓝色
            '#10b981',  // 内存 - 绿色
            '#8b5cf6'   // SWAP - 紫色
        ],
        series: [{
            name: 'CPU',
            data: safeData.cpu
        }, {
            name: '内存',
            data: safeData.mem
        }, {
            name: 'SWAP',
            data: safeData.swap
        }],
        chart: {
            ...baseChartOptions.chart,
            type: 'line',
            height: 300,
            animations: {
                enabled: false
            },
            toolbar: {
                show: false
            }
        },
        tooltip: {
            ...baseChartOptions.tooltip,
            enabled: true,
            shared: true,
            x: {
                ...baseChartOptions.tooltip.x,
                formatter: function(value, { dataPointIndex }) {
                    return safeData.labels[dataPointIndex] || '';
                }
            },
            y: {
                formatter: function(value) {
                    return Math.round(value) + '%';
                }
            }
        },
        xaxis: {
            categories: safeData.labels,
            labels: {
                style: {
                    colors: '#94a3b8'
                },
                formatter: function(value) {
                    // 每2分钟显示一次标签
                    const index = safeData.labels.indexOf(value);
                    if (index === -1 || !value) return '';
                    return index % 2 === 0 ? value : '';
                },
                rotate: 0,
                trim: false
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            },
            tickPlacement: 'on'
        },
        yaxis: {
            labels: {
                formatter: (val) => {
                    if (val === null || !isFinite(val)) return '0%';
                    return val.toFixed(0) + '%';
                },
                style: {
                    colors: '#94a3b8'  // 统一颜色
                }
            },
            min: 0,
            max: 100,
            tickAmount: 5
        }
    };
}

/**
 * 创建带宽图表配置
 * @param {Object} data - 图表数据对象
 * @param {string} title - 图表标题
 * @returns {Object} 图表配置对象
 */
function createBandwidthChartOptions(data, title = '') {
    // 确保数据安全性
    const safeData = {
        ibw: Array.isArray(data.ibw) ? data.ibw.map(v => v === null ? 0 : v) : [],
        obw: Array.isArray(data.obw) ? data.obw.map(v => v === null ? 0 : v) : [],
        labels: Array.isArray(data.labels) ? data.labels : []
    };

    return {
        ...baseChartOptions,
        colors: [
            '#0ea5e9',  // 下行 - 浅蓝色
            '#2563eb'   // 上行 - 深蓝色
        ],
        series: [{
            name: '下行',
            data: safeData.ibw
        }, {
            name: '上行',
            data: safeData.obw
        }],
        chart: {
            ...baseChartOptions.chart,
            type: 'area',
            animations: {
                enabled: true,
                easing: 'linear',
                dynamicAnimation: {
                    speed: 1000
                }
            },
            toolbar: {
                show: false
            }
        },
        tooltip: {
            ...baseChartOptions.tooltip,
            enabled: true,
            shared: true,
            x: {
                ...baseChartOptions.tooltip.x,
                formatter: function(value, { dataPointIndex }) {
                    return safeData.labels[dataPointIndex] || '';
                }
            },
            y: {
                formatter: function(value) {
                    if (value === null || !isFinite(value)) return '0 Mbps';
                    return value.toFixed(2) + ' Mbps';
                }
            }
        },
        xaxis: {
            categories: safeData.labels,
            labels: {
                style: {
                    colors: '#94a3b8'
                },
                formatter: function(value) {
                    // 每2分钟显示一次标签
                    const index = safeData.labels.indexOf(value);
                    if (index === -1 || !value) return '';
                    return index % 2 === 0 ? value : '';
                },
                rotate: 0,
                trim: false
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            },
            tickPlacement: 'on'
        },
        yaxis: {
            labels: {
                formatter: (val) => {
                    if (val === null || !isFinite(val)) return '0 Mbps';
                    return val.toFixed(2) + ' Mbps';
                },
                style: {
                    colors: '#94a3b8'  // 统一颜色
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.35,
                opacityTo: 0.05,
                stops: [0, 95, 100]
            }
        }
    };
}

/**
 * 实时数据存储对象
 * 用于存储最近1分钟的系统负载数据（每2秒一个点，共30个点）
 */
const realtimeData = {
    cpu: new Array(30).fill(0),
    mem: new Array(30).fill(0),
    swap: new Array(30).fill(0),
    labels: Array(30).fill('')
};

/**
 * 初始化实时数据的时间标签
 */
function initTimeLabels() {
    const now = new Date();
    for(let i = 0; i < 30; i++) {
        const time = new Date(now - (30 - i) * 2000);
        realtimeData.labels[i] = time.Format('HH:mm:ss');
    }
}

/**
 * 实时带宽数据存储对象
 * 用于存储最近3分钟的带宽数据（每2秒一个点，共90个点）
 */
const realtimeBandwidthData = {
    ibw: new Array(90).fill(0),
    obw: new Array(90).fill(0),
    labels: Array(90).fill('')
};

/**
 * 初始化实时带宽数据的时间标签
 */
function initBandwidthTimeLabels() {
    // 生成固定的参考时间标签（每2秒一个点，共90个点，每10秒显示一个标签）
    for(let i = 0; i < 90; i++) {
        const seconds = 180 - (i * 2);  // 从180秒开始倒数
        if (i === 89) {
            realtimeBandwidthData.labels[i] = '最新';
        } else if (seconds % 10 === 0) {  // 每10秒显示一个参考点
            realtimeBandwidthData.labels[i] = seconds + 's';
        } else {
            realtimeBandwidthData.labels[i] = '';  // 其他点不显示标签
        }
    }
}

// 声明全局图表实例
let tenMinLoadChart;
let realtimeBandwidthChart;
let loadChartMinute;
let loadChartHour;
let bandwidthChartMinute;
let bandwidthChartHour;  // 添加24小时带宽图表实例

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化时间标签
    initTimeLabels();
    initBandwidthTimeLabels();
    
    // 创建各个图表实例
    tenMinLoadChart = createTenMinLoadChart();
    realtimeBandwidthChart = createRealtimeBandwidthChart();
    
    loadChartMinute = new ApexCharts(
        document.querySelector("#load-m"),
        createLoadChartOptions(minuteData, '过去60分钟系统负载')
    );
    
    bandwidthChartMinute = new ApexCharts(
        document.querySelector("#load-m-bw"), 
        createBandwidthChartOptions(minuteData, '过去60分钟带宽使用')
    );
    
    loadChartHour = new ApexCharts(
        document.querySelector("#load-h"),
        createLoadChartOptions(hourData, '过去24小时系统负载')
    );
    
    bandwidthChartHour = new ApexCharts(
        document.querySelector("#load-h-bw"),
        createBandwidthChartOptions(hourData, '过去24小时带宽统计')
    );
    
    // 渲染图表
    tenMinLoadChart.render();
    realtimeBandwidthChart.render();
    loadChartMinute.render();
    bandwidthChartMinute.render();
    loadChartHour.render();
    bandwidthChartHour.render();  // 渲染24小时带宽图表
    
    // 设置定时更新
    let updateTimer = setInterval(async () => {
        try {
            const response = await fetch("/stats/data");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            await updateCharts(data);
        } catch (error) {
            console.error('Error updating charts:', error);
        }
    }, UPDATE_INTERVAL);
    
    // 清理函数
    function cleanup() {
        if (updateTimer) {
            clearInterval(updateTimer);
            updateTimer = null;
        }
    }
    
    // 页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cleanup();
        } else {
            if (!updateTimer) {
                updateTimer = setInterval(async () => {
                    try {
                        const response = await fetch("/stats/data");
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        const data = await response.json();
                        await updateCharts(data);
                    } catch (error) {
                        console.error('Error updating charts:', error);
                    }
                }, UPDATE_INTERVAL);
            }
        }
    });
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', cleanup);
});

/**
 * 更新图表数据
 * @param {Object} data - 服务器返回的最新数据
 */
async function updateCharts(data) {
    try {
        const nodeId = window.location.pathname.split('/').filter(Boolean)[1];
        const nodeData = data[nodeId];
        
        // 验证基本数据结构
        if (!nodeData?.stat) return;

        const {cpu, mem, net} = nodeData.stat;
        
        // 处理实时数据更新
        // 处理系统负载数据
        const newCpuValue = safeFormatNumber(cpu.multi * 100);
        const newMemValue = safeFormatNumber(mem.virtual.usedPercent);
        const newSwapValue = safeFormatNumber(mem.swap.usedPercent);
        
        // 处理带宽数据（转换为Mbps）
        const newIbwValue = Number((net.delta.in / 128 / 1024).toFixed(2));
        const newObwValue = Number((net.delta.out / 128 / 1024).toFixed(2));
        
        // 更新实时数据
        realtimeData.cpu.shift();
        realtimeData.mem.shift();
        realtimeData.swap.shift();
        
        realtimeData.cpu.push(newCpuValue);
        realtimeData.mem.push(newMemValue);
        realtimeData.swap.push(newSwapValue);
        
        // 更新带宽数据（只更新数值，保持标签不变）
        realtimeBandwidthData.ibw.shift();
        realtimeBandwidthData.obw.shift();
        
        realtimeBandwidthData.ibw.push(newIbwValue);
        realtimeBandwidthData.obw.push(newObwValue);
        
        // 更新系统负载图表（只更新数据，不更新时间轴）
        if (tenMinLoadChart) {
            tenMinLoadChart.updateOptions({
                series: [{
                    name: 'CPU',
                    data: realtimeData.cpu
                }, {
                    name: '内存',
                    data: realtimeData.mem
                }, {
                    name: 'SWAP',
                    data: realtimeData.swap
                }]
            }, false, true);
        }
        
        // 更新带宽图表（只更新数据，不更新时间轴）
        if (realtimeBandwidthChart) {
            realtimeBandwidthChart.updateOptions({
                series: [{
                    name: '下行',
                    data: realtimeBandwidthData.ibw
                }, {
                    name: '上行',
                    data: realtimeBandwidthData.obw
                }]
            }, false, true);
        }

        // 如果存在历史数据，则更新历史图表
        if (nodeData.stats?.load_m?.length && nodeData.stats?.load_h?.length) {
            const stats = nodeData.stats;

            // 更新60分钟数据
            if (loadChartMinute) {
                loadChartMinute.updateSeries([{
                    name: 'CPU',
                    data: stats.load_m.map(item => item[0])
                }, {
                    name: '内存',
                    data: stats.load_m.map(item => item[1])
                }, {
                    name: 'SWAP',
                    data: stats.load_m.map(item => item[2])
                }]);
            }

            if (bandwidthChartMinute) {
                bandwidthChartMinute.updateSeries([{
                    name: '下行',
                    data: stats.load_m.map(item => item[3])
                }, {
                    name: '上行',
                    data: stats.load_m.map(item => item[4])
                }]);
            }

            // 更新24小时数据
            if (loadChartHour) {
                loadChartHour.updateSeries([{
                    name: 'CPU',
                    data: stats.load_h.map(item => item[0])
                }, {
                    name: '内存',
                    data: stats.load_h.map(item => item[1])
                }, {
                    name: 'SWAP',
                    data: stats.load_h.map(item => item[2])
                }]);
            }

            if (bandwidthChartHour) {
                bandwidthChartHour.updateSeries([{
                    name: '下行',
                    data: stats.load_h.map(item => item[3])
                }, {
                    name: '上行',
                    data: stats.load_h.map(item => item[4])
                }]);
            }
        }
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

/**
 * 创建固定时间标签
 * @param {number} points - 数据点数量
 * @param {number} interval - 每个点的时间间隔（秒）
 * @param {number} labelInterval - 标签显示间隔（秒）
 * @returns {Array} 时间标签数组
 */
function createTimeLabels(points, interval, labelInterval) {
    return Array(points).fill('').map((_, i) => {
        const seconds = points * interval - (i * interval);
        if (i === points - 1) {
            return '最新';
        } else if (seconds % labelInterval === 0) {
            return seconds + 's';
        }
        return '';
    });
}

/**
 * 创建实时图表的基础配置
 * @param {Object} data - 图表数据
 * @param {Array} timeLabels - 时间标签数组
 * @param {Object} options - 额外的配置选项
 * @returns {Object} 图表配置对象
 */
function createRealtimeChartOptions(data, timeLabels, options) {
    return {
        ...baseChartOptions,
        chart: {
            ...baseChartOptions.chart,
            type: options.type || 'line',
            height: 300,
            animations: {
                enabled: false
            },
            toolbar: {
                show: false
            }
        },
        colors: options.colors,
        series: options.series,
        xaxis: {
            categories: timeLabels,
            labels: {
                show: true,
                style: {
                    colors: '#94a3b8'
                },
                formatter: function(value) {
                    return value;  // 直接返回预设的标签
                }
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            }
        },
        yaxis: {
            labels: {
                formatter: options.yaxisFormatter,
                style: {
                    colors: '#94a3b8'
                }
            },
            ...options.yaxis
        },
        ...options.additional
    };
}

/**
 * 创建1分钟实时负载图表
 */
function createTenMinLoadChart() {
    const timeLabels = createTimeLabels(30, 2, 10); // 30个点，每2秒一个，每10秒显示标签
    
    return new ApexCharts(
        document.querySelector("#load-10m-chart"),
        createRealtimeChartOptions(realtimeData, timeLabels, {
            colors: [
                '#3b82f6',  // CPU - 蓝色
                '#10b981',  // 内存 - 绿色
                '#8b5cf6'   // SWAP - 紫色
            ],
            series: [{
                name: 'CPU',
                data: realtimeData.cpu
            }, {
                name: '内存',
                data: realtimeData.mem
            }, {
                name: 'SWAP',
                data: realtimeData.swap
            }],
            yaxisFormatter: (val) => val.toFixed(0) + '%',
            yaxis: {
                min: 0,
                max: 100,
                tickAmount: 5
            },
            additional: {
                stroke: {
                    curve: 'straight',
                    width: 2,
                    lineCap: 'round'
                },
                markers: {
                    size: 0,
                    hover: {
                        size: 3
                    }
                },
                title: {
                    text: '实时系统负载 (1分钟)',
                    align: 'left',
                    style: {
                        fontSize: '14px',
                        color: '#64748b'
                    }
                }
            }
        })
    );
}

/**
 * 创建3分钟实时带宽图表
 */
function createRealtimeBandwidthChart() {
    const timeLabels = createTimeLabels(90, 2, 10); // 90个点，每2秒一个，每10秒显示标签
    
    return new ApexCharts(
        document.querySelector("#bandwidth-realtime-chart"),
        createRealtimeChartOptions(realtimeBandwidthData, timeLabels, {
            type: 'area',
            colors: [
                '#0ea5e9',  // 下行 - 浅蓝色
                '#2563eb'   // 上行 - 深蓝色
            ],
            series: [{
                name: '下行',
                data: realtimeBandwidthData.ibw
            }, {
                name: '上行',
                data: realtimeBandwidthData.obw
            }],
            yaxisFormatter: (val) => {
                if (val === null || !isFinite(val)) return '0 Mbps';
                return val.toFixed(2) + ' Mbps';
            },
            additional: {
                fill: {
                    type: 'gradient',
                    gradient: {
                        shadeIntensity: 1,
                        opacityFrom: 0.35,
                        opacityTo: 0.05,
                        stops: [0, 95, 100]
                    }
                },
                title: {
                    text: '实时带宽监控 (3分钟)',
                    align: 'left',
                    style: {
                        fontSize: '14px',
                        color: '#64748b'
                    }
                }
            }
        })
    );
}

// 设置更新间隔为2秒
const UPDATE_INTERVAL = 2000;