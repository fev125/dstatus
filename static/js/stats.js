/**
 * @file stats.js
 * @description 服务器状态监控前端脚本，负责实时更新服务器状态信息和拖拽排序功能
 */

// WebSocket连接管理
// 避免重复声明
if (typeof window.statsWs === 'undefined') {
    window.statsWs = null;
    window.statsReconnectTimer = null;
}

// 跟踪当前分组 - 避免重复声明
if (typeof window.currentGroupId === 'undefined') {
    window.currentGroupId = 'all';
}

    function initWebSocket() {
        if (window.statsWs) {
            window.statsWs.close();
            window.statsWs = null;
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws/stats`;

        // WebSocket连接初始化
        window.statsWs = new WebSocket(wsUrl);

    // 确保ws存在
    if (window.statsWs) window.statsWs.onmessage = (event) => {
        try {
            // 1. 数据完整性检查
            if (!event.data) {
                // 接收到空数据
                return;
            }

            // 2. 解析数据
            const message = JSON.parse(event.data);

            // 3. 验证消息格式
            if (!message || typeof message !== 'object') {
                // 无效的消息格式
                return;
            }

            const {type, data, timestamp} = message;

            // 4. 处理stats类型消息
            if (type === 'stats') {
                // 4.1 验证数据结构
                if (!data || typeof data !== 'object') {
                    // 节点统计数据为空或格式错误
                    return;
                }

                // 4.2 检查是否有节点数据
                const nodeCount = Object.keys(data).length;
                if (nodeCount === 0) {
                    // 没有节点数据
                    return;
                }

                // 4.3 初始化总计数据
                const totals = {
                    nodes: nodeCount,
                    online: 0,
                    offline: 0,
                    download: 0,
                    upload: 0,
                    downloadTotal: 0,
                    uploadTotal: 0,
                    groups: {}
                };

                // 4.4 处理每个节点的数据
                Object.entries(data).forEach(([sid, node]) => {
                    // 检查节点状态
                    const isOnline = node.stat && typeof node.stat === 'object' && !node.stat.offline;

                    // 更新节点计数
                    if (isOnline) {
                        totals.online++;

                        // 确保网络数据存在且有效
                        if (node.stat.net) {
                            // 转换为数字并确保非负
                            const deltaIn = Math.max(0, Number(node.stat.net.delta?.in || 0));
                            const deltaOut = Math.max(0, Number(node.stat.net.delta?.out || 0));
                            const totalIn = Math.max(0, Number(node.stat.net.total?.in || 0));
                            const totalOut = Math.max(0, Number(node.stat.net.total?.out || 0));

                            // 累加到总计
                            totals.download += deltaIn;
                            totals.upload += deltaOut;
                            totals.downloadTotal += totalIn;
                            totals.uploadTotal += totalOut;

                            if (window.setting?.debug) {
                                // 带宽数据处理完成
                            }
                        }
                    } else {
                        totals.offline++;
                    }

                    // 更新分组统计
                    const groupId = node.group_id || 'ungrouped';
                    if (!totals.groups[groupId]) {
                        totals.groups[groupId] = { total: 0, online: 0 };
                    }
                    totals.groups[groupId].total++;
                    if (isOnline) totals.groups[groupId].online++;
                });

                if (window.setting?.debug) {
                    // 总计数据处理完成
                }

                // 4.5 更新总体统计显示
                updateTotalStats({
                    ...totals,
                    nodes: data,  // 保持原始节点数据
                    rawData: data // 添加原始数据用于地区统计
                });

                // 4.6 更新节点显示
                Object.entries(data).forEach(([sid, node]) => {
                    updateNodeDisplay(sid, {
                        ...node,
                        expire_time: node.expire_time // 确保到期时间数据传递
                    });
                });

                // 4.7 如果启用了实时排序，重新应用排序
                const realtimeSortCheckbox = document.getElementById('realtime-sort');
                if (realtimeSortCheckbox?.checked && window.currentSortConfig) {
                    applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
                }

                // 在数据更新完成后触发同步事件（新增）
                setTimeout(() => {
                    const syncEvent = new CustomEvent('statsSyncComplete', {
                        detail: {
                            timestamp: Date.now(),
                            nodeCount: Object.keys(data).length
                        }
                    });
                    document.dispatchEvent(syncEvent);
                }, 50);
            } else {
                // 未知的消息类型
            }
        } catch (error) {
            // WebSocket数据处理错误
            // 原始数据
        }
    };

    window.statsWs.onopen = () => {
        // WebSocket连接成功
        // 清除重连定时器
        if (window.statsReconnectTimer) {
            clearTimeout(window.statsReconnectTimer);
            window.statsReconnectTimer = null;
        }
    };

    window.statsWs.onclose = (event) => {
        // WebSocket连接已关闭
        window.statsWs = null;

        // 设置重连
        if (window.statsReconnectTimer) clearTimeout(window.statsReconnectTimer);
        window.statsReconnectTimer = setTimeout(() => {
            // 尝试重新连接WebSocket
            initWebSocket();
        }, 3000);
    };

    window.statsWs.onerror = (error) => {
        // WebSocket错误
    };
}

// 页面加载时初始化WebSocket
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.statsWs) {
        window.statsWs.close();
    }
    if (window.statsReconnectTimer) {
        clearTimeout(window.statsReconnectTimer);
    }
});

// 避免常量重复声明
if (typeof window.KB === 'undefined') {
    window.KB = 1024;
    window.MB = window.KB * 1024;
    window.GB = window.MB * 1024;
    window.TB = window.GB * 1024;
}
function strB(bytes) {
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

// 将函数添加到全局作用域
window.strB = strB;

// 避免常量重复声明
if (typeof window.Kbps === 'undefined') {
    window.Kbps = 1000;
    window.Mbps = window.Kbps * 1000;
    window.Gbps = window.Mbps * 1000;
    window.Tbps = window.Gbps * 1000;
}
function strbps(bps) {
    if (isNaN(bps) || bps === 0) return '0 bps';
    const k = 1024;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return (bps / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

// 将函数添加到全局作用域
window.strbps = strbps;

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
    return ` ${remainingDays} 天`;
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
if (typeof window.NodeStatus === 'undefined') {
    window.NodeStatus = {
        ONLINE: 'online',
        OFFLINE: 'offline',
        HIDDEN: 'hidden'
    };
}

// 默认排序配置
if (typeof window.SortConfig === 'undefined') {
    window.SortConfig = {
        defaultDirection: 'desc',      // 默认降序
        directions: {
            default: 'desc',           // 新增:默认排序(按top值)
            cpu: 'desc',
            memory: 'desc',
            total_traffic: 'desc',
            upload: 'desc',
            download: 'desc',
            expiration: 'asc'  // 只有到期时间默认升序（剩余时间少的优先）
        }
    };
}

// 节点样式配置
if (typeof window.NodeStyleConfig === 'undefined') {
    window.NodeStyleConfig = {
        [window.NodeStatus.ONLINE]: {
            indicator: 'bg-green-500',
            card: 'opacity-100',
            text: 'text-gray-200',
            title: '在线'
        },
        [window.NodeStatus.OFFLINE]: {
            indicator: 'bg-red-500',
            card: 'opacity-60',
            text: 'text-gray-400',
            title: '离线'
        },
        [window.NodeStatus.HIDDEN]: {
            indicator: 'bg-gray-500',
            card: 'hidden',
            text: 'text-gray-400',
            title: '隐藏'
        }
    };
}

// 判断节点状态的工具函数
function getNodeStatus(node) {
    // 隐藏状态优先判断
    if (node.status === 2) return window.NodeStatus.HIDDEN;

    // 检查离线状态
    if (node?.stat?.offline) return window.NodeStatus.OFFLINE;

    // 最后检查stat对象是否存在
    const isValidStat = node?.stat && typeof node.stat === 'object';
    const status = isValidStat ? window.NodeStatus.ONLINE : window.NodeStatus.OFFLINE;

    return status;
}

// 设置存储相关常量和函数
if (typeof window.SETTINGS_KEY === 'undefined') {
    window.SETTINGS_KEY = 'node_display_settings';
}

// 敏感信息配置
if (typeof window.SENSITIVE_CONFIG === 'undefined') {
    window.SENSITIVE_CONFIG = {
        serverName: {
            selector: '.server-name a',
            mask: name => name.replace(/[^-_\s]/g, '*')
        },
        infoButton: {
            selector: '[id$="_host"]',
            hide: true
        }
    };
}

// 加载用户设置
function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(window.SETTINGS_KEY)) || {
            hideSensitive: false,
            hideOffline: false
        };
    } catch {
        return {
            hideSensitive: false,
            hideOffline: false
        };
    }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 处理敏感信息
function handleSensitiveInfo(card, shouldHide) {
  if (shouldHide) {
    // 处理服务器名称
    const nameEl = card.querySelector(SENSITIVE_CONFIG.serverName.selector);
    if (nameEl) {
      nameEl.dataset.originalText = nameEl.textContent;
      nameEl.textContent = SENSITIVE_CONFIG.serverName.mask(nameEl.textContent);
    }

    // 隐藏信息按钮
    const infoBtn = card.querySelector(SENSITIVE_CONFIG.infoButton.selector);
    if (infoBtn) {
      infoBtn.style.display = 'none';
    }
  } else {
    // 恢复服务器名称
    const nameEl = card.querySelector(SENSITIVE_CONFIG.serverName.selector);
    if (nameEl && nameEl.dataset.originalText) {
      nameEl.textContent = nameEl.dataset.originalText;
    }

    // 显示信息按钮
    const infoBtn = card.querySelector(SENSITIVE_CONFIG.infoButton.selector);
    if (infoBtn) {
      infoBtn.style.display = '';
    }
  }
}

/**
 * 更新节点统计信息
 * @param {Object} stats - 节点统计数据
 */
function updateNodeStats(stats) {
    if (!stats || typeof stats !== 'object') {
        // 无效的统计数据
        return;
    }

    try {
        // 1. 更新所有节点的显示
        Object.entries(stats).forEach(([sid, node]) => {
            // 获取节点状态和对应的样式配置
            const status = getNodeStatus(node);
            const styleConfig = NodeStyleConfig[status];

            // 更新所有分组中的节点
            const cards = document.querySelectorAll(`.server-card[data-sid="${sid}"]`);
            cards.forEach(card => {
                // 移除所有可能的状态类
                Object.values(NodeStyleConfig).forEach(config => {
                    card.classList.remove(config.card);
                    card.classList.remove(config.text);
                });

                // 添加当前状态对应的类
                if (styleConfig.card !== 'hidden') {
                    card.classList.add(styleConfig.card);
                }
                card.style.display = styleConfig.card === 'hidden' ? 'none' : '';

                // 更新文本样式
                const textElements = card.querySelectorAll('.text-gray-200, .text-gray-400');
                textElements.forEach(el => {
                    el.classList.remove('text-gray-200', 'text-gray-400');
                    el.classList.add(styleConfig.text);
                });

            updateNodeDisplay(sid, node);
            });
        });

        // 2. 处理离线节点
        document.querySelectorAll('.server-card').forEach(card => {
            const sid = card.dataset.sid;
            if (!stats[sid]) {
                resetOfflineNodeDisplay(sid);
            }
        });

        // 3. 如果启用了实时排序，重新应用排序
        const realtimeSortCheckbox = document.getElementById('realtime-sort');
        if (realtimeSortCheckbox?.checked && window.currentSortConfig) {
            applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
        }

    } catch (error) {
        // 更新节点统计信息时出错
    }
}

/**
 * 更新节点显示
 * @param {string} sid - 节点ID
 * @param {Object} node - 节点数据
 */
function updateNodeDisplay(sid, node) {
    const cards = document.querySelectorAll(`[data-sid="${sid}"]`);
    if (!cards.length) return;

    cards.forEach(card => {
        // 更新数据属性
        if (node.stat) {
            // CPU数据
            if (node.stat.cpu) {
                const cpuValue = (node.stat.cpu.multi * 100).toFixed(2);
                // 更新根元素数据属性
                card.dataset.cpu = cpuValue;

                // 更新CPU显示和进度条
                const cpuElements = card.querySelectorAll(`[id$="_CPU"]`);
                cpuElements.forEach(el => {
                    el.textContent = `${cpuValue}%`;
                    el.dataset.cpu = cpuValue;
                });

                const cpuProgress = card.querySelector(`[id$="_CPU_progress"]`);
                if (cpuProgress) {
                    cpuProgress.style.width = `${Math.min(100, Math.max(0, cpuValue))}%`;
                }
            }

            // 内存数据
            if (node.stat.mem && node.stat.mem.virtual) {
                const memValue = ((node.stat.mem.virtual.used / node.stat.mem.virtual.total) * 100).toFixed(2);
                // 更新根元素数据属性
                card.dataset.memory = memValue;

                // 更新内存显示和进度条
                const memElements = card.querySelectorAll(`[id$="_MEM"]`);
                memElements.forEach(el => {
                    el.textContent = `${memValue}%`;
                    el.dataset.memory = memValue;
                });

                const memProgress = card.querySelector(`[id$="_MEM_progress"]`);
                if (memProgress) {
                    memProgress.style.width = `${Math.min(100, Math.max(0, memValue))}%`;
                }
            }

            // 网络数据
            if (node.stat.net) {
                // 实时带宽
                if (node.stat.net.delta) {
                    // 更新根元素数据属性
                    card.dataset.download = node.stat.net.delta.in;
                    card.dataset.upload = node.stat.net.delta.out;

                    // 更新下载速度显示
                    const netInElements = card.querySelectorAll(`[id$="_NET_IN"]`);
                    netInElements.forEach(el => {
                        el.textContent = strbps(node.stat.net.delta.in * 8);
                        el.dataset.download = node.stat.net.delta.in;
                    });

                    // 更新上传速度显示
                    const netOutElements = card.querySelectorAll(`[id$="_NET_OUT"]`);
                    netOutElements.forEach(el => {
                        el.textContent = strbps(node.stat.net.delta.out * 8);
                        el.dataset.upload = node.stat.net.delta.out;
                    });
                }

                // 总流量
                if (node.stat.net.total) {
                    // 更新根元素数据属性
                    card.dataset.totalDownload = node.stat.net.total.in;
                    card.dataset.totalUpload = node.stat.net.total.out;

                    // 更新总下载量显示
                    const netInTotalElements = card.querySelectorAll(`[id$="_NET_IN_TOTAL"]`);
                    netInTotalElements.forEach(el => {
                        el.textContent = strB(node.stat.net.total.in);
                        el.dataset.totalDownload = node.stat.net.total.in;
                    });

                    // 更新总上传量显示
                    const netOutTotalElements = card.querySelectorAll(`[id$="_NET_OUT_TOTAL"]`);
                    netOutTotalElements.forEach(el => {
                        el.textContent = strB(node.stat.net.total.out);
                        el.dataset.totalUpload = node.stat.net.total.out;
                    });
                }
            }
        }

        // 更新状态指示器
        const status = getNodeStatus(node);
        card.dataset.status = status; // 添加状态到根元素

        const indicators = card.querySelectorAll('[id$="_status_indicator"]');
        indicators.forEach(indicator => {
            // 移除所有可能的状态类
            indicator.classList.remove('bg-green-500', 'bg-red-500');
            // 添加当前状态类
            indicator.classList.add(status === NodeStatus.ONLINE ? 'bg-green-500' : 'bg-red-500');
            // 保持其他基础类
            indicator.classList.add('rounded-full');
            // 根据设备类型添加不同的尺寸类
            if (window.innerWidth < 640) { // 移动端
                indicator.classList.add('w-1.5', 'h-1.5');
            } else { // PC端
                indicator.classList.add('w-2', 'h-2');
            }
        });

        // 更新到期时间
        if (node.expire_time !== undefined) {
            card.dataset.expiration = node.expire_time;
            const expireElements = card.querySelectorAll(`[id$="_EXPIRE_TIME"]`);
            expireElements.forEach(el => {
                el.textContent = formatRemainingDays(node.expire_time);
                el.dataset.expiration = node.expire_time;
            });
        }

        // 更新卡片透明度
        if (status === NodeStatus.ONLINE) {
            card.classList.remove('opacity-60');
            card.classList.add('opacity-100');
        } else {
            card.classList.remove('opacity-100');
            card.classList.add('opacity-60');
        }
    });
}

// 辅助函数: 验证网络数据结构
function validateNetworkStats(netStats) {
    const defaultStats = {
        delta: { in: 0, out: 0 },
        total: { in: 0, out: 0 }
    };

    if (!netStats) {
        // 网络数据为空,使用默认值
        return defaultStats;
    }

    return {
        delta: {
            in: Number(netStats.delta?.in || 0),
            out: Number(netStats.delta?.out || 0)
        },
        total: {
            in: Number(netStats.total?.in || 0),
            out: Number(netStats.total?.out || 0)
        }
    };
}

// 辅助函数: 更新节点网络显示
function updateNodeNetworkDisplay(sid, netStats) {
    const elements = {
        netIn: document.getElementById(`${sid}_NET_IN`),
        netOut: document.getElementById(`${sid}_NET_OUT`),
        netInTotal: document.getElementById(`${sid}_NET_IN_TOTAL`),
        netOutTotal: document.getElementById(`${sid}_NET_OUT_TOTAL`)
    };

    if (elements.netIn) {
        elements.netIn.textContent = strbps(netStats.delta.in * 8);
    }
    if (elements.netOut) {
        elements.netOut.textContent = strbps(netStats.delta.out * 8);
    }
    if (elements.netInTotal) {
        elements.netInTotal.textContent = strB(netStats.total.in);
    }
    if (elements.netOutTotal) {
        elements.netOutTotal.textContent = strB(netStats.total.out);
    }
}

// 辅助函数: 重置离线节点显示
function resetOfflineNodeDisplay(sid) {
    ['NET_IN', 'NET_OUT', 'NET_IN_TOTAL', 'NET_OUT_TOTAL'].forEach(type => {
        const el = document.getElementById(`${sid}_${type}`);
        if (el) {
            el.textContent = type.includes('TOTAL') ? '0 B' : '0 bps';
        }
    });
}

// 辅助函数: 更新卡片状态
function updateCardStatus(card, status) {
    const config = NodeStyleConfig[status];

    // 更新状态指示器
    const indicator = card.querySelector('[id$="_status_indicator"]');
    if (indicator) {
        // 保持基础样式类，只更新颜色类
        const baseClasses = 'w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full';
        const colorClasses = Object.values(NodeStyleConfig).map(cfg => cfg.indicator);

        // 移除所有颜色类
        colorClasses.forEach(cls => indicator.classList.remove(cls));

        // 设置新的类
        indicator.className = `${baseClasses} ${config.indicator}`;
        indicator.setAttribute('title', config.title);
    }

    // 更新卡片样式
    Object.values(NodeStyleConfig).forEach(cfg => {
        card.classList.remove(cfg.card);
    });
    card.classList.add(config.card);
}

// 辅助函数: 更新进度条
function updateProgressBars(sid, stat) {
    // CPU进度条
    const cpuProgress = document.getElementById(`${sid}_CPU_progress`);
    const cpuValue = stat?.cpu?.multi * 100 || 0;
    if (cpuProgress) {
        cpuProgress.style.width = `${cpuValue}%`;
    }

    // 内存进度条
    const memProgress = document.getElementById(`${sid}_MEM_progress`);
    const memValue = stat?.mem?.virtual?.usedPercent || 0;
    if (memProgress) {
        memProgress.style.width = `${memValue}%`;
    }
}

// 辅助函数: 更新总体统计
function updateTotalStats(totals) {
    try {
        // 1. 数据验证
        if (!totals || typeof totals !== 'object') {
            // 无效的统计数据
            return;
        }

        // 2. 确保所有数值有效
        const stats = {
            // 兼容两种格式：直接数字或对象格式
            nodes: typeof totals.nodes === 'object' ?
                  Object.keys(totals.nodes || {}).length :
                  Math.max(0, Number(totals.nodes) || 0),
            online: Math.max(0, Number(totals.online) || 0),
            offline: Math.max(0, Number(totals.offline) || 0),
            download: Math.max(0, Number(totals.download) || 0),
            upload: Math.max(0, Number(totals.upload) || 0),
            downloadTotal: Math.max(0, Number(totals.downloadTotal) || 0),
            uploadTotal: Math.max(0, Number(totals.uploadTotal) || 0)
        };



        // 3. 更新桌面端显示
        const elements = {
            totalNodes: document.getElementById('total-nodes'),
            onlineNodes: document.getElementById('online-nodes'),
            offlineNodes: document.getElementById('offline-nodes'),
            currentNetIn: document.getElementById('current-download-speed'),
            currentNetOut: document.getElementById('current-upload-speed'),
            totalNetIn: document.getElementById('total-download'),
            totalNetOut: document.getElementById('total-upload'),
            expiringNodes3: document.getElementById('expiring-nodes-3'),
            expiringNodes7: document.getElementById('expiring-nodes-7'),
            expiringNodes30: document.getElementById('expiring-nodes-30'),
            regionStats: document.getElementById('region-stats')
        };

        // 4. 更新移动端显示
        const mobileElements = {
            totalNodes: document.getElementById('total-nodes-mobile'),
            onlineNodes: document.getElementById('online-nodes-mobile'),
            offlineNodes: document.getElementById('offline-nodes-mobile'),
            currentNetIn: document.getElementById('current-download-speed-mobile'),
            currentNetOut: document.getElementById('current-upload-speed-mobile'),
            totalNetIn: document.getElementById('total-download-mobile'),
            totalNetOut: document.getElementById('total-upload-mobile'),
            regionStats: document.getElementById('region-stats-mobile')
        };

        // 5. 更新基础统计 - 添加空值检查和调试日志
        [elements, mobileElements].forEach(els => {
            if (els.totalNodes) {
                els.totalNodes.textContent = stats.nodes;
                // 更新节点总数统计
            } else {
                // 未找到节点总数显示元素
            }
            if (els.onlineNodes) els.onlineNodes.textContent = stats.online;
            if (els.offlineNodes) els.offlineNodes.textContent = stats.offline;
            if (els.currentNetIn) els.currentNetIn.textContent = strbps(stats.download * 8);
            if (els.currentNetOut) els.currentNetOut.textContent = strbps(stats.upload * 8);
            if (els.totalNetIn) els.totalNetIn.textContent = strB(stats.downloadTotal);
            if (els.totalNetOut) els.totalNetOut.textContent = strB(stats.uploadTotal);
        });

        // 6. 计算不同天数内到期的节点
        const now = Math.floor(Date.now() / 1000);
        const threeDaysFromNow = now + (3 * 24 * 60 * 60);
        const sevenDaysFromNow = now + (7 * 24 * 60 * 60);
        const thirtyDaysFromNow = now + (30 * 24 * 60 * 60);
        let expiringCount3Days = 0;
        let expiringCount7Days = 0;
        let expiringCount30Days = 0;

        // 7. 处理每个节点 - 提取到期时间检查
        Object.entries(totals.nodes || {}).forEach(([sid, node]) => {
            // 跳过非节点数据
            if (!node || typeof node !== 'object' || !node.name) return;

            // 检查到期时间
            if (node.expire_time && node.expire_time > now) {
                // 3天内到期
                if (node.expire_time <= threeDaysFromNow) {
                    expiringCount3Days++;
                    expiringCount7Days++;
                    expiringCount30Days++;
                }
                // 7天内到期
                else if (node.expire_time <= sevenDaysFromNow) {
                    expiringCount7Days++;
                    expiringCount30Days++;
                }
                // 30天内到期
                else if (node.expire_time <= thirtyDaysFromNow) {
                    expiringCount30Days++;
                }
            }
        });

        // 8. 新增 - 处理节点地区信息，便于后续筛选
        // 无论是否使用RegionStatsModule，都需要处理节点的regionCode

        // 调试日志 - 检查节点数据结构
        // 节点数据结构检查

        let regionCount = 0;
        Object.entries(totals.nodes || {}).forEach(([sid, node]) => {
            if (!node || typeof node !== 'object' || !node.name) return;

            // 将地区信息添加到节点数据上，用于后续筛选 - 只使用新的数据结构
            if (!node.regionCode) {
                if (node.data?.location?.code) {
                    node.regionCode = node.data.location.code;
                    regionCount++;
                }
            }
        });
        // 地区信息处理完成

        // 9. 更新地区统计 - 尝试使用新模块
        if (window.RegionStatsModule) {
            // 使用新模块处理地区统计
            // 使用 RegionStatsModule 处理地区统计
            window.RegionStatsModule.update(totals.nodes || {});
        } else {
            // 如果模块未加载，显示警告
            // RegionStatsModule 未加载，地区统计功能将不可用
        }

        // 10. 更新分组统计和到期时间显示
        if (totals.groups) {
            Object.entries(totals.groups).forEach(([groupId, groupStats]) => {
                const countElement = document.getElementById(`group-${groupId}-count-tab`);
                if (countElement) {
                    countElement.textContent = `${groupStats.online}/${groupStats.total}`;
                }
            });
        }

        // 更新到期时间显示
        if (elements.expiringNodes3) {
            elements.expiringNodes3.textContent = expiringCount3Days;
        }
        if (elements.expiringNodes7) {
            elements.expiringNodes7.textContent = expiringCount7Days;
        }
        if (elements.expiringNodes30) {
            elements.expiringNodes30.textContent = expiringCount30Days;
        }

        // 11. 调试日志
        if (window.setting?.debug) {
            console.debug('更新总体统计:', {
                nodes: stats.nodes,
                online: stats.online,
                offline: stats.offline,
                expiringCount3Days,
                expiringCount7Days,
                expiringCount30Days,
                topRegions,
                currentDownload: strbps(stats.download * 8),
                currentUpload: strbps(stats.upload * 8),
                totalDownload: strB(stats.downloadTotal),
                totalUpload: strB(stats.uploadTotal)
            });
        }
    } catch (error) {
        // 更新总体统计时出错
    }
}

// 辅助函数: 标记节点错误状态
function markNodeAsError(card) {
    card.classList.add('error-state');
    const statusIndicator = card.querySelector('[id$="_status_indicator"]');
    if (statusIndicator) {
        statusIndicator.classList.add('bg-yellow-500');
        statusIndicator.title = '数据更新失败';
    }
}

// 增加初始化状态标记（新增）
if (typeof window.initializationCompleted === 'undefined') {
    window.initializationCompleted = false;
}

// 统一使用window命名空间管理全局控制器
if (typeof window.StatsController === 'undefined') {
    window.StatsController = {
    // 防抖计时器
    updateTimer: null,

    // 最后一次更新时间
    lastUpdateTime: 0,

    // 最小更新间隔（毫秒）
    MIN_UPDATE_INTERVAL: 1000,

    // 统一的更新函数
    async update() {
        try {
            // 在首次更新完成时标记（新增）
            if (!window.initializationCompleted) {
                await this.performInitialUpdate();
                window.initializationCompleted = true;
            }
            // WebSocket会自动更新数据，这里不需要额外的HTTP请求
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                // WebSocket未连接，尝试重新连接
                initWebSocket();
            }
        } catch (error) {
            // 更新失败
            this.scheduleRetry();
        }
    },

    performInitialUpdate() {
        return new Promise(resolve => {
            const listener = () => {
                document.removeEventListener('statsSyncComplete', listener);
                resolve();
            };
            document.addEventListener('statsSyncComplete', listener);
        });
    },

    // 安排重试更新
    scheduleRetry(delay = 3000) {
        setTimeout(() => this.update(), delay);
    },

    // 更新节点状态
    updateNodesStatus(stats) {
        const settings = loadSettings();
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
                // 应用敏感信息设置
                handleSensitiveInfo(serverCard, settings.hideSensitive);

                // 应用离线节点隐藏设置
                if (settings.hideOffline && status === NodeStatus.OFFLINE) {
                    serverCard.style.display = 'none';
                } else {
                // 更新卡片样式
                Object.values(NodeStyleConfig).forEach(config => {
                    serverCard.classList.remove(config.card);
                    serverCard.classList.remove(config.text);
                });
                if (styleConfig.card !== 'hidden') {
                    serverCard.classList.add(styleConfig.card);
                }
                serverCard.style.display = styleConfig.card === 'hidden' ? 'none' : '';
                }

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
    },

    // 更新仪表盘网络数据
    updateDashboardNetwork(netStats) {
        // 更新实时带宽 - 桌面端
        const currentDownloadSpeed = document.getElementById('current-download-speed');
        const currentUploadSpeed = document.getElementById('current-upload-speed');
        if (currentDownloadSpeed) {
            currentDownloadSpeed.textContent = strbps(netStats.downloadSpeed * 8);
        }
        if (currentUploadSpeed) {
            currentUploadSpeed.textContent = strbps(netStats.uploadSpeed * 8);
                }

        // 更新实时带宽 - 移动端
        const currentDownloadSpeedMobile = document.getElementById('current-download-speed-mobile');
        const currentUploadSpeedMobile = document.getElementById('current-upload-speed-mobile');
        if (currentDownloadSpeedMobile) {
            currentDownloadSpeedMobile.textContent = strbps(netStats.downloadSpeed * 8);
        }
        if (currentUploadSpeedMobile) {
            currentUploadSpeedMobile.textContent = strbps(netStats.uploadSpeed * 8);
        }

        // 更新总流量 - 桌面端
        const totalDownload = document.getElementById('total-download');
        const totalUpload = document.getElementById('total-upload');
        if (totalDownload) {
            totalDownload.textContent = strB(netStats.totalDownload);
        }
        if (totalUpload) {
            totalUpload.textContent = strB(netStats.totalUpload);
        }

        // 更新总流量 - 移动端
        const totalDownloadMobile = document.getElementById('total-download-mobile');
        const totalUploadMobile = document.getElementById('total-upload-mobile');
        if (totalDownloadMobile) {
            totalDownloadMobile.textContent = strB(netStats.totalDownload);
        }
        if (totalUploadMobile) {
            totalUploadMobile.textContent = strB(netStats.totalUpload);
        }
    },

    // 更新单个卡片的数据
    updateCardData(card, node, status) {
        if (!card || !node) {
            // 无效的卡片或节点数据
            return;
        }

        const sid = card.dataset.sid;
        if (!sid) {
            // 卡片缺少sid属性
            return;
        }

        // 如果节点有地区信息，添加到卡片上用于筛选
        if (node.data?.location?.country?.code) {
            card.dataset.region = node.data.location.country.code;
        }

        // 更新节点卡片

        // 更新状态指示器
        const style = NodeStyleConfig[status];
        const indicator = card.querySelector('.status-indicator');
        if (indicator) {
            // 移除所有可能的状态类
            Object.values(NodeStyleConfig).forEach(s => {
                indicator.classList.remove(s.indicator);
            });
            indicator.classList.add(style.indicator);
            indicator.setAttribute('title', style.title);
        }

        // 更新卡片透明度
        Object.values(NodeStyleConfig).forEach(s => {
            card.classList.remove(s.card);
        });
        card.classList.add(style.card);

        // 如果节点在线，更新统计数据
        if (status === NodeStatus.ONLINE && node.stat) {
            // CPU数据更新
            const cpuEl = document.getElementById(`${sid}_CPU`);
            if (cpuEl && node.stat.cpu) {
                const cpuUsage = (node.stat.cpu * 100).toFixed(1);
                cpuEl.style.width = `${cpuUsage}%`;
                cpuEl.textContent = `${cpuUsage}%`;
                updateTooltip(cpuEl, `CPU使用率: ${cpuUsage}%`);
            }

            // 内存数据更新
            const memEl = document.getElementById(`${sid}_MEM`);
            if (memEl && node.stat.mem) {
                const memTotal = node.stat.mem.total;
                const memUsed = node.stat.mem.used;
                const memUsage = ((memUsed / memTotal) * 100).toFixed(1);
                memEl.style.width = `${memUsage}%`;
                memEl.textContent = `${memUsage}%`;
                updateTooltip(memEl, `内存使用: ${strB(memUsed)} / ${strB(memTotal)}`);
            }

            // 网络数据更新
            if (node.stat.net) {
                const netStats = {
                    in: node.stat.net.in || 0,
                    out: node.stat.net.out || 0,
                    total_in: node.stat.net.total_in || 0,
                    total_out: node.stat.net.total_out || 0
                };

                // 更新网络速度
                const netInEl = document.getElementById(`${sid}_NET_IN`);
                const netOutEl = document.getElementById(`${sid}_NET_OUT`);
                if (netInEl) {
                    netInEl.textContent = strbps(netStats.in);
                    updateTooltip(netInEl, `下载速度: ${strbps(netStats.in)}`);
                }
                if (netOutEl) {
                    netOutEl.textContent = strbps(netStats.out);
                    updateTooltip(netOutEl, `上传速度: ${strbps(netStats.out)}`);
                }

                // 更新总流量
                const netInTotalEl = document.getElementById(`${sid}_NET_IN_TOTAL`);
                const netOutTotalEl = document.getElementById(`${sid}_NET_OUT_TOTAL`);
                if (netInTotalEl) {
                    netInTotalEl.textContent = strB(netStats.total_in);
                    updateTooltip(netInTotalEl, `总下载: ${strB(netStats.total_in)}`);
                }
                if (netOutTotalEl) {
                    netOutTotalEl.textContent = strB(netStats.total_out);
                    updateTooltip(netOutTotalEl, `总上传: ${strB(netStats.total_out)}`);
                }

                // 节点网络数据已更新
            } else {
                // 节点无网络数据
            }
        } else {
            // 节点离线，清空所有数据显示
            const elements = ['CPU', 'MEM', 'NET_IN', 'NET_OUT', 'NET_IN_TOTAL', 'NET_OUT_TOTAL'];
            elements.forEach(type => {
                const el = document.getElementById(`${sid}_${type}`);
                if (el) {
                    if (type === 'CPU' || type === 'MEM') {
                        el.style.width = '0%';
                    }
                    el.textContent = type.includes('NET') ? '0' : '0%';
                    updateTooltip(el, '节点离线');
                }
            });
        }

        // 更新到期时间
        const expireEl = document.getElementById(`${sid}_expire`);
        if (expireEl) {
            expireEl.textContent = formatRemainingDays(node.expire_time);
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
} // 关闭window.StatsController定义

// 更新统计数据
async function updateStats() {
  if (StateManager.getState('isUpdating')) return;

  try {
    StateManager.setState({ isUpdating: true });

    if (typeof StatsController === 'undefined') {
      throw new Error('StatsController not found');
    }

    await StatsController.update();

    StateManager.setState({
      lastUpdateTime: Date.now(),
      updateError: null,
      connectionStatus: 'connected'
    });

  } catch (error) {
    console.error('数据更新失败:', error);
    StateManager.setState({
      updateError: error.message || String(error),
      connectionStatus: 'error'
    });
    scheduleRetry();
  } finally {
    StateManager.setState({ isUpdating: false });
  }
}

// 安排重试
function scheduleRetry(delay = 3000) {
  setTimeout(() => updateStats(), delay);
}

// 初始化系统
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 等待 SystemInitializer 完成初始化
        await SystemInitializer.init();

        // 继续执行 stats.js 特有的初始化逻辑（如果有）
        if (typeof window.StatsController !== 'undefined') {
            await window.StatsController.update();
        }
    } catch (error) {
        // stats.js 初始化失败
    }
});

/**
 * 根据分组筛选节点
 * @param {string} groupId - 分组ID
 */
function filterByGroup(groupId) {
    // 按分组筛选

    // 1. 更新当前分组ID
    currentGroupId = groupId;

    // 2. 获取所有服务器卡片
    const allCards = Array.from(document.querySelectorAll('.server-card'));
    // 找到服务器卡片

    // 3. 判断是否显示所有卡片
    const showAll = groupId === 'all';

    // 4. 筛选卡片
    let matchedCards = 0;
    let unmatchedCards = 0;

    allCards.forEach(card => {
        // 获取卡片的分组
        const cardGroup = card.dataset.group;

        // 判断是否匹配当前选中的分组
        const isMatched = showAll || cardGroup === groupId;

        if (isMatched) {
            matchedCards++;
            // 如果卡片只因为分组筛选而隐藏，则显示它
            if (card.style.display === 'none' && card.classList.contains('hidden-by-group') &&
                !card.classList.contains('hidden-by-expiry') && !card.classList.contains('hidden-by-status') &&
                !card.classList.contains('hidden-by-region')) {
                card.style.display = '';
            }
            // 移除分组筛选标记
            card.classList.remove('hidden-by-group');
        } else {
            unmatchedCards++;
            // 隐藏不匹配的卡片
            card.style.display = 'none';
            // 标记是被分组筛选隐藏的
            card.classList.add('hidden-by-group');
        }
    });

    // 筛选完成

    // 5. 更新Tab状态
    const allTabs = document.querySelectorAll('.group-tab');
    allTabs.forEach(tab => {
        if (tab.dataset.group === groupId) {
            tab.classList.add('active-tab');
        } else {
            tab.classList.remove('active-tab');
        }
    });

    // 7. 重新应用当前排序
    if (window.currentSortConfig) {
        applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
    }
}

function initTabs() {
    // 获取所有tab按钮 - 同时支持.tab-btn和.group-tab类
    const tabButtons = document.querySelectorAll('.tab-btn, .group-tab');
    // 初始化分组标签

    // 为每个按钮添加点击事件
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const groupId = button.getAttribute('data-group');
            if (groupId) {
                // 点击分组标签
                filterByGroup(groupId);
            }
        });
    });

    // 初始化时激活"全部"分组
    filterByGroup('all');
}

/**
 * 应用排序
 * @param {string} type - 排序类型
 * @param {string} direction - 排序方向
 */
function applySort(type, direction) {
    // 执行排序

    // 获取所有服务器卡片 - 不再依赖标签页和视图组
    let activeView = null;
    let cards = [];

    try {
        // 先尝试获取激活的标签页和视图组
        const activeTab = document.querySelector('.tab-btn.active, .group-tab.active-tab');
        if (activeTab) {
            const activeGroupId = activeTab.dataset.group;
            // 获取当前激活分组
            // 注意：现在我们使用筛选而不是视图组
            // activeView = document.querySelector(`.group-view[data-group="${activeGroupId}"]`);
        }

        // 如果找不到激活的视图组，尝试获取可见的视图组
        if (!activeView) {
            const visibleViews = Array.from(document.querySelectorAll('.group-view:not([style*="display: none"])'));
            if (visibleViews.length > 0) {
                activeView = visibleViews[0];
            }
        }

        // 如果还是找不到，尝试获取第一个视图组
        if (!activeView) {
            const allViews = document.querySelectorAll('.group-view');
            if (allViews.length > 0) {
                activeView = allViews[0];
            }
        }

        // 如果还是找不到，尝试获取所有卡片
        if (!activeView) {
            cards = Array.from(document.querySelectorAll('.server-card'));
            if (cards.length === 0) {
                // 未找到任何服务器卡片，跳过排序
                return;
            }
        } else {
            // 从激活的视图组中获取卡片
            cards = Array.from(activeView.querySelectorAll('.server-card')).filter(card =>
                card.style.display !== 'none'
            );
        }
    } catch (error) {
        // 获取服务器卡片时出错
        return;
    }

    // 不需要重复获取卡片，因为在上面的try块中已经获取了

    // 准备排序卡片

    // 保存拖拽相关的属性和事件
    const preserveDragData = (card) => {
        return {
            dragData: card.getAttribute('draggable'),
            dragEvents: card.getAttribute('data-has-drag-events') === 'true'
        };
    };

    // 排序前保存所有卡片的拖拽状态
    const dragStates = cards.map(card => ({
        element: card,
        state: preserveDragData(card)
    }));

    // 获取排序值的函数
    const getSortValue = (card, type) => {
        let value = 0;
        switch(type) {
            case 'default':
                return Number(card.dataset.top || 0);
            case 'cpu':
                value = Number(card.querySelector('[id$="_CPU"]')?.dataset.cpu || 0);
                break;
            case 'memory':
                value = Number(card.querySelector('[id$="_MEM"]')?.dataset.memory || 0);
                break;
            case 'download':
                const downloadText = card.querySelector('[id$="_NET_IN"]')?.textContent || '0 bps';
                value = parseNetworkValue(downloadText);
                break;
            case 'upload':
                const uploadText = card.querySelector('[id$="_NET_OUT"]')?.textContent || '0 bps';
                value = parseNetworkValue(uploadText);
                break;
            case 'expiration':
                const expireText = card.querySelector('[id$="_EXPIRE_TIME"]')?.textContent;
                if (expireText === '永久') return Number.MAX_SAFE_INTEGER;
                if (expireText === '已过期') return -1;
                if (expireText === '今日到期') return 0;
                const days = parseInt(expireText.match(/\d+/)?.[0] || 0);
                return days;
            default:
                return 0;
        }
        return value;
    };

    // 解析网络值的辅助函数
    const parseNetworkValue = (text) => {
        const match = text.match(/^([\d.]+)\s*(\w+)$/);
        if (!match) return 0;

        const [_, value, unit] = match;
        const numValue = parseFloat(value);

        switch(unit.toLowerCase()) {
            case 'bps': return numValue;
            case 'kbps': return numValue * 1000;
            case 'mbps': return numValue * 1000000;
            case 'gbps': return numValue * 1000000000;
            case 'tbps': return numValue * 1000000000000;
            default: return 0;
        }
    };

    // 执行排序
    cards.sort((a, b) => {
        // 获取在线状态
        const isOnlineA = a.querySelector('[id$="_status_indicator"]')?.classList.contains('bg-green-500') || false;
        const isOnlineB = b.querySelector('[id$="_status_indicator"]')?.classList.contains('bg-green-500') || false;

        // 如果在线状态不同,在线的排在前面
        if (isOnlineA !== isOnlineB) {
            return isOnlineA ? -1 : 1;
        }

        // 如果是默认排序,只按top值排序
        if (type === 'default') {
            const topA = Number(a.dataset.top || 0);
            const topB = Number(b.dataset.top || 0);
            return direction === 'asc' ? topA - topB : topB - topA;
        }

        // 获取排序值
        const valueA = getSortValue(a, type);
        const valueB = getSortValue(b, type);

        // 如果值相同,按top值排序
        if (valueA === valueB) {
            const topA = Number(a.dataset.top || 0);
            const topB = Number(b.dataset.top || 0);
            return topB - topA;
        }

        // 根据排序方向返回比较结果
        return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });

    // 获取正确的容器
    let container = null;

    if (activeView) {
        // 尝试从激活视图中获取容器
        const groupId = activeView.dataset.group || 'all';
        container = groupId === 'all' ?
            activeView.querySelector('.grid') :
            document.getElementById(`card-grid-${groupId}`);
    }

    // 如果还是找不到容器，尝试使用第一个可用的卡片容器
    if (!container) {
        container = document.querySelector('.grid') || document.querySelector('.server-grid');
    }

    if (container) {
        // 排序完成,更新DOM
        // 重新排序DOM元素
        cards.forEach(card => container.appendChild(card));

        // 恢复拖拽状态
        dragStates.forEach(({element, state}) => {
            if (state.dragData) {
                element.setAttribute('draggable', state.dragData);
            }
            if (state.dragEvents) {
                element.setAttribute('data-has-drag-events', 'true');
            }
        });
    } else {
        // 未找到卡片容器
    }
}

/**
 * 按地区筛选服务器卡片
 * @param {string} regionCode - 地区代码
 */
/**
 * 地区筛选功能 - 委托给RegionStatsModule
 * @param {string} regionCode - 地区代码
 */
function filterByRegion(regionCode) {
    // 检查是否有RegionStatsModule，有则使用，无则降级到原有实现
    if (window.RegionStatsModule) {
        window.RegionStatsModule.filterByRegion(regionCode);
    } else {
        // RegionStatsModule未加载，无法使用地区筛选功能
        // 简单回退实现：重置显示所有卡片
        const allCards = Array.from(document.querySelectorAll('.server-card'));
        allCards.forEach(card => {
            if (card.style.display === 'none' && !card.classList.contains('hidden-by-status')) {
                card.style.display = '';
            }
        });

        // 重置筛选器状态
        document.querySelectorAll('.region-filter').forEach(el => {
            el.classList.remove('active-filter');
        });
    }
}

// 应用当前排序
function applyCurrentSort() {
    try {
        // 检查是否启用了实时排序
        const realtimeSort = document.getElementById('realtime-sort');
        const isRealtimeSortEnabled = realtimeSort ? realtimeSort.checked : window.realtimeSortEnabled;

        // 如果没有启用实时排序，则不执行排序
        if (isRealtimeSortEnabled === false) {
            // 实时排序未启用，跳过排序
            return;
        }

        const currentSortBtn = document.querySelector('.sort-btn.active');
        if (currentSortBtn) {
            const type = currentSortBtn.dataset.sort;
            const direction = currentSortBtn.dataset.direction || 'desc';
            applySort(type, direction);
        } else {
            // 如果找不到激活的排序按钮，使用默认排序
            // 未找到激活的排序按钮，使用默认排序
            applySort('default', 'desc');
        }
    } catch (error) {
        // 应用当前排序时出错
    }
}

/**
 * 重置地区筛选 - 委托给RegionStatsModule
 */
function resetRegionFilter() {
    filterByRegion('ALL');
}

/**
 * 更新排序按钮状态
 * @param {string} type - 排序类型
 * @param {string} direction - 排序方向
 */
function updateSortButtonStates(type, direction) {
    const sortButtons = document.querySelectorAll('.sort-button');
    sortButtons.forEach(button => {
        const buttonType = button.getAttribute('data-sort');
        const buttonDirection = button.getAttribute('data-direction');
        button.classList.toggle('active', buttonType === type && buttonDirection === direction);
    });
}

/**
 * 根据节点到期时间筛选服务器卡片
 * @param {number} days - 到期天数（3, 7, 30）
 */
function filterByExpiry(days) {
    // 按到期时间筛选

    // 重置所有过滤状态
    const resetFilter = !days;

    // 记录当前激活的筛选器
    window.activeExpiryFilter = resetFilter ? null : days;

    // 计算到期时间范围
    const now = Math.floor(Date.now() / 1000);
    const expiryLimit = now + (days * 24 * 60 * 60);

    // 获取所有服务器卡片
    let allCards = Array.from(document.querySelectorAll('.server-card'));
    // 找到服务器卡片

    if (resetFilter) {
        // 重置所有卡片显示状态
        allCards.forEach(card => {
            if (card.style.display === 'none' && !card.classList.contains('hidden-by-region') && !card.classList.contains('hidden-by-status')) {
                card.style.display = '';
            }
            // 移除到期筛选标记
            card.classList.remove('hidden-by-expiry');
        });

        // 移除所有到期筛选按钮的激活状态
        document.querySelectorAll('.expiry-filter').forEach(el => {
            el.classList.remove('active-filter');
        });

        // 重置到期筛选，显示所有卡片
    } else {
        // 设置新的筛选状态
        // 开始按到期时间筛选

        // 记录匹配和不匹配的卡片数量
        let matchedCards = 0;
        let unmatchedCards = 0;

        allCards.forEach(card => {
            // 获取卡片的到期时间
            // 先尝试从卡片的data-expiration属性获取
            let expiryTime = parseInt(card.dataset.expiration || '0', 10);

            // 如果卡片上没有到期时间，则尝试从内部元素获取
            if (!expiryTime) {
                const expiryElement = card.querySelector('[data-expire]');
                if (expiryElement && expiryElement.dataset.expire) {
                    expiryTime = parseInt(expiryElement.dataset.expire, 10);
                }
            }

            // 检查是否在指定天数内到期
            if (expiryTime > now && expiryTime <= expiryLimit) {
                matchedCards++;
                if (card.style.display === 'none' && !card.classList.contains('hidden-by-region') && !card.classList.contains('hidden-by-status')) {
                    card.style.display = '';
                }
                card.classList.remove('hidden-by-expiry');
            } else {
                unmatchedCards++;
                // 隐藏非目标到期时间的卡片
                card.style.display = 'none';
                // 标记是被到期筛选隐藏的
                card.classList.add('hidden-by-expiry');
            }
        });

        // 筛选完成
        // 更新到期筛选按钮样式
        document.querySelectorAll('.expiry-filter').forEach(el => {
            if (parseInt(el.dataset.days, 10) === days) {
                el.classList.add('active-filter');
            } else {
                el.classList.remove('active-filter');
            }
        });
    }
}

/**
 * 根据节点状态筛选服务器卡片
 * @param {string} status - 节点状态（'ALL', 'ONLINE', 'OFFLINE'）
 */
function filterByStatus(status) {
    // 按状态筛选

    // 重置所有过滤状态
    const resetFilter = !status || status === 'ALL';

    // 记录当前激活的筛选器
    window.activeStatusFilter = resetFilter ? null : status;

    // 获取所有服务器卡片
    let allCards = Array.from(document.querySelectorAll('.server-card'));
    // 找到服务器卡片

    if (resetFilter) {
        // 重置所有卡片显示状态
        allCards.forEach(card => {
            if (card.style.display === 'none' && !card.classList.contains('hidden-by-region')) {
                card.style.display = '';
            }
            // 移除状态筛选标记
            card.classList.remove('hidden-by-status');
        });

        // 移除所有状态筛选按钮的激活状态
        document.querySelectorAll('.status-filter').forEach(el => {
            el.classList.remove('active-filter');
        });

        // 激活'ALL'按钮
        const allButton = document.querySelector('.status-filter[data-status="ALL"]');
        if (allButton) {
            allButton.classList.add('active-filter');
        }

        // 重置状态筛选，显示所有卡片
    } else {
        // 设置新的筛选状态
        // 开始按状态筛选

        // 记录匹配和不匹配的卡片数量
        let matchedCards = 0;
        let unmatchedCards = 0;

        allCards.forEach(card => {
            // 获取卡片的状态指示器
            const statusIndicator = card.querySelector('[id$="_status_indicator"]');
            let cardStatus = 'UNKNOWN';

            if (statusIndicator) {
                // 根据状态指示器的类名判断卡片状态
                if (statusIndicator.classList.contains('bg-green-500')) {
                    cardStatus = 'ONLINE';
                } else if (statusIndicator.classList.contains('bg-red-500')) {
                    cardStatus = 'OFFLINE';
                } else if (statusIndicator.classList.contains('bg-yellow-500')) {
                    cardStatus = 'ERROR';
                }
            }

            if (cardStatus === status || (status === 'OFFLINE' && cardStatus === 'ERROR')) {
                matchedCards++;
                if (card.style.display === 'none' && !card.classList.contains('hidden-by-region')) {
                    card.style.display = '';
                }
                card.classList.remove('hidden-by-status');
            } else {
                unmatchedCards++;
                // 隐藏非目标状态的卡片
                card.style.display = 'none';
                // 标记是被状态筛选隐藏的，而不是因为地区
                card.classList.add('hidden-by-status');
            }
        });

        // 筛选完成
        // 更新状态筛选按钮样式
        document.querySelectorAll('.status-filter').forEach(el => {
            if (el.dataset.status === status) {
                el.classList.add('active-filter');
            } else {
                el.classList.remove('active-filter');
            }
        });
    }
}

/**
 * 初始化地区统计卡片的交互式功能
 * 该功能现已迁移到RegionStatsModule模块
 */
function initRegionStats() {
    // 检查是否已经加载RegionStatsModule
    if (!window.RegionStatsModule) {
        // 检查当前页面是否需要地区统计功能
        // 只有仪表板页面才需要，定义为存在region-stats元素的页面
        const needRegionStats = document.getElementById('region-stats') || document.getElementById('region-stats-mobile');

        if (needRegionStats) {
            // RegionStatsModule未加载，地区统计功能将不可用
        } else {
            // 非仪表板页面，不需要显示警告
            // 当前页面不需要地区统计功能
        }
    } else {
        // 地区统计功能已由RegionStatsModule提供
    }
}

/**
 * 初始化到期节点筛选功能
 */
function initExpiryFilters() {
    // 获取所有到期筛选按钮
    const expiryFilters = document.querySelectorAll('.expiry-filter');
    // 初始化到期筛选按钮

    // 为每个到期筛选按钮添加点击事件
    expiryFilters.forEach(filter => {
        filter.addEventListener('click', (event) => {
            // 防止事件冒泡到文档级别
            event.stopPropagation();

            const days = parseInt(filter.dataset.days, 10);
            // 点击到期筛选按钮

            // 直接应用筛选，不管是否是当前激活的按钮
            // 移除再次点击就取消筛选的逻辑，只有点击其他区域才会取消筛选
            filterByExpiry(days);
        });
    });

    // 添加文档级别的点击事件监听器
    document.addEventListener('click', (event) => {
        // 检查是否有激活的到期筛选
        if (window.activeExpiryFilter) {
            // 检查点击的元素是否是到期筛选按钮或其子元素
            const isExpiryFilter = event.target.closest('.expiry-filter');

            // 如果不是到期筛选按钮，则取消筛选
            if (!isExpiryFilter) {
                filterByExpiry(null);
            }
        }
    });
}

/**
 * 初始化状态筛选功能
 */
function initStatusFilters() {
    // 获取所有状态筛选按钮
    const statusFilters = document.querySelectorAll('.status-filter');
    // 初始化状态筛选按钮

    // 设置默认激活状态为'ALL'
    const allButton = document.querySelector('.status-filter[data-status="ALL"]');
    if (allButton) {
        allButton.classList.add('active-filter');
    }

    // 为每个状态筛选按钮添加点击事件
    statusFilters.forEach(filter => {
        filter.addEventListener('click', () => {
            const status = filter.dataset.status;
            // 点击状态筛选按钮
            filterByStatus(status);
        });
    });
}

// 初始化排序按钮事件
function initSortButtons() {
    const sortButtons = document.querySelectorAll('.sort-btn');
    // 初始化排序按钮

    // 设置默认排序按钮
    const defaultSortBtn = document.querySelector('[data-sort="default"]');
    if (defaultSortBtn) {
        defaultSortBtn.classList.add('active');
        defaultSortBtn.dataset.direction = 'desc';
        defaultSortBtn.querySelector('i').textContent = 'expand_more';
        // 已设置默认排序按钮

        // 初始化时执行一次默认排序
        applySort('default', 'desc');
    } else {
        // 未找到默认排序按钮
    }

    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.sort;
            let direction = !btn.classList.contains('active') ? 'desc' :
                           (btn.dataset.direction === 'asc' ? 'desc' : 'asc');

            btn.dataset.direction = direction;
            sortButtons.forEach(b => {
                b.classList.remove('active');
                const icon = b.querySelector('i');
                if (icon) icon.textContent = 'unfold_more';
            });

            btn.classList.add('active');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.textContent = direction === 'asc' ? 'expand_less' : 'expand_more';
            }

            applySort(type, direction);
        });
    });

    // 实时排序复选框事件
    try {
        const realtimeSort = document.getElementById('realtime-sort');
        if (realtimeSort) {
            realtimeSort.checked = true;
            // 已启用实时排序
            realtimeSort.addEventListener('change', () => {
                // 实时排序设置变更
                if (realtimeSort.checked) {
                    applyCurrentSort();
                }
            });
        } else {
            // 如果找不到实时排序复选框，创建一个全局变量模拟其行为
            // 找不到实时排序复选框，使用默认设置
            window.realtimeSortEnabled = true; // 默认启用实时排序
        }
    } catch (error) {
        // 初始化实时排序复选框时出错
        window.realtimeSortEnabled = true; // 默认启用实时排序
    }
}

// 添加设置变更监听
document.addEventListener('DOMContentLoaded', () => {
    // 初始化排序按钮
    initSortButtons();
    // 初始化地区统计交互功能
    initRegionStats();
    // 初始化状态筛选功能
    initStatusFilters();
    // 初始化到期节点筛选功能
    initExpiryFilters();

    // 加载保存的设置
    const settings = loadSettings();

    // 设置复选框初始状态
    const sensitiveCheckbox = document.getElementById('show-sensitive');
    const offlineCheckbox = document.getElementById('hide-offline');

    if (sensitiveCheckbox) {
        sensitiveCheckbox.checked = settings.hideSensitive;
        sensitiveCheckbox.addEventListener('change', function(e) {
            settings.hideSensitive = e.target.checked;
            saveSettings(settings);
            window.StatsController.update();
        });
    }

    if (offlineCheckbox) {
        offlineCheckbox.checked = settings.hideOffline;
        offlineCheckbox.addEventListener('change', function(e) {
            settings.hideOffline = e.target.checked;
            saveSettings(settings);
            window.StatsController.update();
        });
    }

    // 应用初始排序
    applyCurrentSort();
});

