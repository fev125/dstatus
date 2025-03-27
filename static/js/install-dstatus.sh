#!/bin/bash

# DStatus客户端一键安装/管理脚本
# 1. 此脚本用于安装和管理DStatus客户端(neko-status)，支持自动发现功能
# 2. 支持通过注册密钥自动注册到服务器
# 3. 提供完整的安装、启动、停止、重启、卸载功能
# 修改时间: 2023-11-01

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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

# 显示横幅
show_banner() {
    clear
    echo -e "${CYAN}${BOLD}"
    echo "====================================="
    echo "    DStatus 客户端管理工具          "
    echo "====================================="
    echo -e "${NC}"
}

# 显示命令行用法
show_usage() {
    echo -e "${CYAN}${BOLD}DStatus 客户端管理工具 - 命令行用法${NC}"
    echo "支持以下命令行参数:"
    echo "------------------------"
    echo -e "${GREEN}./install-dstatus.sh${NC} - 启动交互式菜单"
    echo -e "${GREEN}./install-dstatus.sh install 注册密钥 服务器URL${NC} - 安装客户端"
    echo -e "${GREEN}./install-dstatus.sh start${NC} - 启动服务"
    echo -e "${GREEN}./install-dstatus.sh stop${NC} - 停止服务"
    echo -e "${GREEN}./install-dstatus.sh restart${NC} - 重启服务"
    echo -e "${GREEN}./install-dstatus.sh status${NC} - 查看服务状态"
    echo -e "${GREEN}./install-dstatus.sh uninstall${NC} - 卸载服务"
    echo -e "${GREEN}./install-dstatus.sh help${NC} - 显示此帮助信息"
    echo "------------------------"
    echo "示例: ./install-dstatus.sh install abc123 https://your-server.com"
    echo ""
}

# 检查是否为root用户
check_root() {
    if [ "$(id -u)" != "0" ]; then
        print_error "此脚本需要root权限运行"
        print_info "请尝试以下方法之一:"
        print_info "1. 使用root用户直接运行此脚本"
        print_info "2. 使用sudo运行此脚本: sudo $0"
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

    print_info "系统信息:"
    print_info "  主机名: $HOSTNAME"
    print_info "  IP地址: $IP"
    print_info "  系统: $SYSTEM"
    print_info "  默认网卡: $DEFAULT_DEVICE"
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

    # 检查wget是否已安装
    if ! command -v wget &> /dev/null; then
        print_error "无法安装wget，请手动安装后重试"
        exit 1
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
            print_info "服务器已自动批准，无需等待审核"
        else
            print_warning "服务器需要管理员审核后才能使用"
            print_info "请联系管理员审核您的服务器"
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
            print_warning "未知架构: $ARCH，将尝试使用amd64版本"
            ARCH="amd64"
            ;;
    esac

    # Darwin系统特殊处理
    if [ "$OS_TYPE" = "darwin" ]; then
        # macOS只支持amd64和arm64
        if [ "$ARCH" != "amd64" ] && [ "$ARCH" != "arm64" ]; then
            print_warning "Darwin系统不支持 $ARCH 架构，将尝试使用amd64"
            ARCH="amd64"
        fi
    fi
    
    # 添加代理支持
    if [ ! -z "$HTTP_PROXY" ]; then
        print_info "检测到HTTP代理: $HTTP_PROXY"
        export http_proxy="$HTTP_PROXY"
        export https_proxy="$HTTP_PROXY"
    fi

    if [ ! -z "$HTTPS_PROXY" ]; then
        print_info "检测到HTTPS代理: $HTTPS_PROXY"
        export https_proxy="$HTTPS_PROXY"
    fi

    print_info "检测到系统: $OS_TYPE, 架构: $ARCH"
}

# 下载neko-status客户端
download_neko_status() {
    local SERVER_URL="$1"
    
    # 构建下载URL
    BASE_URL="https://github.com/fev125/dstatus/releases/download/v1.0.1"
    DOWNLOAD_URL="${BASE_URL}/neko-status_${OS_TYPE}_${ARCH}"
    SERVER_ARCH_URL="${SERVER_URL}/neko-status_${OS_TYPE}_${ARCH}"
    print_info "使用下载链接: $DOWNLOAD_URL"

    # 增强下载逻辑，添加失败重试和回退机制
    download_file() {
        local url=$1
        local output=$2
        local retries=3
        local success=false
        
        for i in $(seq 1 $retries); do
            print_info "尝试下载 (${i}/${retries})..."
            if wget -q --show-progress "$url" -O "$output"; then
                chmod +x "$output"
                success=true
                break
            else
                print_warning "下载失败，等待重试..."
                sleep 2
            fi
        done
        
        if [ "$success" = true ]; then
            return 0
        else
            return 1
        fi
    }

    # 网络连接检测
    print_info "检测网络连接..."
    if ! ping -c 1 github.com >/dev/null 2>&1 && ! curl -s --connect-timeout 5 https://github.com >/dev/null; then
        print_warning "无法连接到GitHub，将尝试从服务器下载"
        # 尝试从服务器下载对应架构版本
        if ! download_file "$SERVER_ARCH_URL" "/usr/bin/neko-status"; then
            print_info "服务器上没有对应架构版本，尝试下载通用版本..."
            download_file "${SERVER_URL}/neko-status" "/usr/bin/neko-status"
        fi
    else
        # 正常从GitHub下载
        if ! download_file "$DOWNLOAD_URL" "/usr/bin/neko-status"; then
            # 下载失败，尝试从服务器下载
            print_warning "从GitHub下载失败，尝试从服务器下载..."
            if ! download_file "$SERVER_ARCH_URL" "/usr/bin/neko-status"; then
                print_info "尝试下载通用版本..."
                if ! download_file "${SERVER_URL}/neko-status" "/usr/bin/neko-status"; then
                    print_error "下载neko-status失败，请检查网络连接或手动下载"
                    return 1
                fi
            fi
        fi
    fi

    # 验证可执行文件
    if ! /usr/bin/neko-status -v >/dev/null 2>&1; then
        print_warning "neko-status可能不适用于当前系统，尝试下载其他架构版本..."
        
        # 尝试其他架构
        if [ "$ARCH" = "amd64" ]; then
            # 尝试386架构
            print_info "尝试386架构..."
            download_file "${BASE_URL}/neko-status_${OS_TYPE}_386" "/usr/bin/neko-status"
        elif [ "$ARCH" = "arm64" ]; then
            # 尝试arm7架构
            print_info "尝试arm7架构..."
            download_file "${BASE_URL}/neko-status_${OS_TYPE}_arm7" "/usr/bin/neko-status"
        fi
    fi

    return 0
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."
    if command -v ufw &> /dev/null; then
        # Ubuntu/Debian with UFW
        ufw allow 9999/tcp >/dev/null 2>&1
        print_info "已配置UFW防火墙规则"
    elif command -v firewall-cmd &> /dev/null; then
        # CentOS/RHEL with firewalld
        firewall-cmd --permanent --add-port=9999/tcp >/dev/null 2>&1
        firewall-cmd --reload >/dev/null 2>&1
        print_info "已配置firewalld防火墙规则"
    elif command -v iptables &> /dev/null; then
        # Generic iptables
        iptables -C INPUT -p tcp --dport 9999 -j ACCEPT >/dev/null 2>&1 || iptables -A INPUT -p tcp --dport 9999 -j ACCEPT
        if command -v iptables-save &> /dev/null; then
            iptables-save > /etc/iptables.rules 2>/dev/null
            print_info "已配置iptables防火墙规则"
        else
            print_warning "已添加iptables规则，但可能在重启后失效"
        fi
    else
        print_warning "未检测到支持的防火墙系统，请手动配置防火墙以允许9999端口"
    fi
}

# 创建系统服务
create_service() {
    local API_KEY="$1"
    
    # 停止现有服务
    stop_service
    
    # 创建配置目录
    mkdir -p /etc/neko-status/
    
    # 创建配置文件
    print_info "创建配置文件..."
    cat > /etc/neko-status/config.yaml <<EOF
key: ${API_KEY}
port: 9999
debug: false
EOF
    
    # 创建systemd服务 (对于使用systemd的系统)
    if command -v systemctl &> /dev/null; then
        print_info "创建systemd服务..."
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
        print_info "创建init.d服务..."
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
        print_warning "未检测到支持的服务管理系统，将使用简单的启动脚本"
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
    print_info "启动DStatus客户端服务..."
    
    if command -v systemctl &> /dev/null; then
        systemctl start nekonekostatus
        systemctl enable nekonekostatus >/dev/null 2>&1
        if systemctl is-active --quiet nekonekostatus; then
            print_success "服务启动成功"
        else
            print_error "服务启动失败"
            return 1
        fi
    elif [ -f /etc/init.d/nekonekostatus ]; then
        /etc/init.d/nekonekostatus start
        print_success "服务启动成功"
    elif [ -f /usr/local/bin/nekonekostatus-start ]; then
        /usr/local/bin/nekonekostatus-start
        print_success "服务启动成功"
    else
        print_error "未安装服务，请先安装DStatus客户端"
        return 1
    fi
    
    return 0
}

# 停止服务
stop_service() {
    print_info "停止DStatus客户端服务..."
    
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
    
    print_success "服务已停止"
    return 0
}

# 重启服务
restart_service() {
    print_info "重启DStatus客户端服务..."
    
    stop_service
    start_service
    
    return 0
}

# 卸载服务
uninstall_service() {
    print_info "卸载DStatus客户端..."
    
    # 先停止服务
    stop_service
    
    # 删除服务相关文件
    if command -v systemctl &> /dev/null; then
        systemctl disable nekonekostatus >/dev/null 2>&1
        rm -f /etc/systemd/system/nekonekostatus.service
        systemctl daemon-reload
    elif [ -f /etc/init.d/nekonekostatus ]; then
        update-rc.d nekonekostatus remove >/dev/null 2>&1 || chkconfig nekonekostatus off >/dev/null 2>&1
        rm -f /etc/init.d/nekonekostatus
    elif [ -f /usr/local/bin/nekonekostatus-start ]; then
        rm -f /usr/local/bin/nekonekostatus-start
        rm -f /usr/local/bin/nekonekostatus-stop
    fi
    
    # 删除程序和配置文件
    rm -f /usr/bin/neko-status
    rm -rf /etc/neko-status
    
    print_success "DStatus客户端已成功卸载"
    return 0
}

# 安装DStatus客户端
install_dstatus_client() {
    local REGISTRATION_KEY="$1"
    local SERVER_URL="$2"
    
    # 检查参数
    if [ -z "$REGISTRATION_KEY" ] || [ -z "$SERVER_URL" ]; then
        print_error "注册密钥和服务器URL不能为空"
        return 1
    fi
    
    # 去除URL末尾的斜杠
    SERVER_URL=${SERVER_URL%/}
    
    print_info "使用服务器: $SERVER_URL"
    print_info "使用注册密钥: $REGISTRATION_KEY"
    
    # 安装必要的命令
    install_dependencies
    
    # 注册到自动发现服务
    if ! register_autodiscovery "$REGISTRATION_KEY" "$SERVER_URL"; then
        print_error "注册失败，安装中止"
        return 1
    fi
    
    # 检测系统架构
    detect_architecture
    
    # 下载neko-status客户端
    if ! download_neko_status "$SERVER_URL"; then
        print_error "下载neko-status失败，安装中止"
        return 1
    fi
    
    # 创建系统服务
    create_service "$API_KEY"
    
    # 配置防火墙
    configure_firewall
    
    # 启动服务
    if start_service; then
        print_success "DStatus 客户端安装完成!"
        print_info "服务器信息:"
        print_info "  主机名: $HOSTNAME"
        print_info "  IP地址: $IP"
        print_info "  系统: $SYSTEM"
        print_info "  网卡: $DEFAULT_DEVICE"
        print_info "  API端口: 9999"
        
        if command -v systemctl &> /dev/null; then
            print_info "客户端状态: $(systemctl is-active nekonekostatus)"
            print_info "客户端日志: journalctl -u nekonekostatus"
        elif [ -f /etc/init.d/nekonekostatus ]; then
            print_info "客户端状态: $(/etc/init.d/nekonekostatus status || echo '未知')"
            print_info "客户端日志: 请检查系统日志"
        else
            print_info "客户端日志: /var/log/nekonekostatus.log"
        fi
        
        print_info "客户端配置文件: /etc/neko-status/config.yaml"
        return 0
    else
        print_error "服务启动失败，请检查日志"
        return 1
    fi
}

# 查看服务状态
check_status() {
    print_info "检查DStatus客户端状态..."
    
    if [ ! -f "/usr/bin/neko-status" ]; then
        print_error "DStatus客户端未安装"
        return 1
    fi
    
    print_info "客户端版本: $(/usr/bin/neko-status -v 2>&1 || echo '未知')"
    
    if command -v systemctl &> /dev/null; then
        if systemctl is-active --quiet nekonekostatus; then
            print_success "服务状态: 运行中"
            print_info "启动时间: $(systemctl show nekonekostatus -p ActiveEnterTimestamp | cut -d= -f2)"
        else
            print_error "服务状态: 未运行"
        fi
    elif [ -f /etc/init.d/nekonekostatus ]; then
        if /etc/init.d/nekonekostatus status >/dev/null 2>&1; then
            print_success "服务状态: 运行中"
        else
            print_error "服务状态: 未运行"
        fi
    elif [ -f /var/run/nekonekostatus.pid ] && kill -0 $(cat /var/run/nekonekostatus.pid) 2>/dev/null; then
        print_success "服务状态: 运行中"
    else
        print_error "服务状态: 未运行"
    fi
    
    print_info "配置文件: /etc/neko-status/config.yaml"
    print_info "API密钥: $(grep 'key:' /etc/neko-status/config.yaml 2>/dev/null | awk '{print $2}' || echo '未找到')"
    print_info "API端口: $(grep 'port:' /etc/neko-status/config.yaml 2>/dev/null | awk '{print $2}' || echo '9999')"
    
    return 0
}

# 显示主菜单
show_menu() {
    show_banner
    echo "请选择操作:"
    echo "------------------------"
    echo "1. 安装DStatus客户端"
    echo "2. 启动服务"
    echo "3. 停止服务"
    echo "4. 重启服务"
    echo "5. 查看状态"
    echo "6. 卸载服务"
    echo "------------------------"
    echo "0. 退出脚本"
    echo ""
    echo -n "请输入选项 [0-6]: "
    read -r choice
    
    case $choice in
        1)
            show_banner
            echo "安装DStatus客户端"
            echo "------------------------"
            echo -n "请输入注册密钥: "
            read -r reg_key
            echo -n "请输入服务器URL: "
            read -r server_url
            
            if [ -z "$reg_key" ] || [ -z "$server_url" ]; then
                print_error "注册密钥和服务器URL不能为空"
                press_any_key
                show_menu
                return
            fi
            
            check_root
            get_system_info
            install_dstatus_client "$reg_key" "$server_url"
            press_any_key
            show_menu
            ;;
        2)
            check_root
            start_service
            press_any_key
            show_menu
            ;;
        3)
            check_root
            stop_service
            press_any_key
            show_menu
            ;;
        4)
            check_root
            restart_service
            press_any_key
            show_menu
            ;;
        5)
            check_status
            press_any_key
            show_menu
            ;;
        6)
            show_banner
            echo "卸载DStatus客户端"
            echo "------------------------"
            echo -n "确定要卸载DStatus客户端吗？(y/n): "
            read -r confirm
            
            if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                check_root
                uninstall_service
            else
                print_info "已取消卸载"
            fi
            
            press_any_key
            show_menu
            ;;
        0)
            clear
            exit 0
            ;;
        *)
            print_error "无效的选项，请重新选择"
            press_any_key
            show_menu
            ;;
    esac
}

# 等待用户按任意键继续
press_any_key() {
    echo ""
    echo -n "按任意键继续..."
    read -r -n 1
    echo ""
}

# 开始执行脚本
main() {
    # 检查命令行参数
    if [ "$#" -ge 1 ]; then
        case "$1" in
            install)
                if [ "$#" -lt 3 ]; then
                    print_error "使用方法: $0 install 注册密钥 服务器URL"
                    show_usage
                    exit 1
                fi
                check_root
                get_system_info
                install_dstatus_client "$2" "$3"
                ;;
            start)
                check_root
                start_service
                ;;
            stop)
                check_root
                stop_service
                ;;
            restart)
                check_root
                restart_service
                ;;
            status)
                check_status
                ;;
            uninstall)
                check_root
                uninstall_service
                ;;
            help)
                show_usage
                exit 0
                ;;
            *)
                print_error "未知的命令: $1"
                show_usage
                show_menu
                ;;
        esac
    else
        # 无参数，先显示帮助信息再显示菜单
        show_usage
        echo "按Enter键继续进入交互式菜单..."
        read
        show_menu
    fi
}

# 执行主函数
main "$@" 