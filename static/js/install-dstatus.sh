#!/bin/bash

# DStatus Agent 一键安装脚本
# 支持从旧版 neko-status 迁移
# 支持格式:
#   1. curl ... | sudo bash -s install <注册密钥> <服务器URL>
#   2. curl ... | sudo bash -s -- <注册密钥> <服务器URL> (面板格式)
#   3. curl ... | sudo bash -s <注册密钥> <服务器URL>

# --- 名称定义 ---
NEW_AGENT_BINARY_NAME="dstatus-agent"
NEW_SERVICE_NAME="dstatus"
NEW_CONFIG_DIR="/etc/dstatus-agent"
NEW_CONFIG_FILE="${NEW_CONFIG_DIR}/config.yaml"
NEW_BINARY_PATH="/usr/bin/${NEW_AGENT_BINARY_NAME}"

OLD_AGENT_BINARY_NAME="neko-status" # 用于下载远程的旧文件名
OLD_SERVICE_NAME="nekonekostatus"
OLD_CONFIG_DIR="/etc/neko-status"
OLD_CONFIG_FILE="${OLD_CONFIG_DIR}/config.yaml"
OLD_BINARY_PATH="/usr/bin/${OLD_AGENT_BINARY_NAME}" # 旧的本地路径

# --- 颜色定义 ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'
print_info() { echo -e "${BLUE}[信息]${NC} $1"; }
print_success() { echo -e "${GREEN}[成功]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[警告]${NC} $1"; }
print_error() { echo -e "${RED}[错误]${NC} $1"; }
die() { print_error "$1"; exit "${2:-1}"; }

# --- 辅助函数 ---
check_root() {
    if [ "$(id -u)" != "0" ]; then die "此脚本需要root权限运行"; fi
}

get_system_info() {
    if [ -f /etc/alpine-release ]; then OS_FAMILY="alpine";
    elif [ -f /etc/os-release ]; then . /etc/os-release; OS_FAMILY=$ID;
    else die "无法确定操作系统类型"; fi
    print_info "检测到系统家族: $OS_FAMILY"

    HOSTNAME_VAL=$(hostname)
    IP_ADDR=$(curl -s -m 5 https://api.ipify.org || curl -s -m 5 https://ipinfo.io/ip || hostname -I 2>/dev/null | awk '{print $1}' || ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v 127.0.0.1 | head -n1)
    if [ -z "$IP_ADDR" ]; then IP_ADDR="127.0.0.1"; print_warning "无法获取外部IP，使用本地IP: $IP_ADDR"; fi

    SYSTEM_INFO_OS_NAME=$(uname -s)
    SYSTEM_INFO_OS_VERSION=$(uname -r)

    if command -v ip &> /dev/null; then DEFAULT_NETWORK_DEVICE=$(ip route | grep default | head -n1 | awk '{print $5}');
    elif command -v route &> /dev/null; then DEFAULT_NETWORK_DEVICE=$(route -n | grep 'UG[ \t]' | awk '{print $8}' | head -n1); fi
    if [ -z "$DEFAULT_NETWORK_DEVICE" ]; then DEFAULT_NETWORK_DEVICE="eth0"; print_warning "无法确定默认网卡，使用: $DEFAULT_NETWORK_DEVICE"; fi
}

detect_architecture() {
    DOWNLOAD_OS_TYPE=$(uname -s | tr '[:upper:]' '[:lower:]')
    DOWNLOAD_ARCH=$(uname -m)
    case "$DOWNLOAD_ARCH" in
        x86_64|amd64) DOWNLOAD_ARCH="amd64" ;; i386|i686) DOWNLOAD_ARCH="386" ;;
        aarch64|arm64) DOWNLOAD_ARCH="arm64" ;; armv7*|armhf) DOWNLOAD_ARCH="arm7" ;;
        arm*) if grep -q "v7" /proc/cpuinfo 2>/dev/null; then DOWNLOAD_ARCH="arm7";
              elif grep -q "v6" /proc/cpuinfo 2>/dev/null; then DOWNLOAD_ARCH="arm6";
              else DOWNLOAD_ARCH="arm64"; fi ;;
        *) DOWNLOAD_ARCH="amd64"; print_warning "未知架构: $DOWNLOAD_ARCH，默认使用amd64" ;;
    esac
    if [ "$DOWNLOAD_OS_TYPE" = "darwin" ]; then
        if [ "$DOWNLOAD_ARCH" != "amd64" ] && [ "$DOWNLOAD_ARCH" != "arm64" ]; then DOWNLOAD_ARCH="amd64"; fi
    fi
    print_info "用于下载的系统类型: $DOWNLOAD_OS_TYPE, 架构: $DOWNLOAD_ARCH"
}

install_dependencies() {
    print_info "安装必要的工具..."
    if [[ "$OS_FAMILY" == "alpine" ]]; then
        apk update >/dev/null && apk add --no-cache curl wget procps iptables ip6tables openrc
        apk add --no-cache iptables-persistent || apk add --no-cache iptables
    elif [[ "$OS_FAMILY" == "ubuntu" || "$OS_FAMILY" == "debian" ]]; then
        apt-get update -qq >/dev/null && apt-get install -y -qq curl wget
    elif [[ "$OS_FAMILY" == "centos" || "$OS_FAMILY" == "rhel" || "$OS_FAMILY" == "fedora" ]]; then
        yum install -y -q curl wget
    elif [[ "$OS_FAMILY" == "arch" || "$OS_FAMILY" == "manjaro" ]]; then
        pacman -S --noconfirm curl wget >/dev/null
    else
        print_warning "不支持的操作系统 ($OS_FAMILY)，请确保已安装: curl wget"
    fi
}

stop_and_disable_service() {
    local service_name_to_stop="$1"
    local process_name_to_kill="$2"
    print_info "尝试停止并禁用服务: $service_name_to_stop (进程: $process_name_to_kill)..."

    if command -v systemctl &> /dev/null; then
        systemctl stop "$service_name_to_stop" 2>/dev/null || true
        systemctl disable "$service_name_to_stop" 2>/dev/null || true
    elif command -v rc-service &> /dev/null && [ -f "/etc/init.d/$service_name_to_stop" ]; then
        rc-service "$service_name_to_stop" stop 2>/dev/null || true
        rc-update delete "$service_name_to_stop" default 2>/dev/null || true
    elif [ -f "/etc/init.d/$service_name_to_stop" ]; then
        /etc/init.d/"$service_name_to_stop" stop 2>/dev/null || true
        update-rc.d -f "$service_name_to_stop" remove 2>/dev/null || \
        chkconfig "$service_name_to_stop" off 2>/dev/null || true
    fi
    if [ -n "$process_name_to_kill" ]; then
      pkill -9 -f "$process_name_to_kill" 2>/dev/null || true
    fi
    sleep 1
    print_success "服务 $service_name_to_stop 已尝试停止和禁用。"
}

cleanup_old_version_files() {
    print_info "清理旧版本 ($OLD_AGENT_BINARY_NAME) 文件..."
    local cleaned=false
    if [ -f "$OLD_BINARY_PATH" ]; then
        rm -f "$OLD_BINARY_PATH" && print_info "已删除旧二进制文件: $OLD_BINARY_PATH" && cleaned=true
    fi
    if [ -d "$OLD_CONFIG_DIR" ]; then
        rm -rf "$OLD_CONFIG_DIR" && print_info "已删除旧配置目录: $OLD_CONFIG_DIR" && cleaned=true
    fi
    if [ -f "/etc/systemd/system/$OLD_SERVICE_NAME.service" ]; then
        rm -f "/etc/systemd/system/$OLD_SERVICE_NAME.service" && print_info "已删除旧 systemd 服务文件" && cleaned=true
        systemctl daemon-reload 2>/dev/null || true
    fi
    if [ -f "/etc/init.d/$OLD_SERVICE_NAME" ]; then
        rm -f "/etc/init.d/$OLD_SERVICE_NAME" && print_info "已删除旧 init.d 服务文件" && cleaned=true
    fi
    if [ "$cleaned" = true ]; then print_success "旧版本文件清理完成。"; else print_info "未找到需要清理的旧版本文件。"; fi
}

download_agent_binary() {
    local server_url_for_download="$1"
    # 下载时用旧名相关的临时文件名，因为远程资源可能是旧名
    local temp_file_downloaded="/tmp/${OLD_AGENT_BINARY_NAME}.downloaded_$(date +%s%N)"
    local download_prefix_url=""

    print_info "尝试从服务器获取 ${NEW_AGENT_BINARY_NAME} (远程可能为 ${OLD_AGENT_BINARY_NAME}) 下载链接前缀: ${server_url_for_download}/api/client/download-prefix"
    local server_prefix_response
    server_prefix_response=$(curl -s -m 10 "${server_url_for_download}/api/client/download-prefix" || echo "")

    if [ -n "$server_prefix_response" ] && echo "$server_prefix_response" | grep -q "url"; then
        download_prefix_url=$(echo "$server_prefix_response" | grep -o '"url":"[^"]*' | cut -d'"' -f4)
        print_info "从服务器获取到下载链接前缀: $download_prefix_url"
    else
        download_prefix_url="https://github.com/fev125/dstatus/releases/download/v1.1" # 默认值
        print_info "无法从服务器获取下载前缀或响应无效，使用默认下载链接前缀: $download_prefix_url"
    fi

    # 构建下载URL时，使用旧的二进制文件名前缀 (OLD_AGENT_BINARY_NAME)，因为远程资源可能尚未更新
    local remote_filename_to_download="${OLD_AGENT_BINARY_NAME}_${DOWNLOAD_OS_TYPE}_${DOWNLOAD_ARCH}"
    local client_download_url="${download_prefix_url}/${remote_filename_to_download}"
    # 备用：直接从用户指定的服务器下载架构特定版本 (也假设远程是旧文件名)
    local client_download_url_alt_server="${server_url_for_download}/${remote_filename_to_download}"


    print_info "尝试下载远程文件 ${remote_filename_to_download} 从: $client_download_url"
    # 下载到临时文件 $temp_file_downloaded
    if wget -q --show-progress --progress=bar:force --timeout=30 --tries=2 "$client_download_url" -O "$temp_file_downloaded" 2>&1 | grep -qE '(100%|saved)'; then
        print_success "从主要源下载成功: $client_download_url"
    elif wget -q --show-progress --progress=bar:force --timeout=30 --tries=2 "$client_download_url_alt_server" -O "$temp_file_downloaded" 2>&1 | grep -qE '(100%|saved)'; then
        print_success "从备用服务器源下载成功: $client_download_url_alt_server"
    elif curl -# -s -f -L --connect-timeout 30 --retry 2 "$client_download_url" -o "$temp_file_downloaded"; then
        print_success "使用curl从主要源下载成功: $client_download_url"
    elif curl -# -s -f -L --connect-timeout 30 --retry 2 "$client_download_url_alt_server" -o "$temp_file_downloaded"; then
        print_success "使用curl从备用服务器源下载成功: $client_download_url_alt_server"
    else
        print_error "所有下载尝试均失败 (尝试下载远程文件: ${remote_filename_to_download})。"
        rm -f "$temp_file_downloaded" # 清理可能的空文件或部分文件
        return 1
    fi

    if [ ! -s "$temp_file_downloaded" ]; then
        print_error "下载文件为空 (${temp_file_downloaded})，下载失败。"
        rm -f "$temp_file_downloaded"
        return 1
    fi

    # 下载成功后，将其移动并重命名为新的二进制文件路径
    mkdir -p "$(dirname "$NEW_BINARY_PATH")"
    mv "$temp_file_downloaded" "$NEW_BINARY_PATH"
    chmod +x "$NEW_BINARY_PATH"

    # 验证新路径下的二进制文件
    if ! "$NEW_BINARY_PATH" -v >/dev/null 2>&1; then
        print_error "安装失败，${NEW_AGENT_BINARY_NAME} (路径: ${NEW_BINARY_PATH}) 二进制文件无法执行。"
        # rm -f "$NEW_BINARY_PATH" # 谨慎操作：如果验证失败是否删除？
        return 1
    fi
    print_success "安装 ${NEW_AGENT_BINARY_NAME} 二进制文件到 ${NEW_BINARY_PATH} 成功。"
    return 0
}


register_with_server() {
    local reg_key_for_server="$1"
    local server_url_for_reg="$2"
    print_info "向服务器注册 ${NEW_AGENT_BINARY_NAME}: $server_url_for_reg"
    API_KEY_FROM_SERVER=""

    local register_payload
    register_payload=$(cat <<EOF
{
    "hostname": "$HOSTNAME_VAL",
    "ip": "$IP_ADDR",
    "system": "$SYSTEM_INFO_OS_NAME",
    "version": "$SYSTEM_INFO_OS_VERSION",
    "device": "$DEFAULT_NETWORK_DEVICE",
    "registrationKey": "$reg_key_for_server"
}
EOF
)
    local register_response
    register_response=$(curl -s -X POST "${server_url_for_reg}/autodiscovery/register" \
        -H "Content-Type: application/json" \
        -d "$register_payload")

    if echo "$register_response" | grep -q "success\":true"; then
        API_KEY_FROM_SERVER=$(echo "$register_response" | grep -o '"apiKey":"[^"]*' | cut -d'"' -f4)
        if [ -z "$API_KEY_FROM_SERVER" ]; then
            print_error "未能从服务器响应中获取API密钥。"
            print_error "服务器响应: $register_response"
            return 1
        fi
        print_success "自动发现注册成功。获取到API密钥: ${API_KEY_FROM_SERVER:0:8}..."
        return 0
    else
        print_error "自动发现注册失败。"
        print_error "服务器响应: $register_response"
        return 1
    fi
}

create_new_service_and_config() {
    local api_key_for_config="$1"
    mkdir -p "$NEW_CONFIG_DIR"
    print_info "创建/更新配置文件 ${NEW_CONFIG_FILE} 使用API密钥: ${api_key_for_config:0:8}..."
    cat > "$NEW_CONFIG_FILE" <<EOF
key: ${api_key_for_config}
port: 9999
debug: false
EOF

    print_info "创建/更新服务 ${NEW_SERVICE_NAME}..."
    if [[ "$OS_FAMILY" == "alpine" ]] && command -v rc-service &> /dev/null; then
        cat > "/etc/init.d/${NEW_SERVICE_NAME}" <<EOF
#!/sbin/openrc-run
name="DStatus Agent"
description="DStatus Agent Service"
command="${NEW_BINARY_PATH}"
command_args="-c ${NEW_CONFIG_FILE}"
command_background=true
pidfile="/run/${NEW_SERVICE_NAME}.pid"
depend() { need net; after firewall; }
start_pre() { checkpath --directory --owner root:root --mode 0755 "${NEW_CONFIG_DIR}"; }
EOF
        chmod +x "/etc/init.d/${NEW_SERVICE_NAME}"
    elif command -v systemctl &> /dev/null; then
        cat > "/etc/systemd/system/${NEW_SERVICE_NAME}.service" <<EOF
[Unit]
Description=DStatus Agent Service
After=network.target
[Service]
Restart=always
RestartSec=5
ExecStart=${NEW_BINARY_PATH} -c ${NEW_CONFIG_FILE}
[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
    elif [ -d /etc/init.d ]; then
        cat > "/etc/init.d/${NEW_SERVICE_NAME}" <<EOF
#!/bin/sh
### BEGIN INIT INFO
# Provides:          ${NEW_SERVICE_NAME}
# Required-Start:    \$network \$remote_fs \$syslog
# Required-Stop:     \$network \$remote_fs \$syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: DStatus Agent Service
### END INIT INFO
DAEMON="${NEW_BINARY_PATH}"
DAEMON_ARGS="-c ${NEW_CONFIG_FILE}"
PIDFILE="/var/run/${NEW_SERVICE_NAME}.pid"
start() { echo "启动DStatus Agent..."; start-stop-daemon --start --quiet --background --make-pidfile --pidfile \$PIDFILE --exec \$DAEMON -- \$DAEMON_ARGS || return 2; }
stop() { echo "停止DStatus Agent..."; start-stop-daemon --stop --quiet --pidfile \$PIDFILE || return 2; rm -f \$PIDFILE; }
restart() { stop; sleep 1; start; }
case "\$1" in start) start;; stop) stop;; restart) restart;; *) echo "用法: \$0 {start|stop|restart}"; exit 1;; esac
exit 0
EOF
        chmod +x "/etc/init.d/${NEW_SERVICE_NAME}"
        update-rc.d "${NEW_SERVICE_NAME}" defaults >/dev/null 2>&1 || chkconfig "${NEW_SERVICE_NAME}" on >/dev/null 2>&1
    else
        print_warning "无法检测到标准init系统。服务 ${NEW_SERVICE_NAME} 可能需要手动配置启动。"
    fi
    print_success "服务 ${NEW_SERVICE_NAME} 定义和服务配置文件创建/更新完成。"
}

configure_firewall_rules() {
    print_info "配置防火墙规则 (端口 9999)..."
    if [[ "$OS_FAMILY" == "alpine" ]]; then
        iptables -C INPUT -p tcp --dport 9999 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 9999 -j ACCEPT
        if command -v iptables-save >/dev/null 2>&1; then
            mkdir -p /etc/iptables 2>/dev/null
            iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
            if [ ! -f /etc/local.d/iptables.start ]; then
                mkdir -p /etc/local.d
                echo -e '#!/bin/sh\n[ -f /etc/iptables/rules.v4 ] && iptables-restore < /etc/iptables/rules.v4' > /etc/local.d/iptables.start
                chmod +x /etc/local.d/iptables.start
                rc-update add local default 2>/dev/null || true
            fi
        fi
    elif command -v ufw &> /dev/null; then
        ufw status | grep -qw "9999/tcp" || ufw allow 9999/tcp >/dev/null 2>&1
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --query-port=9999/tcp --permanent >/dev/null 2>&1 || \
        (firewall-cmd --permanent --add-port=9999/tcp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1)
    elif command -v iptables &> /dev/null; then
        iptables -C INPUT -p tcp --dport 9999 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 9999 -j ACCEPT
    fi
    print_success "防火墙配置完成。"
}

start_new_service() {
    print_info "正在启动服务 ${NEW_SERVICE_NAME}..."
    if [[ "$OS_FAMILY" == "alpine" ]] && command -v rc-service &> /dev/null; then
        rc-service "${NEW_SERVICE_NAME}" start && rc-update add "${NEW_SERVICE_NAME}" default >/dev/null 2>&1
    elif command -v systemctl &> /dev/null; then
        systemctl start "${NEW_SERVICE_NAME}" && systemctl enable "${NEW_SERVICE_NAME}" >/dev/null 2>&1
    elif [ -f "/etc/init.d/${NEW_SERVICE_NAME}" ]; then
        "/etc/init.d/${NEW_SERVICE_NAME}" start
    fi

    sleep 2
    if pgrep -f "${NEW_AGENT_BINARY_NAME} -c ${NEW_CONFIG_FILE}" > /dev/null; then
        print_success "服务 ${NEW_SERVICE_NAME} 已成功启动。"
    else
        print_error "服务 ${NEW_SERVICE_NAME} 启动失败，请检查日志。"
        if command -v systemctl &> /dev/null; then print_error "使用 'journalctl -u ${NEW_SERVICE_NAME} -f' 查看日志";
        elif [[ "$OS_FAMILY" == "alpine" ]]; then print_error "使用 'tail -f /var/log/messages' 查看系统日志"; fi
    fi
}

# --- 主安装/更新流程 ---
process_installation() {
    local user_input_reg_key="$1"
    local user_input_server_url="$2"
    user_input_server_url=${user_input_server_url%/}

    check_root
    get_system_info
    detect_architecture
    install_dependencies

    local migrated_api_key_from_old_config=""
    print_info "检查旧版本 (${OLD_AGENT_BINARY_NAME}) ..."
    if [ -f "$OLD_CONFIG_FILE" ]; then
        migrated_api_key_from_old_config=$(grep "^key:" "$OLD_CONFIG_FILE" | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$migrated_api_key_from_old_config" ]; then
            print_info "从旧配置文件 $OLD_CONFIG_FILE 读取到API密钥: ${migrated_api_key_from_old_config:0:8}..."
        else
            print_warning "旧配置文件 $OLD_CONFIG_FILE 存在，但未能读取到API密钥。"
        fi
    fi
    if [ -f "$OLD_BINARY_PATH" ] || [ -d "$OLD_CONFIG_DIR" ] || \
       (command -v systemctl &>/dev/null && systemctl list-unit-files | grep -q "$OLD_SERVICE_NAME.service") || \
       [ -f "/etc/init.d/$OLD_SERVICE_NAME" ]; then
        print_warning "检测到旧版本 ${OLD_AGENT_BINARY_NAME} 的残留，将进行停止和禁用。"
        stop_and_disable_service "$OLD_SERVICE_NAME" "$OLD_AGENT_BINARY_NAME" # 停止旧服务和旧进程
    else
        print_info "未检测到活动的旧版本 ${OLD_AGENT_BINARY_NAME}。"
    fi

    local final_api_key_for_config=""
    local should_re_register=true
    local existing_api_key_from_new_config=""

    if [ -n "$migrated_api_key_from_old_config" ]; then
        print_info "将使用从旧版本迁移的API密钥进行比较。"
        if [ "$user_input_reg_key" == "$migrated_api_key_from_old_config" ]; then
            print_info "传入的注册密钥与迁移的API密钥相同。将保留此API密钥，不重新注册。"
            should_re_register=false
            final_api_key_for_config="$migrated_api_key_from_old_config"
        else
            print_warning "传入的注册密钥与迁移的API密钥不符。将执行重新注册。"
        fi
    elif [ -f "$NEW_CONFIG_FILE" ]; then
        existing_api_key_from_new_config=$(grep "^key:" "$NEW_CONFIG_FILE" | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$existing_api_key_from_new_config" ]; then
            print_info "从现有配置文件 $NEW_CONFIG_FILE 读取到API密钥: ${existing_api_key_from_new_config:0:8}..."
            if [ "$user_input_reg_key" == "$existing_api_key_from_new_config" ]; then
                print_info "传入的注册密钥与现有新配置中的API密钥相同。将保留此API密钥，不重新注册。"
                should_re_register=false
                final_api_key_for_config="$existing_api_key_from_new_config"
            else
                print_warning "传入的注册密钥与现有新配置中的API密钥不符。将执行重新注册。"
            fi
        else
            print_warning "新配置文件 $NEW_CONFIG_FILE 存在但无法读取API密钥。将执行注册。"
        fi
    else
        print_info "未找到任何现有配置或迁移密钥。将执行注册。"
    fi

    stop_and_disable_service "$NEW_SERVICE_NAME" "$NEW_AGENT_BINARY_NAME" # 停止新服务和新进程 (以防万一)

    if ! download_agent_binary "$user_input_server_url"; then
        die "${NEW_AGENT_BINARY_NAME} 下载失败，操作中止。"
    fi

    if [ "$should_re_register" = true ]; then
        print_info "执行自动发现注册流程..."
        if ! register_with_server "$user_input_reg_key" "$user_input_server_url"; then
            die "自动发现注册失败，操作中止。"
        fi
        final_api_key_for_config="$API_KEY_FROM_SERVER"
    else
        print_info "跳过注册流程，使用已确定/迁移的API密钥。"
    fi

    if [ -z "$final_api_key_for_config" ]; then
        die "错误：最终的API密钥为空，无法继续。请检查注册或现有配置。"
    fi

    create_new_service_and_config "$final_api_key_for_config"
    configure_firewall_rules
    start_new_service
    cleanup_old_version_files

    if [ "$should_re_register" = true ]; then
        print_success "${NEW_AGENT_BINARY_NAME} 全新安装/重新注册完成。"
    else
        print_success "${NEW_AGENT_BINARY_NAME} 更新完成 (API密钥已保留/迁移)。"
    fi
    print_info "当前使用的API密钥: ${final_api_key_for_config:0:8}..."
    print_info "配置文件: ${NEW_CONFIG_FILE}"
    print_info "服务名称: ${NEW_SERVICE_NAME}"
}

# --- 主函数入口 ---
main() {
    local operation=""
    local key_param=""
    local url_param=""

    if [ "$1" == "install" ] && [ "$#" -eq 3 ]; then
        operation="install"
        key_param="$2"
        url_param="$3"
        print_info "检测到 'install' 命令模式。"
    elif [ "$#" -eq 2 ]; then
        operation="install"
        key_param="$1"
        url_param="$2"
        print_info "检测到直接参数模式 (KEY URL)，视为 'install' 操作。"
    else
        print_error "参数格式不正确。"
        echo "支持的格式:"
        echo "  1. curl ... | sudo bash -s install <注册密钥> <服务器URL>"
        echo "  2. curl ... | sudo bash -s -- <注册密钥> <服务器URL>"
        echo "  3. curl ... | sudo bash -s <注册密钥> <服务器URL>"
        echo "示例 (格式1): curl ... | sudo bash -s install abc123https://status.example.com"
        echo "示例 (格式2): curl ... | sudo bash -s -- abc123https://status.example.com"
        exit 1
    fi

    if [ -z "$key_param" ]; then die "注册密钥不能为空。"; fi
    if [ -z "$url_param" ]; then die "服务器URL不能为空。"; fi
    if [[ ! "$url_param" =~ ^https?:// ]]; then die "服务器URL格式无效，应以 http:// 或 https:// 开头。"; fi

    if [ "$operation" == "install" ]; then
        process_installation "$key_param" "$url_param"
    else
        print_error "未知的操作模式。"
        exit 1
    fi
}

main "$@"
