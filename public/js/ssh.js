/**
 * 测试SSH连接
 * @param {Object} config - SSH配置对象
 * @param {string} config.host - 主机地址
 * @param {number} config.port - 端口
 * @param {string} config.username - 用户名
 * @param {string} config.password - 密码
 * @param {string} config.privateKey - 私钥
 * @param {string} config.passphrase - 私钥密码
 * @returns {Promise<Object>} 测试结果
 */
async function testConnection(config) {
    try {
        // 验证必要参数
        if (!config.host) {
            throw new Error('缺少主机地址');
        }

        const port = config.port || 22;
        const username = config.username || 'root';

        // 创建SSH客户端
        const ssh = new NodeSSH();
        
        // 准备连接配置
        const sshConfig = {
            host: config.host,
            port: port,
            username: username,
            tryKeyboard: true,
            readyTimeout: 10000,
        };

        // 配置认证方式
        if (config.privateKey && config.privateKey.trim() !== '') {
            sshConfig.privateKey = config.privateKey;
            // 如果有私钥密码，添加到配置中
            if (config.passphrase && config.passphrase.trim() !== '') {
                sshConfig.passphrase = config.passphrase;
            }
        } else if (config.password) {
            sshConfig.password = config.password;
        } else {
            throw new Error('需要提供密码或私钥');
        }

        // 连接到服务器
        await ssh.connect(sshConfig);
        
        // 测试执行简单命令
        const result = await ssh.execCommand('echo "Connection successful"');
        
        // 关闭连接
        ssh.dispose();
        
        if (result.stdout.includes('Connection successful')) {
            return { 
                status: true, 
                msg: '连接测试成功' 
            };
        } else {
            return { 
                status: false, 
                msg: '连接测试失败: ' + (result.stderr || '未知错误') 
            };
        }
    } catch (error) {
        console.error('SSH连接测试失败:', error);
        
        // 提供更详细的错误信息
        let errorMsg = '连接测试失败: ';
        
        if (error.code === 'ENOTFOUND') {
            errorMsg += '无法解析主机名 ' + config.host;
        } else if (error.code === 'ECONNREFUSED') {
            errorMsg += '连接被拒绝，请检查主机地址和端口是否正确';
        } else if (error.code === 'ETIMEDOUT') {
            errorMsg += '连接超时，请检查网络或防火墙设置';
        } else if (error.level === 'client-authentication') {
            errorMsg += '认证失败，请检查用户名和密码或私钥';
            if (error.message.includes('passphrase')) {
                errorMsg += '，私钥可能需要密码';
            }
        } else {
            errorMsg += error.message || '未知错误';
        }
        
        return { 
            status: false, 
            msg: errorMsg,
            error: error.toString()
        };
    }
} 