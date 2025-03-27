# DStatus Docker 自动更新使用说明

## 目录

- [简介](#简介)
- [自动更新方案](#自动更新方案)
  - [方案一：使用 Watchtower 自动更新（推荐）](#方案一使用-watchtower-自动更新推荐)
  - [方案二：使用更新脚本手动更新](#方案二使用更新脚本手动更新)
  - [方案三：使用 Cron 定时更新](#方案三使用-cron-定时更新)
- [数据备份与恢复](#数据备份与恢复)
- [常见问题](#常见问题)
- [高级配置](#高级配置)

## 简介

DStatus 支持通过 Docker 进行部署和自动更新。本文档将详细介绍如何配置 Docker 环境以实现 DStatus 的自动更新，确保您的服务始终运行最新版本。

## 自动更新方案

### 方案一：使用 Watchtower 自动更新（推荐）

[Watchtower](https://github.com/containrrr/watchtower) 是一个专为 Docker 容器自动更新设计的工具，它能够监控指定的容器，并在发现镜像更新时自动拉取最新镜像并重启容器。

#### 安装步骤

我们已在 `docker-compose.yml` 中集成了 Watchtower 容器配置，您只需要按照以下步骤操作：

1. 下载配置文件：

```bash
wget https://raw.githubusercontent.com/fev125/dstatus/main/docker-compose.yml
```

2. 启动服务：

```bash
docker-compose up -d
```

这将同时启动 DStatus 和 Watchtower 容器。

#### 工作原理

Watchtower 会定期检查 Docker Hub 或 GitHub Container Registry 上的镜像，如果发现更新会自动执行以下操作：

1. 拉取最新的镜像
2. 停止当前运行的容器
3. 使用相同的参数和挂载卷启动新容器
4. 清理旧镜像（可配置）

#### 配置参数说明

您可以通过修改 `docker-compose.yml` 中的环境变量来自定义 Watchtower 的行为：

```yaml
watchtower:
  environment:
    - WATCHTOWER_CLEANUP=true                # 是否清理旧镜像
    - WATCHTOWER_POLL_INTERVAL=86400         # 检查间隔（秒）
    - WATCHTOWER_NOTIFICATION_REPORT=false   # 是否发送更新报告
    - WATCHTOWER_INCLUDE_STOPPED=false       # 是否更新已停止的容器
```

### 方案二：使用更新脚本手动更新

如果您希望完全控制更新过程，或者不想使用 Watchtower，可以使用我们提供的更新脚本手动更新。

#### 安装步骤

1. 下载更新脚本：

```bash
wget https://raw.githubusercontent.com/fev125/dstatus/main/docker-update.sh
chmod +x docker-update.sh
```

2. 执行更新：

```bash
./docker-update.sh
```

#### 脚本功能

更新脚本会执行以下操作：

1. 拉取最新的 DStatus 镜像
2. 自动备份数据库到时间戳命名的目录
3. 停止并移除当前容器
4. 启动新容器
5. 显示容器状态

### 方案三：使用 Cron 定时更新

您可以结合上述更新脚本和 Linux 的 cron 功能实现定时自动更新。

#### 配置步骤

1. 编辑 crontab：

```bash
crontab -e
```

2. 添加定时任务（例如每周一凌晨3点更新）：

```
0 3 * * 1 cd /path/to/dstatus && ./docker-update.sh >> /path/to/dstatus/update.log 2>&1
```

3. 保存并退出。

## 数据备份与恢复

自动更新时务必确保数据安全，我们建议以下备份策略：

### 自动备份

更新脚本会在更新前自动创建数据库备份，备份目录为 `database_backup_[时间戳]`。

### 手动备份

您也可以手动备份数据：

```bash
# 停止容器
docker-compose stop

# 备份数据
cp -r /root/dstatus/database /root/dstatus/database_backup_$(date +%Y%m%d)

# 启动容器
docker-compose start
```

### 恢复备份

如需恢复备份：

```bash
# 停止容器
docker-compose stop

# 恢复数据
rm -rf /root/dstatus/database/*
cp -r /root/dstatus/database_backup_YYYYMMDD/* /root/dstatus/database/

# 启动容器
docker-compose start
```

## 常见问题

### Q1: 更新后数据是否会丢失？

A: 不会。我们使用数据卷挂载方式存储数据，更新容器不会影响数据持久化。但为了安全起见，建议在更新前进行备份。

### Q2: 如何查看更新日志？

A: 可以通过以下命令查看容器日志：

```bash
# 查看DStatus日志
docker logs dstatus

# 查看Watchtower日志
docker logs watchtower
```

### Q3: 如何暂停自动更新？

A: 如果使用Watchtower，可以停止Watchtower容器：

```bash
docker stop watchtower
```

要恢复自动更新，只需重新启动容器：

```bash
docker start watchtower
```

## 高级配置

### Watchtower通知配置

您可以配置Watchtower在更新后发送通知，例如通过邮件、Slack或Telegram：

```yaml
watchtower:
  environment:
    # SMTP邮件通知
    - WATCHTOWER_NOTIFICATIONS=email
    - WATCHTOWER_NOTIFICATION_EMAIL_FROM=from@example.com
    - WATCHTOWER_NOTIFICATION_EMAIL_TO=to@example.com
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER=smtp.example.com
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PORT=587
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_USER=user
    - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PASSWORD=password
```

更多配置选项请参考[Watchtower官方文档](https://containrrr.dev/watchtower/) 