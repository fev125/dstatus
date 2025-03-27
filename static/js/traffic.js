/**
 * 流量数据处理模块
 * 依赖:
 * - traffic-format.js
 * - traffic-utils.js
 */

var G = 1024 * 1024 * 1024; // 1GB in bytes

// 防止重复调用的标志和数据缓存
const TrafficState = {
    isUpdating: false,
    cache: {
        lastUpdate: 0,
        lastData: null,
        CACHE_DURATION: 30 * 1000  // 30秒缓存
    }
};

// 图表基础配置
const trafficBaseOptions = {
    chart: {
        height: 300,
        type: 'area',
        fontFamily: 'Inter, sans-serif',
        zoom: {
            enabled: false
        },
        toolbar: {
            show: false
        },
        background: 'transparent'
    },
    dataLabels: {
        enabled: false
    },
    stroke: {
        curve: 'smooth',
        width: 2
    },
    tooltip: {
        theme: 'dark',
        shared: true,
        intersect: false,
        y: {
            formatter: function (val) {
                return val.toFixed(3) + ' GB';
            }
        }
    },
    legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'right',
        floating: true,
        offsetY: -25,
        offsetX: -5,
        labels: {
            colors: '#94a3b8'
        }
    }
};

// 图表管理器
const TrafficChartManager = {
    // 图表实例
    charts: {},
    
    // 基础配置
    baseOptions: {
        chart: {
            height: 300,
            type: 'area',
            fontFamily: 'Inter, sans-serif',
            zoom: { enabled: false },
            toolbar: { show: false },
            background: 'transparent',
            animations: {
                enabled: true,
                easing: 'linear',
                speed: 500
            }
        },
        dataLabels: { enabled: false },
        stroke: {
            curve: 'smooth',
            width: 2
        },
        colors: ['#0369a1', '#0284c7'],
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.35,
                opacityTo: 0.05,
                stops: [0, 95, 100]
            }
        },
        tooltip: {
            theme: 'dark',
            shared: true,
            y: {
                formatter: val => val.toFixed(3) + ' GB'
            }
        },
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'right',
            floating: true,
            offsetY: -25,
            offsetX: -5,
            labels: { colors: '#94a3b8' }
        },
        grid: {
            show: true,
            borderColor: 'rgba(148, 163, 184, 0.1)',
            strokeDashArray: 4,
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: true } },
            padding: { top: 0, right: 0, bottom: 0, left: 0 }
        }
    },

    // 初始化图表
    init() {
        const containers = {
            hs: { id: 'hs', title: '过去24小时流量统计', count: 24, unit: 'hour' },
            ds: { id: 'ds', title: '过去31天流量统计', count: 31, unit: 'day' },
            ms: { id: 'ms', title: '过去12个月流量统计', count: 12, unit: 'month' }
        };

        for (const [key, config] of Object.entries(containers)) {
            const container = document.getElementById(config.id);
            if (!container) continue;

            container.style.display = 'block';
            container.style.height = '300px';

            this.charts[key] = new ApexCharts(
                container,
                this.createChartConfig(
                    this.generateTimeLabels(config.count, config.unit),
                    [], [],
                    config.title
                )
            );
            this.charts[key].render();
        }
    },

    // 生成图表配置
    createChartConfig(labels, inData, outData, title) {
        return {
            ...this.baseOptions,
            title: {
                text: title,
                align: 'left',
                style: { fontSize: '14px', color: '#94a3b8' }
            },
            series: [
                { name: '下行', data: inData },
                { name: '上行', data: outData }
            ],
            xaxis: {
                categories: labels,
                labels: {
                    style: { colors: '#94a3b8' },
                    formatter: (value, timestamp, index) => {
                        if (typeof index !== 'number') return value;
                        const interval = labels.length <= 12 ? 1 : 
                                       labels.length <= 31 ? (window.innerWidth < 768 ? 4 : 2) : 
                                       (window.innerWidth < 768 ? 6 : 3);
                        return index % interval === 0 ? value : '';
                    }
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: {
                    formatter: val => isFinite(val) ? val.toFixed(2) + ' GB' : '0 GB',
                    style: { colors: '#94a3b8' }
                },
                min: 0,
                tickAmount: 5,
                axisBorder: { show: false },
                axisTicks: { show: false }
            }
        };
    },

    // 生成时间标签
    generateTimeLabels(count, unit) {
        const now = new Date();
        const labels = [];
        
        for (let i = count - 1; i >= 0; i--) {
            const time = new Date(now);
            switch (unit) {
                case 'hour':
                    time.setHours(time.getHours() - i);
                    labels.push(`${time.getHours().toString().padStart(2, '0')}:00`);
                    break;
                case 'day':
                    time.setDate(time.getDate() - i);
                    labels.push(`${(time.getMonth() + 1).toString().padStart(2, '0')}-${time.getDate().toString().padStart(2, '0')}`);
                    break;
                case 'month':
                    time.setMonth(time.getMonth() - i);
                    labels.push(`${time.getFullYear()}-${(time.getMonth() + 1).toString().padStart(2, '0')}`);
                    break;
            }
        }
        return labels;
    },

    // 更新图表数据
    updateChart(type, data) {
        const chart = this.charts[type];
        if (!chart || !Array.isArray(data)) return;

        const series = data.reduce((acc, [i, o]) => {
            acc.in.push(this.formatTraffic(i));
            acc.out.push(this.formatTraffic(o));
            return acc;
        }, { in: [], out: [] });

        chart.updateSeries([
            { name: '下行', data: series.in },
            { name: '上行', data: series.out }
        ]);
    },

    // 格式化流量数据(转换为GB)
    formatTraffic(bytes) {
        if (!bytes || isNaN(bytes)) return 0;
        return Number((bytes / (1024 * 1024 * 1024)).toFixed(3));
    }
};

// 流量数据管理器
const TrafficDataManager = {
    isUpdating: false,
    cache: {
        lastUpdate: 0,
        data: null,
        duration: 30 * 1000
    },

    // 获取节点ID
    getNodeId() {
        const matches = window.location.pathname.match(/\/stats\/([^\/]+)/);
        return matches ? matches[1] : document.getElementById('current_node_id')?.value;
    },

    // 获取流量数据
    async fetchData(nodeId) {
        try {
            const response = await fetch(`/stats/${nodeId}/traffic`);
            const { data, error } = await response.json();
            
            if (error || !data?.ds) return null;
            
            return {
                ds: data.ds,
                hs: data.hs || new Array(24).fill([0,0]),
                ms: data.ms || new Array(12).fill([0,0]),
                traffic_reset_day: data.traffic_reset_day || 1,
                traffic_limit: data.traffic_limit || 0,
                calibration_date: data.calibration_date || 0,
                calibration_value: data.calibration_value || 0
            };
        } catch {
            return null;
        }
    },

    // 更新流量显示
    async updateDisplay(nodeId) {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            const now = Date.now();
            if (this.cache.data && (now - this.cache.lastUpdate) < this.cache.duration) {
                this.processData(this.cache.data);
                return;
            }

            const data = await this.fetchData(nodeId);
            if (!data) return;

            this.cache.data = data;
            this.cache.lastUpdate = now;
            this.processData(data);
        } finally {
            this.isUpdating = false;
        }
    },

    // 处理流量数据
    processData(data) {
        if (!data) return;

        // 更新图表
        ['hs', 'ds', 'ms'].forEach(type => {
            if (Array.isArray(data[type])) {
                TrafficChartManager.updateChart(type, data[type]);
                this.updateTotal(type + '_tot', data[type]);
            }
        });

        // 更新月度流量
        if (window.TrafficManager?.updateMonthlyStats) {
            window.TrafficManager.updateMonthlyStats(data);
        }
    },

    // 更新总流量显示
    updateTotal(elementId, data) {
        if (!Array.isArray(data)) return;

        const total = data.reduce((sum, [i, o]) => sum + (Number(i) || 0) + (Number(o) || 0), 0);
        const element = document.getElementById(elementId);
        if (!element) return;

        const prefix = {
            'hs_tot': '24小时:',
            'ds_tot': '31天:',
            'ms_tot': '12个月:'
        }[elementId] || '';

        element.innerHTML = `<span class='font-medium'>${prefix}</span> <span class='text-white'>${window.TrafficFormat.formatBytes(total)}</span>`;
    }
};

// 标签管理器
const TrafficTabManager = {
    init() {
        const tabs = document.querySelectorAll('[data-tab^="traffic-"]');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => this.activateTab(tab));
        });

        // 处理URL hash或激活默认标签
        if (!this.handleUrlHash()) {
            const defaultTab = document.querySelector('[data-tab="traffic-hs"]');
            if (defaultTab) this.activateTab(defaultTab);
        }
    },

    activateTab(tab) {
        const targetId = tab.dataset.tab;
        if (!targetId) return;

        // 更新标签状态
        document.querySelectorAll('[data-tab^="traffic-"]').forEach(t => {
            t.classList.toggle('bg-slate-700/50', t === tab);
            t.classList.toggle('text-white', t === tab);
        });

        // 更新内容显示
        document.querySelectorAll('[id^="traffic-"].tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        document.getElementById(targetId)?.classList.remove('hidden');

        // 刷新图表
        const chartType = targetId.replace('traffic-', '');
        const chart = TrafficChartManager.charts[chartType];
        if (chart) {
                setTimeout(() => {
                if (!document.getElementById(targetId)?.classList.contains('hidden')) {
                    chart.render();
                    }
                }, 50);
        }
    },

    handleUrlHash() {
        const hash = window.location.hash.substring(1);
        if (hash?.startsWith('traffic-')) {
            const tab = document.querySelector(`[data-tab="${hash}"]`);
            if (tab) {
                setTimeout(() => this.activateTab(tab), 100);
                return true;
            }
        }
        return false;
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    TrafficChartManager.init();
    TrafficTabManager.init();
    
    const nodeId = TrafficDataManager.getNodeId();
    if (nodeId) {
        TrafficDataManager.updateDisplay(nodeId);
        setInterval(() => TrafficDataManager.updateDisplay(nodeId), 60 * 1000);
    }
});

// 导出必要的函数
window.TrafficStats = {
    updateTrafficStats: data => TrafficDataManager.processData(data)
};