var G = 1024 * 1024 * 1024; // 1GB in bytes

// 安全的数据解析
function safeParseTrafficData() {
    try {
        const element = document.getElementById('traffic_data');
        if (!element || !element.value) {
            console.warn('Traffic data element not found or empty');
            return {hs: [], ds: [], ms: []};
        }
        return JSON.parse(element.value);
    } catch (e) {
        console.error('Error parsing traffic data:', e);
        return {hs: [], ds: [], ms: []};
    }
}

var traffic = safeParseTrafficData(), hs_tot = 0, ds_tot = 0, ms_tot = 0;

// 安全的数据格式化
function safeFormatTraffic(value) {
    if (value === null || value === undefined || value === -1) {
        return '0.000';
    }
    try {
        const gb = value / G;
        return gb.toFixed(3);
    } catch (e) {
        console.error('Error formatting traffic value:', e);
        return '0.000';
    }
}

// 处理24小时数据
var hsData = {
    in: [],
    out: []
};
for (const data of traffic.hs || []) {
    if (!Array.isArray(data) || data.length !== 2) continue;
    const [i, o] = data;
    hs_tot += i + o;
    hsData.in.push(safeFormatTraffic(i));
    hsData.out.push(safeFormatTraffic(o));
}

// 处理31天数据
var dsData = {
    in: [],
    out: []
};
for (const data of traffic.ds || []) {
    if (!Array.isArray(data) || data.length !== 2) continue;
    const [i, o] = data;
    ds_tot += i + o;
    dsData.in.push(safeFormatTraffic(i));
    dsData.out.push(safeFormatTraffic(o));
}

// 处理12个月数据
var msData = {
    in: [],
    out: []
};
for (const data of traffic.ms || []) {
    if (!Array.isArray(data) || data.length !== 2) continue;
    const [i, o] = data;
    ms_tot += i + o;
    msData.in.push(safeFormatTraffic(i));
    msData.out.push(safeFormatTraffic(o));
}

// 安全的时间标签生成
function generateTimeLabels(count, format, timeUnit) {
    const labels = [];
    try {
        const now = new Date();
        for (let i = 0; i < count; i++) {
            const time = new Date(now);
            switch (timeUnit) {
                case 'hour':
                    time.setHours(time.getHours() - i);
                    time.setMinutes(59);
                    break;
                case 'day':
                    time.setDate(time.getDate() - i);
                    break;
                case 'month':
                    time.setMonth(time.getMonth() - i);
                    break;
            }
            labels.push(time.Format(format));
        }
    } catch (e) {
        console.error('Error generating time labels:', e);
        for (let i = 0; i < count; i++) {
            labels.push('--');
        }
    }
    return labels.reverse();
}

var hsLabels = generateTimeLabels(24, 'HH:mm', 'hour');
var dsLabels = generateTimeLabels(31, 'MM-dd', 'day');
var msLabels = generateTimeLabels(12, 'yyyy-MM', 'month');

// 更新总流量显示
document.getElementById('hs_tot').innerText = `24h: ${(hs_tot/G).toFixed(2)}GB`;
document.getElementById('ds_tot').innerText = `31d: ${(ds_tot/G).toFixed(2)}GB`;
document.getElementById('ms_tot').innerText = `12m: ${(ms_tot/G).toFixed(2)}GB`;

// 图表配置
const trafficChartConfig = (labels, inData, outData, title = '') => ({
    ...baseChartOptions,
    chart: {
        ...baseChartOptions.chart,
        type: 'area',
        stacked: false,
        animations: {
            enabled: true,
            easing: 'linear',
            speed: 500
        },
        background: 'transparent',
        toolbar: {
            show: false
        },
        zoom: {
            enabled: false
        }
    },
    title: {
        text: title,
        align: 'left',
        style: {
            fontSize: '14px',
            color: '#94a3b8'
        }
    },
    colors: [
        '#0369a1',  // 下行 - 深蓝色
        '#0284c7'   // 上行 - 中蓝色
    ],
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
    series: [{
        name: '下行',
        data: inData
    }, {
        name: '上行',
        data: outData
    }],
    xaxis: {
        categories: labels,
        labels: {
            style: {
                colors: '#94a3b8'
            },
            formatter: function(value, timestamp, index) {
                if (typeof index !== 'number') return value;
                let interval;
                if (labels.length <= 12) {  // 月度数据
                    interval = 1;
                } else if (labels.length <= 31) {  // 天数据
                    interval = window.innerWidth < 768 ? 4 : 2;
                } else {  // 小时数据
                    interval = window.innerWidth < 768 ? 6 : 3;
                }
                return index % interval === 0 ? value : '';
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
            formatter: (val) => {
                if (val === null || !isFinite(val)) return '0 GB';
                return Number(val).toFixed(2) + ' GB';
            },
            style: {
                colors: '#94a3b8'  // 与横轴颜色一致
            }
        },
        min: 0,
        tickAmount: 5,
        axisBorder: {
            show: false
        },
        axisTicks: {
            show: false
        }
    },
    grid: {
        show: true,
        borderColor: 'rgba(148, 163, 184, 0.1)',
        strokeDashArray: 4,
        xaxis: {
            lines: {
                show: true
            }
        },
        yaxis: {
            lines: {
                show: true
            }
        },
        padding: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0
        }
    }
});

// 初始化图表
document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化图表实例
    const hsChart = new ApexCharts(
        document.querySelector("#hs"), 
        trafficChartConfig(hsLabels, hsData.in, hsData.out, '过去24小时流量统计')
    );
    const dsChart = new ApexCharts(
        document.querySelector("#ds"), 
        trafficChartConfig(dsLabels, dsData.in, dsData.out, '过去31天流量统计')
    );
    const msChart = new ApexCharts(
        document.querySelector("#ms"), 
        trafficChartConfig(msLabels, msData.in, msData.out, '过去12个月流量统计')
    );
    
    // 2. 设置初始状态
    const trafficPanel = document.querySelector('.bg-white\\/5:has([data-tab="traffic-hs"])');
    if (trafficPanel) {
        // 隐藏所有内容
        trafficPanel.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        // 显示24小时内容
        const hourlyContent = trafficPanel.querySelector('#traffic-hs');
        if (hourlyContent) {
            hourlyContent.classList.remove('hidden');
        }
        
        // 设置标签状态
        trafficPanel.querySelectorAll('.tab-button').forEach(tab => {
            const isHourly = tab.dataset.tab === 'traffic-hs';
            tab.classList.toggle('bg-slate-700/50', isHourly);
            tab.classList.toggle('text-white', isHourly);
        });
    }
    
    // 3. 渲染图表
    hsChart.render();
    dsChart.render();
    msChart.render();
});