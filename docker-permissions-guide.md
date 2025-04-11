# DStatus Docker 权限问题解决指南

## 问题描述

在使用 Docker 部署 DStatus 时，有时会遇到权限问题，特别是以下错误：

```
EACCES: permission denied, mkdir '/app/data/backups'
```

这是因为 Docker 容器内的进程无法在挂载的卷目录中创建文件或目录。

## 解决方案

### 方案1：使用权限修复脚本（推荐）

我们提供了一个简单的权限修复脚本，可以自动解决大多数权限问题：

```bash
# 下载权限修复脚本
wget https://raw.githubusercontent.com/fev125/dstatus/main/fix-docker-permissions.sh

# 添加执行权限
chmod +x fix-docker-permissions.sh

# 以root权限运行脚本
sudo ./fix-docker-permissions.sh
```

### 方案2：手动设置权限

如果您希望手动解决权限问题，可以执行以下步骤：

1. 创建必要的目录：

```bash
sudo mkdir -p /root/dstatus/database /root/dstatus/logs
```

2. 设置目录权限：

```bash
sudo chmod -R 777 /root/dstatus/database /root/dstatus/logs
```

3. 重启 Docker 容器：

```bash
docker restart dstatus
```

### 方案3：使用用户映射

在 `docker-compose.yml` 文件中，我们已经添加了用户映射配置：

```yaml
user: "${UID:-1000}:${GID:-1000}"  # 使用当前用户权限
```

这会使容器使用主机上的用户权限运行。如果您需要手动设置，可以执行：

```bash
# 获取当前用户的UID和GID
echo "Current UID: $(id -u), GID: $(id -g)"

# 修改docker-compose.yml中的user配置
# 将 user: "${UID:-1000}:${GID:-1000}" 替换为您的实际UID和GID
# 例如：user: "1001:1001"
```

## 备份目录说明

DStatus 的备份目录位于：

- 容器内：`/app/data/backups`
- 主机上：`/root/dstatus/database/backups`

备份文件的命名格式为：`backup-{timestamp}.db.db`

## 注意事项

1. 确保 Docker 容器有足够的权限访问挂载的卷目录
2. 如果您使用非标准路径，请相应调整权限设置命令
3. 在更新 DStatus 前，建议先备份数据
4. 如果您使用的是自定义用户运行 Docker，确保该用户有权限访问挂载目录
