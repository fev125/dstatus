#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # 恢复默认颜色

# 打印横幅
print_banner() {
    clear
    echo -e "${BLUE}=================================================${NC}"
    echo -e "${GREEN}          DStatus 服务器监控系统安装脚本        ${NC}"
    echo -e "${BLUE}=================================================${NC}"
    echo -e "${YELLOW}作者: fev125${NC}"
    echo -e "${YELLOW}版本: 1.0.0${NC}"
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

# 安装Docker
install_docker() {
    print_banner
    echo -e "${BLUE}正在检查Docker安装状态...${NC}"
    
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}Docker已安装!${NC}"
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
            echo -e "${GREEN}Docker安装成功!${NC}"
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

# 安装DStatus
install_dstatus() {
    print_banner
    echo -e "${BLUE}开始安装DStatus...${NC}"
    
    # 创建安装目录
    mkdir -p /opt/dstatus
    cd /opt/dstatus
    
    # 创建数据目录并设置权限
    echo -e "${BLUE}创建数据目录...${NC}"
    mkdir -p data
    chmod -R 777 data
    
    # 检查容器是否已存在
    if docker ps -a | grep -q dstatus; then
        echo -e "${YELLOW}发现已有DStatus容器，正在移除...${NC}"
        docker stop dstatus &>/dev/null
        docker rm dstatus &>/dev/null
    fi
    
    # 拉取镜像并启动容器
    echo -e "${BLUE}拉取最新镜像并启动容器...${NC}"
    docker pull ghcr.io/fev125/dstatus:latest
    
    docker run -d \
        --name dstatus \
        -p 5555:5555 \
        --restart unless-stopped \
        -e TZ=Asia/Shanghai \
        -e NODE_ENV=production \
        -v /opt/dstatus/data:/app/data \
        ghcr.io/fev125/dstatus:latest
    
    # 检查容器是否成功启动
    if [ $? -eq 0 ] && docker ps | grep -q dstatus; then
        echo -e "${GREEN}DStatus 安装成功!${NC}"
        IP=$(curl -s https://api.ipify.org || echo "无法获取")
        if [ "$IP" = "无法获取" ]; then
            IP=$(hostname -I | awk '{print $1}')
        fi
        
        echo ""
        echo -e "${PURPLE}==============================================${NC}"
        echo -e "${GREEN}DStatus 已成功安装并运行!${NC}"
        echo -e "${YELLOW}访问地址: http://$IP:5555${NC}"
        echo -e "${YELLOW}默认密码: dstatus${NC}"
        echo -e "${RED}重要: 首次登录后请立即修改默认密码!${NC}"
        echo -e "${PURPLE}==============================================${NC}"
    else
        echo -e "${RED}DStatus 安装失败!${NC}"
        echo -e "${YELLOW}请检查错误信息并重试，或手动运行Docker命令:${NC}"
        echo "docker run -d --name dstatus -p 5555:5555 --restart unless-stopped -e TZ=Asia/Shanghai -e NODE_ENV=production -v /opt/dstatus/data:/app/data ghcr.io/fev125/dstatus:latest"
    fi
    
    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 更新DStatus
update_dstatus() {
    print_banner
    echo -e "${BLUE}开始更新DStatus...${NC}"
    
    # 确保在正确的目录
    cd /opt/dstatus || mkdir -p /opt/dstatus && cd /opt/dstatus
    
    # 检查容器是否存在
    if ! docker ps -a | grep -q dstatus; then
        echo -e "${RED}未发现DStatus容器，请先安装!${NC}"
        echo ""
        read -p "按Enter键返回主菜单" pause
        return
    fi
    
    # 备份数据
    echo -e "${BLUE}备份当前数据...${NC}"
    cp -r data data_backup_$(date +%Y%m%d) 2>/dev/null
    
    # 停止并删除旧容器
    echo -e "${BLUE}停止旧容器...${NC}"
    docker stop dstatus
    docker rm dstatus
    
    # 拉取最新镜像
    echo -e "${BLUE}拉取最新镜像...${NC}"
    docker pull ghcr.io/fev125/dstatus:latest
    
    # 启动新容器
    echo -e "${BLUE}启动新容器...${NC}"
    docker run -d \
        --name dstatus \
        -p 5555:5555 \
        --restart unless-stopped \
        -e TZ=Asia/Shanghai \
        -e NODE_ENV=production \
        -v /opt/dstatus/data:/app/data \
        ghcr.io/fev125/dstatus:latest
    
    # 检查容器是否成功启动
    if [ $? -eq 0 ] && docker ps | grep -q dstatus; then
        echo -e "${GREEN}DStatus 更新成功!${NC}"
        IP=$(curl -s https://api.ipify.org || echo "无法获取")
        if [ "$IP" = "无法获取" ]; then
            IP=$(hostname -I | awk '{print $1}')
        fi
        
        echo ""
        echo -e "${PURPLE}==============================================${NC}"
        echo -e "${GREEN}DStatus 已成功更新并重新启动!${NC}"
        echo -e "${YELLOW}访问地址: http://$IP:5555${NC}"
        echo -e "${PURPLE}==============================================${NC}"
    else
        echo -e "${RED}DStatus 更新失败!${NC}"
        echo "请检查错误信息并重试"
    fi
    
    echo ""
    read -p "按Enter键返回主菜单" pause
}

# 卸载DStatus
uninstall_dstatus() {
    print_banner
    echo -e "${YELLOW}即将卸载DStatus...${NC}"
    echo -e "${RED}警告: 此操作将停止并删除DStatus容器!${NC}"
    echo ""
    
    read -p "是否备份数据? (y/n): " backup
    if [[ $backup =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}备份数据...${NC}"
        if [ -d "/opt/dstatus/data" ]; then
            mkdir -p /opt/dstatus/backup
            cp -r /opt/dstatus/data /opt/dstatus/backup/data_backup_$(date +%Y%m%d)
            echo -e "${GREEN}数据已备份到 /opt/dstatus/backup/data_backup_$(date +%Y%m%d)${NC}"
        else
            echo -e "${YELLOW}未找到数据目录，跳过备份${NC}"
        fi
    fi
    
    echo ""
    read -p "确认要卸载DStatus? (y/n): " confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}停止并删除DStatus容器...${NC}"
        docker stop dstatus 2>/dev/null
        docker rm dstatus 2>/dev/null
        
        echo -e "${BLUE}删除DStatus镜像...${NC}"
        docker rmi ghcr.io/fev125/dstatus:latest 2>/dev/null
        
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
        echo -e "${YELLOW}请选择要执行的操作:${NC}"
        echo -e "${GREEN}1. 安装Docker环境${NC}"
        echo -e "${GREEN}2. 安装DStatus${NC}"
        echo -e "${GREEN}3. 更新DStatus${NC}"
        echo -e "${GREEN}4. 卸载DStatus${NC}"
        echo -e "${RED}0. 退出脚本${NC}"
        echo ""
        read -p "请输入选项 [0-4]: " choice
        
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