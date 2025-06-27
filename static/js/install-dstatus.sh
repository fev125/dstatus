#!/bin/bash

# DStatus Agent 一键安装脚本
# 支持从旧版 neko-status 迁移并更新配置格式
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

OLD_AGENT_BINARY_NAME="neko-status"
OLD_SERVICE_NAME="nekonekostatus"
OLD_CONFIG_DIR="/etc/neko-status"
OLD_CONFIG_FILE="${OLD_CONFIG_DIR}/config.yaml"
OLD_BINARY_PATH="/usr/bin/${OLD_AGENT_BINARY_NAME}"

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
}

install_dependencies() {
    print_info "安装依赖: curl, wget..."
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
        print_warning "未知操作系统 ($OS_FAMILY)，请确保已安装: curl wget"
    fi
}

stop_and_disable_service() {
    local service_name_to_stop="$1"
    local process_name_to_kill="$2"
    print_info "停止并禁用服务: $service_name_to_stop..."

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
}

cleanup_old_version_files() {
    local cleaned=false
    if [ -f "$OLD_BINARY_PATH" ]; then
        rm -f "$OLD_BINARY_PATH" && print_info "已删除旧二进制: $OLD_BINARY_PATH" && cleaned=true
    fi
    if [ -d "$OLD_CONFIG_DIR" ]; then
        rm -rf "$OLD_CONFIG_DIR" && print_info "已删除旧配置目录: $OLD_CONFIG_DIR" && cleaned=true
    fi
    if [ -f "/etc/systemd/system/$OLD_SERVICE_NAME.service" ]; then
        rm -f "/etc/systemd/system/$OLD_SERVICE_NAME.service" && print_info "已删除旧systemd服务文件" && cleaned=true
        systemctl daemon-reload 2>/dev/null || true
    fi
    if [ -f "/etc/init.d/$OLD_SERVICE_NAME" ]; then
        rm -f "/etc/init.d/$OLD_SERVICE_NAME" && print_info "已删除旧init.d服务文件" && cleaned=true
    fi
    if [ "$cleaned" = true ]; then print_success "旧版本文件清理完成。"; fi
}

download_agent_binary() {
    local server_url_for_download="$1"
    local temp_file_downloaded="/tmp/${OLD_AGENT_BINARY_NAME}.downloaded_$(date +%s%N)"
    local download_prefix_url=""

    print_info "获取 ${NEW_AGENT_BINARY_NAME} 下载信息..."
    local server_prefix_response
    server_prefix_response=$(curl -s -m 10 "${server_url_for_download}/api/client/download-prefix" || echo "")

    if [ -n "$server_prefix_response" ] && echo "$server_prefix_response" | grep -q "url"; then
        download_prefix_url=$(echo "$server_prefix_response" | grep -o '"url":"[^"]*' | cut -d'"' -f4)
    else
        download_prefix_url="https://github.com/fev125/dstatus/releases/download/v1.1" # 默认值
        print_info "使用默认下载源: $download_prefix_url"
    fi

    local remote_filename_to_download="${OLD_AGENT_BINARY_NAME}_${DOWNLOAD_OS_TYPE}_${DOWNLOAD_ARCH}"
    local client_download_url="${download_prefix_url}/${remote_filename_to_download}"
    local client_download_url_alt_server="${server_url_for_download}/${remote_filename_to_download}"

    print_info "下载 ${remote_filename_to_download}..."
    if wget -q --show-progress --progress=bar:force --timeout=30 --tries=2 "$client_download_url" -O "$temp_file_downloaded" 2>&1 | grep -qE '(100%|saved)'; then
        print_success "主源下载成功。"
    elif wget -q --show-progress --progress=bar:force --timeout=30 --tries=2 "$client_download_url_alt_server" -O "$temp_file_downloaded" 2>&1 | grep -qE '(100%|saved)'; then
        print_success "备用源下载成功。"
    elif curl -# -s -f -L --connect-timeout 30 --retry 2 "$client_download_url" -o "$temp_file_downloaded"; then
        print_success "主源下载成功 (curl)。"
    elif curl -# -s -f -L --connect-timeout 30 --retry 2 "$client_download_url_alt_server" -o "$temp_file_downloaded"; then
        print_success "备用源下载成功 (curl)。"
    else
        print_error "下载失败: ${remote_filename_to_download}"
        rm -f "$temp_file_downloaded"
        return 1
    fi

    if [ ! -s "$temp_file_downloaded" ]; then print_error "下载文件为空。"; rm -f "$temp_file_downloaded"; return 1; fi

    mkdir -p "$(dirname "$NEW_BINARY_PATH")"
    mv "$temp_file_downloaded" "$NEW_BINARY_PATH"
    chmod +x "$NEW_BINARY_PATH"

    if ! "$NEW_BINARY_PATH" -v >/dev/null 2>&1; then print_error "${NEW_AGENT_BINARY_NAME} 安装后无法执行。"; return 1; fi
    print_success "${NEW_AGENT_BINARY_NAME} 二进制文件已安装至 ${NEW_BINARY_PATH}"
    return 0
}

register_with_server() {
    local reg_key_for_server="$1"
    local server_url_for_reg="$2"
    print_info "向服务器注册 (注册密钥: ${reg_key_for_server:0:8}...) 于: $server_url_for_reg"
    API_KEY_FROM_SERVER="" # 全局
    SID_FROM_SERVER=""   # 全局

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
        SID_FROM_SERVER=$(echo "$register_response" | grep -o '"sid":"[^"]*' | cut -d'"' -f4)

        if [ -z "$API_KEY_FROM_SERVER" ]; then
            print_error "未能从服务器响应中获取API密钥。响应: $register_response"
            return 1
        fi
        print_success "注册成功。API密钥: ${API_KEY_FROM_SERVER:0:8}..., Server ID: ${SID_FROM_SERVER:-未提供}"
        return 0
    else
        print_error "注册失败。响应: $register_response"
        return 1
    fi
}

create_new_service_and_config() {
    local api_key_for_config="$1"
    local report_server_url_config="$2"
    local server_id_for_config="$3"
    local report_interval_val="2"

    mkdir -p "$NEW_CONFIG_DIR"
    print_info "写入配置文件 ${NEW_CONFIG_FILE}..."
    cat > "$NEW_CONFIG_FILE" <<EOF
# DStatus Agent Configuration
key: "${api_key_for_config}"
port: 9999
debug: false

# 主动上报配置
report_enabled: false
report_server: "${report_server_url_config}"
report_interval: ${report_interval_val}
report_server_key: "${api_key_for_config}"
server_id: "${server_id_for_config}"
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
Type=simple
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
}

configure_firewall_rules() {
    local agent_port="9999"
    print_info "配置防火墙规则 (端口 ${agent_port})..."
    if [[ "$OS_FAMILY" == "alpine" ]]; then
        iptables -C INPUT -p tcp --dport "${agent_port}" -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport "${agent_port}" -j ACCEPT
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
        ufw status | grep -qw "${agent_port}/tcp" || ufw allow "${agent_port}/tcp" >/dev/null 2>&1
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --query-port="${agent_port}/tcp" --permanent >/dev/null 2>&1 || \
        (firewall-cmd --permanent --add-port="${agent_port}/tcp" >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1)
    elif command -v iptables &> /dev/null; then
        iptables -C INPUT -p tcp --dport "${agent_port}" -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport "${agent_port}" -j ACCEPT
    fi
}

start_new_service() {
    print_info "启动服务 ${NEW_SERVICE_NAME}..."
    if [[ "$OS_FAMILY" == "alpine" ]] && command -v rc-service &> /dev/null; then
        rc-service "${NEW_SERVICE_NAME}" start && rc-update add "${NEW_SERVICE_NAME}" default >/dev/null 2>&1
    elif command -v systemctl &> /dev/null; then
        systemctl enable "${NEW_SERVICE_NAME}" >/dev/null 2>&1
        systemctl start "${NEW_SERVICE_NAME}"
    elif [ -f "/etc/init.d/${NEW_SERVICE_NAME}" ]; then
        "/etc/init.d/${NEW_SERVICE_NAME}" start
    fi

    sleep 2
    if pgrep -f "${NEW_AGENT_BINARY_NAME} -c ${NEW_CONFIG_FILE}" > /dev/null; then
        print_success "服务 ${NEW_SERVICE_NAME} 已启动。"
    else
        print_error "服务 ${NEW_SERVICE_NAME} 启动失败。"
        if command -v systemctl &> /dev/null; then print_error "  查看日志: sudo journalctl -u ${NEW_SERVICE_NAME} -f -n 50";
        elif [[ "$OS_FAMILY" == "alpine" ]]; then print_error "  查看日志: sudo tail -n 50 /var/log/messages (或相关日志)"; fi
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

    local final_api_key_for_config=""
    local final_server_id_for_config=""
    local api_key_source="none"
    local should_re_register_based_on_keys=true

    print_info "--- 检查现有配置 ---"
    local migrated_api_key_from_old_config=""
    local migrated_server_id_from_old_config=""
    if [ -f "$OLD_CONFIG_FILE" ]; then
        migrated_api_key_from_old_config=$(grep "^key:" "$OLD_CONFIG_FILE" | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        migrated_server_id_from_old_config=$(grep "^server_id:" "$OLD_CONFIG_FILE" | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$migrated_api_key_from_old_config" ]; then
            print_info "检测到旧版 (${OLD_AGENT_BINARY_NAME}) API密钥: ${migrated_api_key_from_old_config:0:8}..."
            final_api_key_for_config="$migrated_api_key_from_old_config"
            final_server_id_for_config="$migrated_server_id_from_old_config"
            api_key_source="migrated_old"
            should_re_register_based_on_keys=false
        else
            print_warning "旧版配置文件 $OLD_CONFIG_FILE 存在但无有效API密钥。"
        fi
    fi
    if [ -f "$OLD_BINARY_PATH" ] || [ -d "$OLD_CONFIG_DIR" ] || \
       (command -v systemctl &>/dev/null && systemctl list-unit-files | grep -q "$OLD_SERVICE_NAME.service") || \
       [ -f "/etc/init.d/$OLD_SERVICE_NAME" ]; then
        print_info "处理旧版 (${OLD_AGENT_BINARY_NAME}) 服务..."
        stop_and_disable_service "$OLD_SERVICE_NAME" "$OLD_AGENT_BINARY_NAME"
    fi

    local existing_api_key_in_new_config=""
    local existing_server_id_in_new_config=""
    if [ "$api_key_source" == "none" ] && [ -f "$NEW_CONFIG_FILE" ]; then
        existing_api_key_in_new_config=$(grep "^key:" "$NEW_CONFIG_FILE" | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        existing_server_id_in_new_config=$(grep "^server_id:" "$NEW_CONFIG_FILE" | cut -d' ' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$existing_api_key_in_new_config" ]; then # Corrected: removed {
            print_info "检测到当前 (${NEW_AGENT_BINARY_NAME}) API密钥: ${existing_api_key_in_new_config:0:8}..."
            final_api_key_for_config="$existing_api_key_in_new_config"
            final_server_id_for_config="$existing_server_id_in_new_config"
            api_key_source="existing_new"
            should_re_register_based_on_keys=false
        else # Corrected: this else now correctly pairs with the if above
            print_warning "当前配置文件 $NEW_CONFIG_FILE 存在但无有效API密钥。"
        fi # Corrected: fi for if [ -n "$existing_api_key_in_new_config" ]
    fi

    local force_new_key_acquisition=false
    if [ "$should_re_register_based_on_keys" = false ] && [ -n "$final_api_key_for_config" ]; then
        local source_desc="未知"
        if [ "$api_key_source" == "migrated_old" ]; then source_desc="从旧版 ${OLD_AGENT_BINARY_NAME} 迁移";
        elif [ "$api_key_source" == "existing_new" ]; then source_desc="当前 ${NEW_AGENT_BINARY_NAME} 配置"; fi
        print_warning "检测到已存在的API密钥 (${final_api_key_for_config:0:8}...) 来源: $source_desc."
        if [ -t 0 ] && [ -t 1 ]; then
            read -r -p "是否使用提供的注册密钥 (${user_input_reg_key:0:8}...) 强制获取新的API密钥? (y/N): " confirm_new_key
            if [[ "$confirm_new_key" =~ ^[Yy]$ ]]; then force_new_key_acquisition=true; fi
        else print_info "非交互模式，自动保留现有API密钥 (如果有效)。"; fi
    fi

    local actual_should_re_register=true
    if [ "$force_new_key_acquisition" = true ]; then
        actual_should_re_register=true; print_info "用户选择强制获取新API密钥。"
    elif [ "$should_re_register_based_on_keys" = false ] && [ -n "$final_api_key_for_config" ]; then
        actual_should_re_register=false; print_info "将使用已存在的API密钥。"
    else
        actual_should_re_register=true; print_info "需要获取新的API密钥。"
    fi

    if [ "$actual_should_re_register" = false ] && [ -z "$final_server_id_for_config" ] && [ -n "$final_api_key_for_config" ]; then
        print_warning "API密钥 (${final_api_key_for_config:0:8}) 已存在但Server ID缺失。将强制使用注册密钥获取完整配置。"
        actual_should_re_register=true
    fi

    print_info "--- 开始安装/更新 ${NEW_AGENT_BINARY_NAME} ---"
    stop_and_disable_service "$NEW_SERVICE_NAME" "$NEW_AGENT_BINARY_NAME"

    if ! download_agent_binary "$user_input_server_url"; then
        die "${NEW_AGENT_BINARY_NAME} 下载失败。"
    fi

    if [ "$actual_should_re_register" = true ]; then
        if ! register_with_server "$user_input_reg_key" "$user_input_server_url"; then
            die "注册失败。"
        fi
        final_api_key_for_config="$API_KEY_FROM_SERVER"
        final_server_id_for_config="$SID_FROM_SERVER"
        api_key_source="from_server"
    else
        print_info "跳过注册，使用已有API密钥: ${final_api_key_for_config:0:8}..., Server ID: ${final_server_id_for_config:-未设置}"
    fi

    if [ -z "$final_api_key_for_config" ]; then die "最终API密钥为空，无法继续。"; fi

    create_new_service_and_config "$final_api_key_for_config" "$user_input_server_url" "$final_server_id_for_config"
    configure_firewall_rules
    start_new_service
    cleanup_old_version_files

    print_success "--------------------------------------------------"
    print_success "${NEW_AGENT_BINARY_NAME} 安装/更新成功!"
    print_success "--------------------------------------------------"
    print_info "${BLUE}服务管理命令:${NC}"
    if command -v systemctl &> /dev/null; then
        echo -e "  启动: ${GREEN}sudo systemctl start ${NEW_SERVICE_NAME}${NC}"
        echo -e "  停止: ${GREEN}sudo systemctl stop ${NEW_SERVICE_NAME}${NC}"
        echo -e "  重启: ${GREEN}sudo systemctl restart ${NEW_SERVICE_NAME}${NC}"
        echo -e "  状态: ${GREEN}sudo systemctl status ${NEW_SERVICE_NAME}${NC}"
        echo -e "  日志: ${GREEN}sudo journalctl -u ${NEW_SERVICE_NAME} -f -n 50${NC}"
    elif command -v rc-service &> /dev/null && [[ "$OS_FAMILY" == "alpine" ]]; then
        echo -e "  启动: ${GREEN}sudo rc-service ${NEW_SERVICE_NAME} start${NC}"
        echo -e "  停止: ${GREEN}sudo rc-service ${NEW_SERVICE_NAME} stop${NC}"
        echo -e "  重启: ${GREEN}sudo rc-service ${NEW_SERVICE_NAME} restart${NC}"
        echo -e "  状态: ${GREEN}sudo rc-service ${NEW_SERVICE_NAME} status${NC}"
    elif [ -f "/etc/init.d/${NEW_SERVICE_NAME}" ]; then
        echo -e "  启动: ${GREEN}sudo /etc/init.d/${NEW_SERVICE_NAME} start${NC}"
        echo -e "  停止: ${GREEN}sudo /etc/init.d/${NEW_SERVICE_NAME} stop${NC}"
        echo -e "  重启: ${GREEN}sudo /etc/init.d/${NEW_SERVICE_NAME} restart${NC}"
        echo -e "  状态: ${GREEN}sudo /etc/init.d/${NEW_SERVICE_NAME} status${NC}"
    fi
    print_info "${BLUE}配置文件:${NC} ${NEW_CONFIG_FILE}"
    print_success "--------------------------------------------------"
    print_warning "${YELLOW}卸载说明:${NC}"
    print_warning "  要卸载 ${NEW_AGENT_BINARY_NAME}, 请运行以下命令 (复制粘贴并执行):"
    local UNINSTALL_CMD="sudo bash -c \"echo '正在卸载 ${NEW_AGENT_BINARY_NAME}...'; "
    UNINSTALL_CMD+="systemctl stop ${NEW_SERVICE_NAME} 2>/dev/null; systemctl disable ${NEW_SERVICE_NAME} 2>/dev/null; "
    UNINSTALL_CMD+="rc-service ${NEW_SERVICE_NAME} stop 2>/dev/null; rc-update delete ${NEW_SERVICE_NAME} default 2>/dev/null; "
    UNINSTALL_CMD+="/etc/init.d/${NEW_SERVICE_NAME} stop 2>/dev/null; update-rc.d -f ${NEW_SERVICE_NAME} remove 2>/dev/null; "
    UNINSTALL_CMD+="rm -f ${NEW_BINARY_PATH} /etc/systemd/system/${NEW_SERVICE_NAME}.service /etc/init.d/${NEW_SERVICE_NAME} ${NEW_CONFIG_FILE} 2>/dev/null; "
    UNINSTALL_CMD+="rmdir ${NEW_CONFIG_DIR} 2>/dev/null || true; "
    UNINSTALL_CMD+="echo '${NEW_AGENT_BINARY_NAME} 已卸载。防火墙规则可能需要手动清理。'\""
    echo -e "    ${UNINSTALL_CMD}"
    print_success "--------------------------------------------------"

}

# --- 主函数入口 ---
main() {
    local operation=""
    local key_param=""
    local url_param=""

    if [ "$1" == "install" ] && [ "$#" -eq 3 ]; then
        operation="install"; key_param="$2"; url_param="$3";
    elif [ "$#" -eq 2 ]; then
        operation="install"; key_param="$1"; url_param="$2";
    else
        print_error "参数格式不正确。"
        echo "支持的格式:"
        echo "  1. curl ... | sudo bash -s install <注册密钥> <服务器URL>"
        echo "  2. curl ... | sudo bash -s -- <注册密钥> <服务器URL>"
        echo "  3. curl ... | sudo bash -s <注册密钥> <服务器URL>"
        exit 1
    fi

    if [ -z "$key_param" ]; then die "注册密钥不能为空。"; fi
    if [ -z "$url_param" ]; then die "服务器URL不能为空。"; fi
    if [[ ! "$url_param" =~ ^https?:// ]]; then die "服务器URL格式无效 (应以 http(s):// 开头)。"; fi

    if [ "$operation" == "install" ]; then
        process_installation "$key_param" "$url_param"
    else
        print_error "未知的操作模式。"
        exit 1
    fi
}

main "$@"
