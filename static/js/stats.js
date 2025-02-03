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

// 更新分组计数
function updateGroupCounts() {
    document.querySelectorAll('.group-container').forEach(group => {
        const groupId = group.dataset.groupId;
        const cards = group.querySelectorAll('.server-card');
        
        // 计算可见的服务器数量
        const visibleCards = Array.from(cards).filter(card => {
            // 检查是否被隐藏
            if (card.style.display === 'none') {
                return false;
            }
            
            // 如果启用了隐藏离线节点选项，则检查状态
            if (document.getElementById('hide-offline').checked) {
                const sid = card.dataset.sid;
                const statusIndicator = document.getElementById(`${sid}_status_indicator`);
                // 只计算在线的节点（绿色状态）
                return statusIndicator && statusIndicator.classList.contains('bg-green-500');
            }
            
            // 如果不隐藏离线节点，计算所有节点
            return true;
        }).length;
        
        // 更新计数
        const countElement = document.getElementById(`group-${groupId}-count`);
        if (countElement) {
            countElement.textContent = `(${visibleCards})`;
        }
        
        // 根据隐藏离线节点选项决定是否显示分组
        if (document.getElementById('hide-offline').checked) {
            group.style.display = visibleCards > 0 ? '' : 'none';
        } else {
            group.style.display = ''; // 不隐藏离线节点时始终显示分组
        }
    });
}

// 监听隐藏离线节点选项的变化
document.addEventListener('DOMContentLoaded', () => {
    const hideOfflineCheckbox = document.getElementById('hide-offline');
    if (hideOfflineCheckbox) {
        hideOfflineCheckbox.addEventListener('change', (e) => {
            const hideOffline = e.target.checked;
            // 更新所有服务器卡片的显示状态
            document.querySelectorAll('.server-card').forEach(card => {
                const statusIndicator = card.querySelector('[id$="_status_indicator"]');
                const isOnline = statusIndicator && statusIndicator.classList.contains('bg-green-500');
                // 只在启用隐藏离线节点时才隐藏离线节点
                card.style.display = hideOffline && !isOnline ? 'none' : '';
            });
            // 更新分组显示状态
            updateGroupCounts();
        });
    }

    // 初始化分组拖拽
    const groupsContainer = document.getElementById('groups-container');
    if (groupsContainer && document.querySelector('.group-handle')) {
        new Sortable(groupsContainer, {
            animation: 150,
            handle: '.group-handle',
            draggable: '.group-container',
            ghostClass: 'bg-slate-800/50',
            onEnd: async function() {
                const groups = Array.from(groupsContainer.children)
                    .filter(el => el.classList.contains('group-container'))
                    .map(el => el.dataset.groupId);
                
                try {
                    startloading();
                    const res = await postjson('/admin/groups/order', { groups });
                    if (res.status) {
                        notice('排序已保存');
                    } else {
                        notice(res.data || '保存失败');
                        location.reload();
                    }
                } catch (error) {
                    notice('操作失败');
                    location.reload();
                } finally {
                    endloading();
                }
            }
        });
    }

    // 初始化每个分组内的服务器卡片拖拽
    document.querySelectorAll('[id^="card-grid-"]').forEach(cardGrid => {
        new Sortable(cardGrid, {
            animation: 150,
            draggable: '.server-card',
            ghostClass: 'bg-slate-800/50',
            handle: '.server-card-handle', // 只允许通过特定区域拖动
            group: 'servers', // 允许跨分组拖拽
            onEnd: async function(evt) {
                const serverId = evt.item.dataset.sid;
                const newGroupId = evt.to.id.replace('card-grid-', '');
                const servers = Array.from(evt.to.children).map(el => el.dataset.sid);
                
                try {
                    startloading();
                    // 先更新服务器所属分组
                    await postjson(`/admin/servers/${serverId}/edit`, {
                        group_id: newGroupId
                    });
                    
                    // 再保存新的排序
                    await postjson('/admin/servers/ord', { servers });
                    
                    notice('更新成功');
                    // 更新分组计数
                    updateGroupCounts();
                } catch (error) {
                    notice('操作失败');
                    location.reload();
                } finally {
                    endloading();
                }
            }
        });
    });
});

// 主循环：每秒更新一次状态
setInterval(async () => {
    try {
        const stats = await fetch("/stats/data").then(res => res.json());
        let updated = false;
        
        // 检查当前是否在卡片视图（通过检查hide-offline元素）
        const isCardView = document.getElementById('hide-offline') !== null;
        const hideOffline = isCardView ? document.getElementById('hide-offline').checked : false;
        
        for (const [sid, node] of Object.entries(stats)) {
            // 获取状态指示器（在列表视图中可能不存在）
            const statusIndicator = E(`${sid}_status_indicator`);
            
            // 判断在线状态
            const isOnline = node.stat && typeof node.stat === 'object';
            
            // 更新状态指示器（如果存在）
            if (statusIndicator) {
                statusIndicator.className = `w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`;
                statusIndicator.title = isOnline ? '在线' : '离线';
                updated = true;
            }

            // 更新服务器卡片的显示状态（仅在卡片视图中）
            if (isCardView) {
                const serverCard = statusIndicator?.closest('.server-card');
                if (serverCard) {
                    serverCard.style.display = hideOffline && !isOnline ? 'none' : '';
                    serverCard.classList.toggle('server-online', isOnline);
                    serverCard.classList.toggle('server-offline', !isOnline);
                }
            }

            // 更新 CPU 信息
            const cpuElement = E(`${sid}_CPU`);
            const cpuProgressElement = E(`${sid}_CPU_progress`);
            if (cpuElement && cpuProgressElement) {
                const cpuValue = isOnline ? (node.stat.cpu.multi * 100).toFixed(2) : '0';
                cpuElement.innerText = cpuValue + '%';
                cpuElement.dataset.cpu = cpuValue;  // 添加数据属性
                cpuProgressElement.style.width = isOnline ? cpuValue + '%' : '0%';
                updated = true;
            }
            
            // 更新内存信息
            const memElement = E(`${sid}_MEM`);
            const memProgressElement = E(`${sid}_MEM_progress`);
            const memItemElement = E(`${sid}_MEM_item`);
            if (memElement && memProgressElement) {
                if (isOnline && node.stat?.mem?.virtual) {
                    const {used, total} = node.stat.mem.virtual;
                    const usage = used/total;
                    const memValue = (usage * 100).toFixed(2);
                    memElement.innerText = memValue + '%';
                    memElement.dataset.memory = memValue;  // 添加数据属性
                    memProgressElement.style.width = memValue + '%';
                    
                    if (memItemElement) {
                        const memContent = `${strB(used)}/${strB(total)}`;
                        updateTooltip(memItemElement, memContent);
                    }
                    updated = true;
                } else {
                    memElement.innerText = 'N/A';
                    memElement.dataset.memory = '0';  // 离线时设置为0
                    memProgressElement.style.width = '0%';
                    if (memItemElement) {
                        updateTooltip(memItemElement, 'N/A');
                    }
                }
            }
            
            // 更新网络信息
            const netInElement = E(`${sid}_NET_IN`);
            const netOutElement = E(`${sid}_NET_OUT`);
            const netInTotalElement = E(`${sid}_NET_IN_TOTAL`);
            const netOutTotalElement = E(`${sid}_NET_OUT_TOTAL`);
            
            if (isOnline && node.stat?.net) {
                // 记录详细的网络数据用于调试
                console.log(`节点 ${sid} 的详细网络数据:`, {
                    delta: node.stat.net.delta,
                    total: node.stat.net.total,
                    traffic_used: node.traffic_used,
                    traffic_limit: node.traffic_limit,
                    traffic_calibration_value: node.traffic_calibration_value
                });

                // 更新实时网速
                if (netInElement) {
                    const rawValue = node.stat.net.delta?.in;
                    const value = rawValue !== undefined ? strbps(rawValue) : '0 bps';
                    console.log(`节点 ${sid} 实时下载速度:`, { raw: rawValue, formatted: value });
                    netInElement.innerText = value;
                    updated = true;
                }
                
                if (netOutElement) {
                    const rawValue = node.stat.net.delta?.out;
                    const value = rawValue !== undefined ? strbps(rawValue) : '0 bps';
                    console.log(`节点 ${sid} 实时上传速度:`, { raw: rawValue, formatted: value });
                    netOutElement.innerText = value;
                    updated = true;
                }

                // 更新总流量
                if (netInTotalElement) {
                    const rawValue = node.stat.net.total?.in || 0;
                    const value = strB(rawValue);
                    console.log(`节点 ${sid} 总下载流量:`, { raw: rawValue, formatted: value });
                    netInTotalElement.innerText = value;
                    updated = true;
                }
                
                if (netOutTotalElement) {
                    const rawValue = node.stat.net.total?.out || 0;
                    const value = strB(rawValue);
                    console.log(`节点 ${sid} 总上传流量:`, { raw: rawValue, formatted: value });
                    netOutTotalElement.innerText = value;
                    updated = true;
                }
            } else {
                // 节点离线或没有网络数据时显示0
                if (netInElement) netInElement.innerText = '0 bps';
                if (netOutElement) netOutElement.innerText = '0 bps';
                if (netInTotalElement) netInTotalElement.innerText = '0 B';
                if (netOutTotalElement) netOutTotalElement.innerText = '0 B';
                updated = true;
            }
            
            // 添加流量限制和剩余流量的显示
            const trafficLimitElement = E(`${sid}_TRAFFIC_LIMIT`);
            const trafficRemainingElement = E(`${sid}_TRAFFIC_REMAINING`);

            if (trafficLimitElement) {
                const limit = node.traffic_limit || 0;
                trafficLimitElement.innerText = strB(limit);
            }

            if (trafficRemainingElement) {
                const used = node.traffic_used || 0;
                const limit = node.traffic_limit || 0;
                const remaining = Math.max(0, limit - used);
                trafficRemainingElement.innerText = strB(remaining);
            }
            
            // 更新到期时间
            const expireElement = E(`${sid}_EXPIRE_TIME`);
            if (expireElement) {
                expireElement.innerText = formatRemainingDays(node.expire_time);
                expireElement.dataset.expire = node.expire_time || '0';  // 添加数据属性
                updated = true;
            }
            
            // 更新主机信息提示
            const hostElement = E(`${sid}_host`);
            if (hostElement && isOnline && node.stat?.host) {
                const hostContent = 
`系统: ${node.stat.host.os || 'N/A'}
平台: ${node.stat.host.platform || 'N/A'}
内核版本: ${node.stat.host.kernelVersion || 'N/A'}
内核架构: ${node.stat.host.kernelArch || 'N/A'}
启动: ${node.stat.host.bootTime ? new Date(node.stat.host.bootTime*1000).toLocaleString() : 'N/A'}
在线: ${node.stat.host.uptime ? (node.stat.host.uptime/86400).toFixed(2) + '天' : 'N/A'}`;
                updateTooltip(hostElement, hostContent);
                updated = true;
            }
        }

        // 仅在卡片视图中更新分组计数
        if (isCardView && updated) {
            updateGroupCounts();
            
            // 如果启用了实时排序，触发排序
            if (window.sortState && window.sortState.realtimeSort) {
                window.sortCards();
            }
        }

        // 触发状态更新事件
        if (updated) {
            const event = new Event('statusUpdated');
            document.dispatchEvent(event);
        }
    } catch (error) {
        console.error('更新状态时发生错误:', error);
    }
}, 1000);

// 监听状态更新事件
document.addEventListener('statusUpdated', () => {
    updateGroupCounts();
});

/**
 * 更新服务器的分组信息
 * @param {string} serverId - 服务器ID
 * @param {string} newGroupId - 新的分组ID
 * @returns {Promise<boolean>} 更新是否成功
 */
async function updateServerGroup(serverId, newGroupId) {
    try {
        const response = await fetch(`/servers/${serverId}`, {
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
        return false;
    }
}

// 初始化拖拽功能
document.addEventListener('DOMContentLoaded', function() {
    const groups = document.querySelectorAll('.group-container');
    groups.forEach(group => {
        new Sortable(group.querySelector('.server-list'), {
            group: 'servers',
            animation: 150,
            onEnd: async function(evt) {
                const serverId = evt.item.getAttribute('data-server-id');
                const newGroupId = evt.to.closest('.group-container').getAttribute('data-group-id');
                
                // 更新服务器的分组信息
                const success = await updateServerGroup(serverId, newGroupId);
                if (!success) {
                    // 如果更新失败，将服务器移回原来的位置
                    evt.from.appendChild(evt.item);
                }
            }
        });
    });
});

// 初始化拖拽功能