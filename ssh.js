const {NodeSSH}=require('node-ssh');
const SSHClient = require("ssh2").Client;

/**
 * 验证私钥格式
 * @param {string} privateKey - SSH私钥
 * @return {boolean} 返回私钥格式是否有效
 */
function validatePrivateKey(privateKey) {
    if(!privateKey || privateKey.trim() === '') return false;
    
    // 检查常见的私钥格式
    const rsaPattern = /-----BEGIN (?:RSA|OPENSSH) PRIVATE KEY-----[\s\S]*?-----END (?:RSA|OPENSSH) PRIVATE KEY-----/;
    const ed25519Pattern = /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/;
    const pkcs8Pattern = /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/;
    
    return rsaPattern.test(privateKey) || ed25519Pattern.test(privateKey) || pkcs8Pattern.test(privateKey);
}

/**
 * 建立SSH连接
 * @param {object} key - SSH连接参数
 * @param {number} retries - 重试次数
 * @return {Promise<object|null>} 返回SSH连接对象或null
 */
async function ssh_con(key, retries = 3){
    // 处理私钥
    if(key.privateKey) {
        if(!validatePrivateKey(key.privateKey)) {
            console.error('[SSH] 无效的私钥格式');
            return null;
        }
    } else if(key.privateKey === '') {
        delete key.privateKey;
    }
    
    // 处理IPv6地址
    if(key.host && key.host.includes(':') && !key.host.startsWith('[') && !key.host.includes('.')) {
        console.log(`[SSH] 检测到IPv6地址: ${key.host}，正在格式化`);
        key.host = `[${key.host}]`;
    }
    
    // 设置超时
    key.readyTimeout = key.readyTimeout || 10000;
    
    // 记录连接信息（不包含敏感数据）
    const logInfo = {
        host: key.host,
        port: key.port || 22,
        username: key.username,
        authMethod: key.privateKey ? (key.passphrase ? '私钥(带密码)' : '私钥') : '密码'
    };
    console.log(`[SSH] 尝试连接: ${JSON.stringify(logInfo)}`);
    
    for(let attempt = 1; attempt <= retries; attempt++) {
        try{
            var ssh = new NodeSSH();
            await ssh.connect(key);
            
            // 监听错误
            ssh.connection.on("error",(err) => {
                console.error(`[SSH] 连接错误 (${key.host}:${key.port}): ${err.message}`);
            });
            
            console.log(`[SSH] 连接成功: ${key.host}:${key.port}`);
            return ssh;
        } catch(e){
            console.error(`[SSH] 连接失败 (${key.host}:${key.port}) 尝试 ${attempt}/${retries}: ${e.message}`);
            
            // 如果私钥错误且带密码，可能是密码不正确
            if(e.message && e.message.includes('bad decrypt') && key.privateKey && !key.passphrase) {
                console.error('[SSH] 私钥可能需要密码');
            }
            
            // 如果还有重试次数，等待后重试
            if(attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    
    return null;
}

/**
 * 执行SSH命令
 * @param {object} ssh - SSH连接对象
 * @param {string} sh - 要执行的命令
 * @return {Promise<object>} 返回执行结果
 */
async function ssh_exec(ssh, sh){
    try{
        var res = await ssh.execCommand(sh, {
            onStdout: null,
            onStderr: (chunk) => {
                console.error(`[SSH] 命令错误输出: ${chunk.toString()}`);
            }
        });
        return {success: true, data: res.stdout, stderr: res.stderr};
    }
    catch(e){
        console.error(`[SSH] 命令执行失败: ${e.message}`);
        return {success: false, data: e.message, error: e};
    }
}

async function spwan(key,sh,onData=(chunk)=>{process.stdout.write(chunk)}){
    if(key.privateKey=='')delete key.privateKey;
    key.readyTimeout=10000;
    
    // 处理IPv6地址
    if(key.host && key.host.includes(':') && !key.host.startsWith('[') && !key.host.includes('.')) {
        console.log(`[SSH] spwan: 检测到IPv6地址: ${key.host}，正在格式化`);
        key.host = `[${key.host}]`;
    }
    
    try{
        var ssh=new NodeSSH();
        await ssh.connect(key);
        ssh.connection.on("error",(err)=>{});
        var res=await ssh.execCommand(sh,{
            onStdout:onData,
        });
        await ssh.dispose();
        return {success:true,data:res.stdout};
    }catch(e){return {success:false,data:e};}
}
async function exec(key,sh){
    if(key.privateKey=='')delete key.privateKey;
    key.readyTimeout=60000;
    
    // 处理IPv6地址
    if(key.host && key.host.includes(':') && !key.host.startsWith('[') && !key.host.includes('.')) {
        console.log(`[SSH] exec: 检测到IPv6地址: ${key.host}，正在格式化`);
        key.host = `[${key.host}]`;
    }
    
    try{
        var ssh=new NodeSSH();
        await ssh.connect(key);
        ssh.connection.on("error",(err)=>{});
        var res=await ssh.execCommand(sh,{});
        await ssh.dispose();
        return {success:true,data:res.stdout};
    }catch(e){return {success:false,data:e};}
}
async function createSocket(key,ws,conf={}){
    // 处理IPv6地址
    if(key.host && key.host.includes(':') && !key.host.startsWith('[') && !key.host.includes('.')) {
        console.log(`[SSH] createSocket: 检测到IPv6地址: ${key.host}，正在格式化`);
        key.host = `[${key.host}]`;
    }
    
    const ssh = new SSHClient();
    ssh.on("ready",()=>{
        if(ws)ws.send("\r\n*** SSH CONNECTION ESTABLISHED ***\r\n".toString('utf-8'));
        else return;
        ssh.shell((err, stream)=>{
            if(err){
                try{ws.send("\n*** SSH SHELL ERROR: " + err.message + " ***\n".toString('utf-8'));}catch{}
                return;                
            }
            if(conf.cols||conf.rows)stream.setWindow(conf.rows,conf.cols);
            if(conf.sh)stream.write(conf.sh);
            ws.on("message", (data)=>{stream.write(data);});
            ws.on("resize",(data)=>{stream.setWindow(data.rows,data.cols)})
            ws.on("close",()=>{ssh.end()});
            stream.on("data", (data)=>{try{ws.send(data.toString('utf-8'));}catch{}})
                .on("close",()=>{ssh.end()});
        });
    }).on("close",()=>{
        try{ws.close()}catch{}})
    .on("error",(err)=>{
        try{
            ws.send("\r\n*** SSH CONNECTION ERROR: " + err.message + " ***\r\n");
            ws.close();
        } catch {}
    }).connect(key);
}
function toJSON(x){return JSON.stringify(x);}
var sshCons={},sshConTime={};
async function Exec(key,cmd,verbose=0){
    if(!key.privateKey)delete key.privateKey;
    if(!key.password)delete key.password;
    
    // 处理IPv6地址
    if(key.host && key.host.includes(':') && !key.host.startsWith('[') && !key.host.includes('.')) {
        console.log(`[SSH] Exec: 检测到IPv6地址: ${key.host}，正在格式化`);
        key.host = `[${key.host}]`;
    }
    
    var k=toJSON(key);
    var con=sshCons[k];
    if(con&&con.isConnected()){
        if((new Date())-sshConTime[k]>120000){
            await con.dispose();
            con=await ssh_con(key);
            sshConTime[k]=new Date();
        }
    }
    else{
        con=await ssh_con(key);
        sshConTime[k]=new Date();
    }
    sshCons[k]=con;
    var res=await ssh_exec(con,cmd);
    if(verbose)console.log(key.host,cmd,res);
    return res;
}
async function pidS(key,keyword){
    var x=await Exec(key,`ps -aux|grep ${keyword}|awk '{print $2}'`);
    if(!x.success)return false;
    var pids=x.data.trim().split('\n'),pS=new Set();
    for(var pid of pids)pS.add(pid);
    return pS;
}
async function netStat(key,keyword){
    var x=await Exec(key,`netstat -lp | grep ${keyword}`);
    if(!x.success)return {};
    var lines=x.data.trim().split('\n'),res={};
    try{
    for(var line of lines)if(line){
        var rows=line.trim().split(/\s+/);
        var port=rows[3].split(':').pop(),pid=rows.pop().split('/')[0];
        if(Number(port))res[Number(port)]=pid;
    }
    }
    catch{}
    return res;
}

/**
 * 测试SSH连接
 * @param {object} key - SSH连接参数
 * @return {Promise<object>} 返回测试结果
 */
async function testConnection(key) {
    try {
        if(!key.host || !key.username) {
            return {success: false, message: '缺少必要的连接参数'};
        }
        
        // 处理IPv6地址
        if(key.host.includes(':') && !key.host.startsWith('[') && !key.host.includes('.')) {
            key.host = `[${key.host}]`;
        }
        
        // 设置超时
        key.readyTimeout = 10000;
        key.tryKeyboard = true;
        
        const ssh = new NodeSSH();
        
        // 记录连接信息（不包含敏感数据）
        const logInfo = {
            host: key.host,
            port: key.port || 22,
            username: key.username,
            authMethod: key.privateKey ? (key.passphrase ? '私钥(带密码)' : '私钥') : '密码'
        };
        console.log(`[SSH测试] 尝试连接: ${JSON.stringify(logInfo)}`);
        
        // 执行连接
        await ssh.connect(key);
        
        // 测试执行简单命令
        const result = await ssh.execCommand('echo "Connection successful"');
        
        // 关闭连接
        ssh.dispose();
        
        // 检查命令执行结果
        if(result.stdout.includes('Connection successful')) {
            console.log(`[SSH测试] 连接成功: ${key.host}:${key.port}`);
            return {success: true, message: '连接成功'};
        } else {
            console.error(`[SSH测试] 命令执行失败: ${key.host}:${key.port}`, result.stderr);
            return {success: false, message: '命令执行失败', details: result.stderr};
        }
    } catch(error) {
        console.error(`[SSH测试] 连接失败: ${key.host}:${key.port || 22}`, error.message);
        
        // 提供详细的错误信息
        let errorMessage = '连接失败: ';
        
        // 根据错误类型提供具体信息
        if(error.message.includes('All configured authentication methods failed')) {
            errorMessage += '认证失败，请检查用户名和密码或私钥';
        } else if(error.message.includes('Cannot parse privateKey')) {
            errorMessage += '私钥格式不正确';
        } else if(error.message.includes('Encrypted private key detected')) {
            errorMessage += '私钥解密失败，请提供正确的私钥密码';
        } else if(error.message.includes('connect ECONNREFUSED')) {
            errorMessage += '连接被拒绝，请检查主机地址和端口是否正确';
        } else if(error.message.includes('connect ETIMEDOUT')) {
            errorMessage += '连接超时，请检查网络或防火墙设置';
        } else if(error.message.includes('getaddrinfo ENOTFOUND')) {
            errorMessage += '无法解析主机名，请检查主机地址是否正确';
        } else {
            errorMessage += error.message;
        }
        
        return {
            success: false, 
            message: errorMessage,
            details: error.message,
            code: error.code,
            level: error.level
        };
    }
}

module.exports={
    exec,spwan,
    ssh_con,ssh_exec,
    Exec,
    createSocket,
    netStat,pidS,
    testConnection,
    validatePrivateKey
}
