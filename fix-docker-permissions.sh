#!/bin/bash

# DStatus Docker 权限修复脚本
# 作用：修复 Docker 容器挂载目录的权限问题
# 使用方法：bash fix-docker-permissions.sh

# 设置颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========== DStatus Docker 权限修复脚本 ==========${NC}"

# 检查是否以 root 权限运行
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}错误: 请使用 root 权限运行此脚本${NC}"
  echo -e "请使用 sudo bash fix-docker-permissions.sh 重新运行"
  exit 1
fi

# 定义数据目录
DATA_DIR="/root/dstatus/database"
LOGS_DIR="/root/dstatus/logs"

echo -e "${BLUE}1. 创建必要的目录${NC}"
mkdir -p ${DATA_DIR}/backups ${DATA_DIR}/temp ${LOGS_DIR}
echo -e "${GREEN}✓ 目录创建完成${NC}"

echo -e "${BLUE}2. 设置目录权限${NC}"
chmod -R 777 ${DATA_DIR} ${LOGS_DIR}
echo -e "${GREEN}✓ 权限设置完成${NC}"

echo -e "${BLUE}3. 检查 Docker 容器状态${NC}"
if command -v docker &> /dev/null; then
    if docker ps -a | grep -q dstatus; then
        echo -e "${YELLOW}发现 DStatus 容器，尝试重启...${NC}"
        docker restart dstatus
        echo -e "${GREEN}✓ 容器已重启${NC}"
    else
        echo -e "${YELLOW}未发现 DStatus 容器，跳过重启步骤${NC}"
    fi
else
    echo -e "${YELLOW}未检测到 Docker 命令，跳过容器操作${NC}"
fi

echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}✅ 权限修复完成！${NC}"
echo -e "${GREEN}=======================================${NC}"
echo -e "如果仍然遇到问题，请尝试以下操作："
echo -e "1. 检查 Docker 容器的用户设置"
echo -e "2. 在 docker-compose.yml 中添加 user: \"$(id -u):$(id -g)\" 配置"
echo -e "3. 重新创建并启动容器: docker-compose down && docker-compose up -d"
