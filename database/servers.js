/**
 * 服务器数据库管理模块
 * 负责服务器信息的存储和管理，包括基本信息和流量统计
 */
module.exports=(DB)=>{
    // 引入数据库迁移模块
    const migrations = require('./migrations')(DB);
    
    // 执行数据库迁移
    migrations.migrate();

    // 首先确保表存在
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS servers (
            sid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT,
            top INTEGER,
            status INTEGER,
            expire_time INTEGER,
            group_id TEXT DEFAULT 'default',
            traffic_limit INTEGER DEFAULT 0,
            traffic_reset_day INTEGER DEFAULT 1,
            traffic_alert_percent INTEGER DEFAULT 80,
            traffic_last_reset INTEGER DEFAULT (strftime('%s', 'now')),
            traffic_calibration_date INTEGER DEFAULT (strftime('%s', 'now')),
            traffic_calibration_value BIGINT DEFAULT 0
        )
    `).run();

    // 检查并添加必要的字段
    const columns = DB.prepare("PRAGMA table_info(servers)").all();
    const hasExpireTime = columns.some(col => col.name === 'expire_time');
    if (!hasExpireTime) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN expire_time INTEGER").run();
        } catch (err) {
            console.error('添加 expire_time 字段时出错:', err);
        }
    }
    
    // 检查并添加 group_id 字段
    const hasGroupId = columns.some(col => col.name === 'group_id');
    if (!hasGroupId) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN group_id TEXT DEFAULT 'default'").run();
        } catch (err) {
            console.error('添加 group_id 字段时出错:', err);
        }
    }

    // 检查并添加流量相关字段
    const hasTrafficLimit = columns.some(col => col.name === 'traffic_limit');
    if (!hasTrafficLimit) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN traffic_limit INTEGER DEFAULT 0").run();
        } catch (err) {
            console.error('添加 traffic_limit 字段时出错:', err);
        }
    }
    const hasTrafficResetDay = columns.some(col => col.name === 'traffic_reset_day');
    if (!hasTrafficResetDay) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN traffic_reset_day INTEGER DEFAULT 1").run();
        } catch (err) {
            console.error('添加 traffic_reset_day 字段时出错:', err);
        }
    }
    const hasTrafficAlertPercent = columns.some(col => col.name === 'traffic_alert_percent');
    if (!hasTrafficAlertPercent) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN traffic_alert_percent INTEGER DEFAULT 80").run();
        } catch (err) {
            console.error('添加 traffic_alert_percent 字段时出错:', err);
        }
    }
    const hasTrafficLastReset = columns.some(col => col.name === 'traffic_last_reset');
    if (!hasTrafficLastReset) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN traffic_last_reset INTEGER DEFAULT 0").run();
        } catch (err) {
            console.error('添加 traffic_last_reset 字段时出错:', err);
        }
    }
    const hasTrafficCalibrationDate = columns.some(col => col.name === 'traffic_calibration_date');
    if (!hasTrafficCalibrationDate) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN traffic_calibration_date INTEGER").run();
        } catch (err) {
            console.error('添加 traffic_calibration_date 字段时出错:', err);
        }
    }
    const hasTrafficCalibrationValue = columns.some(col => col.name === 'traffic_calibration_value');
    if (!hasTrafficCalibrationValue) {
        try {
            DB.prepare("ALTER TABLE servers ADD COLUMN traffic_calibration_value INTEGER").run();
        } catch (err) {
            console.error('添加 traffic_calibration_value 字段时出错:', err);
        }
    }

    // 检查并添加流量校准表
    DB.prepare("CREATE TABLE IF NOT EXISTS traffic_calibration (sid, calibration_date, calibration_value, PRIMARY KEY(sid))").run();

    const servers = {
        /**
         * 插入新服务器记录
         * @param {string} sid - 服务器ID
         * @param {string} name - 服务器名称
         * @param {object} data - 服务器配置数据
         * @param {number} top - 排序权重
         * @param {number} status - 服务器状态(1:启用,0:禁用)
         * @param {number} expire_time - 过期时间戳
         * @param {string} group_id - 分组ID
         * @param {object} options - 可选参数
         */
        ins(sid, name, data, top, status=1, expire_time=null, group_id='default', options={}){
            const {
                traffic_limit = 0,
                traffic_reset_day = 1,
                traffic_alert_percent = 80,
                traffic_last_reset = Math.floor(Date.now()/1000)
            } = options;

            this._ins.run(
                sid, name, JSON.stringify(data), top, status, expire_time, group_id,
                traffic_limit, traffic_reset_day, traffic_alert_percent, traffic_last_reset
            );
        },
        _ins: DB.prepare(`
            INSERT INTO servers (
                sid, name, data, top, status, expire_time, group_id,
                traffic_limit, traffic_reset_day, traffic_alert_percent, traffic_last_reset
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `),

        /**
         * 更新服务器记录
         * @param {string} sid - 服务器ID
         * @param {string} name - 服务器名称
         * @param {object} data - 服务器配置数据
         * @param {number} top - 排序权重
         * @param {number} expire_time - 过期时间戳
         * @param {string} group_id - 分组ID
         * @param {object} options - 可选参数
         */
        upd(sid, name, data, top, expire_time=null, group_id='default', traffic_limit=null, traffic_reset_day=null, traffic_alert_percent=null, traffic_calibration_date=null, traffic_calibration_value=null){
            this._upd.run(
                name, JSON.stringify(data), top, expire_time, group_id,
                traffic_limit, traffic_reset_day, traffic_alert_percent, null, // traffic_last_reset 保持不变
                traffic_calibration_date, traffic_calibration_value,
                sid
            );
        },
        _upd: DB.prepare(`
            UPDATE servers SET 
                name=?, data=?, top=?, expire_time=?, group_id=?,
                traffic_limit=COALESCE(?, traffic_limit),
                traffic_reset_day=COALESCE(?, traffic_reset_day),
                traffic_alert_percent=COALESCE(?, traffic_alert_percent),
                traffic_last_reset=COALESCE(?, traffic_last_reset),
                traffic_calibration_date=COALESCE(?, traffic_calibration_date),
                traffic_calibration_value=COALESCE(?, traffic_calibration_value)
            WHERE sid=?
        `),

        // 基础更新函数
        upd_status(sid,status){
            DB.prepare("UPDATE servers SET status=? WHERE sid=?").run(status,sid);
        },
        upd_data(sid,data){
            DB.prepare("UPDATE servers SET data=? WHERE sid=?").run(JSON.stringify(data),sid);
        },
        upd_top(sid,top){
            this._upd_top.run(top,sid);
        },
        _upd_top: DB.prepare("UPDATE servers set top=? WHERE sid=?"),
        
        upd_expire_time(sid,expire_time){
            DB.prepare("UPDATE servers SET expire_time=? WHERE sid=?").run(expire_time,sid);
        },
        
        _upd_group_id: DB.prepare("UPDATE servers SET group_id=? WHERE sid=?"),
        upd_group_id(sid,group_id='default'){
            this._upd_group_id.run(group_id,sid);
        },

        /**
         * 流量相关的更新函数
         */
        upd_traffic_limit(sid, traffic_limit) {
            DB.prepare("UPDATE servers SET traffic_limit=? WHERE sid=?").run(traffic_limit, sid);
        },
        upd_traffic_reset_day(sid, traffic_reset_day) {
            DB.prepare("UPDATE servers SET traffic_reset_day=? WHERE sid=?").run(traffic_reset_day, sid);
        },
        upd_traffic_alert_percent(sid, traffic_alert_percent) {
            DB.prepare("UPDATE servers SET traffic_alert_percent=? WHERE sid=?").run(traffic_alert_percent, sid);
        },
        upd_traffic_last_reset(sid, traffic_last_reset) {
            DB.prepare("UPDATE servers SET traffic_last_reset=? WHERE sid=?").run(traffic_last_reset, sid);
        },

        /**
         * 设置服务器的流量校准信息
         * @param {string} sid - 服务器ID
         * @param {number} calibrationDate - 校准日期（时间戳）
         * @param {number} calibrationValue - 校准值（字节）
         */
        setCalibration(sid, calibrationDate, calibrationValue) {
            try {
                DB.prepare(`
                    INSERT INTO traffic_calibration (sid, calibration_date, calibration_value)
                    VALUES (?, ?, ?)
                    ON CONFLICT(sid) DO UPDATE SET
                        calibration_date = excluded.calibration_date,
                        calibration_value = excluded.calibration_value
                `).run(sid, calibrationDate, calibrationValue);
                return true;
            } catch (err) {
                console.error('设置流量校准信息时出错:', err);
                return false;
            }
        },

        /**
         * 获取服务器的流量校准信息
         * @param {string} sid - 服务器ID
         * @returns {Object|null} 校准信息对象或null
         */
        getCalibration(sid) {
            try {
                return DB.prepare(`
                    SELECT calibration_date, calibration_value
                    FROM traffic_calibration
                    WHERE sid = ?
                `).get(sid);
            } catch (err) {
                console.error('获取流量校准信息时出错:', err);
                return null;
            }
        },

        /**
         * 删除服务器的流量校准信息
         * @param {string} sid - 服务器ID
         */
        deleteCalibration(sid) {
            try {
                DB.prepare('DELETE FROM traffic_calibration WHERE sid = ?').run(sid);
                return true;
            } catch (err) {
                console.error('删除流量校准信息时出错:', err);
                return false;
            }
        },

        /**
         * 获取服务器信息
         */
        _get: DB.prepare("SELECT * FROM servers WHERE sid=?"),
        get(sid){
            var server = this._get.get(sid);
            if(server) server.data = JSON.parse(server.data);
            return server;
        },

        /**
         * 删除服务器
         */
        del(sid){
            DB.prepare("DELETE FROM servers WHERE sid=?").run(sid);
        },

        /**
         * 获取所有服务器列表
         */
        _all: DB.prepare("SELECT * FROM servers ORDER BY top DESC"),
        all(){
            var svrs = this._all.all();
            svrs.forEach(svr => {svr.data = JSON.parse(svr.data);});
            return svrs;
        },
    };

    return {servers};
}