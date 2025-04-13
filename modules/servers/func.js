const ssh=require("../../ssh");
async function initServer(server,neko_status_url){
    // 添加每个步骤的输出标记，方便前端展示
    var sh=
`echo "[步骤1/7] 检查并安装wget工具..."
wget --version || { echo "安装wget..."; yum install wget -y || apt-get install wget -y; }

echo "[步骤2/7] 检查并下载探针..."
if [ -f /usr/bin/neko-status ] && /usr/bin/neko-status -v &>/dev/null; then
    echo "探针已存在，跳过下载"
else
    echo "下载探针..."
    wget -q --progress=dot:giga ${neko_status_url} -O /usr/bin/neko-status
    chmod +x /usr/bin/neko-status
    echo "探针下载完成"
fi

echo "[步骤3/7] 停止现有服务..."
systemctl stop nekonekostatus 2>/dev/null || echo "服务未运行，无需停止"

echo "[步骤4/7] 创建配置目录..."
mkdir -p /etc/neko-status/

echo "[步骤5/7] 写入配置文件..."
echo "key: ${server.data.api.key}
port: ${server.data.api.port}
debug: false" > /etc/neko-status/config.yaml
echo "配置文件已写入"

echo "[步骤6/7] 创建系统服务..."
echo "[Unit]
Description=nekonekostatus

[Service]
Restart=always
RestartSec=5
ExecStart=/usr/bin/neko-status -c /etc/neko-status/config.yaml

[Install]
WantedBy=multi-user.target" > /etc/systemd/system/nekonekostatus.service
systemctl daemon-reload
echo "系统服务已创建"

echo "[步骤7/7] 启动并设置开机自启..."
systemctl start nekonekostatus
systemctl enable nekonekostatus
echo "服务已启动并设置为开机自启"

echo "[完成] 探针安装完成！"`

    // 执行SSH命令
    var res = await ssh.Exec(server.data.ssh, sh);

    // 处理结果
    if (res.success) {
        // 提取安装日志
        const installLog = res.data.trim();

        // 返回成功状态和安装日志
        return {
            status: 1,
            data: "安装成功",
            log: installLog
        };
    } else {
        // 返回失败状态和错误信息
        return {
            status: 0,
            data: "安装失败/SSH连接失败",
            log: res.data || res.error || "未知错误"
        };
    }
}
async function updateServer(server,neko_status_url){
    var sh=
`rm -f /usr/bin/neko-status
wget -q --progress=dot:giga ${neko_status_url} -O /usr/bin/neko-status
chmod +x /usr/bin/neko-status
systemctl restart nekonekostatus`
    await ssh.Exec(server.data.ssh,sh);
    return {status:1,data:"更新成功"};
}
module.exports={
    initServer,updateServer,
}