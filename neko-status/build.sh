#!/bin/sh

# 清理之前的构建
rm -rf build
mkdir -p build

# 设置Go代理解决网络问题
export GOPROXY=https://goproxy.cn,direct

# 强制更新依赖
echo "强制更新依赖..."
go mod download github.com/shirou/gopsutil@v3.20.10+incompatible
go mod download golang.org/x/net@v0.0.0-20210610132358-84b48f89b13b
go mod download golang.org/x/sys@v0.0.0-20210423082822-04245dca01da
go mod download github.com/mattn/go-isatty@v0.0.14
go mod download github.com/tonobo/mtr@v0.1.0

# 替换依赖
echo "替换依赖..."
go mod edit -replace=golang.org/x/net=golang.org/x/net@v0.0.0-20210610132358-84b48f89b13b
go mod edit -replace=golang.org/x/sys=golang.org/x/sys@v0.0.0-20210423082822-04245dca01da
go mod edit -replace=github.com/shirou/gopsutil=github.com/shirou/gopsutil@v3.20.10+incompatible

# 更新go.mod和go.sum
echo "更新go.mod和go.sum..."
go mod tidy
go get -u ./...

# 验证依赖
echo "验证依赖..."
go mod verify

# 先尝试构建当前平台版本
echo "构建当前平台版本..."
go build -v -ldflags="-w -s" -o build/neko-status

# 如果当前平台构建成功，再构建其他平台
if [ $? -eq 0 ]; then
    echo "当前平台构建成功，继续构建其他平台..."
    
    # 构建主要平台
    echo "构建 darwin arm64 (M1芯片)..."
    CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-w -s" -o build/neko-status_darwin_arm64
    
    echo "构建 darwin amd64..."
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_darwin_amd64
    
    echo "构建 linux amd64..."
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_linux_amd64
    
    # 如果主要平台构建成功，继续构建其他平台
    if [ $? -eq 0 ]; then
        echo "主要平台构建成功，继续构建其他平台..."
        
        # FreeBSD
        echo "构建 freebsd amd64..."
        CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_freebsd_amd64
        
        # OpenBSD
        echo "构建 openbsd amd64..."
        CGO_ENABLED=0 GOOS=openbsd GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_openbsd_amd64
        
        # NetBSD
        echo "构建 netbsd amd64..."
        CGO_ENABLED=0 GOOS=netbsd GOARCH=amd64 go build -ldflags="-w -s" -o build/neko-status_netbsd_amd64
        
        # Linux ARM64
        echo "构建 linux arm64..."
        CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" -o build/neko-status_linux_arm64
        
        # Linux 386
        echo "构建 linux 386..."
        CGO_ENABLED=0 GOOS=linux GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_linux_386
        
        # FreeBSD 386
        echo "构建 freebsd 386..."
        CGO_ENABLED=0 GOOS=freebsd GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_freebsd_386
        
        # OpenBSD 386
        echo "构建 openbsd 386..."
        CGO_ENABLED=0 GOOS=openbsd GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_openbsd_386
        
        # NetBSD 386
        echo "构建 netbsd 386..."
        CGO_ENABLED=0 GOOS=netbsd GOARCH=386 go build -ldflags="-w -s" -o build/neko-status_netbsd_386
        
        # Linux ARM
        echo "构建 linux arm7..."
        CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-w -s" -o build/neko-status_linux_arm7
        
        echo "构建 linux arm6..."
        CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=6 go build -ldflags="-w -s" -o build/neko-status_linux_arm6
        
        echo "构建 linux arm5..."
        CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=5 go build -ldflags="-w -s" -o build/neko-status_linux_arm5
        
        # Linux MIPS
        echo "构建 linux mips..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mips go build -ldflags="-w -s" -o build/neko-status_linux_mips
        
        echo "构建 linux mipsle..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mipsle go build -ldflags="-w -s" -o build/neko-status_linux_mipsle
        
        echo "构建 linux mips_softfloat..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mips GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mips_softfloat
        
        echo "构建 linux mipsle_softfloat..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mipsle GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mipsle_softfloat
        
        echo "构建 linux mips64..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mips64 go build -ldflags="-w -s" -o build/neko-status_linux_mips64
        
        echo "构建 linux mips64le..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mips64le go build -ldflags="-w -s" -o build/neko-status_linux_mips64le
        
        echo "构建 linux mips64_softfloat..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mips64 GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mips64_softfloat
        
        echo "构建 linux mips64le_softfloat..."
        CGO_ENABLED=0 GOOS=linux GOARCH=mips64le GOMIPS=softfloat go build -ldflags="-w -s" -o build/neko-status_linux_mips64le_softfloat
    else
        echo "主要平台构建失败，停止构建其他平台"
    fi
else
    echo "当前平台构建失败，请检查错误信息"
fi

# 检查构建结果
echo "检查构建结果..."
ls -la build/

echo "构建完成！"