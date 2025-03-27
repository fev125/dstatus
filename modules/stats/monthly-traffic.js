/**
 * 月度流量计算模块
 * 处理所有月度流量相关的计算逻辑
 */

const MonthlyTraffic = {
    /**
     * 计算月度流量使用情况
     * @param {Object} trafficData 流量数据对象
     * @param {Array} trafficData.ds 31天的流量数据
     * @param {number} trafficData.traffic_reset_day 流量重置日
     * @param {number} trafficData.traffic_limit 流量限制
     * @param {number} trafficData.calibration_date 校准日期
     * @param {number} trafficData.calibration_value 校准值
     * @returns {Object} 月度流量统计结果
     */
    calculateMonthlyUsage(trafficData) {
        try {
            if (!trafficData || !Array.isArray(trafficData.ds)) {
                return this.getDefaultResult();
            }

            // 1. 确定计算范围
            const now = new Date();
            const currentDay = now.getDate();
            const resetDay = trafficData.traffic_reset_day || 1;
            
            let startIndex = 0;
            const endIndex = trafficData.ds.length - 1;
            
            if (resetDay >= 1 && resetDay <= 31) {
                if (currentDay >= resetDay) {
                    // 从本月重置日开始计算
                    startIndex = Math.max(0, trafficData.ds.length - (currentDay - resetDay + 1));
                } else {
                    // 从上月重置日开始计算
                    const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
                    startIndex = Math.max(0, trafficData.ds.length - (daysInLastMonth - resetDay + currentDay + 1));
                }
            }

            // 2. 计算已用流量
            let usedTraffic = 0;
            for (let i = startIndex; i <= Math.min(endIndex, trafficData.ds.length - 1); i++) {
                const item = trafficData.ds[i];
                if (Array.isArray(item) && item.length >= 2) {
                    usedTraffic += Number(item[0] || 0) + Number(item[1] || 0);
                }
            }

            // 3. 添加校准值
            if (trafficData.calibration_date > 0 && typeof trafficData.calibration_value === 'number') {
                usedTraffic += Number(trafficData.calibration_value);
            }

            // 4. 计算流量限制和剩余流量
            const trafficLimit = Number(trafficData.traffic_limit) || 0;
            const remainingTraffic = trafficLimit ? Math.max(0, trafficLimit - usedTraffic) : -1;

            // 5. 计算使用比例
            const usageRatio = trafficLimit ? Math.min(100, (usedTraffic / trafficLimit) * 100) : 0;

            // 6. 返回计算结果
            return {
                used: usedTraffic,
                remaining: remainingTraffic,
                limit: trafficLimit,
                ratio: usageRatio,
                reset_day: resetDay,
                next_reset: this.calculateNextResetDate(resetDay),
                status: this.calculateStatus(usageRatio)
            };
        } catch (error) {
            console.error('[Monthly Traffic] 计算月度流量失败:', error);
            return this.getDefaultResult();
        }
    },

    /**
     * 获取默认结果
     */
    getDefaultResult() {
        return {
            used: 0,
            remaining: -1,
            limit: 0,
            ratio: 0,
            reset_day: 1,
            next_reset: this.calculateNextResetDate(1),
            status: 'normal'
        };
    },

    /**
     * 计算下次重置日期
     * @param {number} resetDay 重置日
     * @returns {number} 下次重置的时间戳
     */
    calculateNextResetDate(resetDay) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const currentDay = now.getDate();

        let nextReset = new Date(year, month, resetDay);
        
        // 如果当前日期已过重置日，移到下个月
        if (currentDay >= resetDay) {
            nextReset = new Date(year, month + 1, resetDay);
        }

        return Math.floor(nextReset.getTime() / 1000);
    },

    /**
     * 计算流量状态
     * @param {number} ratio 使用比例
     * @returns {string} 状态标识
     */
    calculateStatus(ratio) {
        if (ratio >= 90) return 'critical';
        if (ratio >= 70) return 'warning';
        return 'normal';
    }
};

module.exports = MonthlyTraffic; 