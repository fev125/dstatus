#!/bin/bash

# DStatus客户端一键安装脚本
# 1. 此脚本用于安装DStatus客户端(neko-status)，支持自动发现功能
# 2. 支持通过注册密钥自动注册到服务器
# 3. 支持多系统多架构
# 4. 支持安装和更新两种模式
# 修改时间: 2024-06-26
# Alpine优化版本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# 打印带颜色的信息
print_info() {
    echo -e "${BLUE}[信息]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[成功]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[警告]${NC} $1"
}

print_error() {
    echo -e "${RED}[错误]${NC} $1"
}

# 显示使用帮助
show_usage() {
    echo "DStatus客户端安装/更新脚本"
    echo ""
    echo "使用方法:"
    echo "  全新安装: sudo $0 install <注册密钥> <服务器URL>"
    echo "  更新客户端: sudo $0 update [服务器URL]"
    echo "  交互模式: sudo $0"
    echo ""
    echo "示例:"
    echo "  sudo $0 install abc123 https://status.example.com"
    echo "  sudo $0 update https://status.example.com"
    echo "  sudo $0 update  # 使用配置文件中的服务器URL"
    echo ""
}

# 检查是否为root用户
check_root() {
    if [ "$(id -u)" != "0" ]; then
        print_error "此脚本需要root权限运行"
        show_usage
        exit 1
    fi
}

# 检查是否已安装
check_existing_installation() {
    if [ -f "/etc/neko-status/config.yaml" ] && [ -f "/usr/bin/neko-status" ]; then
        return 0  # 已安装
    else
        return 1  # 未安装
    fi
}

# 读取现有配置
read_existing_config() {
    if [ -f "/etc/neko-status/config.yaml" ]; then
        EXISTING_API_KEY=$(grep "^key:" /etc/neko-status/config.yaml | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        EXISTING_PORT=$(grep "^port:" /etc/neko-status/config.yaml | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        EXISTING_DEBUG=$(grep "^debug:" /etc/neko-status/config.yaml | cut -d' ' -f2 | tr -d '"' | tr -d "'")

        print_info "读取到现有配置:"
        print_info "  API密钥: ${EXISTING_API_KEY:0:8}..."
        print_info "  端口: ${EXISTING_PORT:-9999}"
        print_info "  调试模式: ${EXISTING_DEBUG:-false}"

        return 0
    else
        print_warning "未找到现有配置文件"
        return 1
    fi
}

# 简化的错误处理函数
die() {
    print_error "$1"
    exit "${2:-1}"
}

# 统一的初始化函数
init_environment() {
    check_root
    get_system_info
    detect_architecture
}

# 通用的参数验证
validate_install_params() {
    [ -n "$1" ] && [ -n "$2" ] || die "注册密钥和服务器URL不能为空"
}

# 获取系统信息
get_system_info() {
    # 检查系统类型
    if [ -f /etc/alpine-release ]; then
        OS="alpine"
        VERSION=$(cat /etc/alpine-release)
        print_info "检测到系统: Alpine Linux $VERSION"
    elif [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        print_info "检测到系统: $OS $VERSION"
    else
        print_error "无法确定操作系统类型"
        exit 1
    fi

    # 获取系统信息
    HOSTNAME=$(hostname)

    # 更可靠的IP获取方法，尤其对于Alpine系统
    IP=$(curl -s -m 5 https://api.ipify.org || curl -s -m 5 https://ipinfo.io/ip || hostname -I 2>/dev/null | awk '{print $1}' || ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v 127.0.0.1 | head -n1)

    # IP获取失败时的后备方案
    if [ -z "$IP" ]; then
        if command -v ifconfig >/dev/null 2>&1; then
            IP=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -n1 | awk '{print $2}' | cut -d: -f2)
        fi
        # 如果仍然无法获取IP，使用本地回环地址
        if [ -z "$IP" ]; then
            IP="127.0.0.1"
            print_warning "无法获取外部IP，使用本地IP: $IP"
        fi
    fi

    SYSTEM="$OS $VERSION"
    VERSION_INFO=$(uname -r)

    # 获取默认网卡 - 针对Alpine优化
    if command -v ip &> /dev/null; then
        DEFAULT_DEVICE=$(ip route | grep default | head -n1 | awk '{print $5}')
    elif command -v route &> /dev/null; then
        DEFAULT_DEVICE=$(route -n | grep 'UG[ \t]' | awk '{print $8}' | head -n1)
    elif [ -d /sys/class/net ]; then
        # 备用方案 - 检查活动的网络接口
        for IFACE in $(ls /sys/class/net/ | grep -v lo); do
            if [ -f "/sys/class/net/$IFACE/operstate" ] && [ "$(cat /sys/class/net/$IFACE/operstate)" = "up" ]; then
                DEFAULT_DEVICE="$IFACE"
                break
            fi
        done
    fi

    if [ -z "$DEFAULT_DEVICE" ]; then
        DEFAULT_DEVICE="eth0"
        print_warning "无法确定默认网卡，使用: $DEFAULT_DEVICE"
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
    local SERVER_URL="$2"

    print_info "正在注册到自动发现服务..."

    # 构建注册请求
    REGISTER_RESPONSE=$(curl -s -X POST "${SERVER_URL}/autodiscovery/register" \
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
    if echo "$REGISTER_RESPONSE" | grep -q "success\":true"; then
        print_success "自动发现注册成功"

        # 尝试解析返回的数据
        SID=$(echo "$REGISTER_RESPONSE" | grep -o '"sid":"[^"]*' | cut -d'"' -f4)
        API_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"apiKey":"[^"]*' | cut -d'"' -f4)
        APPROVED=$(echo "$REGISTER_RESPONSE" | grep -o '"approved":[^,}]*' | cut -d':' -f2)

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
        print_error "服务器响应: $REGISTER_RESPONSE"
        return 1
    fi
}

# 检测系统架构
detect_architecture() {
    print_info "检测系统架构..."
    OS_TYPE=$(uname -s | tr '[:upper:]' '[:lower:]')
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
        /etc/init.d/nekonekostatus stop 2>/dev/null || true
    elif [ -f /usr/local/bin/nekonekostatus-stop ]; then
        # 对于使用自定义脚本的系统
        /usr/local/bin/nekonekostatus-stop 2>/dev/null || true
    else
        # 尝试通过进程查找并关闭
        pkill -f "neko-status -c /etc/neko-status/config.yaml" 2>/dev/null || true
    fi

    # 强制结束可能残留的进程
    pkill -9 -f "neko-status" 2>/dev/null || true

    # 等待进程完全退出
    sleep 2

    # 检查进程是否完全停止
    if pgrep -f "neko-status" > /dev/null; then
        print_warning "无法完全停止neko-status进程，将尝试强制停止"
        pkill -9 -f "neko-status" 2>/dev/null || true
        sleep 1
    fi
}

# 下载neko-status客户端
download_neko_status() {
    local SERVER_URL="$1"
    local TEMP_FILE="/tmp/neko-status.new"

    # 获取客户端下载链接前缀
    # 先尝试从服务器获取链接前缀
    DOWNLOAD_PREFIX=""

    # 尝试从服务器获取链接前缀
    print_info "从服务器获取下载链接前缀..."
    SERVER_PREFIX_RESPONSE=$(curl -s -m 5 "${SERVER_URL}/api/client/download-prefix" || echo "")

    if [ -n "$SERVER_PREFIX_RESPONSE" ] && echo "$SERVER_PREFIX_RESPONSE" | grep -q "url"; then
        # 从响应中提取链接前缀
        DOWNLOAD_PREFIX=$(echo "$SERVER_PREFIX_RESPONSE" | grep -o '"url":"[^"]*' | cut -d'"' -f4)
        print_info "从服务器获取到下载链接前缀: $DOWNLOAD_PREFIX"
    else
        # 使用默认链接前缀
        DOWNLOAD_PREFIX="https://github.com/fev125/dstatus/releases/download/v1.1"
        print_info "使用默认下载链接前缀: $DOWNLOAD_PREFIX"
    fi

    # 构建下载URL
    DOWNLOAD_URL="${DOWNLOAD_PREFIX}/neko-status_${OS_TYPE}_${ARCH}"
    SERVER_ARCH_URL="${SERVER_URL}/neko-status_${OS_TYPE}_${ARCH}"

    print_info "使用下载链接: $DOWNLOAD_URL"
    print_info "备用下载链接: $SERVER_ARCH_URL"

    # 确保所有旧进程停止
    stop_service

    # 尝试从不同源下载
    print_info "开始下载..."

    # 使用更安全的下载方法，显示进度
    if wget -q --show-progress --timeout=30 --tries=3 "$DOWNLOAD_URL" -O "$TEMP_FILE"; then
        print_success "从GitHub下载成功"
    elif wget -q --show-progress --timeout=30 --tries=3 "$SERVER_ARCH_URL" -O "$TEMP_FILE"; then
        print_success "从服务器下载架构版本成功"
    elif wget -q --show-progress --timeout=30 --tries=3 "${SERVER_URL}/neko-status" -O "$TEMP_FILE"; then
        print_success "从服务器下载通用版本成功"
    elif curl -s -f -L --connect-timeout 30 --retry 3 "$DOWNLOAD_URL" -o "$TEMP_FILE"; then
        print_success "使用curl从GitHub下载成功"
    elif curl -s -f -L --connect-timeout 30 --retry 3 "$SERVER_ARCH_URL" -o "$TEMP_FILE"; then
        print_success "使用curl从服务器下载架构版本成功"
    elif curl -s -f -L --connect-timeout 30 --retry 3 "${SERVER_URL}/neko-status" -o "$TEMP_FILE"; then
        print_success "使用curl从服务器下载通用版本成功"
    else
        print_error "所有下载尝试均失败"
        return 1
    fi

    # 检查下载文件是否为空
    if [ ! -s "$TEMP_FILE" ]; then
        print_error "下载文件为空，下载失败"
        return 1
    fi

    # 安装文件
    mkdir -p /usr/bin
    mv "$TEMP_FILE" /usr/bin/neko-status
    chmod +x /usr/bin/neko-status

    # 验证可执行文件
    if ! /usr/bin/neko-status -v >/dev/null 2>&1; then
        print_error "安装失败，二进制文件无法执行"
        return 1
    fi

    print_success "安装neko-status二进制文件成功"
    return 0
}

# 配置防火墙 - 改进Alpine支持
configure_firewall() {
    print_info "配置防火墙规则..."

    # 对Alpine系统的特殊处理
    if [ "$OS" == "alpine" ]; then
        # 确保iptables模块已加载
        modprobe -q iptables || true

        # 添加防火墙规则
        iptables -C INPUT -p tcp --dport 9999 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 9999 -j ACCEPT

        # 保存iptables规则 - 针对Alpine的几种可能情况
        if command -v iptables-save >/dev/null 2>&1; then
            # 尝试直接保存
            mkdir -p /etc/iptables 2>/dev/null
            iptables-save > /etc/iptables/rules.v4 2>/dev/null || true

            # 确保在启动时恢复规则
            if [ ! -f /etc/local.d/iptables.start ]; then
                mkdir -p /etc/local.d
                cat > /etc/local.d/iptables.start <<EOF
#!/bin/sh
if [ -f /etc/iptables/rules.v4 ]; then
    iptables-restore < /etc/iptables/rules.v4
fi
EOF
                chmod +x /etc/local.d/iptables.start

                # 确保local服务已启用
                if command -v rc-update >/dev/null 2>&1; then
                    rc-update add local default 2>/dev/null || true
                fi
            fi
        fi
    elif command -v ufw &> /dev/null; then
        # Ubuntu/Debian with UFW
        ufw allow 9999/tcp >/dev/null 2>&1
    elif command -v firewall-cmd &> /dev/null; then
        # CentOS/RHEL with firewalld
        firewall-cmd --permanent --add-port=9999/tcp >/dev/null 2>&1
        firewall-cmd --reload >/dev/null 2>&1
    elif command -v iptables &> /dev/null; then
        # Generic iptables
        iptables -C INPUT -p tcp --dport 9999 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 9999 -j ACCEPT
    fi

    print_success "防火墙配置完成"
}

# 创建系统服务 - 增强Alpine支持
create_service() {
    local API_KEY="$1"
    local PRESERVE_CONFIG="$2"

    # 创建配置目录
    mkdir -p /etc/neko-status/

    # 创建或更新配置文件
    if [ "$PRESERVE_CONFIG" = "true" ] && [ -f "/etc/neko-status/config.yaml" ]; then
        print_info "保留现有配置文件"
        # 验证配置文件格式
        if ! grep -q "^key:" /etc/neko-status/config.yaml; then
            print_warning "配置文件格式异常，将重新创建"
            PRESERVE_CONFIG="false"
        fi
    fi

    if [ "$PRESERVE_CONFIG" != "true" ]; then
        print_info "创建新的配置文件"
        cat > /etc/neko-status/config.yaml <<EOF
key: ${API_KEY}
port: 9999
debug: false
EOF
    fi

    # 根据系统类型创建不同服务管理文件
    if [ "$OS" == "alpine" ] && command -v rc-service &> /dev/null; then
        # 为Alpine创建OpenRC服务
        print_info "为Alpine创建OpenRC服务..."

        cat > /etc/init.d/nekonekostatus <<EOF
#!/sbin/openrc-run

name="DStatus客户端"
description="DStatus客户端服务"
command="/usr/bin/neko-status"
command_args="-c /etc/neko-status/config.yaml"
command_background=true
pidfile="/run/nekonekostatus.pid"

depend() {
    need net
    after firewall
}

start_pre() {
    checkpath --directory --owner root:root --mode 0755 /etc/neko-status
}
EOF
        chmod +x /etc/init.d/nekonekostatus

        # 添加到启动项
        rc-update add nekonekostatus default 2>/dev/null

    elif command -v systemctl &> /dev/null; then
        # 创建systemd服务 (对于使用systemd的系统)
        cat > /etc/systemd/system/nekonekostatus.service <<EOF
[Unit]
Description=DStatus客户端服务
After=network.target

[Service]
Restart=always
RestartSec=5
ExecStart=/usr/bin/neko-status -c /etc/neko-status/config.yaml

[Install]
WantedBy=multi-user.target
EOF
        # 重新加载systemd配置
        systemctl daemon-reload

    # 对于使用init.d的系统
    elif [ -d /etc/init.d ]; then
        cat > /etc/init.d/nekonekostatus <<EOF
#!/bin/sh
### BEGIN INIT INFO
# Provides:          nekonekostatus
# Required-Start:    \$network \$remote_fs \$syslog
# Required-Stop:     \$network \$remote_fs \$syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: DStatus客户端服务
### END INIT INFO

DAEMON="/usr/bin/neko-status"
DAEMON_ARGS="-c /etc/neko-status/config.yaml"
PIDFILE="/var/run/nekonekostatus.pid"

start() {
    echo "启动DStatus客户端..."
    start-stop-daemon --start --background --make-pidfile --pidfile \$PIDFILE --exec \$DAEMON -- \$DAEMON_ARGS
    return \$?
}

stop() {
    echo "停止DStatus客户端..."
    start-stop-daemon --stop --pidfile \$PIDFILE
    rm -f \$PIDFILE
    return \$?
}

restart() {
    stop
    sleep 1
    start
}

case "\$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        if [ -f \$PIDFILE ] && kill -0 \$(cat \$PIDFILE) 2>/dev/null; then
            echo "DStatus客户端正在运行"
        else
            echo "DStatus客户端未运行"
            exit 1
        fi
        ;;
    *)
        echo "用法: \$0 {start|stop|restart|status}"
        exit 1
        ;;
esac

exit 0
EOF
        chmod +x /etc/init.d/nekonekostatus
        # 添加到启动项
        update-rc.d nekonekostatus defaults >/dev/null 2>&1 || chkconfig nekonekostatus on >/dev/null 2>&1
    else
        # 创建简单的启动脚本
        print_info "创建基本启动脚本..."

        # 创建目录
        mkdir -p /usr/local/bin /var/log

        cat > /usr/local/bin/nekonekostatus-start <<EOF
#!/bin/sh
nohup /usr/bin/neko-status -c /etc/neko-status/config.yaml > /var/log/nekonekostatus.log 2>&1 &
echo \$! > /var/run/nekonekostatus.pid
EOF
        chmod +x /usr/local/bin/nekonekostatus-start

        cat > /usr/local/bin/nekonekostatus-stop <<EOF
#!/bin/sh
if [ -f /var/run/nekonekostatus.pid ]; then
    kill \$(cat /var/run/nekonekostatus.pid) 2>/dev/null
    rm -f /var/run/nekonekostatus.pid
fi
pkill -f "neko-status" 2>/dev/null || true
EOF
        chmod +x /usr/local/bin/nekonekostatus-stop

        # 如果是Alpine但没有OpenRC，创建启动脚本
        if [ "$OS" == "alpine" ]; then
            # 在开机时自动启动
            if [ ! -f /etc/local.d/nekonekostatus.start ]; then
                mkdir -p /etc/local.d
                cat > /etc/local.d/nekonekostatus.start <<EOF
#!/bin/sh
/usr/local/bin/nekonekostatus-start
EOF
                chmod +x /etc/local.d/nekonekostatus.start

                # 确保local服务已启用
                if command -v rc-update >/dev/null 2>&1; then
                    rc-update add local default 2>/dev/null || true
                fi
            fi
        fi
    fi

    print_success "服务创建完成"
}

# 启动服务 - 增强Alpine支持
start_service() {
    print_info "正在启动服务..."

    if [ "$OS" == "alpine" ] && command -v rc-service &> /dev/null; then
        # 对Alpine使用OpenRC
        rc-service nekonekostatus start
        rc-update add nekonekostatus default >/dev/null 2>&1
    elif command -v systemctl &> /dev/null; then
        systemctl start nekonekostatus
        systemctl enable nekonekostatus >/dev/null 2>&1
    elif [ -f /etc/init.d/nekonekostatus ]; then
        /etc/init.d/nekonekostatus start
    elif [ -f /usr/local/bin/nekonekostatus-start ]; then
        /usr/local/bin/nekonekostatus-start
    fi

    # 验证服务是否正在运行
    sleep 2
    if pgrep -f "neko-status" > /dev/null; then
        print_success "服务已成功启动"
    else
        print_warning "服务启动失败，尝试手动启动"
        nohup /usr/bin/neko-status -c /etc/neko-status/config.yaml > /var/log/nekonekostatus.log 2>&1 &

        # 再次检查
        sleep 2
        if pgrep -f "neko-status" > /dev/null; then
            print_success "服务已手动启动成功"
        else
            print_error "服务无法启动，请检查日志: /var/log/nekonekostatus.log"
        fi
    fi
}

# 通用的安装流程
common_install_steps() {
    local server_url="$1"

    # 去除URL末尾的斜杠
    server_url=${server_url%/}

    install_dependencies

    # 下载客户端
    if ! download_neko_status "$server_url"; then
        die "下载失败，安装中止"
    fi
}

# 全新安装DStatus客户端
install_dstatus() {
    local registration_key="$1"
    local server_url="$2"

    validate_install_params "$registration_key" "$server_url"

    print_info "开始全新安装DStatus客户端..."

    # 注册到自动发现服务
    if ! register_autodiscovery "$registration_key" "$server_url"; then
        die "注册失败，安装中止"
    fi

    # 通用安装步骤
    common_install_steps "$server_url"

    # 创建系统服务（不保留配置）
    create_service "$API_KEY" "false"
    configure_firewall
    start_service

    print_success "DStatus客户端全新安装完成"
    show_installation_info
}

# 更新DStatus客户端
update_dstatus() {
    local server_url="${1:-https://github.com/fev125/dstatus/releases/download/v1.1}"

    print_info "开始更新DStatus客户端..."

    # 读取现有配置
    read_existing_config || die "无法读取现有配置，请使用全新安装模式"

    # 备份现有配置
    local backup_file="/etc/neko-status/config.yaml.backup.$(date +%Y%m%d_%H%M%S)"
    cp /etc/neko-status/config.yaml "$backup_file"
    print_info "配置已备份到: $backup_file"

    # 停止现有服务
    stop_service

    # 通用安装步骤
    if ! common_install_steps "$server_url"; then
        print_error "下载新版本失败，恢复服务..."
        start_service
        exit 1
    fi

    # 创建系统服务（保留配置）
    create_service "$EXISTING_API_KEY" "true"
    start_service

    print_success "DStatus客户端更新完成"
    print_info "配置信息:"
    print_info "  API密钥: ${EXISTING_API_KEY:0:8}... (已保留)"
    print_info "  端口: ${EXISTING_PORT:-9999}"
    print_info "  配置文件: /etc/neko-status/config.yaml"
    print_info "  备份文件: $backup_file"

    show_service_info
}

# 显示安装信息
show_installation_info() {
    print_info "服务器信息:"
    print_info "  主机名: $HOSTNAME"
    print_info "  IP地址: $IP"
    print_info "  系统: $SYSTEM"
    print_info "  API端口: 9999"
    print_info "  服务器ID: $SID"
    print_info "  API密钥: ${API_KEY:0:8}..."
    print_info "配置文件: /etc/neko-status/config.yaml"

    show_service_info
}

# 显示服务信息
show_service_info() {
    # 针对Alpine的特殊提示
    if [ "$OS" == "alpine" ]; then
        print_info "Alpine Linux服务管理:"
        print_info "  - 服务名称: nekonekostatus"
        print_info "  - 启动命令: rc-service nekonekostatus start"
        print_info "  - 停止命令: rc-service nekonekostatus stop"
        print_info "  - 查看状态: rc-service nekonekostatus status"
        print_info "  - 开机自启: rc-update add nekonekostatus default (已自动配置)"
        print_info "  - 日志文件: 使用 'tail -f /var/log/messages' 查看系统日志"
    elif command -v systemctl &> /dev/null; then
        print_info "Systemd服务管理:"
        print_info "  - 服务名称: nekonekostatus"
        print_info "  - 启动命令: systemctl start nekonekostatus"
        print_info "  - 停止命令: systemctl stop nekonekostatus"
        print_info "  - 查看状态: systemctl status nekonekostatus"
        print_info "  - 开机自启: systemctl enable nekonekostatus (已自动配置)"
        print_info "  - 查看日志: journalctl -u nekonekostatus -f"
    else
        print_info "服务管理:"
        print_info "  - 启动命令: /etc/init.d/nekonekostatus start"
        print_info "  - 停止命令: /etc/init.d/nekonekostatus stop"
        print_info "  - 查看状态: /etc/init.d/nekonekostatus status"
    fi
}

# 智能参数处理 - 支持curl管道安装
smart_parameter_handling() {
    # 如果通过curl管道安装且提供了参数，将参数作为默认值
    if [ -n "$1" ] && [ -n "$2" ]; then
        # 检测是否为有效的注册密钥和URL格式
        if [[ "$1" =~ ^[A-Za-z0-9]{8,}$ ]] && [[ "$2" =~ ^https?:// ]]; then
            CURL_REGISTRATION_KEY="$1"
            CURL_SERVER_URL="$2"
            print_info "检测到curl安装参数: 注册密钥=${CURL_REGISTRATION_KEY:0:8}..., 服务器=${CURL_SERVER_URL}"
            return 0
        fi
    fi
    return 1
}

# 增强的交互模式 - 支持curl参数预填
enhanced_interactive_mode() {
    echo ""
    print_info "=== DStatus客户端安装/更新向导 ==="
    echo ""

    if check_existing_installation; then
        print_success "检测到已安装的DStatus客户端"
        read_existing_config
        echo ""
        print_info "请选择操作模式:"
        echo "  1) 更新客户端 (保留现有配置和注册信息)"
        echo "  2) 全新安装 (重新注册，会丢失面板配置)"
        echo "  3) 退出"
        echo ""

        while true; do
            read -p "请输入选择 [1-3]: " choice
            case $choice in
                1)
                    MODE="update"
                    print_info "选择了更新模式"
                    break
                    ;;
                2)
                    MODE="install"
                    print_warning "注意：全新安装会重新注册，面板上的配置将丢失！"
                    read -p "确认继续？[y/N]: " confirm
                    if [[ $confirm =~ ^[Yy]$ ]]; then
                        print_info "选择了全新安装模式"
                        break
                    else
                        print_info "已取消"
                        exit 0
                    fi
                    ;;
                3)
                    print_info "已退出"
                    exit 0
                    ;;
                *)
                    print_error "无效选择，请输入 1-3"
                    ;;
            esac
        done
    else
        print_info "未检测到现有安装，将进行全新安装"
        MODE="install"
    fi

    # 根据模式获取参数
    if [ "$MODE" = "install" ]; then
        echo ""
        # 如果有curl参数，提供默认值
        if [ -n "$CURL_REGISTRATION_KEY" ]; then
            read -p "请输入注册密钥 [${CURL_REGISTRATION_KEY:0:8}...]: " input_key
            REGISTRATION_KEY="${input_key:-$CURL_REGISTRATION_KEY}"
        else
            read -p "请输入注册密钥: " REGISTRATION_KEY
        fi

        if [ -n "$CURL_SERVER_URL" ]; then
            read -p "请输入服务器URL [$CURL_SERVER_URL]: " input_url
            SERVER_URL="${input_url:-$CURL_SERVER_URL}"
        else
            read -p "请输入服务器URL: " SERVER_URL
        fi

        if [ -z "$REGISTRATION_KEY" ] || [ -z "$SERVER_URL" ]; then
            print_error "注册密钥和服务器URL不能为空"
            exit 1
        fi
    elif [ "$MODE" = "update" ]; then
        echo ""
        read -p "请输入服务器URL (留空使用默认源): " SERVER_URL
        if [ -z "$SERVER_URL" ]; then
            print_info "将使用默认下载源"
        fi
    fi
}

# 主函数
main() {
    # 解析命令行参数
    case "${1:-}" in
        "help"|"-h"|"--help")
            show_usage
            exit 0
            ;;
        "install")
            init_environment
            validate_install_params "$2" "$3"
            install_dstatus "$2" "$3"
            ;;
        "update")
            init_environment
            update_dstatus "$2"
            ;;
        "")
            init_environment
            enhanced_interactive_mode
            case "$MODE" in
                "install") install_dstatus "$REGISTRATION_KEY" "$SERVER_URL" ;;
                "update") update_dstatus "$SERVER_URL" ;;
            esac
            ;;
        *)
            # 智能处理curl管道安装和兼容旧版本
            if smart_parameter_handling "$1" "$2"; then
                init_environment
                enhanced_interactive_mode
                case "$MODE" in
                    "install") install_dstatus "$REGISTRATION_KEY" "$SERVER_URL" ;;
                    "update") update_dstatus "$SERVER_URL" ;;
                esac
            elif [ -n "$1" ] && [ -n "$2" ]; then
                # 兼容旧版本调用方式
                init_environment
                print_warning "检测到旧版本调用方式，建议使用: $0 install $1 $2"
                install_dstatus "$1" "$2"
            else
                die "无效的参数\n$(show_usage)"
            fi
            ;;
    esac
}

# 执行主函数
main "$@"
