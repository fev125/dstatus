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

// 基础图表配置
const baseChartOptions = {
    chart: {
        type: 'line',
        height: '100%',  // 修改为百分比高度
        fontFamily: 'inherit',
        background: 'transparent',
        animations: {
            enabled: true,
            easing: 'easeinout',
            speed: 800,
            dynamicAnimation: {
                enabled: true,
                speed: 350
            }
        },
        toolbar: {
            show: true,
            offsetX: -5,
            offsetY: 5,
            tools: {
                download: true,
                selection: true,
                zoom: true,
                zoomin: true,
                zoomout: true,
                pan: true,
                reset: true
            }
        },
        zoom: {
            enabled: true
        }
    },
    stroke: {
        curve: 'smooth',
        width: 2,
        lineCap: 'round',
        dashArray: 0
    },
    grid: {
        show: true,
        borderColor: 'rgba(148, 163, 184, 0.1)',
        strokeDashArray: 4,
        padding: {
            top: 5,
            right: 5,
            bottom: 5,
            left: 5
        }
    },
    dataLabels: {
        enabled: false
    },
    markers: {
        size: 0,
        hover: {
            size: 5,
            sizeOffset: 3
        }
    },
    tooltip: {
        theme: 'dark',
        marker: {
            show: true
        },
        x: {
            show: true
        }
    },
    legend: {
        position: 'top',
        horizontalAlign: 'right',
        offsetY: -5,
        labels: {
            colors: '#94a3b8'
        },
        itemMargin: {
            horizontal: 10
        }
    }
};

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
            height: '100%',  // 修改为百分比高度
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
            height: '100%',  // 修改为百分比高度
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
        },
        stroke: {
            curve: 'smooth',
            width: 2
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            offsetY: -5,
            labels: {
                colors: '#94a3b8'
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

// ApexCharts实例
let tenMinLoadChart, 
    realtimeBandwidthChart, 
    minuteLoadChart, hourLoadChart, 
    minuteBandwidthChart, hourBandwidthChart;

/**
 * 初始化所有图表
 */
function initCharts() {
    try {
        // 初始化时间标签
        initTimeLabels();
        initBandwidthTimeLabels();
        
        // 负载图表
        tenMinLoadChart = createTenMinLoadChart();
        minuteLoadChart = new ApexCharts(
            document.querySelector("#load-m"), 
            createLoadChartOptions(minuteData, '过去60分钟系统负载')
        );
        hourLoadChart = new ApexCharts(
            document.querySelector("#load-h"), 
            createLoadChartOptions(hourData, '过去24小时系统负载')
        );

        // 带宽图表
        realtimeBandwidthChart = createRealtimeBandwidthChart();
        minuteBandwidthChart = new ApexCharts(
            document.querySelector("#bandwidth-60m-chart"), 
            createBandwidthChartOptions(minuteData, '过去60分钟带宽使用')
        );
        hourBandwidthChart = new ApexCharts(
            document.querySelector("#bandwidth-24h-chart"), 
            createBandwidthChartOptions(hourData, '过去24小时带宽统计')
        );

        // 渲染所有图表
        Promise.all([
            tenMinLoadChart.render(),
            minuteLoadChart.render(),
            hourLoadChart.render(),
            realtimeBandwidthChart.render(),
            minuteBandwidthChart.render(),
            hourBandwidthChart.render()
        ]).then(() => {
            console.log('所有图表初始化完成');
            // 图表渲染完成后调整高度
            setTimeout(adjustChartContainerHeights, 300);
        }).catch(err => {
            console.error('图表渲染错误:', err);
        });
    } catch (e) {
        console.error('初始化图表错误:', e);
    }
}

// 页面初始化完成后设置所有图表
document.addEventListener('DOMContentLoaded', function() {
    // 初始化图表
    initCharts();
    
    // 设置更新逻辑
    setupUpdates();
});

// 在窗口大小改变时调整图表高度
window.addEventListener('resize', function() {
    // 防抖动处理，避免频繁调整
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(function() {
        adjustChartContainerHeights();
        
        // 通知图表容器大小变化
        if (tenMinLoadChart) tenMinLoadChart.render();
        if (realtimeBandwidthChart) realtimeBandwidthChart.render();
        if (minuteLoadChart) minuteLoadChart.render();
        if (hourLoadChart) hourLoadChart.render();
        if (minuteBandwidthChart) minuteBandwidthChart.render();
        if (hourBandwidthChart) hourBandwidthChart.render();
    }, 300);
});

/**
 * 更新所有图表数据
 * @param {Object} data - 实时数据对象
 */
function updateCharts(data) {
    try {
        const nodeId = window.location.pathname.split('/').filter(Boolean)[1];
        const nodeData = data[nodeId];
        
        // 增强数据验证
        if (!nodeData?.stat || typeof nodeData.stat !== 'object') {
            console.warn('Invalid node data structure');
            return;
        }

        // 安全地访问数据
        const cpu = nodeData.stat.cpu || { multi: 0 };
        const mem = nodeData.stat.mem || { 
            virtual: { used: 0, total: 1, usedPercent: 0 },
            swap: { used: 0, total: 1, usedPercent: 0 }
        };
        const net = nodeData.stat.net || { 
            delta: { in: 0, out: 0 },
            total: { in: 0, out: 0 }
        };
        
        // 使用安全的数据访问方式
        const newCpuValue = safeFormatNumber((cpu.multi || 0) * 100);
        const newMemValue = safeFormatNumber(mem.virtual?.usedPercent || 0);
        const newSwapValue = safeFormatNumber(mem.swap?.usedPercent || 0);
        
        // 处理带宽数据（转换为Mbps）
        const newIbwValue = Number(((net.delta?.in || 0) / 128 / 1024).toFixed(2));
        const newObwValue = Number(((net.delta?.out || 0) / 128 / 1024).toFixed(2));
        
        // 更新实时数据
        if (realtimeData) {
            realtimeData.cpu.shift();
            realtimeData.mem.shift();
            realtimeData.swap.shift();
            
            realtimeData.cpu.push(newCpuValue);
            realtimeData.mem.push(newMemValue);
            realtimeData.swap.push(newSwapValue);
        }
        
        // 更新带宽数据
        if (realtimeBandwidthData) {
            realtimeBandwidthData.ibw.shift();
            realtimeBandwidthData.obw.shift();
            
            // 使用安全的默认值，确保不会出现无效数据
            const inSpeed = Number.isFinite(newIbwValue) ? newIbwValue : 0;
            const outSpeed = Number.isFinite(newObwValue) ? newObwValue : 0;
            
            realtimeBandwidthData.ibw.push(inSpeed);
            realtimeBandwidthData.obw.push(outSpeed);
        }
        
        // 更新图表
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
            });
        }
        
        if (realtimeBandwidthChart) {
            try {
                realtimeBandwidthChart.updateSeries([{
                    name: '下行',
                    data: realtimeBandwidthData.ibw
                }, {
                    name: '上行',
                    data: realtimeBandwidthData.obw
                }]);
            } catch (e) {
                console.error('更新实时带宽图表错误:', e);
            }
        }
        
        // 每10次更新后重新调整图表高度（大约20秒）
        if (updateCounter % 10 === 0) {
            try {
                adjustChartContainerHeights();
            } catch (e) {
                console.warn('调整图表高度出错:', e);
            }
        }
        
        updateCounter++;
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
    const { type = 'line', colors = [], series = [], yaxisFormatter, yaxis = {}, additional = {} } = options;

    return {
        ...baseChartOptions,
        ...additional,
        colors,
        series,
        chart: {
            ...baseChartOptions.chart,
            type,
            height: '100%',  // 修改为百分比高度
            animations: {
                enabled: false,
                easing: 'linear',
                dynamicAnimation: {
                    speed: 1000
                }
            },
            toolbar: {
                show: false
            }
        },
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
                formatter: yaxisFormatter,
                style: {
                    colors: '#94a3b8'
                }
            },
            ...yaxis
        },
        grid: {
            show: true,
            borderColor: 'rgba(148, 163, 184, 0.1)',
            strokeDashArray: 4,
            padding: {
                top: 5,
                right: 5,
                bottom: 5,
                left: 5
            }
        },
        stroke: {
            curve: type === 'area' ? 'smooth' : 'straight',
            width: 2,
            lineCap: 'round'
        },
        markers: {
            size: 0,
            hover: {
                size: 4,
                sizeOffset: 3
            }
        },
        tooltip: {
            theme: 'dark',
            shared: true,
            intersect: false,
            marker: {
                show: true
            }
        }
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
            type: 'line',
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
                title: {
                    text: '实时系统负载 (1分钟)',
                    align: 'left',
                    style: {
                        fontSize: '14px',
                        color: '#64748b'
                    }
                },
                legend: {
                    position: 'top',
                    horizontalAlign: 'right',
                    offsetY: -5,
                    labels: {
                        colors: '#94a3b8'
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
                '#f59e0b',  // 下行 - 黄色
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
                },
                legend: {
                    position: 'top',
                    horizontalAlign: 'right',
                    offsetY: -5,
                    labels: {
                        colors: '#94a3b8'
                    }
                }
            }
        })
    );
}

// 设置更新间隔为2秒
const UPDATE_INTERVAL = 2000;

// 更新计数器
let updateCounter = 0;

/**
 * 调整图表容器高度以适应卡片
 */
function adjustChartContainerHeights() {
    // 调整负载详情图表高度
    const loadDetailsCard = document.querySelector('.col-span-1.lg\\:col-span-3.card');
    if (loadDetailsCard) {
        const cardHeight = loadDetailsCard.clientHeight;
        const headerHeight = loadDetailsCard.querySelector('.border-b').clientHeight;
        const contentHeight = cardHeight - headerHeight - 32; // 减去padding
        
        const chartContainers = loadDetailsCard.querySelectorAll('.chart-container');
        chartContainers.forEach(container => {
            container.style.height = `${contentHeight}px`;
        });
    }
    
    // 调整带宽监控图表高度
    const bandwidthCharts = ['bandwidth-realtime-chart', 'bandwidth-60m-chart', 'bandwidth-24h-chart'];
    bandwidthCharts.forEach(chartId => {
        const chartEl = document.getElementById(chartId);
        if (chartEl) {
            const card = findParentCard(chartEl);
            if (card) {
                const cardHeight = card.clientHeight;
                const headerHeight = card.querySelector('.border-b').clientHeight;
                const contentHeight = cardHeight - headerHeight - 32; // 减去padding
                chartEl.style.height = `${contentHeight}px`;
            }
        }
    });
    
    // 调整流量统计图表高度
    const trafficCharts = ['ds', 'ms', 'hs'];
    trafficCharts.forEach(chartId => {
        const chartEl = document.getElementById(chartId);
        if (chartEl) {
            const card = findParentCard(chartEl);
            if (card) {
                const cardHeight = card.clientHeight;
                const headerHeight = card.querySelector('.border-b').clientHeight;
                const contentHeight = cardHeight - headerHeight - 32; // 减去padding
                chartEl.style.height = `${contentHeight}px`;
            }
        }
    });
}

/**
 * 查找元素的父卡片元素
 * @param {HTMLElement} element - 要查找的元素
 * @returns {HTMLElement|null} 父卡片元素或null
 */
function findParentCard(element) {
    let current = element;
    while (current) {
        if (current.classList && current.classList.contains('card')) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

/**
 * 设置更新逻辑
 */
function setupUpdates() {
    // 订阅StatManager的数据更新
    if (window.StatManager) {
        window.StatManager.subscribe('load-charts', updateCharts);
    } else {
        console.error('StatManager未找到，图表将无法更新');
    }
    
    // 页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('页面隐藏，降低更新频率');
            // 不取消订阅，只调整更新频率
            if (window.StatManager && window.StatManager._adjustUpdateInterval) {
                window.StatManager._adjustUpdateInterval(10000); // 10秒一次
            }
        } else {
            console.log('页面显示，恢复正常更新频率');
            if (window.StatManager) {
                if (window.StatManager._adjustUpdateInterval) {
                    window.StatManager._adjustUpdateInterval(2000); // 恢复2秒一次
                }
                // 立即执行一次更新
                window.StatManager._fetchRealtimeStats && window.StatManager._fetchRealtimeStats();
                
                // 确保订阅状态
                if (!window.StatManager._subscribers.has('load-charts')) {
                    window.StatManager.subscribe('load-charts', updateCharts);
                }
            }
        }
    });
}