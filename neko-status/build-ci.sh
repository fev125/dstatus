#!/bin/bash

# 设置环境变量
export GO111MODULE=on

# 创建构建目录
mkdir -p build

echo "更新依赖..."
# 先运行go mod tidy确保依赖正确
go mod tidy
# 确保下载所有依赖
go mod download

# 检测当前操作系统
CURRENT_OS=$(uname -s | tr '[:upper:]' '[:lower:]')
echo "当前操作系统: $CURRENT_OS"

# 只在macOS上构建Darwin二进制文件
if [ "$CURRENT_OS" == "darwin" ]; then
    echo "构建 darwin arm64 (M1芯片)版本..."
    CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 go build -o build/neko-status_darwin_arm64 main_simple.go
    
    echo "构建 darwin amd64 版本..."
    CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 go build -o build/neko-status_darwin_amd64 main_simple.go
    
    # 创建通用macOS二进制文件
    echo "创建darwin通用二进制文件..."
    lipo -create -output build/neko-status_darwin_universal build/neko-status_darwin_amd64 build/neko-status_darwin_arm64
else
    # 在CI环境中，我们将构建单独的平台二进制文件，但跳过macOS通用二进制
    echo "在非macOS环境构建，将跳过darwin特定版本和通用二进制构建..."
    
    # 如果在CI上，我们仍然需要darwin二进制文件的占位符，使后续步骤不会失败
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -o build/neko-status_darwin_amd64 main_simple.go
    CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o build/neko-status_darwin_arm64 main_simple.go
    
    # 创建占位符通用二进制（实际上就是amd64版本的副本）
    cp build/neko-status_darwin_amd64 build/neko-status_darwin_universal
fi

echo "构建 linux amd64 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o build/neko-status_linux_amd64 main_simple.go

echo "构建 linux arm64 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" -o build/neko-status_linux_arm64 main_simple.go

echo "构建 linux 386 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_linux_386 main_simple.go

# 构建ARM版本
echo "构建 linux arm7 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-w -s" -o build/neko-status_linux_arm7 main_simple.go

# 跳过已知有问题的构建
echo "跳过有问题的平台构建（FreeBSD、NetBSD、OpenBSD等）..."

# 创建linux通用二进制文件（复制amd64版本）
echo "创建linux通用二进制文件..."
cp build/neko-status_linux_amd64 build/neko-status_linux_universal

# 创建通用二进制文件（复制linux amd64版本）
echo "创建完全通用二进制文件..."
cp build/neko-status_linux_amd64 build/neko-status_universal

# 检查构建结果
echo "构建完成，列出构建的二进制文件:"
chmod +x build/neko-status_*
ls -la build/ 