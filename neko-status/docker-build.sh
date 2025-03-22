#!/bin/sh

# 确保脚本在错误时退出
set -e

echo "开始使用Docker构建neko-status..."

# 构建Docker镜像
echo "构建Docker镜像..."
docker build -t neko-status-builder -f Dockerfile.build .

# 运行容器并创建卷
echo "运行构建容器..."
CONTAINER_ID=$(docker run -d neko-status-builder)

# 等待容器完成构建
echo "等待构建完成..."
docker wait $CONTAINER_ID

# 显示构建日志
echo "构建日志:"
docker logs $CONTAINER_ID

# 创建本地build目录
mkdir -p build

# 从容器复制构建结果
echo "复制构建结果到本地..."
docker cp $CONTAINER_ID:/output/. build/

# 清理容器
echo "清理容器..."
docker rm $CONTAINER_ID

echo "构建完成！构建结果在build目录中"
ls -la build/

# 为M1芯片的macOS设置可执行权限
if [ "$(uname)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
    echo "为M1芯片设置可执行权限..."
    chmod +x build/neko-status_darwin_arm64
    echo "M1版本可执行文件: build/neko-status_darwin_arm64"
fi 