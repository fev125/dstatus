#!/bin/bash

# 脚本版本
VERSION="2023-11-01-alpine-fix2"

# DStatus客户端一键安装脚本
# 1. 此脚本用于安装DStatus客户端(neko-status)，支持自动发现功能
# 2. 支持通过注册密钥自动注册到服务器
# 3. 支持多系统多架构
# 修改时间: 2023-11-01
# Alpine优化版本 (第二次修复)

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# 打印带颜色的信息
print_info() {
    echo -e "<span class="math-inline">\{BLUE\}\[信息\]</span>{NC} <span class="math-inline">1"
\# 确保立即输出
sync
\}
print\_success\(\) \{
echo \-e "</span>{GREEN}[成功]${NC} <span class="math-inline">1"
\# 确保立即输出
sync
\}
print\_warning\(\) \{
echo \-e "</span>{YELLOW}[警告]${NC} <span class="math-inline">1"
\# 确保立即输出
sync
\}
print\_error\(\) \{
echo \-e "</span>{RED}[错误]${NC} <span class="math-inline">1"
\# 确保立即输出
sync
\}
\# 检查是否为root用户
check\_root\(\) \{
if \[ "</span>(id -u)" != "0" ]; then
        print_error "此脚本需要root权限运行"
        print_info "请使用sudo运行此脚本: sudo <span class="math-inline">0 注册密钥 服务器URL"
exit 1
fi
\}
\# 获取系统信息
get\_system\_info\(\) \{
\# 检查系统类型
if \[ \-f /etc/alpine\-release \]; then
OS\="alpine"
VERSION\=</span>(cat /etc/alpine-release)
        print_info "检测到系统: Alpine Linux $VERSION"
    elif [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        print_info "检测到系统: $OS <span class="math-inline">VERSION"
else
print\_error "无法确定操作系统类型"
exit 1
fi
\# 获取系统信息
HOSTNAME\=</span>(hostname)
    
    # 更可靠的IP获取方法，特别针对Alpine系统
    if command -v ip >/dev/null 2>&1; then
        IP=$(ip -4 addr show | grep -v '127.0.0.1' | grep -v 'secondary' | grep 'inet' | head -n1 | awk '{print $2}' | cut -d'/' -f1)
    fi
    
    # 如果上面的方法未能获取IP，尝试使用ifconfig
    if [ -z "<span class="math-inline">IP" \] && command \-v ifconfig \>/dev/null 2\>&1; then
IP\=</span>(ifconfig | grep 'inet addr:' 2>/dev/null | grep -v '127.0.0.1' | head -n1 | awk '{print $2}' | cut -d: -f2)
        # 适用于较新版本的ifconfig
        if [ -z "<span class="math-inline">IP" \]; then
IP\=</span>(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -n1 | awk '{print $2}')
        fi
    fi
    
    # 如果本地方法无法获取IP，尝试使用外部服务（如果curl已安装）
    if [ -z "<span class="math-inline">IP" \] && command \-v curl \>/dev/null 2\>&1; then
IP\=</span>(curl -s -m 5 https://api.ipify.org 2>/dev/null || curl -s -m 5 https://ipinfo.io/ip 2>/dev/null)
    fi
    
    # 如果IP仍然为空，使用本地IP
    if [ -z "<span class="math-inline">IP" \]; then
\# 在某些Alpine系统上，可以通过/proc获取IP
if \[ \-d "/proc/net/fib\_trie" \]; then
IP\=</span>(grep -v "127.0.0.1" /proc/net/fib_trie | grep -E "([0-9]{1,3}\.){3}[0-9]{1,3}" | head -n1 | awk '{print $2}')
        else
            IP="127.0.0.1"
            print_warning "无法获取IP地址，使用本地回环地址"
        fi
    fi
    
    SYSTEM="$OS <span class="math-inline">VERSION"
VERSION\_INFO\=</span>(uname -r)

    # 获取默认网卡 - 针对Alpine优化
    if command -v ip &> /dev/null; then
        DEFAULT_DEVICE=$(ip route | grep default | head -n1 | awk '{print <span class="math-inline">5\}'\)
elif command \-v route &\> /dev/null; then
DEFAULT\_DEVICE\=</span>(route -n | grep 'UG[ \t]' | awk '{print $8}' | head -n1)
    elif [ -d /sys/class/net ]; then
        # 备用方案 - 检查活动的网络接口
        for IFACE in $(ls /sys/class/net/ | grep -v lo); do
            if [ -f "/sys/class/net/<span class="math-inline">IFACE/operstate" \] && \[ "</span>(cat /sys/class/net/$IFACE/operstate)" = "up" ]; then
                DEFAULT_DEVICE="$IFACE"
                break
            fi
        done
    fi

    if [ -z "$DEFAULT_DEVICE" ]; then
        # 获取第一个非lo接口
        if [ -d /sys/class/net ]; then
            for IFACE in $(ls /sys/class/net/ | grep -v lo); do
                DEFAULT_DEVICE="$IFACE"
                break
            done
        fi
        
        # 如果仍然为空
        if [ -z "$DEFAULT_DEVICE" ]; then
            DEFAULT_DEVICE="eth0"
            print_warning "无法确定默认网卡，使用: $DEFAULT_DEVICE"
        fi
    fi
}

# 安装必要的命令
install_dependencies() {
    print_info "安装必要的工具..."
    
    if [[ "$OS" == "alpine" ]]; then
        print_info "安装Alpine Linux依赖..."
        # 更新包列表，避免安装错误
        apk update
        
        # 安装基本工具包和OpenRC需要的包
        apk add --no-cache curl wget bash procps iptables ip6tables
        
        # 检查是否需要安装OpenRC (可能在某些最小化安装中缺失)
        if ! command -v rc-service >/dev/null 2>&1; then
            apk add --no-cache openrc
        fi
        
        # 安装用于防火墙持久化的工具
        apk add --no-cache iptables-persistent || apk add --no-cache iptables
    elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        apt-get update -qq
        apt-get install -y -qq curl wget
    elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
        yum install -y curl wget
    elif [[ "$OS" == "arch" || "$OS" == "manjaro" ]]; then
        pacman -S --noconfirm curl wget
    else
        print_warning "不支持的操作系统，请确保已安装: curl wget"
    fi
}

# 注册到自动发现服务
register_autodiscovery() {
    local REGISTRATION_KEY="$1"
    local SERVER_URL="<span class="math-inline">2"
print\_info "正在注册到自动发现服务\.\.\."
\# 构建注册请求
REGISTER\_RESPONSE\=</span>(curl -s -X POST "${SERVER_URL}/autodiscovery/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"hostname\": \"$HOSTNAME\",
            \"ip\": \"$IP\",
            \"system\": \"$SYSTEM\",
            \"version\": \"$VERSION_INFO\",
            \"device\": \"$DEFAULT_DEVICE\",
            \"registrationKey\": \"$REGISTRATION_KEY\"
        }")

    # 检查注册结果
    if echo "<span class="math-inline">REGISTER\_RESPONSE" \| grep \-q "success\\"\:true"; then
print\_success "自动发现注册成功"
\# 尝试解析返回的数据
SID\=</span>(echo "<span class="math-inline">REGISTER\_RESPONSE" \| grep \-o '"sid"\:"\[^"\]\*' \| cut \-d'"' \-f4\)
API\_KEY\=</span>(echo "<span class="math-inline">REGISTER\_RESPONSE" \| grep \-o '"apiKey"\:"\[^"\]\*' \| cut \-d'"' \-f4\)
APPROVED\=</span>(echo "$REGISTER_RESPONSE" | grep -o '"approved":[^,}]*' | cut -d':' -f2)

        print_info "服务器ID: $SID"
        print_info "API密钥: $API_KEY"

        if [ "$APPROVED" = "true" ]; then
            print_info "服务器已自动批准"
        else
            print_warning "服务器需要管理员审核后才能使用"
        fi

        return 0
    else
        print_error "自动发现注册失败"
        print_error "服务器响应: <span class="math-inline">REGISTER\_RESPONSE"
return 1
fi
\}
\# 检测系统架构
detect\_architecture\(\) \{
print\_info "检测系统架构\.\.\."
OS\_TYPE\=</span>(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    # 更完善的架构映射
    case "$ARCH" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        i386|i486|i586|i686)
            ARCH="386"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7*|armhf)
            ARCH="arm7"
            ;;
        arm*)
            # 检测ARM版本 - 针对Alpine改进
            if grep -q "v7" /proc/cpuinfo 2>/dev/null; then
                ARCH="arm7"
            elif grep -q "v6" /proc/cpuinfo 2>/dev/null; then
                ARCH="arm6" # 增加对ARMv6的支持
            else
                # 通过查看CPU特性进一步确定
                if grep -q "aarch64" /proc/cpuinfo 2>/dev/null; then
                    ARCH="arm64"
                else
                    ARCH="arm64" # 默认使用arm64
                fi
            fi
            ;;
        *)
            print_warning "未知架构: $ARCH，默认使用amd64"
            ARCH="amd64"
            ;;
    esac

    # Darwin系统特殊处理
    if [ "$OS_TYPE" = "darwin" ]; then
        # macOS只支持amd64和arm64
        if [ "$ARCH" != "amd64" ] && [ "$ARCH" != "arm64" ]; then
            ARCH="amd64"
        fi
    fi

    # 添加代理支持
    if [ ! -z "$HTTP_PROXY" ]; then
        export http_proxy="$HTTP_PROXY"
        export https_proxy="$HTTP_PROXY"
    fi

    if [ ! -z "$HTTPS_PROXY" ]; then
        export https_proxy="$HTTPS_PROXY"
    fi

    print_info "检测到系统: $OS_TYPE, 架构: $ARCH"
}

# 停止服务 - 增强对Alpine的支持
stop_service() {
    print_info "尝试停止已存在的服务..."
    
    if [ "$OS" == "alpine" ] && command -v rc-service &> /dev/null; then
        # 对Alpine使用OpenRC
        rc-service nekonekostatus stop 2>/dev/null || true
    elif command -v systemctl &> /dev/null; then
        # 对于使用systemd的系统
        systemctl stop nekonekostatus 2>/dev/null || true
    elif [ -f /etc/init.d/nekonekostatus ]; then
        # 对于使用SysV init的系统
        /etc/init.d/nekonekostatus stop 2>/dev/null ||
