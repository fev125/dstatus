/**
 * region-stats.js
 * 提供地区统计和筛选功能
 */

// 全局变量和DOM引用
// 避免重复声明
if (typeof window.RegionStatsModule === 'undefined') {
window.RegionStatsModule = {
    // DOM 元素引用 - 改为函数形式，确保每次获取最新元素
    getElements() {
        return {
            desktopRegionStats: document.getElementById('region-stats'),
            mobileRegionStats: document.getElementById('region-stats-mobile')
        };
    },
    
    // 元素缓存
    elements: null,
    
    // 当前的地区统计数据
    regionData: new Map(),
    
    // 当前激活的筛选器
    activeFilter: null,
    
    /**
     * 初始化地区统计模块
     */
    init() {
        this.initStyles();
        this.setupEventListeners();
        console.debug('地区统计模块已初始化');
    },
    
    /**
     * 初始化样式
     */
    initStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .region-filter {
                transition: all 0.2s ease-in-out;
            }
            .region-filter:hover {
                transform: scale(1.05);
            }
            .active-filter {
                background-color: rgba(59, 130, 246, 0.5) !important;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
            }
        `;
        document.head.appendChild(style);
    },
    
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 监听窗口加载完成事件
        window.addEventListener('load', () => {
            // 添加全局点击事件，当点击页面空白处时重置地区筛选
            document.addEventListener('click', (event) => {
                // 如果点击的不是地区筛选元素，且不是其子元素
                if (!event.target.closest('.region-filter')) {
                    // 检查是否有任何激活的筛选器
                    const activeFilters = document.querySelectorAll('.region-filter.active-filter');
                    if (activeFilters.length > 0) {
                        this.resetFilter();
                    }
                }
            });
        });
    },
    
    /**
     * 从节点数据中收集地区统计信息
     * @param {Object} nodesData - 节点数据
     * @returns {Map} - 地区统计数据
     */
    collectRegionStats(nodesData) {
        const regionStats = new Map();
        let processedNodes = 0;
        let onlineNodes = 0;
        let nodesWithRegion = 0;
        
        // 处理每个节点
        Object.entries(nodesData || {}).forEach(([sid, node]) => {
            processedNodes++;
            // 跳过非节点数据
            if (!node || typeof node !== 'object' || !node.name) return;
            
            // 统计地区分布(仅统计在线节点)
            const isOnline = node.stat && typeof node.stat === 'object' && !node.stat.offline;
            if (isOnline) {
                onlineNodes++;
                
                // 检查地区信息 - 新的数据结构 data.location.code
                if (node.data?.location?.code) {
                    nodesWithRegion++;
                    const key = node.data.location.code;
                    
                    // 根据国家代码获取国家名称
                    let countryName = '未知国家';
                    let countryFlag = '🏳️';
                    
                    // 常见国家代码映射
                    const countryMap = {
                        'CN': { name: '中国', flag: '🇨🇳' },
                        'US': { name: '美国', flag: '🇺🇸' },
                        'JP': { name: '日本', flag: '🇯🇵' },
                        'KR': { name: '韩国', flag: '🇰🇷' },
                        'SG': { name: '新加坡', flag: '🇸🇬' },
                        'HK': { name: '香港', flag: '🇭🇰' },
                        'TW': { name: '台湾', flag: '🇹🇼' },
                        'GB': { name: '英国', flag: '🇬🇧' },
                        'DE': { name: '德国', flag: '🇩🇪' },
                        'FR': { name: '法国', flag: '🇫🇷' },
                        'RU': { name: '俄罗斯', flag: '🇷🇺' },
                        'CA': { name: '加拿大', flag: '🇨🇦' },
                        'AU': { name: '澳大利亚', flag: '🇦🇺' },
                        'IN': { name: '印度', flag: '🇮🇳' },
                        'BR': { name: '巴西', flag: '🇧🇷' },
                        'CL': { name: '智利', flag: '🇨🇱' }
                    };
                    
                    if (countryMap[key]) {
                        countryName = countryMap[key].name;
                        countryFlag = countryMap[key].flag;
                    }
                    
                    if (!regionStats.has(key)) {
                        regionStats.set(key, {
                            code: key,
                            name: countryName,
                            flag: countryFlag,
                            count: 0
                        });
                    }
                    regionStats.get(key).count++;
                    
                    // 将地区信息添加到节点数据上，用于后续筛选
                    if (!node.regionCode) {
                        node.regionCode = key;
                    }
                }
                // 兼容旧的数据结构 data.location.country
                else if (node.data?.location?.country?.code) {
                    nodesWithRegion++;
                    const country = node.data.location.country;
                    const key = country.code;
                    if (!regionStats.has(key)) {
                        regionStats.set(key, {
                            code: key,
                            name: country.name_zh || country.name,
                            flag: country.flag || '🏳️',
                            count: 0
                        });
                    }
                    regionStats.get(key).count++;
                    
                    // 将地区信息添加到节点数据上，用于后续筛选
                    if (!node.regionCode) {
                        node.regionCode = key;
                    }
                } else {
                    // 如果没有地区信息，使用默认地区
                    const key = 'UNKNOWN';
                    if (!regionStats.has(key)) {
                        regionStats.set(key, {
                            code: key,
                            name: '未知地区',
                            flag: '🏳️',
                            count: 0
                        });
                    }
                    regionStats.get(key).count++;
                    
                    // 添加默认地区码
                    if (!node.regionCode) {
                        node.regionCode = key;
                    }
                }
            }
        });
        
        console.debug('地区统计收集结果:', {
            处理节点数: processedNodes,
            在线节点数: onlineNodes,
            有地区信息节点数: nodesWithRegion,
            地区统计数: regionStats.size,
            地区列表: Array.from(regionStats.keys())
        });
        
        this.regionData = regionStats;
        return regionStats;
    },
    
    /**
     * 获取排序后的前N个地区统计
     * @param {number} limit - 限制返回数量
     * @returns {Array} - 排序后的地区统计数组
     */
    getTopRegions(limit = 9) {
        return Array.from(this.regionData.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    },
    
    /**
     * 更新DOM中的地区统计显示
     * @param {Array} topRegions - 排序后的地区统计数组
     */
    updateRegionStatsDisplay(topRegions) {
        // 更新桌面版地区统计
        if (this.elements.desktopRegionStats) {
            this.elements.desktopRegionStats.innerHTML = topRegions.map(region => `
                <div class="w-[65px] flex items-center justify-between bg-slate-800 rounded-full px-2 py-1 hover:bg-slate-700 cursor-pointer region-filter" data-region="${region.code}" title="点击查看${region.name}的服务器">
                    <div class="flex items-center min-w-0">
                        <span class="text-sm mr-1">${region.flag}</span>
                        <span class="text-xs font-medium">${region.code}</span>
                        <span class="text-xs font-bold ml-1">${region.count}</span>
                    </div>
                </div>
            `).join('');
            
            // 添加点击事件处理
            Array.from(this.elements.desktopRegionStats.querySelectorAll('.region-filter')).forEach(el => {
                el.addEventListener('click', () => {
                    const regionCode = el.dataset.region;
                    this.filterByRegion(regionCode);
                });
            });
        }
        
        // 更新移动版地区统计
        if (this.elements.mobileRegionStats) {
            this.elements.mobileRegionStats.innerHTML = topRegions.map(region => `
                <div class="w-[60px] flex items-center justify-between bg-slate-800 rounded-full px-1.5 py-0.5 hover:bg-slate-700 cursor-pointer region-filter" data-region="${region.code}" title="点击查看${region.name}的服务器">
                    <div class="flex items-center min-w-0">
                        <span class="text-xs mr-0.5">${region.flag}</span>
                        <span class="text-[8px] font-medium">${region.code}</span>
                        <span class="text-[8px] font-bold ml-0.5">${region.count}</span>
                    </div>
                </div>
            `).join('');
            
            // 添加点击事件处理
            Array.from(this.elements.mobileRegionStats.querySelectorAll('.region-filter')).forEach(el => {
                el.addEventListener('click', () => {
                    const regionCode = el.dataset.region;
                    this.filterByRegion(regionCode);
                });
            });
        }
    },
    
    /**
     * 根据地区代码筛选服务器卡片
     * @param {string} regionCode - 地区代码
     */
    filterByRegion(regionCode) {
        console.debug('按地区筛选:', regionCode);
        
        // 重置所有过滤状态
        const resetFilter = !regionCode || regionCode === 'ALL';
        
        // 记录当前激活的筛选器
        this.activeFilter = resetFilter ? null : regionCode;
        
        // 获取所有服务器卡片 - 不再依赖标签页和视图组
        let allCards = [];
        
        try {
            // 先尝试获取激活的标签页和视图组
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const activeGroupId = activeTab.dataset.group;
                const activeView = document.querySelector(`.group-view[data-group="${activeGroupId}"]`);
                if (activeView) {
                    allCards = Array.from(activeView.querySelectorAll('.server-card'));
                    console.debug(`从激活视图组 ${activeGroupId} 中找到 ${allCards.length} 个卡片`);
                }
            }
            
            // 如果没有找到卡片，尝试从所有可见的卡片中获取
            if (allCards.length === 0) {
                const visibleViews = Array.from(document.querySelectorAll('.group-view:not([style*="display: none"]'));
                if (visibleViews.length > 0) {
                    visibleViews.forEach(view => {
                        const cards = Array.from(view.querySelectorAll('.server-card'));
                        allCards = allCards.concat(cards);
                    });
                    console.debug(`从可见视图组中找到 ${allCards.length} 个卡片`);
                }
            }
            
            // 如果还是没有找到卡片，尝试获取所有卡片
            if (allCards.length === 0) {
                allCards = Array.from(document.querySelectorAll('.server-card'));
                console.debug(`从所有元素中找到 ${allCards.length} 个卡片`);
            }
            
            // 如果还是没有找到卡片，返回错误
            if (allCards.length === 0) {
                console.warn('未找到任何服务器卡片');
                return;
            }
        } catch (error) {
            console.error('获取服务器卡片时出错:', error);
            return;
        }
        
        if (resetFilter) {
            // 重置所有卡片显示状态
            allCards.forEach(card => {
                if (card.style.display === 'none' && !card.classList.contains('hidden-by-status')) {
                    card.style.display = '';
                }
                // 移除地区筛选标记
                card.classList.remove('hidden-by-region');
            });
            
            // 移除所有地区筛选状态样式
            document.querySelectorAll('.region-filter').forEach(el => {
                el.classList.remove('active-filter');
            });
            
            this.activeFilter = null;
            console.debug('重置地区筛选，显示所有卡片');
        } else {
            // 设置新的筛选状态
            console.debug(`开始按地区代码 ${regionCode} 筛选 ${allCards.length} 个卡片`);
            
            // 记录匹配和不匹配的卡片数量
            let matchedCards = 0;
            let unmatchedCards = 0;
            let missingRegionCards = 0;
            
            allCards.forEach(card => {
                // 根据地区属性筛选卡片
                const cardRegion = card.dataset.region;
                
                // 记录卡片的地区信息
                if (!cardRegion) {
                    console.debug(`卡片 ${card.dataset.sid} 没有地区信息`);
                    missingRegionCards++;
                }
                
                if (cardRegion === regionCode) {
                    matchedCards++;
                    if (card.style.display === 'none' && !card.classList.contains('hidden-by-status')) {
                        card.style.display = '';
                    }
                    card.classList.remove('hidden-by-region');
                } else {
                    unmatchedCards++;
                    // 隐藏非目标地区的卡片
                    card.style.display = 'none';
                    // 标记是被地区筛选隐藏的，而不是因为状态
                    card.classList.add('hidden-by-region');
                }
            });
            
            console.debug(`筛选结果: 匹配 ${matchedCards} 个卡片, 不匹配 ${unmatchedCards} 个卡片, 缺失地区信息 ${missingRegionCards} 个卡片`);
            
            // 更新地区筛选按钮样式
            document.querySelectorAll('.region-filter').forEach(el => {
                if (el.dataset.region === regionCode) {
                    el.classList.add('active-filter');
                } else {
                    el.classList.remove('active-filter');
                }
            });
            
            this.activeFilter = regionCode;
            console.debug(`应用地区筛选: ${regionCode}`);
        }
        
        // 应用当前排序
        // 兼容stats.js中的applyCurrentSort和applySort函数
        if (window.applyCurrentSort && typeof window.applyCurrentSort === 'function') {
            window.applyCurrentSort();
        } else if (window.currentSortConfig) {
            // 兼容stats.js中的旧方法
            if (window.applySort && typeof window.applySort === 'function') {
                window.applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
            }
        }
    },
    
    /**
     * 重置地区筛选
     */
    resetFilter() {
        this.filterByRegion('ALL');
    },
    
    /**
     * 更新地区统计
     * @param {Object} nodesData - 节点数据
     */
    update(nodesData) {
        try {
            // 每次更新时重新获取DOM元素
            this.elements = this.getElements();
            
            // 检查DOM元素是否存在
            if (!this.elements.desktopRegionStats && !this.elements.mobileRegionStats) {
                console.debug('未找到地区统计DOM元素，跳过更新');
                return;
            }
            
            // 收集地区统计数据
            this.collectRegionStats(nodesData);
            
            if (this.regionData.size === 0) {
                console.debug('无地区数据可显示');
                return;
            }
            
            // 获取并显示前9个地区
            const topRegions = this.getTopRegions(9);
            this.updateRegionStatsDisplay(topRegions);
            
            // 如果有激活的筛选，重新应用
            if (this.activeFilter) {
                this.filterByRegion(this.activeFilter);
            }
            
            console.debug('地区统计已更新', topRegions.length, '个地区');
        } catch (error) {
            console.error('地区统计更新失败:', error);
        }
    }
};

// 导出模块已完成
} // 关闭RegionStatsModule对象声明

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    RegionStatsModule.init();
});
