#!/bin/bash
# DStatus Docker 容器更新脚本
# 作用：拉取最新镜像并重启容器以应用更新
# 使用方法：bash docker-update.sh

# 设置颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========== DStatus Docker 更新脚本 ==========${NC}"
echo -e "开始执行容器更新操作..."

# 检查docker命令是否可用
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装或不在系统路径中${NC}"
    exit 1
fi

# 检查docker-compose命令是否可用
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}警告: Docker Compose 未安装，尝试使用 docker compose 命令...${NC}"
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# 检查当前目录是否有docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${YELLOW}警告: 当前目录没有找到 docker-compose.yml${NC}"
    echo -e "请确认您是否在正确的目录中运行此脚本"
    read -p "是否继续? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "更新操作已取消"
        exit 1
    fi
fi

echo -e "${BLUE}1. 拉取最新的镜像${NC}"
docker pull ghcr.io/fev125/dstatus:latest
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 拉取镜像失败${NC}"
    echo -e "请检查网络连接或镜像名称是否正确"
    exit 1
fi

echo -e "${BLUE}2. 备份数据库${NC}"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
if [ -d "database" ]; then
    echo -e "创建数据库备份: database_backup_$TIMESTAMP"
    cp -r database "database_backup_$TIMESTAMP"
fi

echo -e "${BLUE}3. 重启容器${NC}"
$DOCKER_COMPOSE down
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}警告: 关闭容器失败，尝试使用强制参数${NC}"
    $DOCKER_COMPOSE down --remove-orphans
fi

$DOCKER_COMPOSE up -d
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 启动容器失败${NC}"
    echo -e "请检查docker-compose配置文件是否正确"
    exit 1
fi

echo -e "${BLUE}4. 检查容器状态${NC}"
sleep 5
$DOCKER_COMPOSE ps

echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}✅ DStatus Docker 容器已更新到最新版本${NC}"
echo -e "${GREEN}=======================================${NC}"
echo -e "可以通过以下命令查看日志:"
echo -e "$ docker logs dstatus" 