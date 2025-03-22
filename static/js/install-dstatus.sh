#!/bin/bash

# DStatus客户端一键安装脚本
# 1. 此脚本用于安装DStatus客户端(neko-status)，支持自动发现功能
# 2. 与原有安装逻辑保持一致，直接下载neko-status二进制文件
# 3. 支持通过注册密钥自动注册到服务器
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

# 检查参数
if [ "$#" -lt 1 ]; then
    print_error "使用方法: $0 注册密钥 [服务器URL]"
    exit 1
fi

REGISTRATION_KEY="$1"
SERVER_URL="$2"

# 如果没有提供服务器URL，使用默认值
if [ -z "$SERVER_URL" ]; then
    print_error "未提供服务器URL，请使用: $0 注册密钥 服务器URL"
    exit 1
fi

# 去除URL末尾的斜杠
SERVER_URL=${SERVER_URL%/}

print_info "使用服务器: $SERVER_URL"
print_info "使用注册密钥: $REGISTRATION_KEY"

# 检查是否为root用户
if [ "$(id -u)" != "0" ]; then
    print_error "此脚本需要root权限运行"
    print_info "请尝试以下方法之一:"
    print_info "1. 使用root用户直接运行此脚本"
    print_info "2. 使用sudo运行此脚本: sudo $0 $REGISTRATION_KEY $SERVER_URL"
    exit 1
fi

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

# 安装必要的命令
print_info "安装必要的工具..."
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    apt-get update -qq
    apt-get install -y -qq curl wget
elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
    yum install -y curl wget
else
    print_warning "不支持的操作系统，请确保已安装: curl wget"
fi

# 注册到自动发现服务
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
    
    # 安装neko-status客户端
    print_info "正在安装neko-status客户端..."
    
    # 检查wget是否已安装
    wget --version || {
        if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
            apt-get install wget -y
        elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "fedora" ]]; then
            yum install wget -y
        fi
    }
    
    # 检查neko-status是否已安装
    /usr/bin/neko-status -v || {
        print_info "下载neko-status..."
        wget "${SERVER_URL}/neko-status" -O /usr/bin/neko-status && chmod +x /usr/bin/neko-status
    }
    
    # 停止现有服务
    systemctl stop nekonekostatus 2>/dev/null || true
    
    # 创建配置目录
    mkdir -p /etc/neko-status/
    
    # 创建配置文件
    print_info "创建配置文件..."
    cat > /etc/neko-status/config.yaml <<EOF
key: ${API_KEY}
port: 9999
debug: false
EOF
    
    # 创建systemd服务
    print_info "创建系统服务..."
    cat > /etc/systemd/system/nekonekostatus.service <<EOF
[Unit]
Description=nekonekostatus

[Service]
Restart=always
RestartSec=5
ExecStart=/usr/bin/neko-status -c /etc/neko-status/config.yaml

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载systemd配置
    systemctl daemon-reload
    
    # 启动服务
    print_info "启动neko-status服务..."
    systemctl start nekonekostatus
    systemctl enable nekonekostatus
    
    # 配置防火墙
    print_info "配置防火墙..."
    if command -v ufw &> /dev/null; then
        # Ubuntu/Debian with UFW
        ufw allow 9999/tcp
        print_info "已配置UFW防火墙规则"
    elif command -v firewall-cmd &> /dev/null; then
        # CentOS/RHEL with firewalld
        firewall-cmd --permanent --add-port=9999/tcp
        firewall-cmd --reload
        print_info "已配置firewalld防火墙规则"
    elif command -v iptables &> /dev/null; then
        # Generic iptables
        iptables -A INPUT -p tcp --dport 9999 -j ACCEPT
        if command -v iptables-save &> /dev/null; then
            iptables-save > /etc/iptables.rules
            print_info "已配置iptables防火墙规则"
        else
            print_warning "已添加iptables规则，但可能在重启后失效"
        fi
    else
        print_warning "未检测到支持的防火墙系统，请手动配置防火墙以允许9999端口"
    fi
    
    print_success "neko-status客户端安装完成!"
    print_info "服务状态: $(systemctl is-active nekonekostatus)"
else
    print_error "自动发现注册失败"
    print_error "服务器响应: $REGISTER_RESPONSE"
    exit 1
fi

print_success "DStatus 客户端安装完成!"
print_info "服务器信息:"
print_info "  主机名: $HOSTNAME"
print_info "  IP地址: $IP"
print_info "  系统: $SYSTEM"
print_info "  网卡: $DEFAULT_DEVICE"
print_info "  API端口: 9999"
print_info "客户端状态: $(systemctl is-active nekonekostatus)"
print_info "客户端配置文件: /etc/neko-status/config.yaml"
print_info "客户端日志: journalctl -u nekonekostatus" 