/**
 * @file stats.js
 * @description 服务器状态监控前端脚本，负责实时更新服务器状态信息和拖拽排序功能
 */

const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;
function strB(b) {
    if(b === 0) return '0 B';
    if(b < KB) return b.toFixed(2) + ' B';
    if(b < MB) return (b/KB).toFixed(2) + ' KB';
    if(b < GB) return (b/MB).toFixed(2) + ' MB';
    if(b < TB) return (b/GB).toFixed(2) + ' GB';
    return (b/TB).toFixed(2) + ' TB';
}

const Kbps = 1000, Mbps = Kbps * 1000, Gbps = Mbps * 1000, Tbps = Gbps * 1000;
function strbps(b) {
    if(b === 0) return '0 bps';
    if(b < Kbps) return b.toFixed(2) + ' bps';
    if(b < Mbps) return (b/Kbps).toFixed(2) + ' Kbps';
    if(b < Gbps) return (b/Mbps).toFixed(2) + ' Mbps';
    if(b < Tbps) return (b/Gbps).toFixed(2) + ' Gbps';
    return (b/Tbps).toFixed(2) + ' Tbps';
}

/**
 * 计算并格式化剩余天数
 * @param {number} expireTimestamp - 到期时间戳（秒）
 * @returns {string} 格式化后的剩余天数字符串
 */
function formatRemainingDays(expireTimestamp) {
    if (!expireTimestamp) return '永久';
    
    const now = Math.floor(Date.now() / 1000);
    const remainingSeconds = expireTimestamp - now;
    const remainingDays = Math.ceil(remainingSeconds / (24 * 60 * 60));
    
    if (remainingDays < 0) {
        return '已过期';
    } else if (remainingDays === 0) {
        return '今日到期';
    }
    return `剩余 ${remainingDays} 天`;
}

// 使用原生 JavaScript 获取元素
function E(id) {
    return document.getElementById(id);
}

// 更新提示信息
function updateTooltip(element, content) {
    if (element) {
        element.setAttribute('data-tooltip', content);
    }
}

// 节点状态常量
const NodeStatus = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    HIDDEN: 'hidden'
};

// 默认排序配置
const SortConfig = {
    defaultType: 'total_traffic',  // 默认按总流量排序
    defaultDirection: 'desc',      // 默认降序
    directions: {
        // 定义每个排序类型的首次点击方向
        cpu: 'desc',
        memory: 'desc',
        total_traffic: 'desc',
        upload: 'desc',
        download: 'desc',
        expiration: 'asc'  // 只有到期时间默认升序（剩余时间少的优先）
    }
};

// 节点样式配置
const NodeStyleConfig = {
    [NodeStatus.ONLINE]: {
        indicator: 'bg-green-500',
        card: 'opacity-100',
        text: 'text-gray-200',
        title: '在线'
    },
    [NodeStatus.OFFLINE]: {
        indicator: 'bg-red-500',
        card: 'opacity-60',
        text: 'text-gray-400',
        title: '离线'
    },
    [NodeStatus.HIDDEN]: {
        indicator: 'bg-gray-500',
        card: 'hidden',
        text: 'text-gray-400',
        title: '隐藏'
    }
};

// 判断节点状态的工具函数
function getNodeStatus(node) {
    // 首先检查 node.stat 是否为有效对象
    const isValidStat = node?.stat && typeof node.stat === 'object';
    if (!isValidStat) return NodeStatus.OFFLINE;
    
    // 检查是否为隐藏节点
    if (node.status === 2) return NodeStatus.HIDDEN;
    
    // 其他情况为在线
    return NodeStatus.ONLINE;
}

// 统一的节点统计函数
function updateNodeStats(stats) {
    try {
        // 1. 计算总体统计
        const totalStats = {
            total: 0,
            online: 0,
            offline: 0
        };
        
        // 使用 Set 确保节点不重复
        const processedNodes = new Set();
        
        // 遍历所有节点，只统计一次
        Object.entries(stats).forEach(([sid, node]) => {
            if (processedNodes.has(sid)) return;
            processedNodes.add(sid);
            
            const status = getNodeStatus(node);
            if (status !== NodeStatus.HIDDEN) {
                totalStats.total++;
                if (status === NodeStatus.ONLINE) {
                    totalStats.online++;
                    } else {
                    totalStats.offline++;
                }
            }
        });
        
        // 2. 分组统计
        const groups = new Map();
        Object.entries(stats).forEach(([sid, node]) => {
            if (!node.group_id) return;
            
            const status = getNodeStatus(node);
            if (status === NodeStatus.HIDDEN) return;
            
            if (!groups.has(node.group_id)) {
                groups.set(node.group_id, { total: 0, online: 0 });
            }
            
            const groupStats = groups.get(node.group_id);
            groupStats.total++;
            if (status === NodeStatus.ONLINE) {
                groupStats.online++;
            }
        });
        
        // 3. 更新显示
        // 3.1 更新总体显示
        const dashboardElements = {
            total: document.getElementById('total-nodes'),
            online: document.getElementById('online-nodes'),
            offline: document.getElementById('offline-nodes')
        };
        
        if (dashboardElements.total) dashboardElements.total.textContent = totalStats.total;
        if (dashboardElements.online) dashboardElements.online.textContent = totalStats.online;
        if (dashboardElements.offline) dashboardElements.offline.textContent = totalStats.offline;
        
        // 3.2 更新全部节点 tab
        const allNodesTab = document.querySelector('[data-group="all"] .tab-count');
        if (allNodesTab) {
            allNodesTab.textContent = `${totalStats.online}/${totalStats.total}`;
        }
        
        // 3.3 更新分组 tab
        groups.forEach((stats, groupId) => {
            const countElement = document.getElementById(`group-${groupId}-count-tab`);
            if (countElement) {
                countElement.textContent = `${stats.online}/${stats.total}`;
            }
        });
        
        // 4. 触发更新完成事件
        document.dispatchEvent(new CustomEvent('nodeStatsUpdated', {
            detail: {
                ...totalStats,
                groups: Object.fromEntries(groups)
            }
        }));
        
    } catch (error) {
        console.error('更新节点统计时出错:', error);
    }
}

// 统一的更新控制器
const StatsController = {
    // 防抖计时器
    updateTimer: null,
    
    // 最后一次更新时间
    lastUpdateTime: 0,
    
    // 最小更新间隔（毫秒）
    MIN_UPDATE_INTERVAL: 1000,
    
    // 统一的更新函数
    async update() {
        try {
            const stats = await fetch("/stats/data").then(res => res.json());
            
            // 更新数据
            updateNodeStats(stats);
            this.updateNodesStatus(stats);
            
            // 触发更新完成事件
            document.dispatchEvent(new Event('statsUpdateComplete'));
            
            // 确保应用当前排序（包括首次加载）
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                // 如果已有激活的标签页，应用当前排序
                applyCurrentSort();
            } else {
                // 首次加载，应用默认排序
                applySort(SortConfig.defaultType, SortConfig.defaultDirection);
            }
            
            this.lastUpdateTime = Date.now();
        } catch (error) {
            console.error('更新统计失败:', error);
        }
    },
    
    // 更新节点状态
    updateNodesStatus(stats) {
        let updated = false;
        let totalNetStats = {
            downloadSpeed: 0,
            uploadSpeed: 0,
            totalDownload: 0,
            totalUpload: 0
        };
        
        for (const [sid, node] of Object.entries(stats)) {
            const status = getNodeStatus(node);
            const styleConfig = NodeStyleConfig[status];
            const isOnline = status === NodeStatus.ONLINE;
            
            // 更新所有匹配的服务器卡片
            const serverCards = document.querySelectorAll(`[data-sid="${sid}"]`);
            serverCards.forEach(serverCard => {
                // 更新卡片样式
                Object.values(NodeStyleConfig).forEach(config => {
                    serverCard.classList.remove(config.card);
                    serverCard.classList.remove(config.text);
                });
                if (styleConfig.card !== 'hidden') {
                    serverCard.classList.add(styleConfig.card);
                }
                serverCard.style.display = styleConfig.card === 'hidden' ? 'none' : '';
                
                // 更新文本元素
                const textElements = serverCard.querySelectorAll('.text-gray-200, .text-gray-400');
                textElements.forEach(el => {
                    el.classList.remove('text-gray-200', 'text-gray-400');
                    el.classList.add(styleConfig.text);
                });
                
                // 更新节点数据
                this.updateCardData(serverCard, node, status);
                updated = true;
            });

            // 更新网络统计（只统计在线节点）
            if (isOnline && node.stat?.net) {
                totalNetStats.downloadSpeed += node.stat.net.delta?.in || 0;
                totalNetStats.uploadSpeed += node.stat.net.delta?.out || 0;
                totalNetStats.totalDownload += node.stat.net.total?.in || 0;
                totalNetStats.totalUpload += node.stat.net.total?.out || 0;
            }
        }
        
        // 更新仪表盘网络数据
        this.updateDashboardNetwork(totalNetStats);
        
        // 如果有更新且开启了实时排序，应用排序
        if (updated && document.getElementById('realtime-sort')?.checked) {
            const currentSortBtn = document.querySelector('.sort-btn.active');
            if (currentSortBtn) {
                const type = currentSortBtn.dataset.sort;
                const direction = currentSortBtn.dataset.direction || 'desc';
                applySort(type, direction);
            }
        }
    },
    
    // 更新仪表盘网络数据
    updateDashboardNetwork(netStats) {
        // 更新实时带宽
        const currentDownloadSpeed = document.getElementById('current-download-speed');
        const currentUploadSpeed = document.getElementById('current-upload-speed');
        if (currentDownloadSpeed) {
            currentDownloadSpeed.textContent = strbps(netStats.downloadSpeed * 8);
        }
        if (currentUploadSpeed) {
            currentUploadSpeed.textContent = strbps(netStats.uploadSpeed * 8);
        }
        
        // 更新总流量
        const totalDownload = document.getElementById('total-download');
        const totalUpload = document.getElementById('total-upload');
        if (totalDownload) {
            totalDownload.textContent = strB(netStats.totalDownload);
        }
        if (totalUpload) {
            totalUpload.textContent = strB(netStats.totalUpload);
        }
    },
    
    // 更新单个卡片的数据
    updateCardData(card, node, status) {
        const isOnline = status === NodeStatus.ONLINE;
        const sid = card.dataset.sid;
        
        // 更新CPU数据
        const cpuElement = card.querySelector('[id$="_CPU"]');
        if (cpuElement) {
            const cpuValue = isOnline ? (node.stat.cpu.multi * 100).toFixed(2) : '0';
            cpuElement.textContent = cpuValue + '%';
            cpuElement.dataset.cpu = cpuValue;
            
            const cpuProgress = card.querySelector('[id$="_CPU_progress"]');
            if (cpuProgress) {
                cpuProgress.style.width = `${cpuValue}%`;
            }
        }
        
        // 更新内存数据
        const memElement = card.querySelector('[id$="_MEM"]');
        if (memElement) {
            const memValue = isOnline && node.stat?.mem?.virtual ? 
                ((node.stat.mem.virtual.used / node.stat.mem.virtual.total) * 100).toFixed(2) : '0';
            memElement.textContent = memValue + '%';
            memElement.dataset.memory = memValue;
            
            const memProgress = card.querySelector('[id$="_MEM_progress"]');
            if (memProgress) {
                memProgress.style.width = `${memValue}%`;
            }
        }
        
        // 更新网络数据
        if (isOnline && node.stat?.net) {
            const elements = {
                netIn: card.querySelector('[id$="_NET_IN"]'),
                netOut: card.querySelector('[id$="_NET_OUT"]'),
                netInTotal: card.querySelector('[id$="_NET_IN_TOTAL"]'),
                netOutTotal: card.querySelector('[id$="_NET_OUT_TOTAL"]')
            };
            
            // 更新下载速度
            if (elements.netIn) {
                const inSpeed = node.stat.net.delta?.in || 0;
                elements.netIn.textContent = strbps(inSpeed * 8);
                elements.netIn.dataset.speed = inSpeed;
            }
            
            // 更新上传速度
            if (elements.netOut) {
                const outSpeed = node.stat.net.delta?.out || 0;
                elements.netOut.textContent = strbps(outSpeed * 8);
                elements.netOut.dataset.speed = outSpeed;
            }
            
            // 更新总下载量
            if (elements.netInTotal) {
                const inTotal = node.stat.net.total?.in || 0;
                elements.netInTotal.textContent = strB(inTotal);
                elements.netInTotal.dataset.traffic = inTotal;
            }
            
            // 更新总上传量
            if (elements.netOutTotal) {
                const outTotal = node.stat.net.total?.out || 0;
                elements.netOutTotal.textContent = strB(outTotal);
                elements.netOutTotal.dataset.traffic = outTotal;
            }
        } else {
            // 节点离线时显示0
            const elements = {
                netIn: card.querySelector('[id$="_NET_IN"]'),
                netOut: card.querySelector('[id$="_NET_OUT"]'),
                netInTotal: card.querySelector('[id$="_NET_IN_TOTAL"]'),
                netOutTotal: card.querySelector('[id$="_NET_OUT_TOTAL"]')
            };
            
            if (elements.netIn) elements.netIn.textContent = '0 bps';
            if (elements.netOut) elements.netOut.textContent = '0 bps';
            if (elements.netInTotal) elements.netInTotal.textContent = '0 B';
            if (elements.netOutTotal) elements.netOutTotal.textContent = '0 B';
        }
        
        // 更新到期时间
        const expireElement = card.querySelector('[id$="_EXPIRE_TIME"]');
        if (expireElement) {
            expireElement.textContent = formatRemainingDays(node.expire_time);
            expireElement.dataset.expire = node.expire_time || '0';
        }
    },
    
    // 防抖更新
    debounceUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        
        if (timeSinceLastUpdate >= this.MIN_UPDATE_INTERVAL) {
            this.update();
        } else {
            this.updateTimer = setTimeout(() => {
                this.update();
            }, this.MIN_UPDATE_INTERVAL - timeSinceLastUpdate);
        }
    }
};

// 拖拽管理器
const DragDropManager = {
    // 状态管理
    state: {
        isDragging: false,
        currentCard: null,
        sourceGroup: null,
        targetGroup: null,
        isUpdating: false
    },

    // 初始化
    init() {
        // 确保 DOM 完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initDragDrop());
        } else {
            this.initDragDrop();
        }
    },

    // 初始化拖拽功能
    initDragDrop() {
        try {
            this.initCardContainers();
            this.initTabDropZones();
        } catch (error) {
            console.error('初始化拖拽功能失败:', error);
            // 延迟重试
            setTimeout(() => this.initDragDrop(), 500);
        }
    },

    // 初始化卡片容器
    initCardContainers() {
        const groupViews = document.querySelectorAll('.group-view');
        groupViews.forEach(view => {
            if (view.dataset.group === 'all') return;
            
            const cardGrid = view.querySelector('.grid');
            if (cardGrid) {
                this.initSortable(cardGrid);
            }
        });
    },

    // 初始化 Sortable
    initSortable(element) {
        new Sortable(element, {
            group: {
                name: 'server-cards',
                pull: (to, from, dragEl) => this.canDrag(dragEl),
                put: (to, from, dragEl) => this.canDrop(to, dragEl)
            },
            animation: 150,
            ghostClass: 'opacity-50',
            dragClass: 'shadow-lg',
            onStart: (evt) => this.handleDragStart(evt),
            onEnd: (evt) => this.handleDragEnd(evt)
        });
    },

    // 初始化 Tab 拖拽区域
    initTabDropZones() {
        const tabContainer = document.querySelector('.bg-white\\/5 .flex.flex-wrap.items-center');
        if (!tabContainer) {
            console.warn('找不到 tab 容器，尝试延迟初始化');
            setTimeout(() => this.initTabDropZones(), 500);
            return;
        }

        // 添加可视化提示
        tabContainer.classList.add('droppable-container');
        this.initTabEvents(tabContainer);
    },

    // 初始化 Tab 事件
    initTabEvents(container) {
        const handlers = {
            dragenter: (e) => {
                e.preventDefault();
                const tab = e.target.closest('.tab-btn');
                if (tab && tab.dataset.group !== 'all') {
                    tab.classList.add('drag-target');
                }
            },
            dragover: (e) => {
                e.preventDefault();
                const tab = e.target.closest('.tab-btn');
                if (tab?.dataset.group === 'all') return;

                this.clearTabEffects();
                tab?.classList.add('drag-over');
            },
            dragleave: (e) => {
                const tab = e.target.closest('.tab-btn');
                if (tab) {
                    tab.classList.remove('drag-over', 'drag-target');
                }
            },
            drop: async (e) => {
                e.preventDefault();
                this.clearTabEffects();

                const card = this.state.currentCard;
                const tab = e.target.closest('.tab-btn');
                
                if (!card || !tab || tab.dataset.group === 'all') return;

                try {
                    await this.updateCardGroup(card, tab.dataset.group);
                    // 添加成功反馈
                    this.showSuccess(`已移动到 ${tab.textContent.trim().split('(')[0].trim()} 分组`);
                    tab.click();
                } catch (error) {
                    this.showError('移动失败，请重试');
                }
            }
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            container.addEventListener(event, handler.bind(this));
        });
    },

    // 拖拽判断
    canDrag(element) {
        if (!element) return false;
        const isOffline = element.classList.contains('opacity-60');
        const isHidden = element.style.display === 'none';
        return !isOffline && !isHidden;
    },

    // 放置判断
    canDrop(to, element) {
        if (!to || !element) return false;
        const targetGroup = to.el.closest('.group-view')?.dataset.group;
        return targetGroup && targetGroup !== 'all';
    },

    // 处理拖拽开始
    handleDragStart(evt) {
        const card = evt.item;
        this.state.isDragging = true;
        this.state.currentCard = card;
        this.state.sourceGroup = card.closest('.group-view')?.dataset.group;
        card.classList.add('dragging');
    },

    // 处理拖拽结束
    async handleDragEnd(evt) {
        const card = evt.item;
        this.state.isDragging = false;
        card.classList.remove('dragging');
        
        if (!evt.to) return;

        const targetGroup = evt.to.closest('.group-view')?.dataset.group;
        if (targetGroup === 'all') {
            evt.from.appendChild(card);
            return;
        }

        await this.updateCardGroup(card, targetGroup, evt.from);
    },

    // 清除所有拖拽效果
    clearTabEffects() {
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.classList.remove('drag-over', 'drag-target');
        });
    },

    // 更新卡片分组
    async updateCardGroup(card, newGroupId, sourceContainer = null) {
        if (this.state.isUpdating) return;
        this.state.isUpdating = true;
        card.classList.add('updating');

        try {
            const success = await this.updateServerGroup(card.dataset.sid, newGroupId);
            if (!success && sourceContainer) {
                sourceContainer.appendChild(card);
            }
            await StatsController.update();
        } catch (error) {
            if (sourceContainer) {
                sourceContainer.appendChild(card);
            }
            this.showError('更新分组失败');
        } finally {
            card.classList.remove('updating');
            this.state.isUpdating = false;
        }
    },

    // 更新服务器分组
    async updateServerGroup(serverId, newGroupId) {
        try {
            const response = await fetch(`/api/server/${serverId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    group_id: newGroupId
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('更新服务器分组失败:', error);
            this.showError(error.message);
            return false;
        }
    },

    // 显示错误
    showError(message) {
        if (typeof notice === 'function') {
            notice(message);
        } else {
            console.error(message);
        }
    },

    // 显示成功提示
    showSuccess(message) {
        if (typeof notice === 'function') {
            notice(message);
        } else {
            console.log(message);
        }
    }
};

// 修改 DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化排序按钮
    initSortButtons();
    
    // 2. 设置默认排序按钮状态并高亮
    const defaultSortBtn = document.querySelector(`[data-sort="${SortConfig.defaultType}"]`);
    if (defaultSortBtn) {
        // 激活默认排序按钮
        defaultSortBtn.click();  // 直接触发点击事件来激活排序
    }
    
    // 3. 初始化标签页
    initTabs();
    
    // 4. 激活默认标签页
    const defaultTab = document.querySelector('.tab-btn[data-group="all"]');
    if (defaultTab) {
        defaultTab.click();
    }
    
    // 5. 初始化拖拽功能
    DragDropManager.init();
    
    // 6. 初始更新
    StatsController.update();
    
    // 7. 设置定时更新
    setInterval(() => {
        StatsController.update();
    }, StatsController.MIN_UPDATE_INTERVAL);
});

// Tab切换功能
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const groupViews = document.querySelectorAll('.group-view');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有active状态
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.classList.add('text-slate-400');
                b.classList.remove('text-white', 'bg-slate-700/60', 'border-primary-500');
                
                // 重置计数器样式
                const counter = b.querySelector('span:last-child');
                if (counter) {
                    counter.classList.remove('bg-slate-700/50', 'text-gray-200');
                    counter.classList.add('bg-slate-800/50', 'text-gray-400');
                }
            });
            
            // 隐藏所有视图
            groupViews.forEach(v => {
                v.classList.add('hidden');
                v.classList.remove('opacity-100');
            });
            
            // 激活当前Tab
            btn.classList.add('active');
            btn.classList.remove('text-slate-400');
            btn.classList.add('text-white', 'bg-slate-700/60', 'border-primary-500');
            
            // 更新计数器样式
            const counter = btn.querySelector('span:last-child');
            if (counter) {
                counter.classList.remove('bg-slate-800/50', 'text-gray-400');
                counter.classList.add('bg-slate-700/50', 'text-gray-200');
            }
            
            // 显示对应视图
            const groupId = btn.dataset.group;
            const targetView = document.querySelector(`.group-view[data-group="${groupId}"]`);
            if (targetView) {
                targetView.classList.remove('hidden');
                setTimeout(() => {
                    targetView.classList.add('opacity-100');
                }, 0);
            }
            
            // 修改排序逻辑
            if(document.getElementById('realtime-sort')?.checked) {
                // 使用 setTimeout 确保视图更新后再排序
                setTimeout(() => {
                    applyCurrentSort();
                }, 0);
            }
        });
    });
}

// 排序功能优化
function applySort(type, direction) {
    const activeTab = document.querySelector('.tab-btn.active');
    if (!activeTab) return;
    
    const activeGroupId = activeTab.dataset.group;
    const activeView = document.querySelector(`.group-view[data-group="${activeGroupId}"]`);
    if (!activeView) return;

    const cards = Array.from(activeView.querySelectorAll('.server-card')).filter(card => 
        card.style.display !== 'none'
    );

    // 排序函数
    const sortFn = (a, b) => {
        // 1. 首先按在线状态排序
        const isOfflineA = a.classList.contains('opacity-60');
        const isOfflineB = b.classList.contains('opacity-60');
        if (isOfflineA !== isOfflineB) {
            return isOfflineA ? 1 : -1;  // 离线节点排后面
        }

        // 2. 然后按指定条件排序
        let valueA, valueB;
        
        switch (type) {
            case 'cpu':
                valueA = parseFloat(a.querySelector('[id$="_CPU"]')?.dataset.cpu || 0);
                valueB = parseFloat(b.querySelector('[id$="_CPU"]')?.dataset.cpu || 0);
                break;
            case 'memory':
                valueA = parseFloat(a.querySelector('[id$="_MEM"]')?.dataset.memory || 0);
                valueB = parseFloat(b.querySelector('[id$="_MEM"]')?.dataset.memory || 0);
                break;
            case 'total_traffic':
                valueA = parseFloat(a.querySelector('[id$="_NET_IN_TOTAL"]')?.dataset.traffic || 0);
                valueB = parseFloat(b.querySelector('[id$="_NET_IN_TOTAL"]')?.dataset.traffic || 0);
                break;
            case 'upload':
                valueA = parseFloat(a.querySelector('[id$="_NET_OUT"]')?.dataset.speed || 0);
                valueB = parseFloat(b.querySelector('[id$="_NET_OUT"]')?.dataset.speed || 0);
                break;
            case 'download':
                valueA = parseFloat(a.querySelector('[id$="_NET_IN"]')?.dataset.speed || 0);
                valueB = parseFloat(b.querySelector('[id$="_NET_IN"]')?.dataset.speed || 0);
                break;
            case 'expiration':
                valueA = parseInt(a.querySelector('[id$="_EXPIRE_TIME"]')?.dataset.expire || 0);
                valueB = parseInt(b.querySelector('[id$="_EXPIRE_TIME"]')?.dataset.expire || 0);
                break;
            default:
                return 0;
        }

        if (isNaN(valueA)) valueA = direction === 'asc' ? Infinity : -Infinity;
        if (isNaN(valueB)) valueB = direction === 'asc' ? Infinity : -Infinity;

        return direction === 'asc' ? valueA - valueB : valueB - valueA;
    };

    cards.sort(sortFn);

    const container = activeGroupId === 'all' ? 
        activeView.querySelector('.grid') : 
        document.getElementById(`card-grid-${activeGroupId}`);

    if (container) {
        cards.forEach(card => container.appendChild(card));
    }
}

// 应用当前排序
function applyCurrentSort() {
    const currentSortBtn = document.querySelector('.sort-btn.active');
    if (currentSortBtn) {
        const type = currentSortBtn.dataset.sort;
        const direction = currentSortBtn.dataset.direction || 'desc';
        applySort(type, direction);
    } else {
        // 如果没有激活的排序按钮，使用默认排序
        applySort(SortConfig.defaultType, SortConfig.defaultDirection);
    }
}

// 初始化排序按钮事件
function initSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.sort;
            let direction = btn.dataset.direction;
            
            // 如果是首次点击，使用预设的方向
            if (!direction) {
                direction = SortConfig.directions[type] || 'desc';
            } else {
                // 已有方向则切换
                direction = direction === 'asc' ? 'desc' : 'asc';
            }
            
            btn.dataset.direction = direction;
            
            // 更新按钮状态
            document.querySelectorAll('.sort-btn').forEach(b => {
                b.classList.remove('active');
                b.querySelector('i').textContent = 'unfold_more';
            });
            
            btn.classList.add('active');
            btn.querySelector('i').textContent = direction === 'asc' ? 'expand_less' : 'expand_more';
            
            // 执行排序
            applySort(type, direction);
        });
    });
}