#!/bin/bash

# 设置环境变量
export GOPROXY=https://goproxy.cn,direct
export GO111MODULE=on

# 创建构建目录
mkdir -p build

echo "更新依赖..."
# 先运行go mod tidy确保依赖正确
go mod tidy
# 确保下载所有依赖
go mod download

echo "构建 darwin arm64 (M1芯片)版本..."
CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 go build -o build/neko-status_darwin_arm64 main_simple.go

echo "构建 darwin amd64 版本..."
CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 go build -o build/neko-status_darwin_amd64 main_simple.go

echo "构建 linux amd64 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o build/neko-status_linux_amd64 main_simple.go

echo "构建 linux arm64 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" -o build/neko-status_linux_arm64 main_simple.go

echo "构建 linux 386 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_linux_386 main_simple.go

# 构建FreeBSD版本
echo "构建 freebsd amd64 版本..."
CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_freebsd_amd64 main_simple.go

echo "构建 freebsd 386 版本..."
CGO_ENABLED=0 GOOS=freebsd GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_freebsd_386 main_simple.go

# 构建NetBSD版本
echo "构建 netbsd amd64 版本..."
CGO_ENABLED=0 GOOS=netbsd GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_netbsd_amd64 main_simple.go

echo "构建 netbsd 386 版本..."
CGO_ENABLED=0 GOOS=netbsd GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_netbsd_386 main_simple.go

# 构建OpenBSD版本
echo "构建 openbsd amd64 版本..."
CGO_ENABLED=0 GOOS=openbsd GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_openbsd_amd64 main_simple.go

echo "构建 openbsd 386 版本..."
CGO_ENABLED=0 GOOS=openbsd GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_openbsd_386 main_simple.go

# 构建ARM版本
echo "构建 linux arm7 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-w -s" -o build/neko-status_linux_arm7 main_simple.go

echo "构建 linux arm6 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=6 go build -ldflags="-w -s" -o build/neko-status_linux_arm6 main_simple.go

echo "构建 linux arm5 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=5 go build -ldflags="-w -s" -o build/neko-status_linux_arm5 main_simple.go

# 构建MIPS版本
echo "构建 linux mips 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mips go build -ldflags="-w -s" -o build/neko-status_linux_mips main_simple.go

echo "构建 linux mipsle 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mipsle go build -ldflags="-w -s" -o build/neko-status_linux_mipsle main_simple.go

echo "构建 linux mips_softfloat 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mips GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mips_softfloat main_simple.go

echo "构建 linux mipsle_softfloat 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mipsle GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mipsle_softfloat main_simple.go

echo "构建 linux mips64 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mips64 go build -ldflags="-w -s" -o build/neko-status_linux_mips64 main_simple.go

echo "构建 linux mips64le 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mips64le go build -ldflags="-w -s" -o build/neko-status_linux_mips64le main_simple.go

echo "构建 linux mips64_softfloat 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mips64 GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mips64_softfloat main_simple.go

echo "构建 linux mips64le_softfloat 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=mips64le GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mips64le_softfloat main_simple.go

# 构建PPC64LE版本
echo "构建 linux ppc64le 版本..."
CGO_ENABLED=0 GOOS=linux GOARCH=ppc64le go build -ldflags="-w -s" -o build/neko-status_linux_ppc64le main_simple.go

# 检查构建结果
if [ -f "build/neko-status_darwin_arm64" ]; then
    echo "构建成功！"
    chmod +x build/neko-status_darwin_arm64
    ls -la build/
    echo "M1版本可执行文件: build/neko-status_darwin_arm64"
else
    echo "构建失败，请检查错误信息"
fi 