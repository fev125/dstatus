# DStatus

一个现代化的服务器状态监控面板，基于 Material Design 设计风格。

## 特性

- 🚀 一键安装部署
- 📊 实时监控：CPU、内存、带宽、流量统计
- 📱 响应式设计：支持移动端和桌面端
- 🌙 深色模式：自动适应系统主题
- 🔔 Telegram 通知：服务器状态变更提醒
- 💻 WebSSH：在线终端管理
- 📝 脚本管理：常用运维脚本
- 🎯 分组管理：服务器分组展示
- 🔄 实时排序：多维度数据排序
- 🎨 双视图：支持卡片/列表显示模式

## 快速开始

### Docker 部署（推荐）

```bash
docker run --restart=always \
  --name dstatus \
  -p 5555:5555 \
  -v /path/to/data:/app/database \
  -d fev125/dstatus:latest
```

### 一键脚本安装

CentOS 7+ / Debian 10+ / Ubuntu 18.04+

```bash
wget https://raw.githubusercontent.com/fev125/dstatus/main/install.sh -O install.sh && bash install.sh
```

### 手动安装

1. 环境要求
   - Node.js 12+
   - gcc/g++ 8.x+
   - git

2. 安装依赖
```bash
# CentOS
yum install epel-release centos-release-scl git nodejs devtoolset-8-gcc* -y

# Debian/Ubuntu
apt update && apt install nodejs npm git build-essential -y
```

3. 克隆代码
```bash
git clone https://github.com/fev125/dstatus.git
cd dstatus
npm install
```

4. 启动服务
```bash
# 直接运行
node dstatus.js

# 使用 PM2
npm install pm2 -g
pm2 start dstatus.js

# 使用 systemd
echo "[Unit]
Description=DStatus
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/path/to/dstatus/dstatus.js

[Install]
WantedBy=multi-user.target" > /etc/systemd/system/dstatus.service

systemctl daemon-reload
systemctl enable dstatus
systemctl start dstatus
```

## 配置说明

### 默认配置
- 访问端口：5555
- 默认密码：`dstatus`
- 配置文件：`config.js`

### 服务器配置

| 配置项 | 说明 | 示例 |
|--------|------|------|
| 名称 | 服务器名称 | `web-server` |
| 分组 | 服务器分组 | `production` |
| 地址 | IP或域名 | `192.168.1.100` |
| SSH端口 | SSH连接端口 | `22` |
| 认证方式 | 密码/密钥 | `password/key` |
| 通信模式 | 被动/主动 | `passive` |
| 通信端口 | 数据同步端口 | `10086` |

## 更新维护

1. 备份数据
```bash
cp database/db.db database/db.db.bak
```

2. 更新代码
```bash
git pull
npm install
systemctl restart dstatus
```

## 安全建议

1. 修改默认密码
2. 使用反向代理（如 Nginx）并启用 HTTPS
3. 配置访问控制
4. 使用 SSH 密钥认证
5. 定期备份数据

## 贡献指南

1. Fork 本仓库
2. 创建特性分支
3. 提交变更
4. 发起 Pull Request

## 许可证

MIT License

## 致谢

- 感谢 [NekoNekoStatus](https://github.com/nkeonkeo/nekonekostatus) 项目的启发
- 感谢所有贡献者的付出