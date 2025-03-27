/**
 * 统一的系统状态管理模块
 * 整合了流量统计、格式化和工具函数
 */

// IIFE 立即执行函数，避免全局污染
(function() {
    'use strict';
    
    // 常量定义
    const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    const BPS_UNITS = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    const UPDATE_INTERVAL = 60000; // 1分钟
    const DEBOUNCE_DELAY = 300;    // 300ms
    
    // 单位转换常量
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const TB = GB * 1024;
    const Kbps = 1000;
    const Mbps = Kbps * 1000;
    const Gbps = Mbps * 1000;
    const Tbps = Gbps * 1000;
    
    /**
     * 流量格式化工具
     */
    const TrafficFormat = {
        /**
         * 格式化字节数为可读字符串
         * @param {number|string|bigint} bytes 字节数
         * @param {number} decimals 小数位数
         * @returns {string} 格式化后的字符串
         */
        formatBytes(bytes, decimals = 2) {
            if (!bytes) return '0 B';
            
            let value = typeof bytes === 'bigint' ? Number(bytes) :
                       typeof bytes === 'string' ? Number(bytes) : bytes;
            
            if (isNaN(value) || !isFinite(value)) return '0 B';
            
            if (value < KB) return value.toFixed(decimals) + ' B';
            if (value < MB) return (value/KB).toFixed(decimals) + ' KB';
            if (value < GB) return (value/MB).toFixed(decimals) + ' MB';
            if (value < TB) return (value/GB).toFixed(decimals) + ' GB';
            return (value/TB).toFixed(decimals) + ' TB';
        },
        
        /**
         * 格式化比特率
         * @param {number} bps 比特每秒
         * @returns {string} 格式化后的字符串
         */
        formatBps(bps) {
            if (!bps) return '0 bps';
            
            const value = Number(bps);
            if (isNaN(value) || !isFinite(value)) return '0 bps';
            
            if (value < Kbps) return value.toFixed(2) + ' bps';
            if (value < Mbps) return (value/Kbps).toFixed(2) + ' Kbps';
            if (value < Gbps) return (value/Mbps).toFixed(2) + ' Mbps';
            if (value < Tbps) return (value/Gbps).toFixed(2) + ' Gbps';
            return (value/Tbps).toFixed(2) + ' Tbps';
        },
        
        /**
         * 验证流量值
         * @param {*} value 要验证的值
         * @returns {boolean} 是否为有效的流量值
         */
        validateTrafficValue(value) {
            if (value === undefined || value === null) return false;
            const num = Number(value);
            return !isNaN(num) && num >= 0;
        }
    };
    
    /**
     * 流量数据处理工具
     */
    const TrafficUtils = {
        /**
         * 计算总流量
         * @param {Array} data 流量数据数组
         * @returns {bigint} 总流量
         */
        calculateTotalTraffic(data) {
            if (!Array.isArray(data)) {
                console.warn('无效的流量数据格式');
                return BigInt(0);
            }
            
            try {
                return data.reduce((total, item) => {
                    const value = Array.isArray(item) ? item[0] : item;
                    return total + BigInt(TrafficFormat.validateTrafficValue(value) ? value : 0);
                }, BigInt(0));
            } catch (error) {
                console.warn('计算总流量失败:', error);
                return BigInt(0);
            }
        }
    };
    
    /**
     * 状态管理器
     */
    const StatManager = {
        // 私有属性
        _updateTimer: null,
        _trafficUpdateTimer: null,  // 流量更新定时器
        _debounceTimer: null,
        _isUpdating: false,
        _isTrafficUpdating: false,  // 流量更新状态
        _updateInterval: 1000, // 实时数据1秒更新一次
        _trafficUpdateInterval: 60000, // 流量数据1分钟更新一次
        _maxRetries: 3,
        _retryCount: 0,
        _subscribers: new Map(),
        
        // WebSocket相关属性
        _ws: null,
        _wsReconnectTimer: null,
        _wsReconnectInterval: 3000,
        _useWebSocket: true, // 是否使用WebSocket
        
        /**
         * 订阅数据更新
         * @param {string} id 订阅者ID
         * @param {Function} callback 回调函数
         */
        subscribe(id, callback) {
            console.log('[Debug] 新订阅者:', id);
            this._subscribers.set(id, callback);
        },
        
        /**
         * 取消订阅
         * @param {string} id 订阅者ID
         */
        unsubscribe(id) {
            console.log('[Debug] 取消订阅:', id);
            this._subscribers.delete(id);
        },
        
        /**
         * 通知所有订阅者
         * @param {Object} data 更新的数据
         */
        _notifySubscribers(data) {
            console.log('[Debug] 通知订阅者, 当前订阅者数量:', this._subscribers.size);
            if (!data || !data.stat) {
                console.warn('[Debug] 无效的数据格式，跳过通知');
                return;
            }
            
            // 处理数据
            const processedData = {
                [data.sid]: {
                    name: data.name,
                    stat: data.stat
                }
            };
            
            this._subscribers.forEach((callback, id) => {
                try {
                    console.log('[Debug] 通知订阅者:', id);
                    callback(processedData);
                } catch (error) {
                    console.error(`[Debug] 通知订阅者 ${id} 失败:`, error);
                }
            });
        },
        
        /**
         * 初始化状态管理器
         */
        async init() {
            try {
                console.log('[Debug] 开始初始化状态管理器...');
                this._retryCount = 0;
                this._initEventListeners();
                
                // 订阅自己来更新系统状况
                this.subscribe('system-status', this._updateOtherStats.bind(this));
                
                // 初始化WebSocket
                if (this._useWebSocket) {
                    this._initWebSocket();
                }
                
                // 首次更新
                await Promise.all([
                    this._fetchRealtimeStats(),  // 实时数据
                    this.updateTrafficStats()     // 流量数据
                ]);
                
                // 设置定时更新
                if (!this._useWebSocket || !this._ws || this._ws.readyState !== WebSocket.OPEN) {
                    this._startUpdateTimer();      // 启动实时数据更新
                }
                this._startTrafficUpdateTimer(); // 启动流量数据更新
                
                console.info('[Debug] 状态管理器初始化完成');
            } catch (error) {
                console.error('[Debug] 状态管理器初始化失败:', error);
                setTimeout(() => this.init(), 1000);
            }
        },
        
        /**
         * 初始化WebSocket连接
         * @private
         */
        _initWebSocket() {
            // 关闭现有连接
            if (this._ws) {
                this._ws.close();
                this._ws = null;
            }
            
            try {
                const nodeId = this._getNodeId();
                if (!nodeId) {
                    console.warn('[Debug] 无法获取节点ID，WebSocket将不可用');
                    return;
                }
                
                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${location.host}/ws/stats/${nodeId}`;
                
                console.log('[Debug] 初始化WebSocket连接:', wsUrl);
                this._ws = new WebSocket(wsUrl);
                
                // 连接打开
                this._ws.onopen = () => {
                    console.log('[Debug] WebSocket连接成功');
                    // 连接成功后可以停止HTTP轮询
                    if (this._updateTimer) {
                        console.log('[Debug] 停止HTTP轮询，使用WebSocket通信');
                        clearInterval(this._updateTimer);
                        this._updateTimer = null;
                    }
                    // 清除重连定时器
                    if (this._wsReconnectTimer) {
                        clearTimeout(this._wsReconnectTimer);
                        this._wsReconnectTimer = null;
                    }
                };
                
                // 接收消息
                this._ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === 'stats' && message.data) {
                            console.log('[Debug] 收到WebSocket数据, 节点ID:', message.node_id);
                            
                            // 提取节点数据
                            const nodeId = this._getNodeId();
                            const nodeData = message.data[nodeId];
                            
                            if (nodeData) {
                                // 通知订阅者
                                const processedData = {
                                    sid: nodeId,
                                    name: nodeData.name,
                                    stat: nodeData.stat
                                };
                                this._notifySubscribers(processedData);
                            } else {
                                console.warn('[Debug] WebSocket数据中未找到当前节点数据');
                            }
                        }
                    } catch (error) {
                        console.error('[Debug] 处理WebSocket消息失败:', error);
                    }
                };
                
                // 连接关闭
                this._ws.onclose = () => {
                    console.log('[Debug] WebSocket连接关闭');
                    this._ws = null;
                    
                    // 重新启动HTTP轮询作为备选
                    console.log('[Debug] 恢复HTTP轮询');
                    this._startUpdateTimer();
                    
                    // 设置重连
                    if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
                    this._wsReconnectTimer = setTimeout(() => {
                        console.log('[Debug] 尝试重新连接WebSocket');
                        this._initWebSocket();
                    }, this._wsReconnectInterval);
                };
                
                // 连接错误
                this._ws.onerror = (error) => {
                    console.error('[Debug] WebSocket连接错误:', error);
                };
            } catch (error) {
                console.error('[Debug] 初始化WebSocket失败:', error);
                // 确保HTTP轮询作为备选
                this._startUpdateTimer();
            }
        },
        
        /**
         * 初始化事件监听
         */
        _initEventListeners() {
            console.log('[Debug] 初始化事件监听器');
            
            // 页面可见性变化监听
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    console.log('[Debug] 页面隐藏，继续保持更新');
                    // 页面隐藏时不停止更新，只是降低更新频率
                    this._adjustUpdateInterval(120000); // 2分钟更新一次
                } else {
                    console.log('[Debug] 页面显示，恢复正常更新频率');
                    this._adjustUpdateInterval(60000); // 恢复1分钟更新一次
                    this.updateStats(); // 立即更新一次
                    
                    // 如果WebSocket已断开，尝试重新连接
                    if (this._useWebSocket && (!this._ws || this._ws.readyState !== WebSocket.OPEN)) {
                        console.log('[Debug] 尝试重新连接WebSocket');
                        this._initWebSocket();
                    }
                }
            });

            // 页面焦点变化监听
            window.addEventListener('focus', () => {
                console.log('[Debug] 页面获得焦点，立即更新并恢复正常更新频率');
                this._adjustUpdateInterval(60000);
                this.updateStats();
            });

            window.addEventListener('blur', () => {
                console.log('[Debug] 页面失去焦点，继续以正常频率更新');
                // 失去焦点时保持正常更新频率
            });

            // 添加网络状态监听
            window.addEventListener('online', () => {
                console.log('[Debug] 网络恢复，立即更新');
                this.updateStats();
                
                // 如果WebSocket已断开，尝试重新连接
                if (this._useWebSocket && (!this._ws || this._ws.readyState !== WebSocket.OPEN)) {
                    console.log('[Debug] 网络恢复，尝试重新连接WebSocket');
                    this._initWebSocket();
                }
            });
        },
        
        /**
         * 调整更新间隔
         */
        _adjustUpdateInterval(interval) {
            console.log('[Debug] 调整实时数据更新间隔为:', interval, 'ms');
            this._updateInterval = interval;
            // 只重启实时数据更新定时器
            this._startUpdateTimer();
        },
        
        /**
         * 格式化带宽数据
         * @param {number} bps - 比特每秒
         * @returns {string} 格式化后的字符串
         */
        _formatBandwidth(bps) {
            return TrafficFormat.formatBps(bps);
        },

        /**
         * 格式化字节数
         * @param {number} bytes - 字节数
         * @returns {string} 格式化后的字符串
         */
        _formatBytes(bytes) {
            return TrafficFormat.formatBytes(bytes);
        },
        
        /**
         * 开始定时更新
         */
        _startUpdateTimer() {
            if (this._updateTimer) {
                clearInterval(this._updateTimer);
            }
            
            console.log('[Debug] 启动实时数据更新器，间隔:', this._updateInterval, 'ms');
            
            // 立即执行一次更新
            this._fetchRealtimeStats().catch(error => {
                console.error('[Debug] 初始数据获取失败:', error);
            });
            
            // 设置定时更新
            this._updateTimer = setInterval(() => {
                if (document.hidden) {
                    console.log('[Debug] 页面隐藏，跳过更新');
                    return;
                }
                
                // 如果WebSocket已连接，不需要HTTP获取
                if (this._useWebSocket && this._ws && this._ws.readyState === WebSocket.OPEN) {
                    console.log('[Debug] WebSocket已连接，跳过HTTP更新');
                    return;
                }
                
                this._fetchRealtimeStats().catch(error => {
                    console.error('[Debug] 定时数据获取失败:', error);
                });
            }, this._updateInterval);
        },
        
        /**
         * 停止定时更新
         */
        _stopUpdateTimer() {
            if (this._updateTimer) {
                console.log('[Debug] 停止实时数据更新器');
                clearInterval(this._updateTimer);
                this._updateTimer = null;
            }
            if (this._trafficUpdateTimer) {
                console.log('[Debug] 停止流量数据更新器');
                clearInterval(this._trafficUpdateTimer);
                this._trafficUpdateTimer = null;
            }
        },
        
        /**
         * 防抖函数
         * @param {Function} fn 要执行的函数
         * @returns {Function} 防抖后的函数
         */
        _debounce(fn) {
            return (...args) => {
                if (this._debounceTimer) {
                    clearTimeout(this._debounceTimer);
                }
                this._debounceTimer = setTimeout(() => fn.apply(this, args), DEBOUNCE_DELAY);
            };
        },
        
        /**
         * 获取节点ID
         * @returns {string|null} 节点ID
         */
        _getNodeId() {
            try {
                console.log('[Debug] 当前URL路径:', location.pathname);
                
                // 1. 首先尝试从URL获取 (/stats/[nodeId])
                const statsMatch = location.pathname.match(/\/stats\/([^\/]+)/);
                if (statsMatch) {
                    console.log('[Debug] 从URL获取到节点ID:', statsMatch[1]);
                    return statsMatch[1];
                }
                
                // 2. 如果URL中没有，尝试从URL路径的最后一部分获取
                const pathParts = location.pathname.split('/').filter(Boolean);
                if (pathParts.length > 0) {
                    const lastPart = pathParts[pathParts.length - 1];
                    console.log('[Debug] 从URL路径最后一部分获取到节点ID:', lastPart);
                    return lastPart;
                }

                // 3. 尝试从node-data获取
                const nodeDataElement = document.getElementById('node-data');
                if (nodeDataElement && nodeDataElement.value) {
                    const nodeData = JSON.parse(nodeDataElement.value);
                    if (nodeData.id) {
                        console.log('[Debug] 从node-data获取到节点ID:', nodeData.id);
                        return nodeData.id;
                    }
                }

                // 4. 最后尝试从预处理数据获取
                const preProcessedElement = document.getElementById('preprocessed-data');
                if (preProcessedElement && preProcessedElement.value) {
                    const preProcessedData = JSON.parse(preProcessedElement.value);
                    if (preProcessedData.id) {
                        console.log('[Debug] 从preprocessed-data获取到节点ID:', preProcessedData.id);
                        return preProcessedData.id;
                    }
                }

                // 如果都没有找到，返回null
                console.warn('[Debug] 所有方法都无法获取到节点ID');
                return null;
            } catch (error) {
                console.warn('[Debug] 获取节点ID时发生错误:', error);
                return null;
            }
        },
        
        /**
         * 获取预处理数据
         * @returns {Object|null} 预处理数据
         */
        _getPreProcessedData() {
            try {
                // 这里需要根据实际情况实现获取预处理数据的方法
                // 这里只是一个占位，实际实现需要根据具体需求来实现
                return null;
            } catch (error) {
                console.warn('获取预处理数据失败:', error);
                return null;
            }
        },
        
        /**
         * 获取实时状态数据
         */
        async _fetchRealtimeStats() {
            // 如果WebSocket已连接，不需要使用HTTP获取
            if (this._useWebSocket && this._ws && this._ws.readyState === WebSocket.OPEN) {
                console.log('[Debug] WebSocket已连接，跳过HTTP获取');
                return;
            }
            
            try {
                const nodeId = this._getNodeId();
                if (!nodeId) {
                    throw new Error('无法获取节点ID');
                }

                console.log('[Debug] 开始获取实时数据:', `/stats/${nodeId}/data`);
                const response = await fetch(`/stats/${nodeId}/data`);
                
                if (!response.ok) {
                    throw new Error(`获取实时数据失败: ${response.status}`);
                }

                const data = await response.json();
                console.log('[Debug] 获取到实时数据:', data);
                
                // 验证数据格式
                if (!data || !data.stat) {
                    console.warn('[Debug] 实时数据格式无效');
                    if (this._retryCount < this._maxRetries) {
                        this._retryCount++;
                        console.log(`[Debug] 重试第 ${this._retryCount} 次`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return this._fetchRealtimeStats();
                    } else {
                        throw new Error('达到最大重试次数');
                    }
                }
                
                // 重置重试计数
                this._retryCount = 0;
                
                // 通知订阅者
                this._notifySubscribers(data);
                
                return data;
            } catch (error) {
                console.error('[Debug] 获取实时数据失败:', error);
                if (this._retryCount < this._maxRetries) {
                    this._retryCount++;
                    console.log(`[Debug] 重试第 ${this._retryCount} 次`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return this._fetchRealtimeStats();
                }
                throw error;
            }
        },
        
        /**
         * 更新统计信息
         */
        async updateStats() {
            if (this._isUpdating) {
                console.log('[Debug] 更新正在进行中，跳过本次更新');
                return;
            }

            this._isUpdating = true;
            try {
                // 获取实时数据
                const realtimeData = await this._fetchRealtimeStats();
                if (!realtimeData || !realtimeData.stat) {
                    console.warn('[Debug] 无法获取有效的实时数据，跳过本次更新');
                    return;
                }
                
                // 获取流量数据
                console.log('[Debug] 开始更新流量统计...');
                
                const nodeId = this._getNodeId();
                console.log('[Debug] 获取到节点ID:', nodeId);
                
                if (!nodeId) {
                    throw new Error('无法获取节点ID');
                }

                // 获取流量数据
                console.log('[Debug] 开始请求流量数据:', `/stats/${nodeId}/traffic`);
                const response = await fetch(`/stats/${nodeId}/traffic`);
                console.log('[Debug] API响应状态:', response.status);
                
                if (!response.ok) {
                    throw new Error(`获取流量数据失败: ${response.status}`);
                }

                const result = await response.json();
                console.log('[Debug] 获取到的原始数据:', result);
                
                if (!result || !result.data || !result.data.monthly) {
                    throw new Error('无效的流量数据');
                }

                // 更新月度流量显示
                const monthly = result.data.monthly;
                console.log('[Debug] 月度流量数据:', monthly);
                
                // 判断是否为无限制流量
                const isUnlimited = monthly.remaining === -1 && monthly.limit === 0;
                console.log('[Debug] 是否为无限制流量:', isUnlimited);

                // 验证和处理数据
                const validData = {
                    used: Math.max(0, Number(monthly.used) || 0),
                    remaining: isUnlimited ? Infinity : Math.max(0, Number(monthly.remaining) || 0),
                    limit: isUnlimited ? Infinity : Math.max(0, Number(monthly.limit) || 0),
                    ratio: isUnlimited ? 0 : Math.max(0, Math.min(100, Number(monthly.ratio) || 0)).toFixed(1),
                    reset_day: monthly.reset_day || 1,
                    status: monthly.status || 'normal',
                    isUnlimited: isUnlimited
                };

                console.log('[Debug] 处理后的数据:', validData);
                
                const format = window.TrafficFormat;
                if (!format) {
                    console.error('[Debug] TrafficFormat未定义！');
                    return;
                }

                // 格式化流量数据
                const formattedData = {
                    used: format.formatBytes(validData.used),
                    remaining: isUnlimited ? '无限制' : format.formatBytes(validData.remaining),
                    limit: isUnlimited ? '无限制' : format.formatBytes(validData.limit),
                    ratio: validData.ratio
                };
                
                console.log('[Debug] 格式化后的流量数据:', formattedData);

                // 根据不同情况生成提示语
                const getTips = (isUnlimited, ratio) => {
                    if (isUnlimited) return '随便造吧';
                    const r = parseFloat(ratio);
                    if (r < 50) return '弹药充足';
                    if (r < 80) return '够用不愁';
                    if (r < 90) return '悠着点啦';
                    return '该补货了';
                };

                const tips = getTips(isUnlimited, validData.ratio);
                console.log('[Debug] 当前提示语:', tips);

                // 检查DOM元素
                const elements = {
                    used: document.getElementById('monthly-used'),
                    remaining: document.getElementById('monthly-remaining'),
                    limit: document.getElementById('monthly-limit'),
                    progress: document.getElementById('monthly-progress'),
                    percent: document.getElementById('monthly-percent'),
                    status: document.getElementById('traffic-status'),
                    resetDate: document.getElementById('reset-date')
                };

                console.log('[Debug] DOM元素状态:', {
                    used: elements.used ? '存在' : '不存在',
                    remaining: elements.remaining ? '存在' : '不存在',
                    limit: elements.limit ? '存在' : '不存在',
                    progress: elements.progress ? '存在' : '不存在',
                    percent: elements.percent ? '存在' : '不存在',
                    status: elements.status ? '存在' : '不存在',
                    resetDate: elements.resetDate ? '存在' : '不存在'
                });

                // 更新DOM元素
                if (elements.used) {
                    elements.used.textContent = formattedData.used;
                    console.log('[Debug] 更新已用流量:', formattedData.used);
                }
                if (elements.remaining) {
                    elements.remaining.textContent = formattedData.remaining;
                    console.log('[Debug] 更新剩余流量:', formattedData.remaining);
                }
                if (elements.limit) {
                    elements.limit.textContent = formattedData.limit;
                    console.log('[Debug] 更新总流量:', formattedData.limit);
                }
                if (elements.progress) {
                    // 根据使用比例设置不同的颜色
                    let colorClass = 'bg-green-500';
                    if (!isUnlimited) {
                        const r = parseFloat(validData.ratio);
                        if (r >= 90) {
                            colorClass = 'bg-red-500';
                        } else if (r >= 80) {
                            colorClass = 'bg-yellow-500';
                        } else if (r >= 50) {
                            colorClass = 'bg-blue-500';
                        }
                    }
                    elements.progress.style.width = isUnlimited ? '10%' : `${formattedData.ratio}%`;
                    elements.progress.className = `progress-bar ${colorClass}`;
                    console.log('[Debug] 更新进度条:', isUnlimited ? '10%(无限制)' : formattedData.ratio + '%');
                }
                if (elements.percent) {
                    elements.percent.textContent = isUnlimited ? tips : `${tips} (${formattedData.ratio}%)`;
                    console.log('[Debug] 更新提示语和百分比:', isUnlimited ? tips : `${tips} (${formattedData.ratio}%)`);
                }

                // 更新状态
                if (elements.status) {
                    const statusText = validData.status === 'normal' ? '正常' : '异常';
                    elements.status.textContent = statusText;
                    elements.status.className = `text-sm px-2 py-0.5 rounded-full ${validData.status === 'normal' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`;
                    console.log('[Debug] 更新状态:', statusText);
                }

                // 更新重置日期
                if (elements.resetDate && monthly.next_reset) {
                    const resetDate = new Date(monthly.next_reset * 1000);
                    elements.resetDate.textContent = resetDate.toLocaleDateString();
                    console.log('[Debug] 更新重置日期:', resetDate.toLocaleDateString());
                }

                console.log('[Debug] DOM更新完成');

            } catch (error) {
                console.error('[Debug] 更新流量统计失败:', error);
                console.error('[Debug] 错误堆栈:', error.stack);
            } finally {
                this._isUpdating = false;
            }
        },
        
        /**
         * 开始流量数据更新定时器
         */
        _startTrafficUpdateTimer() {
            console.log('[Debug] 启动流量更新定时器，间隔:', this._trafficUpdateInterval, 'ms');
            
            // 清除旧定时器
            if (this._trafficUpdateTimer) {
                clearInterval(this._trafficUpdateTimer);
                this._trafficUpdateTimer = null;
            }
            
            // 设置新的定时器
            this._trafficUpdateTimer = setInterval(() => {
                console.log('[Debug] 流量更新定时器触发');
                if (!this._isTrafficUpdating) {
                    this.updateTrafficStats().catch(error => {
                        console.error('[Debug] 流量更新失败:', error);
                    });
                }
            }, this._trafficUpdateInterval);
        },
        
        /**
         * 更新流量统计信息
         */
        async updateTrafficStats() {
            if (this._isTrafficUpdating) {
                console.log('[Debug] 流量更新正在进行中，跳过本次更新');
                return;
            }

            this._isTrafficUpdating = true;
            try {
                console.log('[Debug] 开始更新流量统计...');
                
                const nodeId = this._getNodeId();
                if (!nodeId) {
                    throw new Error('无法获取节点ID');
                }

                console.log('[Debug] 开始请求流量数据:', `/stats/${nodeId}/traffic`);
                const response = await fetch(`/stats/${nodeId}/traffic`);
                
                if (!response.ok) {
                    throw new Error(`获取流量数据失败: ${response.status}`);
                }

                const result = await response.json();
                if (!result || !result.data || !result.data.monthly) {
                    throw new Error('无效的流量数据');
                }

                // 更新月度流量显示
                await this._updateTrafficDisplay(result.data.monthly);
                
            } catch (error) {
                console.error('[Debug] 更新流量统计失败:', error);
            } finally {
                this._isTrafficUpdating = false;
            }
        },
        
        /**
         * 更新流量显示
         */
        async _updateTrafficDisplay(monthly) {
            // 判断是否为无限制流量
            const isUnlimited = monthly.remaining === -1 && monthly.limit === 0;
            console.log('[Debug] 是否为无限制流量:', isUnlimited);

            // 验证和处理数据
            const validData = {
                used: Math.max(0, Number(monthly.used) || 0),
                remaining: isUnlimited ? Infinity : Math.max(0, Number(monthly.remaining) || 0),
                limit: isUnlimited ? Infinity : Math.max(0, Number(monthly.limit) || 0),
                ratio: isUnlimited ? 0 : Math.max(0, Math.min(100, Number(monthly.ratio) || 0)).toFixed(1),
                reset_day: monthly.reset_day || 1,
                status: monthly.status || 'normal',
                isUnlimited: isUnlimited
            };

            const format = window.TrafficFormat;
            if (!format) {
                console.error('[Debug] TrafficFormat未定义！');
                return;
            }

            // 格式化流量数据
            const formattedData = {
                used: format.formatBytes(validData.used),
                remaining: isUnlimited ? '无限制' : format.formatBytes(validData.remaining),
                limit: isUnlimited ? '无限制' : format.formatBytes(validData.limit),
                ratio: validData.ratio
            };

            // 根据不同情况生成提示语
            const getTips = (isUnlimited, ratio) => {
                if (isUnlimited) return '随便造吧';
                const r = parseFloat(ratio);
                if (r < 50) return '弹药充足';
                if (r < 80) return '够用不愁';
                if (r < 90) return '悠着点啦';
                return '该补货了';
            };

            const tips = getTips(isUnlimited, validData.ratio);

            // 更新DOM元素
            const elements = {
                used: document.getElementById('monthly-used'),
                remaining: document.getElementById('monthly-remaining'),
                limit: document.getElementById('monthly-limit'),
                progress: document.getElementById('monthly-progress'),
                percent: document.getElementById('monthly-percent'),
                status: document.getElementById('traffic-status'),
                resetDate: document.getElementById('reset-date')
            };

            if (elements.used) elements.used.textContent = formattedData.used;
            if (elements.remaining) elements.remaining.textContent = formattedData.remaining;
            if (elements.limit) elements.limit.textContent = formattedData.limit;
            
            if (elements.progress) {
                let colorClass = 'bg-green-500';
                if (!isUnlimited) {
                    const r = parseFloat(validData.ratio);
                    if (r >= 90) colorClass = 'bg-red-500';
                    else if (r >= 80) colorClass = 'bg-yellow-500';
                    else if (r >= 50) colorClass = 'bg-blue-500';
                }
                elements.progress.style.width = isUnlimited ? '10%' : `${formattedData.ratio}%`;
                elements.progress.className = `progress-bar ${colorClass}`;
            }
            
            if (elements.percent) {
                elements.percent.textContent = isUnlimited ? tips : `${tips} (${formattedData.ratio}%)`;
            }

            if (elements.status) {
                const statusText = validData.status === 'normal' ? '正常' : '异常';
                elements.status.textContent = statusText;
                elements.status.className = `text-sm px-2 py-0.5 rounded-full ${validData.status === 'normal' ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`;
            }

            if (elements.resetDate && monthly.next_reset) {
                const resetDate = new Date(monthly.next_reset * 1000);
                elements.resetDate.textContent = resetDate.toLocaleDateString();
            }
        },
        
        /**
         * 更新其他统计信息
         * @param {Object} data 统计数据
         */
        _updateOtherStats(data) {
            try {
                const nodeId = this._getNodeId();
                if (!nodeId || !data[nodeId] || !data[nodeId].stat) {
                    console.warn('[Debug] 无效的状态数据:', {nodeId, data});
                    return;
                }

                const stat = data[nodeId].stat;
                console.log('[Debug] 更新系统状态数据:', stat);

                // 更新系统信息
                if (stat.host) {
                    const hostnameElem = document.getElementById('system-hostname');
                    const osElem = document.getElementById('system-os');
                    
                    if (hostnameElem && stat.host.hostname) {
                        hostnameElem.textContent = stat.host.hostname;
                        console.log('[Debug] 更新主机名:', stat.host.hostname);
                    }
                    
                    if (osElem && stat.host.platform) {
                        const osInfo = stat.host.platformVersion ? 
                            `${stat.host.platform} ${stat.host.platformVersion}` : 
                            stat.host.platform;
                        osElem.textContent = osInfo;
                        console.log('[Debug] 更新操作系统信息:', osInfo);
                    }
                }

                // 更新CPU使用率
                if (stat.cpu) {
                    const cpuTotal = document.getElementById('CPU');
                    const cpuProgress = document.getElementById('CPU_total_progress');
                    if (cpuTotal) {
                        const cpuUsage = (stat.cpu.multi * 100).toFixed(1);
                        cpuTotal.textContent = `${cpuUsage}%`;
                        console.log('[Debug] 更新CPU使用率:', cpuUsage);
                    }
                    if (cpuProgress) {
                        cpuProgress.style.width = `${stat.cpu.multi * 100}%`;
                    }

                    // 更新每个CPU核心的使用率
                    if (Array.isArray(stat.cpu.single)) {
                        stat.cpu.single.forEach((usage, index) => {
                            const progress = document.getElementById(`CPU${index + 1}_progress`);
                            if (progress) {
                                progress.style.width = `${usage * 100}%`;
                                console.log(`[Debug] 更新CPU${index + 1}使用率:`, (usage * 100).toFixed(1));
                            }
                        });
                    }
                }

                // 更新内存使用率
                if (stat.mem && stat.mem.virtual) {
                    const memTotalElem = document.getElementById('MEM');
                    const memProgress = document.getElementById('MEM_progress');
                    const memDetail = document.getElementById('MEM_detail');
                    
                    // 验证并计算内存使用率
                    const memTotal = stat.mem.virtual.total || 0;
                    const memUsed = stat.mem.virtual.used || 0;
                    if (memTotal <= 0) {
                        console.warn('[Debug] 内存总量无效:', memTotal);
                        return;
                    }
                    
                    const memUsage = ((memUsed / memTotal) * 100).toFixed(1);
                    
                    if (memTotalElem) {
                        memTotalElem.textContent = `${memUsage}%`;
                        console.log('[Debug] 更新内存使用率:', memUsage);
                    }
                    if (memProgress) {
                        memProgress.style.width = `${memUsage}%`;
                        // 根据使用率设置颜色
                        let colorClass = 'bg-purple-500';
                        if (parseFloat(memUsage) >= 90) {
                            colorClass = 'bg-red-500';
                        } else if (parseFloat(memUsage) >= 70) {
                            colorClass = 'bg-yellow-500';
                        }
                        memProgress.className = `progress-bar ${colorClass}`;
                    }
                    if (memDetail) {
                        const usedStr = TrafficFormat.formatBytes(memUsed);
                        const totalStr = TrafficFormat.formatBytes(memTotal);
                        memDetail.textContent = `${usedStr} / ${totalStr}`;
                        console.log('[Debug] 更新内存详情:', `${usedStr} / ${totalStr}`);
                    }
                    
                    // 更新swap使用率
                    if (stat.mem.swap) {
                        const swapTotalElem = document.getElementById('SWAP');
                        const swapProgressElem = document.getElementById('SWAP_progress');
                        const swapDetail = document.getElementById('SWAP_detail');
                        
                        const swapTotal = stat.mem.swap.total || 0;
                        const swapUsed = stat.mem.swap.used || 0;
                        if (swapTotal > 0) {
                            const swapUsage = ((swapUsed / swapTotal) * 100).toFixed(1);
                            
                            if (swapTotalElem) {
                                swapTotalElem.textContent = `${swapUsage}%`;
                                console.log('[Debug] 更新Swap使用率:', swapUsage);
                            }
                            if (swapProgressElem) {
                                swapProgressElem.style.width = `${swapUsage}%`;
                                // 根据使用率设置颜色
                                let colorClass = 'bg-indigo-500';
                                if (parseFloat(swapUsage) >= 80) {
                                    colorClass = 'bg-red-500';
                                } else if (parseFloat(swapUsage) >= 50) {
                                    colorClass = 'bg-yellow-500';
                                }
                                swapProgressElem.className = `progress-bar ${colorClass}`;
                            }
                            if (swapDetail) {
                                const swapUsedStr = TrafficFormat.formatBytes(swapUsed);
                                const swapTotalStr = TrafficFormat.formatBytes(swapTotal);
                                swapDetail.textContent = `${swapUsedStr} / ${swapTotalStr}`;
                                console.log('[Debug] 更新Swap详情:', `${swapUsedStr} / ${swapTotalStr}`);
                            }
                        } else {
                            console.warn('[Debug] Swap总量无效:', swapTotal);
                        }
                    }
                }

                // 更新网络数据
                if (stat.net) {
                    try {
                        const netIn = document.getElementById('NET_IN');
                        const netOut = document.getElementById('NET_OUT');
                        
                        // 确保delta存在并包含有效数据
                        const deltaIn = stat.net.delta?.in;
                        const deltaOut = stat.net.delta?.out;
                        
                        if (netIn && typeof deltaIn === 'number' && isFinite(deltaIn)) {
                            const inSpeed = this._formatBandwidth(deltaIn);
                            netIn.textContent = inSpeed;
                            console.log('[Debug] 更新网络入站速度:', inSpeed);
                        } else {
                            console.warn('[Debug] 无效的网络入站数据:', deltaIn);
                            netIn && (netIn.textContent = '0 bps');
                        }
                        
                        if (netOut && typeof deltaOut === 'number' && isFinite(deltaOut)) {
                            const outSpeed = this._formatBandwidth(deltaOut);
                            netOut.textContent = outSpeed;
                            console.log('[Debug] 更新网络出站速度:', outSpeed);
                        } else {
                            console.warn('[Debug] 无效的网络出站数据:', deltaOut);
                            netOut && (netOut.textContent = '0 bps');
                        }
                    } catch (error) {
                        console.error('[Debug] 更新网络数据时发生错误:', error);
                    }

                    // 更新网络设备数据
                    if (stat.net.devices) {
                        Object.entries(stat.net.devices).forEach(([device, net]) => {
                            const inElement = document.getElementById(`net_${device}_total_in`);
                            const outElement = document.getElementById(`net_${device}_total_out`);
                            
                            if (inElement && net.total && typeof net.total.in === 'number') {
                                const totalIn = this._formatBytes(net.total.in);
                                inElement.textContent = totalIn;
                                console.log(`[Debug] 更新${device}总入站流量:`, totalIn);
                            }
                            if (outElement && net.total && typeof net.total.out === 'number') {
                                const totalOut = this._formatBytes(net.total.out);
                                outElement.textContent = totalOut;
                                console.log(`[Debug] 更新${device}总出站流量:`, totalOut);
                            }
                        });
                    }
                }

            } catch (error) {
                console.error('[Debug] 更新系统状态失败:', error);
                console.error('[Debug] 错误堆栈:', error.stack);
            }
        }
    };
    
    // 导出全局函数和对象
    window.TrafficFormat = TrafficFormat;
    window.TrafficUtils = TrafficUtils;
    window.StatManager = StatManager;
    
    // 兼容旧代码的全局函数
    window.strB = (bytes) => TrafficFormat.formatBytes(bytes);
    window.strbps = (bps) => TrafficFormat.formatBps(bps);
    
    // DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            StatManager.init();
            // 初始化负载详情标签页管理器
            LoadTabManager.init();
        });
    } else {
        StatManager.init();
        // 初始化负载详情标签页管理器
        LoadTabManager.init();
    }

    /**
     * 负载详情标签页管理器
     * 用于管理负载详情区域的标签页切换
     */
    const LoadTabManager = {
        /**
         * 初始化标签页
         * 绑定点击事件并激活默认标签页
         */
        init() {
            // 绑定所有负载详情和带宽监控标签页的点击事件
            const tabs = document.querySelectorAll('[data-tab^="load-"], [data-tab^="bandwidth-"]');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => this.activateTab(tab));
            });

            // 激活默认标签页
            const defaultLoadTab = document.querySelector('[data-tab="load-10m"]');
            const defaultBandwidthTab = document.querySelector('[data-tab="bandwidth-realtime"]');
            
            if (defaultLoadTab) this.activateTab(defaultLoadTab);
            if (defaultBandwidthTab) this.activateTab(defaultBandwidthTab);
        },

        /**
         * 激活指定标签页
         * @param {HTMLElement} tab - 要激活的标签页元素
         */
        activateTab(tab) {
            const targetId = tab.dataset.tab;
            if (!targetId) return;

            const group = tab.closest('[data-tab-group]')?.dataset.tabGroup || 
                        (targetId.startsWith('load-') ? 'load' : 'bandwidth');
            
            // 只影响当前tab组的内容
            const selector = group === 'bandwidth' ? 
                `[data-tab-group="${group}"].tab-content` : 
                '[id^="load-"].tab-content';
            
            document.querySelectorAll(selector).forEach(content => {
                content.classList.add('hidden');
            });

            // 显示目标内容并更新tab样式
            document.getElementById(targetId)?.classList.remove('hidden');
            
            const tabSelector = group === 'bandwidth' ? 
                `[data-tab-group="${group}"] [data-tab]` : 
                '[data-tab^="load-"]';
            
            document.querySelectorAll(tabSelector).forEach(t => {
                t.classList.toggle('bg-slate-700/50', t === tab);
                t.classList.toggle('text-white', t === tab);
            });
        }
    };
})(); 