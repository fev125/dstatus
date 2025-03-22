# DStatus - 服务器状态监控面板

DStatus 是一个轻量级的服务器状态监控面板，专为个人和小型团队设计。它提供了实时的服务器状态监控、历史数据记录和可视化展示功能，帮助您随时掌握服务器的运行状况。

## 📋 功能特点

- 🚀 **实时监控**：CPU、内存、硬盘、网络流量实时监控，秒级数据更新
- 📊 **数据可视化**：直观的图表展示系统负载、带宽使用、流量统计等信息
- 📱 **响应式设计**：完美支持电脑、平板和手机等各种设备访问
- 🔔 **告警通知**：可配置的阈值告警，支持多种通知方式（Telegram 等）
- 🔍 **多服务器管理**：集中管理多台服务器，一目了然查看所有状态
- 🔒 **安全访问控制**：用户认证系统，保障数据安全
- 🐳 **容器化部署**：支持 Docker 快速部署，降低安装门槛

## 📸 界面预览

在线演示: [https://vps.mom](https://vps.mom)

主要功能模块:
- 系统状况：CPU、内存、硬盘使用率实时监控
- 网络流量：上下行带宽实时监控和历史记录
- 负载详情：系统负载历史图表（实时、小时、天级）
- 网络设备：各网络接口的详细数据
- 硬盘使用详情：各分区的使用情况

## 💻 安装方法

### 方法一：Docker 部署（推荐）

#### 快速启动（使用 host 网络）

```bash
# 使用 host 网络模式，适合单机部署
docker run -d \
  --name dstatus \
  --network host \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  -e PORT=5555 \
  ghcr.io/fev125/dstatus:latest
```

#### 端口映射模式

```bash
# 使用端口映射模式，适合多服务部署
docker run -d \
  --name dstatus \
  -p 5555:5555 \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  ghcr.io/fev125/dstatus:latest
```

#### 使用 Docker Compose

创建 `docker-compose.yml` 文件：
```yaml
version: '3.8'

services:
  web:
    image: ghcr.io/fev125/dstatus:latest
    container_name: dstatus
    ports:
      - "0.0.0.0:5555:5555"  # Web 管理界面端口
    volumes:
      - ./database:/app/database
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
      - BOT_ENABLED=false  # 禁用 Telegram Bot，除非配置了 HTTPS
    restart: unless-stopped
```

运行：
```bash
docker-compose up -d
```

### 方法二：直接安装

#### 系统要求
- Node.js 18+ (推荐 20+)
- 支持：CentOS、Debian、Ubuntu 等主流 Linux 发行版

#### 自动安装（仅限 CentOS 或 Debian/Ubuntu）

```bash
curl -fsSL https://raw.githubusercontent.com/fev125/dstatus/main/install.sh | bash
```

#### 手动安装

```bash
# 安装依赖
apt update -y && apt-get install nodejs npm git build-essential -y
# 或
yum install epel-release -y && yum install centos-release-scl git -y && yum install nodejs devtoolset-8-gcc* -y

# 克隆代码
git clone https://github.com/fev125/dstatus.git
cd dstatus

# 安装依赖
npm install

# 启动服务
node nekonekostatus.js
```

## 🔄 更新版本

```bash
# 更新 Docker 版本（建议先备份数据）
(docker stop dstatus || true) && \
(docker rm dstatus || true) && \
docker pull ghcr.io/fev125/dstatus:latest && \
docker run -d \
  --name dstatus \
  --network host \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  -e PORT=5555 \
  ghcr.io/fev125/dstatus:latest
```

## 📝 使用指南

### 初始登录
- 访问地址: `http://your-ip:5555`
- 默认密码: `dstatus`
- **重要**：首次登录后请立即修改默认密码

### 添加服务器
1. 登录后台，点击「添加服务器」按钮
2. 填写服务器信息（名称、IP地址、SSH端口等）
3. 输入SSH凭据（支持密码或密钥认证）
4. 测试连接并保存

### 查看监控数据
- 系统概况：在首页查看所有已添加服务器的概览
- 详细数据：点击任意服务器查看详细监控信息
- 历史数据：查看历史负载、带宽等统计数据

### Telegram Bot 配置
1. 在 Telegram 中联系 @BotFather 创建一个新的 bot
2. 获取 bot token 并配置到系统中
3. 开启通知功能并设置告警阈值

## 🛡️ 安全建议

### 密码安全
- 首次登录后立即修改默认密码
- 使用强密码策略（混合大小写、数字和特殊字符）

### 网络安全
- 使用反向代理并启用HTTPS
- 配置防火墙，限制访问IP
- 示例Nginx配置：
  ```nginx
  server {
      listen 443 ssl;
      server_name status.example.com;
      
      ssl_certificate /path/to/cert.pem;
      ssl_certificate_key /path/to/key.pem;
      
      location / {
          proxy_pass http://127.0.0.1:5555;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```

### 数据安全
- 定期备份数据库目录
- 对于重要数据，考虑使用外部存储或备份服务

## 🔧 常用命令

### Docker 管理命令
```bash
# 启动容器
docker start dstatus

# 停止容器
docker stop dstatus

# 查看日志
docker logs -f dstatus

# 进入容器
docker exec -it dstatus /bin/bash
```

### 直接安装管理命令
```bash
# 启动服务
node nekonekostatus.js

# 后台运行
npm install -g forever
forever start nekonekostatus.js

# 查看日志
tail -f logs/app.log
```

## ⚙️ 环境变量配置

| 变量名     | 默认值         | 描述                       |
|------------|----------------|----------------------------|
| TZ         | Asia/Shanghai  | 时区设置                   |
| NODE_ENV   | production     | 运行环境                   |
| PORT       | 5555           | 服务端口                   |
| DB_PATH    | /app/database  | 数据库存储路径             |
| LOG_LEVEL  | info           | 日志级别 (debug/info/warn/error) |
| BOT_ENABLED| false          | 是否启用 Telegram Bot      |
| BOT_TOKEN  | -              | Telegram Bot Token         |

## 📊 API 接口

DStatus 提供了简单的 API 接口，用于获取服务器状态数据：

```
GET /stats/:serverID/data
```

响应示例：
```json
{
  "sid": "server123",
  "stat": {
    "cpu": {
      "multi": 0.12,
      "single": [0.08, 0.15, 0.14, 0.11]
    },
    "mem": {
      "mem": 0.45,
      "swap": 0.02
    },
    "disk": {
      "used": 128849018880,
      "total": 512110190590
    },
    "net": {
      "delta": {
        "in": 51200,
        "out": 24576
      },
      "total": {
        "in": 1073741824,
        "out": 536870912
      }
    }
  }
}
```

## 🙏 致谢

- [Node.js](https://nodejs.org/) - 核心运行时
- [Express](https://expressjs.com/) - Web框架
- [SQLite](https://www.sqlite.org/) - 数据库
- [ApexCharts](https://apexcharts.com/) - 数据可视化
- [TailwindCSS](https://tailwindcss.com/) - UI框架

## 📜 许可证

本项目采用 [MIT License](LICENSE) 开源协议。