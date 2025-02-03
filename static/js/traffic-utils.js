/**
 * 流量数据处理工具函数
 */

// 基础工具函数
function validateTrafficValue(value) {
    const numValue = Number(value) || 0;
    return Math.max(0, numValue);
}

// 从URL获取服务器ID
function getNodeIdFromUrl() {
    const path = window.location.pathname;
    const matches = path.match(/\/stats\/([^\/]+)/);
    return matches ? matches[1] : null;
}

// 防止重复调用的标志
let isUpdating = false;

// 更新流量显示
async function updateTrafficDisplay() {
    if (isUpdating) return;
    isUpdating = true;
    
    try {
        const nodeId = getNodeIdFromUrl();
        if (!nodeId) return;

        const response = await fetch(`/stats/${nodeId}/traffic`);
        const { data, error } = await response.json();
        
        if (error) {
            const preprocessedData = document.getElementById('preprocessed-data');
            if (preprocessedData) {
                try {
                    const nodeData = JSON.parse(preprocessedData.value);
                    updateTrafficElements(nodeData);
                } catch (e) {
                    console.error('Error parsing preprocessed data:', e);
                }
            }
            return;
        }
        
        if (data) {
            const normalizedData = {
                ds: data.ds || [],
                traffic_calibration_date: data.calibration_date,
                traffic_calibration_value: data.calibration_value,
                traffic_reset_day: data.traffic_reset_day,
                traffic_limit: data.traffic_limit,
                traffic_used: data.traffic_used
            };
            
            updateTrafficElements(normalizedData);
        }
    } catch (error) {
        console.error('Failed to update traffic display:', error);
    } finally {
        isUpdating = false;
    }
}

// 格式化流量数值
function formatTraffic(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) {
        return '0 B';
    }

    let value = Number(bytes);
    if (!isFinite(value)) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    value = Math.abs(value);

    if (value === 0) return '0 B';

    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    let decimals = 2;
    if (value >= 100) decimals = 1;
    else if (value >= 10) decimals = 2;

    return value.toFixed(decimals) + ' ' + units[unitIndex];
}

// 更新显示元素
function updateTrafficElements(data) {
    if (!data) return;
    
    const normalizedData = {
        traffic_limit: parseFloat(data.traffic_limit) || 0,
        traffic_calibration_value: parseFloat(data.traffic_calibration_value) || 0,
        traffic_reset_day: parseInt(data.traffic_reset_day) || 1,
        traffic_calibration_date: parseInt(data.traffic_calibration_date) || 0,
        ds: Array.isArray(data.ds) ? data.ds : []
    };
    
    if (normalizedData.traffic_limit < 0 || !isFinite(normalizedData.traffic_limit)) {
        normalizedData.traffic_limit = 0;
    }
    
    const elements = {
        used: document.getElementById('traffic-used'),
        remaining: document.getElementById('traffic-remaining'),
        limit: document.getElementById('traffic-limit'),
        progressBar: document.getElementById('traffic-progress-bar')
    };

    const usedTraffic = Math.max(0, calculateUsedTraffic({
        trafficData: normalizedData.ds,
        resetDay: normalizedData.traffic_reset_day,
        calibrationDate: normalizedData.traffic_calibration_date,
        calibrationValue: normalizedData.traffic_calibration_value
    }));

    const remainingTraffic = Math.max(0, calculateRemainingTraffic({
        used: usedTraffic,
        limit: normalizedData.traffic_limit
    }));

    const formattedValues = {
        used: formatTraffic(usedTraffic),
        remaining: formatTraffic(remainingTraffic),
        limit: formatTraffic(normalizedData.traffic_limit)
    };

    requestAnimationFrame(() => {
        try {
            if (elements.used) elements.used.textContent = formattedValues.used;
            if (elements.remaining) elements.remaining.textContent = formattedValues.remaining;
            if (elements.limit) elements.limit.textContent = formattedValues.limit;
            
            if (elements.progressBar) {
                const ratio = normalizedData.traffic_limit > 0 ? 
                    Math.min(1, Math.max(0, usedTraffic / normalizedData.traffic_limit)) : 0;
                elements.progressBar.style.transform = `scaleX(${ratio})`;
            }
        } catch (error) {
            console.error('Error updating traffic elements:', error);
        }
    });
}

// 设置定时更新
function setupTrafficUpdates() {
    updateTrafficDisplay();
    
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const delay = nextHour - now;
    
    setTimeout(() => {
        updateTrafficDisplay();
        setInterval(updateTrafficDisplay, 60 * 60 * 1000);
    }, delay);
}

// 页面加载时初始化
let initialized = false;
document.addEventListener('DOMContentLoaded', () => {
    if (!initialized) {
        initialized = true;
        setupTrafficUpdates();
    }
});

/**
 * 计算指定日期范围内的流量总和
 * @param {Array} trafficData ds数据数组
 * @param {number} startTime 开始时间戳
 * @param {number} endTime 结束时间戳
 * @returns {number} 总流量
 */
function calculateTrafficInRange(trafficData, startTime, endTime) {
    if (!trafficData || !Array.isArray(trafficData)) return 0;
    
    let totalTraffic = 0;
    const now = Math.floor(Date.now() / 1000);
    
    for (const record of trafficData) {
        if (Array.isArray(record) && record.length >= 2) {
            const inbound = validateTrafficValue(record[0]);
            const outbound = validateTrafficValue(record[1]);
            totalTraffic += inbound + outbound;
        }
    }
    
    return totalTraffic;
}

/**
 * 计算已用流量
 * @param {Object} params 计算参数
 * @param {Array} params.trafficData ds数据
 * @param {number} params.resetDay 重置日
 * @param {number} params.calibrationDate 校准日期
 * @param {number} params.calibrationValue 校准值
 * @returns {number} 已用流量
 */
function calculateUsedTraffic({trafficData, resetDay, calibrationDate, calibrationValue}) {
    const now = new Date();
    const currentDay = now.getDate();
    
    // 计算上个重置日的时间戳
    const lastResetDate = new Date(now);
    if (currentDay >= resetDay) {
        // 当前日期大于等于重置日，使用本月的重置日
        lastResetDate.setDate(resetDay);
    } else {
        // 当前日期小于重置日，使用上月的重置日
        lastResetDate.setMonth(lastResetDate.getMonth() - 1);
        lastResetDate.setDate(resetDay);
    }
    lastResetDate.setHours(0, 0, 0, 0);
    
    // 如果有校准日期且在上次重置之后
    if (calibrationDate && calibrationDate > lastResetDate.getTime()/1000) {
        // 计算校准后的新增流量
        let additionalTraffic = 0;
        if (trafficData && Array.isArray(trafficData)) {
            // 只计算校准日期之后的流量
            const calibrationIndex = Math.floor((now - new Date(calibrationDate * 1000)) / (24 * 60 * 60 * 1000));
            if (calibrationIndex > 0) {
                const recentData = trafficData.slice(-calibrationIndex);
                
                for (const record of recentData) {
                    if (Array.isArray(record) && record.length >= 2) {
                        additionalTraffic += (record[0] + record[1]);
                    }
                }
            }
        }
        return calibrationValue + additionalTraffic;
    }
    
    // 无校准日期或校准日期在重置日之前，计算当月总流量
    if (trafficData && Array.isArray(trafficData)) {
        let monthlyTraffic = 0;
        // 计算从上次重置日到现在的天数
        const daysFromReset = Math.ceil((now - lastResetDate) / (24 * 60 * 60 * 1000));
        
        // 获取重置日之后的流量数据
        if (daysFromReset > 0) {
            const currentMonthData = trafficData.slice(-daysFromReset);
            
            for (const record of currentMonthData) {
                if (Array.isArray(record) && record.length >= 2) {
                    monthlyTraffic += (record[0] + record[1]);
                }
            }
        }
        return monthlyTraffic;
    }
    
    return 0;
}

/**
 * 计算剩余流量
 * @param {Object} params 计算参数
 * @param {number} params.used 已用流量
 * @param {number} params.limit 流量限制
 * @returns {number} 剩余流量
 */
function calculateRemainingTraffic({used, limit}) {
    // 确保数值有效且为数字，并转换为BigInt
    const usedBytes = BigInt(typeof used === 'number' ? used : Number(used) || 0);
    const limitBytes = BigInt(typeof limit === 'number' ? limit : Number(limit) || 0);
    
    // 使用BigInt进行计算
    const remaining = limitBytes > usedBytes ? 
        Number(limitBytes - usedBytes) : 0;
    
    return remaining;
} 