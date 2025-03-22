#!/bin/sh

# 清理之前的构建
rm -rf build
mkdir -p build

# 设置Go代理解决网络问题
export GOPROXY=https://goproxy.cn,direct

# 降级依赖版本以解决兼容性问题
echo "降级依赖版本..."
go get github.com/shirou/gopsutil@v3.20.10+incompatible
go get golang.org/x/net@v0.0.0-20210610132358-84b48f89b13b
go get golang.org/x/sys@v0.0.0-20210423082822-04245dca01da
go get github.com/mattn/go-isatty@v0.0.14
go get github.com/tonobo/mtr@v0.1.0

# 更新go.mod和go.sum
echo "更新go.mod和go.sum..."
go mod tidy

# 只构建M1芯片版本
echo "构建 darwin arm64 (M1芯片)版本..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-w -s" -o build/neko-status_darwin_arm64

# 检查构建结果
if [ -f "build/neko-status_darwin_arm64" ]; then
    echo "构建成功！"
    chmod +x build/neko-status_darwin_arm64
    ls -la build/
else
    echo "构建失败，请检查错误信息"
fi 