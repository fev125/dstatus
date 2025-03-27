# DStatus - 服务器状态监控系统

DStatus是一个现代化的服务器状态监控系统，提供简洁美观的UI界面和强大的监控功能。

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

## 💻 快速安装指南（傻瓜式教程）

无论您是技术专家还是新手，都可以轻松部署DStatus监控系统。

### 方法一：一键安装脚本（Linux系统专用 ✅）

只需一条命令即可完成安装：

```bash
# 下载并运行安装脚本
bash -c "$(curl -fsSL https://raw.githubusercontent.com/fev125/dstatus/main/dstatus.sh)"
```

安装脚本提供以下功能：
1. 安装Docker环境
2. 安装DStatus服务
3. 更新DStatus
4. 卸载DStatus

![安装脚本示意图]() <!-- 可添加脚本运行截图 -->

### 方法二：Docker一键部署（跨平台）

#### 第1步: 安装Docker

如果您还没有安装Docker，请先安装：

- **Windows/Mac用户**：下载并安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Linux用户**：运行以下命令安装Docker
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

#### 第2步: 创建工作目录

打开终端或命令提示符，输入以下命令：

```bash
# 创建项目文件夹
mkdir -p dstatus
# 进入文件夹
cd dstatus
# 创建必要的数据存储文件夹
mkdir -p data database logs
```

#### 第3步: 启动DStatus

首先创建必要的目录并设置正确权限：

```bash
# 创建数据目录
mkdir -p data
# 设置正确的权限（确保Docker有读写权限）
chmod -R 777 data
```

复制粘贴以下命令到终端中运行：

```bash
# 一键启动DStatus服务
docker run -d \
  --name dstatus \
  -p 5555:5555 \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  -v $(pwd)/data:/app/data \
  ghcr.io/fev125/dstatus:latest
```

> **⚠️ 注意**：如果遇到权限问题（如错误信息中出现EACCES: permission denied），可以尝试以下解决方案：
> 
> **方案1: 使用当前用户权限运行容器**
> ```bash
> docker run -d \
>   --name dstatus \
>   -p 5555:5555 \
>   --user $(id -u):$(id -g) \
>   --restart unless-stopped \
>   -e TZ=Asia/Shanghai \
>   -e NODE_ENV=production \
>   -v $(pwd)/data:/app/data \
>   ghcr.io/fev125/dstatus:latest
> ```
>
> **方案2: 重新设置目录权限**
> ```bash
> sudo chown -R $(id -u):$(id -g) data
> chmod -R 777 data
> ```

#### 第4步: 访问Web界面

- 打开浏览器，输入地址: `http://localhost:5555`
- 如果在服务器上安装，则使用: `http://服务器IP:5555`
- 默认密码: `dstatus`
- **重要**：首次登录后立即修改默认密码！

![登录界面示意图]() <!-- 可添加登录界面截图 -->

### 使用Docker Compose（简单配置版）

如果您想要更灵活的配置，可以使用Docker Compose:

#### 第1步: 创建配置文件

确保创建必要的目录并设置正确权限：

```bash
# 创建数据目录
mkdir -p data
# 设置正确的权限
chmod -R 777 data
```

在dstatus目录中，创建一个名为`docker-compose.yml`的文件，将以下内容复制粘贴进去：

```yaml
version: '3.8'

services:
  web:
    image: ghcr.io/fev125/dstatus:latest
    container_name: dstatus
    ports:
      - "5555:5555"  # Web界面端口，可以修改为其他端口
    volumes:
      - ./data:/app/data  # 数据库持久化
    # 如果遇到权限问题，取消下面一行的注释，并替换为你的用户ID和组ID
    # user: "1000:1000"  # 使用 id -u 和 id -g 命令获取ID
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
    restart: unless-stopped
```

#### 第2步: 启动服务

在终端中，确保您在dstatus目录下，然后运行：

```bash
docker-compose up -d
```

#### 第3步: 访问Web界面

与上面相同，打开浏览器访问 `http://localhost:5555` 或 `http://服务器IP:5555`

## 📝 使用教程（新手友好版）

### 登录系统

![登录页面示意图]() <!-- 可添加登录界面截图 -->

1. 在浏览器中打开 `http://服务器IP:5555`
2. 输入默认密码: `dstatus`
3. 点击"登录"按钮

### 修改默认密码（重要！）

![修改密码示意图]() <!-- 可添加修改密码界面截图 -->

1. 登录成功后，点击右上角"设置"图标
2. 选择"修改密码"选项
3. 输入新密码并确认
4. 点击"保存"按钮

### 添加要监控的服务器

![添加服务器示意图]() <!-- 可添加添加服务器界面截图 -->

1. 在主界面点击"添加服务器"按钮
2. 填写服务器信息：
   - 名称：给服务器起个容易记的名字
   - 地址：服务器的IP地址
   - 端口：通常是SSH的22端口
   - 用户名：服务器的登录用户名
   - 密码/密钥：对应的登录凭证
3. 点击"测试连接"确认连接成功
4. 点击"保存"按钮完成添加

### 查看监控数据

![监控数据示意图]() <!-- 可添加监控界面截图 -->

1. 在主界面可以看到所有服务器的基本状态
2. 点击任意服务器卡片，进入详细监控页面
3. 在详细页面可以查看：
   - CPU使用率
   - 内存占用
   - 硬盘使用情况
   - 网络流量
   - 系统负载
4. 点击页面上方的时间选项可以查看不同时间段的数据

## 🔄 系统更新教程

当有新版本发布时，您可以按照以下步骤更新系统：

### 第1步: 备份数据（重要）

```bash
# 进入您的dstatus目录
cd dstatus
# 备份数据目录
cp -r data data_backup_$(date +%Y%m%d)
```

### 第2步: 更新系统

确保数据目录和权限正确：

```bash
# 确保数据目录存在并有正确权限
mkdir -p data
chmod -R 777 data
```

然后执行更新命令：

```bash
# 自动停止旧容器、拉取新镜像并启动新容器
docker stop dstatus && docker rm dstatus && docker pull ghcr.io/fev125/dstatus:latest && docker run -d --name dstatus -p 5555:5555 --restart unless-stopped -e TZ=Asia/Shanghai -v $(pwd)/data:/app/data ghcr.io/fev125/dstatus:latest
```

## Docker 安装与自动更新

### Docker 安装

DStatus服务端支持使用Docker进行部署，您可以使用以下命令快速启动：

```bash
# 拉取镜像
docker pull ghcr.io/fev125/dstatus:latest

# 启动服务
docker run -d --name dstatus \
  -p 5555:5555 \
  -v /path/to/database:/app/database \
  -v /path/to/logs:/app/logs \
  ghcr.io/fev125/dstatus:latest
```

或者使用docker-compose进行部署（推荐）：

```bash
# 下载docker-compose.yml到本地
wget https://raw.githubusercontent.com/fev125/dstatus/main/docker-compose.yml

# 创建所需目录
mkdir -p /root/dstatus/database /root/dstatus/logs

# 启动服务
docker-compose up -d
```

### Docker自动更新

DStatus提供两种方式实现Docker容器的自动更新：

#### 1. 使用Watchtower自动更新（推荐）

我们在docker-compose.yml中已集成Watchtower容器，它会自动检查并更新DStatus容器。默认配置下，更新检查周期为24小时。

使用docker-compose启动服务时，会自动启动Watchtower：

```bash
docker-compose up -d
```

您可以通过修改docker-compose.yml中的环境变量来调整Watchtower的行为：

- `WATCHTOWER_POLL_INTERVAL`: 检查更新的间隔时间（秒），默认为86400（24小时）
- `WATCHTOWER_CLEANUP`: 更新后是否清理旧镜像，默认为true

#### 2. 使用更新脚本手动更新

如果您不希望使用Watchtower，也可以使用我们提供的更新脚本手动更新容器：

```bash
# 下载更新脚本
wget https://raw.githubusercontent.com/fev125/dstatus/main/docker-update.sh
chmod +x docker-update.sh

# 执行更新
./docker-update.sh
```

更新脚本会自动执行以下操作：

1. 拉取最新的DStatus镜像
2. 备份现有的数据库
3. 重启容器以应用更新
4. 显示容器状态

您也可以将此脚本添加到crontab中实现定时自动更新：

```bash
# 编辑crontab
crontab -e

# 添加以下内容（每天凌晨3点执行更新）
0 3 * * * cd /path/to/dstatus && ./docker-update.sh >> /path/to/dstatus/update.log 2>&1
```

### 注意事项

1. 确保数据卷正确挂载，以防止数据丢失
2. 更新前建议备份数据库
3. 如果您的容器使用自定义环境变量，请在更新后确认这些变量是否仍然生效

## ❓ 常见问题解答

### 问：启动时报错 "EACCES: permission denied, mkdir '/app/data/backups'" 怎么办？
答：这是权限问题导致的，有以下解决方法：
1. 确保已创建data目录：`mkdir -p data`
2. 设置目录权限：`chmod -R 777 data`
3. 使用当前用户权限运行容器：添加 `--user $(id -u):$(id -g)` 参数
4. 如果使用Docker Compose，在配置中添加 `user: "1000:1000"` (使用实际的用户ID和组ID)

### 问：系统占用多少资源？
答：DStatus本身非常轻量，Docker容器仅占用约50-100MB内存，CPU使用率极低。

### 问：如何查看系统日志？
答：运行命令 `docker logs -f dstatus` 可以实时查看日志。

### 问：我忘记了密码怎么办？
答：您可以重置密码，执行：
```bash
docker exec -it dstatus node reset-password.js
```

### 问：如何更改Web界面端口？
答：修改docker启动命令中的`-p 5555:5555`，将第一个5555改为您想要的端口，例如：`-p 8080:5555`

### 问：如何备份所有数据？
答：定期备份data目录即可：
```bash
cp -r ./data ./data_backup_$(date +%Y%m%d)
```

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
- 确保数据目录已正确创建：
  ```bash
  mkdir -p data
  chmod -R 777 data
  ```
- 定期备份数据目录
  ```bash
  # 备份数据目录
  cp -r ./data ./data_backup_$(date +%Y%m%d)
  ```
- 对于Docker部署，确保正确挂载`/app/data`目录以持久化数据
- 可以配置定时任务自动备份数据库文件：
  ```bash
  # 添加每日备份任务到crontab
  echo "0 2 * * * cd /path/to/dstatus && cp -r ./data ./data_backup_\$(date +\%Y\%m\%d)" >> /etc/crontab
  ```
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
| DATA_PATH  | /app/data      | 核心数据存储路径（SQLite数据库） |
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

## neko-status 探针

系统使用neko-status作为探针采集服务器数据。探针支持以下功能：

- 超低资源占用
- 支持多种架构：x86_64, ARM, MIPS等
- 自动识别服务器网络接口
- 安全的API通信

### 自动构建

我们通过GitHub Actions自动构建neko-status二进制文件：

1. 每次推送到main分支会触发自动构建
2. 发布版本标签(如v1.0.0)时会创建GitHub Release
3. 最新版本会发布到GitHub Pages，可通过以下URL获取：
   - Linux版本: https://fev125.github.io/dstatus/neko-status
   - macOS Intel版本: https://fev125.github.io/dstatus/neko-status_darwin
   - macOS M1/M2/M3版本: https://fev125.github.io/dstatus/neko-status_darwin_arm64

### 设置探针下载地址

在管理员设置页面中，您可以配置`neko_status_url`参数指向正确的下载地址。推荐使用GitHub Pages链接：

```
https://fev125.github.io/dstatus/neko-status
```