#!/bin/bash

# DStatus客户端一键安装脚本
# 1. 此脚本用于安装DStatus客户端(neko-status)，支持自动发现功能
# 2. 支持通过注册密钥自动注册到服务器
# 3. 支持多系统多架构
# 修改时间: 2023-11-01

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

# 检查是否为root用户
check_root() {
    if [ "$(id -u)" != "0" ]; then
        print_error "此脚本需要root权限运行"
        print_info "请使用sudo运行此脚本: sudo $0 注册密钥 服务器URL"
        exit 1
    fi
}

# 获取系统信息
get_system_info() {
    # 检查系统类型
    if [ -f /etc/os-release ]; then
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
    IP=$(curl -s https://api.ipify.org || curl -s https://ipinfo.io/ip || hostname -I | awk '{print $1}')
    SYSTEM="$OS $VERSION"
    VERSION_INFO=$(uname -r)

    # 获取默认网卡
    if command -v ip &> /dev/null; then
        DEFAULT_DEVICE=$(ip route | grep default | head -n1 | awk '{print $5}')
    else
        DEFAULT_DEVICE=$(route -n | grep 'UG[ \t]' | awk '{print $8}' | head -n1)
    fi

    if [ -z "$DEFAULT_DEVICE" ]; then
        DEFAULT_DEVICE="eth0"
    fi
}

# 安装必要的命令
install_dependencies() {
    print_info "安装必要的工具..."
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        apt-get update -qq
        apt-get install -y -qq curl wget
    elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
        yum install -y curl wget
    elif [[ "$OS" == "alpine" ]]; then
        apk add curl wget
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
            # 检测ARM版本
            if grep -q "v7" /proc/cpuinfo 2>/dev/null; then
                ARCH="arm7"
            else
                ARCH="arm64" # 默认使用arm64
            fi
            ;;
        *)
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

# 停止服务
stop_service() {
    if command -v systemctl &> /dev/null; then
        systemctl stop nekonekostatus 2>/dev/null
    elif [ -f /etc/init.d/nekonekostatus ]; then
        /etc/init.d/nekonekostatus stop
    elif [ -f /usr/local/bin/nekonekostatus-stop ]; then
        /usr/local/bin/nekonekostatus-stop
    else
        # 尝试通过进程查找并关闭
        pkill -f "neko-status -c /etc/neko-status/config.yaml" 2>/dev/null
    fi
}

# 下载neko-status客户端
download_neko_status() {
    local SERVER_URL="$1"
    local TEMP_FILE="/tmp/neko-status.new"
    
    # 构建下载URL
    BASE_URL="https://github.com/fev125/dstatus/releases/download/v1.0.1"
    DOWNLOAD_URL="${BASE_URL}/neko-status_${OS_TYPE}_${ARCH}"
    SERVER_ARCH_URL="${SERVER_URL}/neko-status_${OS_TYPE}_${ARCH}"
    print_info "使用下载链接: $DOWNLOAD_URL"

    # 确保所有旧进程停止
    print_info "确保旧进程已停止..."
    stop_service
    
    # 强制结束可能残留的进程
    pkill -9 -f "neko-status" 2>/dev/null || true
    
    # 等待进程完全退出
    sleep 2
    
    # 尝试从不同源下载
    if wget -q --show-progress "$DOWNLOAD_URL" -O "$TEMP_FILE"; then
        print_success "从GitHub下载成功"
    elif wget -q --show-progress "$SERVER_ARCH_URL" -O "$TEMP_FILE"; then
        print_success "从服务器下载架构版本成功"
    elif wget -q --show-progress "${SERVER_URL}/neko-status" -O "$TEMP_FILE"; then
        print_success "从服务器下载通用版本成功"
    else
        print_error "所有下载尝试均失败"
        return 1
    fi
    
    # 安装文件
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

# 配置防火墙
configure_firewall() {
    if command -v ufw &> /dev/null; then
        # Ubuntu/Debian with UFW
        ufw allow 9999/tcp >/dev/null 2>&1
    elif command -v firewall-cmd &> /dev/null; then
        # CentOS/RHEL with firewalld
        firewall-cmd --permanent --add-port=9999/tcp >/dev/null 2>&1
        firewall-cmd --reload >/dev/null 2>&1
    elif command -v iptables &> /dev/null; then
        # Generic iptables
        iptables -C INPUT -p tcp --dport 9999 -j ACCEPT >/dev/null 2>&1 || iptables -A INPUT -p tcp --dport 9999 -j ACCEPT
    fi
}

# 创建系统服务
create_service() {
    local API_KEY="$1"
    
    # 创建配置目录
    mkdir -p /etc/neko-status/
    
    # 创建配置文件
    cat > /etc/neko-status/config.yaml <<EOF
key: ${API_KEY}
port: 9999
debug: false
EOF
    
    # 创建systemd服务 (对于使用systemd的系统)
    if command -v systemctl &> /dev/null; then
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

CMD="/usr/bin/neko-status -c /etc/neko-status/config.yaml"
PIDFILE="/var/run/nekonekostatus.pid"

start() {
    echo "启动DStatus客户端..."
    start-stop-daemon --start --background --make-pidfile --pidfile \$PIDFILE --exec \$CMD
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
EOF
        chmod +x /usr/local/bin/nekonekostatus-stop
    fi
}

# 启动服务
start_service() {
    if command -v systemctl &> /dev/null; then
        systemctl start nekonekostatus
        systemctl enable nekonekostatus >/dev/null 2>&1
    elif [ -f /etc/init.d/nekonekostatus ]; then
        /etc/init.d/nekonekostatus start
    elif [ -f /usr/local/bin/nekonekostatus-start ]; then
        /usr/local/bin/nekonekostatus-start
    fi
}

# 安装DStatus客户端
install_dstatus() {
    local REGISTRATION_KEY="$1"
    local SERVER_URL="$2"
    
    # 检查参数
    if [ -z "$REGISTRATION_KEY" ] || [ -z "$SERVER_URL" ]; then
        print_error "使用方法: $0 注册密钥 服务器URL"
        exit 1
    fi
    
    # 去除URL末尾的斜杠
    SERVER_URL=${SERVER_URL%/}
    
    # 检测系统架构
    detect_architecture
    
    # 安装必要的命令
    install_dependencies
    
    # 注册到自动发现服务
    if ! register_autodiscovery "$REGISTRATION_KEY" "$SERVER_URL"; then
        print_error "注册失败，安装中止"
        exit 1
    fi
    
    # 下载neko-status客户端
    if ! download_neko_status "$SERVER_URL"; then
        print_error "下载neko-status失败，安装中止"
        exit 1
    fi
    
    # 创建系统服务
    create_service "$API_KEY"
    
    # 配置防火墙
    configure_firewall
    
    # 启动服务
    start_service
    
    print_success "DStatus客户端安装完成"
    print_info "服务器信息:"
    print_info "  主机名: $HOSTNAME"
    print_info "  IP地址: $IP"
    print_info "  系统: $SYSTEM"
    print_info "  API端口: 9999"
    print_info "配置文件: /etc/neko-status/config.yaml"
    
    exit 0
}

# 主函数
main() {
    # 检查root权限
    check_root
    
    # 获取系统信息
    get_system_info
    
    # 安装服务
    install_dstatus "$1" "$2"
}

# 执行主函数
main "$@" 