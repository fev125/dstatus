#!/bin/sh

# 确保脚本在错误时退出
set -e

# 创建发布目录
mkdir -p release

# 打包主要平台的二进制文件
echo "打包 Linux AMD64 版本..."
tar -czf release/neko-status_linux_amd64.tar.gz -C build neko-status_linux_amd64
echo "打包 Darwin AMD64 版本..."
tar -czf release/neko-status_darwin_amd64.tar.gz -C build neko-status_darwin_amd64
echo "打包 Darwin ARM64 (M1) 版本..."
tar -czf release/neko-status_darwin_arm64.tar.gz -C build neko-status_darwin_arm64
echo "打包 Linux ARM64 版本..."
tar -czf release/neko-status_linux_arm64.tar.gz -C build neko-status_linux_arm64
echo "打包 Linux 386 版本..."
tar -czf release/neko-status_linux_386.tar.gz -C build neko-status_linux_386

# 打包FreeBSD版本
echo "打包 FreeBSD AMD64 版本..."
tar -czf release/neko-status_freebsd_amd64.tar.gz -C build neko-status_freebsd_amd64
echo "打包 FreeBSD 386 版本..."
tar -czf release/neko-status_freebsd_386.tar.gz -C build neko-status_freebsd_386

# 打包NetBSD版本
echo "打包 NetBSD AMD64 版本..."
tar -czf release/neko-status_netbsd_amd64.tar.gz -C build neko-status_netbsd_amd64
echo "打包 NetBSD 386 版本..."
tar -czf release/neko-status_netbsd_386.tar.gz -C build neko-status_netbsd_386

# 跳过OpenBSD版本，因为构建失败
# echo "打包 OpenBSD AMD64 版本..."
# tar -czf release/neko-status_openbsd_amd64.tar.gz -C build neko-status_openbsd_amd64
# echo "打包 OpenBSD 386 版本..."
# tar -czf release/neko-status_openbsd_386.tar.gz -C build neko-status_openbsd_386

# 打包ARM版本
echo "打包 Linux ARM7 版本..."
tar -czf release/neko-status_linux_arm7.tar.gz -C build neko-status_linux_arm7
echo "打包 Linux ARM6 版本..."
tar -czf release/neko-status_linux_arm6.tar.gz -C build neko-status_linux_arm6
echo "打包 Linux ARM5 版本..."
tar -czf release/neko-status_linux_arm5.tar.gz -C build neko-status_linux_arm5

# 打包MIPS版本
echo "打包 Linux MIPS 版本..."
tar -czf release/neko-status_linux_mips.tar.gz -C build neko-status_linux_mips
echo "打包 Linux MIPSLE 版本..."
tar -czf release/neko-status_linux_mipsle.tar.gz -C build neko-status_linux_mipsle
echo "打包 Linux MIPS_softfloat 版本..."
tar -czf release/neko-status_linux_mips_softfloat.tar.gz -C build neko-status_linux_mips_softfloat
echo "打包 Linux MIPSLE_softfloat 版本..."
tar -czf release/neko-status_linux_mipsle_softfloat.tar.gz -C build neko-status_linux_mipsle_softfloat
echo "打包 Linux MIPS64 版本..."
tar -czf release/neko-status_linux_mips64.tar.gz -C build neko-status_linux_mips64
echo "打包 Linux MIPS64LE 版本..."
tar -czf release/neko-status_linux_mips64le.tar.gz -C build neko-status_linux_mips64le
echo "打包 Linux MIPS64_softfloat 版本..."
tar -czf release/neko-status_linux_mips64_softfloat.tar.gz -C build neko-status_linux_mips64_softfloat
echo "打包 Linux MIPS64LE_softfloat 版本..."
tar -czf release/neko-status_linux_mips64le_softfloat.tar.gz -C build neko-status_linux_mips64le_softfloat

# 打包PPC64LE版本
echo "打包 Linux PPC64LE 版本..."
tar -czf release/neko-status_linux_ppc64le.tar.gz -C build neko-status_linux_ppc64le

# 打包通用版本
echo "打包 Linux 通用版本..."
tar -czf release/neko-status_linux_universal.tar.gz -C build neko-status_linux_universal
echo "打包 macOS 通用版本..."
tar -czf release/neko-status_darwin_universal.tar.gz -C build neko-status_darwin_universal
echo "打包全局通用版本..."
tar -czf release/neko-status_universal.tar.gz -C build neko-status_universal

# 创建SHA256校验和
echo "生成SHA256校验和..."
cd release
shasum -a 256 *.tar.gz > SHA256SUMS
cd ..

echo "打包完成！发布文件在release目录中"
ls -la release/ 