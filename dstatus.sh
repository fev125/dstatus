#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # 恢复默认颜色

# 版本信息
VERSION="1.3.0"


# 打印横幅
print_banner() {
    clear
    echo -e "${BLUE}=================================================${NC}"
    echo -e "${GREEN}          DStatus 服务器监控系统安装脚本        ${NC}"
    echo -e "${BLUE}=================================================${NC}"
    echo -e "${YELLOW}作者: fev125${NC}"
    echo -e "${YELLOW}版本: ${VERSION}${NC}"
    echo -e "${BLUE}=================================================${NC}"
    echo ""
}

# 检查是否为root用户
check_root() {
    if [ "$(id -u)" != "0" ]; then
        echo -e "${RED}错误: 请使用root用户运行此脚本${NC}"
        echo -e "${YELLOW}您可以使用 sudo bash $0 命令运行${NC}"
        exit 1
    fi
}

# 检查和创建Docker挂载目录
check_docker_directories() {
    print_banner
    echo -e "${BLUE}检查Docker挂载目录...${NC}"

    # 设置目录路径
    DATA_DIR="/opt/dstatus/data"
    LOGS_DIR="/opt/dstatus/logs"

    # 创建主目录
    echo -e "${BLUE}创建主目录...${NC}"
    mkdir -p "${DATA_DIR}" "${LOGS_DIR}"

    # 创建子目录
    echo -e "${BLUE}创建数据库子目录...${NC}"
    mkdir -p "${DATA_DIR}/backups" "${DATA_DIR}/temp"

    # 设置权限
    echo -e "${BLUE}设置目录权限...${NC}"
    chmod -R 777 "${DATA_DIR}"
    chmod -R 755 "${LOGS_DIR}"

    # 测试写入权限
    echo -e "${BLUE}测试目录写入权限...${NC}"
    TEST_FILE="${DATA_DIR}/.write-test"
    if touch "${TEST_FILE}" 2>/dev/null; then
        echo -e "${GREEN}目录写入测试成功${NC}"
        rm -f "${TEST_FILE}"
    else
        echo -e "${RED}警告: 无法写入数据目录${NC}"
        echo -e "${YELLOW}尝试使用sudo设置权限...${NC}"
        sudo chmod -R 777 "${DATA_DIR}" 2>/dev/null

        # 再次测试
        if touch "${TEST_FILE}" 2>/dev/null; then
            echo -e "${GREEN}权限设置成功${NC}"
            rm -f "${TEST_FILE}"
        else
            echo -e "${RED}错误: 仍然无法写入数据目录${NC}"
            echo -e "${YELLOW}请手动运行以下命令:${NC}"
            echo -e "  sudo mkdir -p ${DATA_DIR}/backups ${DATA_DIR}/temp ${LOGS_DIR}"
            echo -e "  sudo chmod -R 777 ${DATA_DIR}"
            echo -e "  sudo chmod -R 755 ${LOGS_DIR}"

            read -p "是否继续安装? (y/n): " continue_install
            if [[ ! $continue_install =~ ^[Yy]$ ]]; then
                echo -e "${RED}安装已取消${NC}"
                return 1
            fi
        fi
    fi

    echo -e "${GREEN}目录检查和创建完成${NC}"
    return 0
}

# 安装Docker
install_docker() {
    print_banner
    echo -e "${BLUE}正在检查Docker安装状态...${NC}"

    if command -v docker &> /dev/null; then
        echo -e "${GREEN}Docker已安装!${NC}"
        docker_version=$(docker --version | cut -d ' ' -f3 | sed 's/,//')
        echo -e "${CYAN}当前Docker版本: ${docker_version}${NC}"
    else
        echo -e "${YELLOW}Docker未安装, 开始安装...${NC}"
        curl -fsSL https://get.docker.com | sh

        # 启用Docker服务
        systemctl enable docker
        systemctl start docker

        # 安装Docker Compose
        echo -e "${BLUE}正在安装Docker Compose...${NC}"
        curl -L "https://github.com/docker/compose/releases/download/v2.21.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose

        if command -v docker &> /dev/null; then
            docker_version=$(docker --version | cut -d ' ' -f3 | sed 's/,//')
            echo -e "${GREEN}Docker安装成功! 版本: ${docker_version}${NC}"
        else
            echo -e "${RED}Docker安装失败, 请手动安装后再运行此脚本${NC}"
            exit 1
        fi
    fi

    echo ""
    echo -e "${GREEN}Docker环境准备就绪!${NC}"
    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 选择DStatus版本
select_dstatus_version() {
    print_banner
    echo -e "${GREEN}将安装稳定版本 (latest)${NC}"
    echo -e "${YELLOW}注意：为了确保系统稳定性，现在只提供稳定版本${NC}"
    echo -e "${RED}0. 返回主菜单${NC}"
    echo ""

    read -p "按Enter键继续安装或输入0返回: " version_choice

    if [ "$version_choice" = "0" ]; then
        return 1
    fi

    # 始终使用稳定版本
    VERSION_TAG="latest"

    # 检查远程镜像是否可用
    echo -e "${BLUE}检查远程镜像是否可用...${NC}"
    if ! docker pull --quiet ghcr.io/fev125/dstatus:${VERSION_TAG} &>/dev/null; then
        echo -e "${RED}警告: 无法连接到Docker镜像仓库或镜像不存在${NC}"
        echo -e "${YELLOW}请检查您的网络连接或稍后再试${NC}"
        read -p "是否继续? (y/n): " continue_choice
        if [[ ! $continue_choice =~ ^[Yy]$ ]]; then
            return 1
        fi
    else
        echo -e "${GREEN}镜像可用，继续安装...${NC}"
    fi

    return 0
}

# 安装DStatus
install_dstatus() {
    print_banner

    # 选择版本
    select_dstatus_version
    if [ $? -ne 0 ]; then
        return
    fi

    echo -e "${BLUE}开始安装DStatus (${VERSION_TAG}版本)...${NC}"

    # 创建安装目录
    mkdir -p /opt/dstatus
    cd /opt/dstatus

    # 检查和创建Docker挂载目录
    check_docker_directories
    if [ $? -ne 0 ]; then
        echo -e "${RED}目录准备失败，安装中止${NC}"
        echo ""
        read -p "按Enter键返回主菜单" pause
        return
    fi

    # 设置端口
    DEFAULT_PORT=5555
    read -p "请输入外部端口号 [默认: ${DEFAULT_PORT}]: " PORT
    PORT=${PORT:-${DEFAULT_PORT}}

    # 验证端口是否为数字
    if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
        echo -e "${YELLOW}端口必须为数字，使用默认端口 ${DEFAULT_PORT}${NC}"
        PORT=${DEFAULT_PORT}
    fi

    # 验证端口范围
    if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        echo -e "${YELLOW}端口必须在 1-65535 范围内，使用默认端口 ${DEFAULT_PORT}${NC}"
        PORT=${DEFAULT_PORT}
    fi

    echo -e "${GREEN}将使用端口: ${PORT}${NC}"

    # 检查容器是否已存在
    if docker ps -a | grep -q dstatus; then
        echo -e "${YELLOW}发现已有DStatus容器，正在移除...${NC}"
        docker stop dstatus &>/dev/null
        docker rm dstatus &>/dev/null
    fi

    # 拉取镜像并启动容器
    echo -e "${BLUE}强制拉取最新的${VERSION_TAG}镜像并启动容器...${NC}"
    docker pull --no-cache ghcr.io/fev125/dstatus:${VERSION_TAG}

    # 确保获取最新镜像
    echo -e "${BLUE}清理可能的旧镜像缓存...${NC}"
    docker image prune -f

    docker run -d \
        --name dstatus \
        -p ${PORT}:5555 \
        --restart unless-stopped \
        -e TZ=Asia/Shanghai \
        -e NODE_ENV=production \
        -v /opt/dstatus/data:/app/data \
        -v /opt/dstatus/logs:/app/logs \
        ghcr.io/fev125/dstatus:${VERSION_TAG}

    # 检查容器是否成功启动
    if [ $? -eq 0 ] && docker ps | grep -q dstatus; then
        echo -e "${GREEN}DStatus (${VERSION_TAG}版本) 安装成功!${NC}"

        # 获取IP地址 - 尝试多种方法
        IP=$(curl -s -m 5 https://api.ipify.org || echo "")
        if [ -z "$IP" ]; then
            IP=$(hostname -I | awk '{print $1}')
        fi

        echo ""
        echo -e "${PURPLE}==============================================${NC}"
        echo -e "${GREEN}DStatus 已成功安装并运行!${NC}"
        echo -e "${YELLOW}访问地址: http://$IP:${PORT}${NC}"
        echo -e "${YELLOW}默认密码: dstatus${NC}"
        echo -e "${RED}重要: 首次登录后请立即修改默认密码!${NC}"
        echo -e "${PURPLE}==============================================${NC}"
    else
        echo -e "${RED}DStatus 安装失败!${NC}"
        echo -e "${YELLOW}请检查错误信息并重试，或手动运行Docker命令:${NC}"
        echo "docker run -d --name dstatus -p ${PORT}:5555 --restart unless-stopped -e TZ=Asia/Shanghai -e NODE_ENV=production -v /opt/dstatus/data:/app/data -v /opt/dstatus/logs:/app/logs ghcr.io/fev125/dstatus:${VERSION_TAG}"
    fi

    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 更新DStatus
update_dstatus() {
    print_banner

    # 选择版本
    select_dstatus_version
    if [ $? -ne 0 ]; then
        return
    fi

    echo -e "${BLUE}开始更新DStatus至${VERSION_TAG}版本...${NC}"

    # 确保在正确的目录
    cd /opt/dstatus || mkdir -p /opt/dstatus && cd /opt/dstatus

    # 检查和创建Docker挂载目录
    check_docker_directories
    if [ $? -ne 0 ]; then
        echo -e "${RED}目录准备失败，更新中止${NC}"
        echo ""
        read -p "按Enter键返回主菜单" pause
        return
    fi

    # 检查容器是否存在
    if ! docker ps -a | grep -q dstatus; then
        echo -e "${RED}未发现DStatus容器，请先安装!${NC}"
        echo ""
        read -p "按Enter键返回主菜单" pause
        return
    fi

    # 获取当前版本信息
    CURRENT_IMAGE=$(docker inspect --format='{{.Config.Image}}' dstatus 2>/dev/null)
    echo -e "${CYAN}当前版本: ${CURRENT_IMAGE}${NC}"
    echo -e "${CYAN}目标版本: ghcr.io/fev125/dstatus:${VERSION_TAG}${NC}"

    # 备份数据
    BACKUP_DIR="data_backup_$(date +%Y%m%d_%H%M%S)"
    echo -e "${BLUE}备份当前数据到 ${BACKUP_DIR}...${NC}"
    cp -r data ${BACKUP_DIR} 2>/dev/null

    # 停止并删除旧容器
    echo -e "${BLUE}停止旧容器...${NC}"
    docker stop dstatus
    docker rm dstatus

    # 拉取最新镜像
    echo -e "${BLUE}强制拉取最新的${VERSION_TAG}镜像...${NC}"
    docker pull --no-cache ghcr.io/fev125/dstatus:${VERSION_TAG}

    # 清理旧镜像和缓存
    echo -e "${BLUE}清理旧镜像和缓存...${NC}"
    docker image prune -f

    # 再次拉取以确保获取最新版本
    echo -e "${BLUE}再次拉取以确保获取最新版本...${NC}"
    docker pull --no-cache ghcr.io/fev125/dstatus:${VERSION_TAG}

    # 设置端口
    DEFAULT_PORT=5555

    # 尝试获取当前容器的端口映射
    CURRENT_PORT=$(docker inspect --format='{{range $p, $conf := .HostConfig.PortBindings}}{{(index $conf 0).HostPort}}{{end}}' dstatus 2>/dev/null || echo "${DEFAULT_PORT}")

    read -p "请输入外部端口号 [当前: ${CURRENT_PORT}, 默认: ${DEFAULT_PORT}]: " PORT
    PORT=${PORT:-${CURRENT_PORT}}

    # 验证端口是否为数字
    if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
        echo -e "${YELLOW}端口必须为数字，使用默认端口 ${DEFAULT_PORT}${NC}"
        PORT=${DEFAULT_PORT}
    fi

    # 验证端口范围
    if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        echo -e "${YELLOW}端口必须在 1-65535 范围内，使用默认端口 ${DEFAULT_PORT}${NC}"
        PORT=${DEFAULT_PORT}
    fi

    echo -e "${GREEN}将使用端口: ${PORT}${NC}"

    # 启动新容器
    echo -e "${BLUE}启动新容器...${NC}"
    docker run -d \
        --name dstatus \
        -p ${PORT}:5555 \
        --restart unless-stopped \
        -e TZ=Asia/Shanghai \
        -e NODE_ENV=production \
        -v /opt/dstatus/data:/app/data \
        -v /opt/dstatus/logs:/app/logs \
        ghcr.io/fev125/dstatus:${VERSION_TAG}

    # 检查容器是否成功启动
    if [ $? -eq 0 ] && docker ps | grep -q dstatus; then
        echo -e "${GREEN}DStatus 更新成功!${NC}"

        # 获取IP地址
        IP=$(curl -s -m 5 https://api.ipify.org || echo "")
        if [ -z "$IP" ]; then
            IP=$(hostname -I | awk '{print $1}')
        fi

        echo ""
        echo -e "${PURPLE}==============================================${NC}"
        echo -e "${GREEN}DStatus 已成功更新至${VERSION_TAG}版本并重新启动!${NC}"
        echo -e "${YELLOW}访问地址: http://$IP:${PORT}${NC}"
        echo -e "${CYAN}数据备份位置: /opt/dstatus/${BACKUP_DIR}${NC}"
        echo -e "${PURPLE}==============================================${NC}"
    else
        echo -e "${RED}DStatus 更新失败!${NC}"
        echo -e "${YELLOW}尝试还原之前的容器...${NC}"

        # 尝试从之前的镜像恢复
        if [ ! -z "$CURRENT_IMAGE" ]; then
            docker run -d \
                --name dstatus \
                -p ${PORT}:5555 \
                --restart unless-stopped \
                -e TZ=Asia/Shanghai \
                -e NODE_ENV=production \
                -v /opt/dstatus/data:/app/data \
                -v /opt/dstatus/logs:/app/logs \
                $CURRENT_IMAGE

            if [ $? -eq 0 ]; then
                echo -e "${GREEN}已恢复到原版本!${NC}"
            else
                echo -e "${RED}还原失败，请手动恢复容器!${NC}"
            fi
        fi
    fi

    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 查看DStatus状态
view_status() {
    print_banner
    echo -e "${BLUE}DStatus 状态信息:${NC}"
    echo ""

    # 检查容器是否存在
    if ! docker ps -a | grep -q dstatus; then
        echo -e "${RED}未发现DStatus容器，请先安装!${NC}"
        echo ""
        read -p "按Enter键返回主菜单" pause
        return
    fi

    # 获取容器状态
    CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' dstatus 2>/dev/null)
    CONTAINER_IMAGE=$(docker inspect --format='{{.Config.Image}}' dstatus 2>/dev/null)
    CONTAINER_CREATED=$(docker inspect --format='{{.Created}}' dstatus 2>/dev/null | cut -d'T' -f1)
    CONTAINER_UPTIME=$(docker ps --format "{{.RunningFor}}" --filter "name=dstatus" 2>/dev/null)

    # 获取IP地址
    IP=$(curl -s -m 5 https://api.ipify.org || echo "")
    if [ -z "$IP" ]; then
        IP=$(hostname -I | awk '{print $1}')
    fi

    echo -e "${CYAN}容器状态: ${CONTAINER_STATUS}${NC}"
    echo -e "${CYAN}镜像版本: ${CONTAINER_IMAGE}${NC}"
    echo -e "${CYAN}创建时间: ${CONTAINER_CREATED}${NC}"
    echo -e "${CYAN}运行时间: ${CONTAINER_UPTIME}${NC}"
    echo -e "${CYAN}访问地址: http://${IP}:5555${NC}"

    echo ""
    echo -e "${YELLOW}容器日志 (最近10条):${NC}"
    docker logs --tail 10 dstatus 2>/dev/null

    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 卸载DStatus
uninstall_dstatus() {
    print_banner
    echo -e "${YELLOW}即将卸载DStatus...${NC}"
    echo -e "${RED}警告: 此操作将停止并删除DStatus容器!${NC}"
    echo ""

    # 检查容器是否存在
    if ! docker ps -a | grep -q dstatus; then
        echo -e "${RED}未发现DStatus容器，无需卸载!${NC}"
        echo ""
        read -p "按Enter键返回主菜单" pause
        return
    fi

    read -p "是否备份数据? (y/n): " backup
    if [[ $backup =~ ^[Yy]$ ]]; then
        BACKUP_DIR="backup/data_backup_$(date +%Y%m%d_%H%M%S)"
        echo -e "${BLUE}备份数据到 ${BACKUP_DIR}...${NC}"
        if [ -d "/opt/dstatus/data" ]; then
            mkdir -p /opt/dstatus/backup
            cp -r /opt/dstatus/data /opt/dstatus/${BACKUP_DIR}
            echo -e "${GREEN}数据已备份到 /opt/dstatus/${BACKUP_DIR}${NC}"
        else
            echo -e "${YELLOW}未找到数据目录，跳过备份${NC}"
        fi
    fi

    echo ""
    read -p "确认要卸载DStatus? (y/n): " confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        # 获取当前版本信息
        CURRENT_IMAGE=$(docker inspect --format='{{.Config.Image}}' dstatus 2>/dev/null)

        echo -e "${BLUE}停止并删除DStatus容器...${NC}"
        docker stop dstatus 2>/dev/null
        docker rm dstatus 2>/dev/null

        echo -e "${BLUE}删除DStatus镜像...${NC}"
        if [ ! -z "$CURRENT_IMAGE" ]; then
            docker rmi $CURRENT_IMAGE 2>/dev/null
        fi

        read -p "是否删除全部数据? (y/n): " delete_data
        if [[ $delete_data =~ ^[Yy]$ ]]; then
            echo -e "${RED}删除所有DStatus数据...${NC}"
            rm -rf /opt/dstatus/data
            echo -e "${GREEN}数据已删除${NC}"
        else
            echo -e "${YELLOW}保留数据目录: /opt/dstatus/data${NC}"
        fi

        echo -e "${GREEN}DStatus 已成功卸载!${NC}"
    else
        echo -e "${YELLOW}已取消卸载${NC}"
    fi

    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 显示菜单
show_menu() {
    while true; do
        print_banner

        # 检查DStatus状态
        if docker ps | grep -q dstatus; then
            STATUS="${GREEN}[运行中]${NC}"
            VERSION=$(docker inspect --format='{{.Config.Image}}' dstatus 2>/dev/null)
            VERSION=${VERSION##*:}
        elif docker ps -a | grep -q dstatus; then
            STATUS="${RED}[已停止]${NC}"
            VERSION=$(docker inspect --format='{{.Config.Image}}' dstatus 2>/dev/null)
            VERSION=${VERSION##*:}
        else
            STATUS="${YELLOW}[未安装]${NC}"
            VERSION="N/A"
        fi

        echo -e "${YELLOW}DStatus状态: ${STATUS} 版本: ${CYAN}${VERSION}${NC}"
        echo ""
        echo -e "${YELLOW}请选择要执行的操作:${NC}"
        echo -e "${GREEN}1. 安装Docker环境${NC}"
        echo -e "${GREEN}2. 安装DStatus${NC}"
        echo -e "${GREEN}3. 更新DStatus${NC}"
        echo -e "${GREEN}4. 查看DStatus状态${NC}"
        echo -e "${RED}5. 卸载DStatus${NC}"
        echo -e "${BLUE}0. 退出脚本${NC}"
        echo ""
        read -p "请输入选项 [0-5]: " choice

        case $choice in
            1)
                install_docker
                ;;
            2)
                install_dstatus
                ;;
            3)
                update_dstatus
                ;;
            4)
                view_status
                ;;
            5)
                uninstall_dstatus
                ;;
            0)
                echo -e "${GREEN}感谢使用DStatus安装脚本!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}无效选项，请重新选择${NC}"
                sleep 2
                ;;
        esac
    done
}

# 主函数
main() {
    check_root
    show_menu
}

# 执行主函数
main