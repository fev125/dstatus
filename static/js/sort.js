/**
 * @file sort.js
 * @description 服务器状态卡片排序功能
 */

// 全局变量
window.currentSort = {
    field: 'cpu',  // 默认按 CPU 排序
    direction: 'desc'  // 默认降序
};

// 全局状态变量
window.sortState = {
    realtimeSort: false,    // 实时排序状态
    hideSensitive: false,   // 敏感信息显示状态
    hideOffline: false      // 离线节点显示状态
};

// 防止重复初始化
if (window.sortInitialized) {
    // 已初始化，跳过
} else {
    window.sortInitialized = true;

    // 解析流量数据，移除单位后转换为数字
    function parseTraffic(el) {
        if (!el || !el.innerText) return 0;
        const text = el.innerText.trim();
        if (text === '-' || text === '' || text === 'N/A' || text === 'NaN') return 0;
        
        try {
            const number = parseFloat(text);
            if (isNaN(number)) return 0;
            
            const unit = text.replace(/[\d.\s]/g, '').trim().toLowerCase();
            
            // 转换为字节
            switch(unit) {
                // 速率单位 (bits per second)
                case 'bps': return number / 8;
                case 'kbps': return (number * 1000) / 8;
                case 'mbps': return (number * 1000 * 1000) / 8;
                case 'gbps': return (number * 1000 * 1000 * 1000) / 8;
                case 'tbps': return (number * 1000 * 1000 * 1000 * 1000) / 8;
                
                // 流量单位 (bytes)
                case 'b': return number;
                case 'kb': return number * 1024;
                case 'mb': return number * 1024 * 1024;
                case 'gb': return number * 1024 * 1024 * 1024;
                case 'tb': return number * 1024 * 1024 * 1024 * 1024;
                
                // 速率单位 (bytes per second)
                case 'b/s': return number;
                case 'kb/s': return number * 1024;
                case 'mb/s': return number * 1024 * 1024;
                case 'gb/s': return number * 1024 * 1024 * 1024;
                case 'tb/s': return number * 1024 * 1024 * 1024 * 1024;
                
                default: return number; // 如果没有单位，假设是字节
            }
        } catch (error) {
            return 0;
        }
    }

    // 更新仪表盘数据
    function updateDashboard() {
        const cards = document.querySelectorAll('.server-card');
        
        let totalNodes = cards.length;
        let onlineNodes = 0;
        let totalDownload = 0;
        let totalUpload = 0;
        let currentTotalDownloadSpeed = 0;
        let currentTotalUploadSpeed = 0;

        cards.forEach((card) => {
            const statusIndicator = card.querySelector('[id$="_status_indicator"]');
            const isOnline = statusIndicator && statusIndicator.classList.contains('bg-green-500');
            
            if (isOnline) {
                onlineNodes++;
                const sid = statusIndicator.id.split('_')[0];
                
                try {
                    // 获取总流量数据
                    const netInTotal = card.querySelector(`[id="${sid}_NET_IN_TOTAL"]`);
                    const netOutTotal = card.querySelector(`[id="${sid}_NET_OUT_TOTAL"]`);

                    // 解析总流量
                    const parsedNetInTotal = parseTraffic(netInTotal);
                    const parsedNetOutTotal = parseTraffic(netOutTotal);

                    totalDownload += parsedNetInTotal;
                    totalUpload += parsedNetOutTotal;

                    // 获取实时带宽数据
                    const netIn = card.querySelector(`[id="${sid}_NET_IN"]`);
                    const netOut = card.querySelector(`[id="${sid}_NET_OUT"]`);

                    // 解析实时带宽
                    const parsedNetIn = parseTraffic(netIn);
                    const parsedNetOut = parseTraffic(netOut);

                    currentTotalDownloadSpeed += parsedNetIn;
                    currentTotalUploadSpeed += parsedNetOut;
                } catch (error) {
                    // 错误处理
                }
            }
        });

        // 更新仪表盘显示
        const dashboardElements = {
            totalNodes: document.getElementById('total-nodes'),
            onlineNodes: document.getElementById('online-nodes'),
            totalDownload: document.getElementById('total-download'),
            totalUpload: document.getElementById('total-upload'),
            currentDownloadSpeed: document.getElementById('current-download-speed'),
            currentUploadSpeed: document.getElementById('current-upload-speed')
        };

        try {
            if (dashboardElements.totalNodes) dashboardElements.totalNodes.innerText = totalNodes;
            if (dashboardElements.onlineNodes) dashboardElements.onlineNodes.innerText = onlineNodes;
            if (dashboardElements.totalDownload) dashboardElements.totalDownload.innerText = formatTraffic(totalDownload);
            if (dashboardElements.totalUpload) dashboardElements.totalUpload.innerText = formatTraffic(totalUpload);
            if (dashboardElements.currentDownloadSpeed) dashboardElements.currentDownloadSpeed.innerText = formatSpeed(currentTotalDownloadSpeed);
            if (dashboardElements.currentUploadSpeed) dashboardElements.currentUploadSpeed.innerText = formatSpeed(currentTotalUploadSpeed);
        } catch (error) {
            // 错误处理
        }
    }

    // 格式化流量数据
    function formatTraffic(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = bytes;
        let unitIndex = 0;
        
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        
        return value.toFixed(2) + ' ' + units[unitIndex];
    }

    // 格式化速度数据
    function formatSpeed(bytesPerSecond) {
        const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
        let value = bytesPerSecond * 8; // 转换为比特
        let unitIndex = 0;
        
        while (value >= 1000 && unitIndex < units.length - 1) {
            value /= 1000;
            unitIndex++;
        }
        
        return value.toFixed(2) + ' ' + units[unitIndex];
    }

    // 获取卡片的排序值
    function getCardSortValue(card, field) {
        const sid = card.dataset.sid;
        
        switch(field) {
            case 'cpu':
                const cpuEl = card.querySelector(`[id="${sid}_CPU"]`);
                return cpuEl ? parseFloat(cpuEl.dataset.cpu || '0') : 0;
            
            case 'memory':
                const memEl = card.querySelector(`[id="${sid}_MEM"]`);
                return memEl ? parseFloat(memEl.dataset.memory || '0') : 0;
            
            case 'expiration':
                const expireEl = card.querySelector(`[id="${sid}_EXPIRE_TIME"]`);
                return expireEl ? parseFloat(expireEl.dataset.expire || '0') : 0;
            
            case 'total_traffic':
                const inTotal = card.querySelector(`[id="${sid}_NET_IN_TOTAL"]`);
                const outTotal = card.querySelector(`[id="${sid}_NET_OUT_TOTAL"]`);
                return (parseTraffic(inTotal) || 0) + (parseTraffic(outTotal) || 0);
            case 'upload':
                const outEl = card.querySelector(`[id="${sid}_NET_OUT"]`);
                return parseTraffic(outEl) || 0;
            case 'download':
                const inEl = card.querySelector(`[id="${sid}_NET_IN"]`);
                return parseTraffic(inEl) || 0;
            default:
                return 0;
        }
    }

    // 排序卡片
    window.sortCards = function() {
        document.querySelectorAll('.group-container').forEach(group => {
            const groupId = group.dataset.groupId;
            const cardGrid = document.getElementById(`card-grid-${groupId}`);
            if (!cardGrid) return;

            const cards = Array.from(cardGrid.querySelectorAll('.server-card'));
            
            // 按照当前排序规则排序
            cards.sort((a, b) => {
                // 首先按在线状态排序
                const aOnline = a.classList.contains('server-online');
                const bOnline = b.classList.contains('server-online');
                if (aOnline !== bOnline) {
                    return aOnline ? -1 : 1;
                }

                // 然后按照选定的字段排序
                const aValue = getCardSortValue(a, window.currentSort.field);
                const bValue = getCardSortValue(b, window.currentSort.field);
                
                // 考虑排序方向
                const direction = window.currentSort.direction === 'desc' ? -1 : 1;
                return (aValue - bValue) * direction;
            });

            // 重新排列卡片
            cards.forEach(card => cardGrid.appendChild(card));
        });
    };

    // 初始化排序按钮
    document.addEventListener('DOMContentLoaded', () => {
        // 绑定排序按钮事件
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const field = btn.dataset.sort;
                
                if (window.currentSort.field === field) {
                    window.currentSort.direction = window.currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    window.currentSort.field = field;
                    window.currentSort.direction = 'desc';
                }
                
                sortCards();
            });
        });

        // 绑定实时排序复选框
        const realtimeSortCheckbox = document.getElementById('realtime-sort');
        if (realtimeSortCheckbox) {
            realtimeSortCheckbox.addEventListener('change', (e) => {
                window.sortState.realtimeSort = e.target.checked;
                if (window.sortState.realtimeSort) {
                    sortCards();
                }
            });
        }

        // 监听敏感信息开关
        document.getElementById('show-sensitive').addEventListener('change', (e) => {
            window.sortState.hideSensitive = e.target.checked;
            toggleSensitiveInfo(window.sortState.hideSensitive);
        });

        // 监听离线节点显示开关
        document.getElementById('hide-offline').addEventListener('change', (e) => {
            window.sortState.hideOffline = e.target.checked;
            toggleOfflineNodes(window.sortState.hideOffline);
        });

        // 初始化敏感信息状态
        toggleSensitiveInfo(window.sortState.hideSensitive);
        // 初始化离线节点显示状态
        toggleOfflineNodes(window.sortState.hideOffline);

        // 初始化仪表盘
        updateDashboard();
    });

    // 监听状态更新事件
    document.addEventListener('statusUpdated', () => {
        try {
            if (window.currentSort.field !== 'default' && window.sortState.realtimeSort) {
                sortCards();
                toggleOfflineNodes(window.sortState.hideOffline);
            }
            // 更新仪表盘数据
            updateDashboard();
        } catch (error) {
            // 错误处理
        }
    });
}

// 切换敏感信息显示状态
function toggleSensitiveInfo(hide) {
    const cards = document.querySelectorAll('.server-name');
    cards.forEach(title => {
        if (hide) {
            title.style.filter = 'blur(4px)';
            title.style.cursor = 'pointer';
            // 鼠标悬停时临时显示
            title.addEventListener('mouseenter', () => {
                if (window.sortState.hideSensitive) title.style.filter = 'none';
            });
            title.addEventListener('mouseleave', () => {
                if (window.sortState.hideSensitive) title.style.filter = 'blur(4px)';
            });
        } else {
            title.style.filter = 'none';
            title.style.cursor = 'default';
        }
    });
}

// 切换离线节点显示状态
function toggleOfflineNodes(hide) {
    const cards = document.querySelectorAll('#card-grid > div');
    cards.forEach(card => {
        const statusIndicator = card.querySelector('[id$="_status_indicator"]');
        if (statusIndicator) {
            const isOnline = statusIndicator.classList.contains('bg-green-500');
            if (!isOnline && hide) {
                card.style.display = 'none';
            } else {
                card.style.display = '';
            }
        }
    });
}

// 显示提示消息
function showToast(message, type = 'info') {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
        type === 'error' ? 'bg-red-500' : 
        type === 'success' ? 'bg-green-500' : 
        'bg-blue-500'
    } text-white`;
    toast.textContent = message;
    
    // 添加到页面
    document.body.appendChild(toast);
    
    // 3秒后移除
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 显示编辑分组对话框
function showGroupDialog(title, groupId = '', groupName = '') {
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 flex items-center justify-center z-50';
    dialog.innerHTML = `
        <div class="fixed inset-0 bg-black/50"></div>
        <div class="relative bg-gray-800 rounded-lg shadow-xl p-6 w-96">
            <h3 class="text-xl font-medium text-white mb-4">${title}</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-300 mb-1">分组名称</label>
                    <input type="text" id="group-name-input" 
                           class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
                           value="${groupName}"
                           placeholder="请输入分组名称">
                </div>
                <div class="flex justify-end gap-3">
                    <button id="cancel-group-btn" 
                            class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">
                        取消
                    </button>
                    <button id="save-group-btn" 
                            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                        保存
                    </button>
                </div>
            </div>
        </div>
    `;

    // 添加到页面
    document.body.appendChild(dialog);

    // 获取元素
    const input = dialog.querySelector('#group-name-input');
    const cancelBtn = dialog.querySelector('#cancel-group-btn');
    const saveBtn = dialog.querySelector('#save-group-btn');
    const backdrop = dialog.querySelector('.fixed.inset-0.bg-black\\/50');

    // 绑定事件
    const close = () => dialog.remove();
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    // 保存按钮事件
    saveBtn.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) {
            showToast('请输入分组名称', 'error');
            return;
        }

        try {
            const url = groupId ? `/admin/groups/${groupId}/edit` : '/admin/groups/add';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name })
            });

            const result = await response.json();
            if (!result.status) {
                throw new Error(result.msg || '操作失败');
            }

            showToast(groupId ? '修改成功' : '添加成功', 'success');
            // 刷新页面以显示更新
            location.reload();
        } catch (error) {
            showToast(error.message || '保存失败', 'error');
        }
    });

    // 聚焦输入框
    input.focus();
}

// 更新排序图标
function updateSortIcons() {
    document.querySelectorAll('.sort-btn i').forEach(icon => {
        const button = icon.closest('.sort-btn');
        if (button.dataset.sort === window.currentSort.field) {
            icon.textContent = window.currentSort.direction === 'asc' ? 'expand_less' : 'expand_more';
        } else {
            icon.textContent = 'unfold_more';
        }
    });
} 
