/**
 * Telegram Bot API 测试文件
 * 
 
 * 使用方法：
 * node test-telegram.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 从配置文件读取设置
let setting = {};
try {
    const configPath = path.join(__dirname, 'data/config.json');
    if (fs.existsSync(configPath)) {
        setting = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('[测试] 已加载配置文件');
    } else {
        console.log('[测试] 配置文件不存在，使用命令行中的token');
    }
} catch (error) {
    console.error('[测试] 读取配置文件失败:', error);
}

// 使用配置文件中的token或命令行中的token
const token = setting.telegram?.token || '8191339558:AAEcYd4WEMlZUutS3E7ya5sW7G4x8wCutEI';
const chatId = setting.telegram?.chatIds?.[0] || '6329233087';
const baseApiUrl = setting.telegram?.baseApiUrl || 'https://api.telegram.org';

// 测试消息
const testMessage = 'Test message from Node.js: ' + Date.now();

console.log('[测试] 使用以下参数:');
console.log(`[测试] Token: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
console.log(`[测试] Chat ID: ${chatId}`);
console.log(`[测试] API URL: ${baseApiUrl}`);
console.log(`[测试] 消息内容: ${testMessage}`);

// 构建URL - 使用查询参数而不是JSON正文
const url = `${baseApiUrl}/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(testMessage)}`;
console.log(`[测试] 请求URL: ${url.replace(token, 'TOKEN_HIDDEN')}`);

// 发送请求
const req = https.request(url, {
    method: 'POST',
    rejectUnauthorized: false // 允许自签名证书
}, (res) => {
    console.log(`[测试] 状态码: ${res.statusCode}`);
    console.log(`[测试] 响应头: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log(`[测试] 响应数据: ${data}`);
        try {
            const jsonResponse = JSON.parse(data);
            if (jsonResponse.ok) {
                console.log('[测试] 消息发送成功!');
            } else {
                console.error('[测试] 消息发送失败:', jsonResponse.description);
            }
        } catch (error) {
            console.error('[测试] 解析响应失败:', error);
        }
    });
});

req.on('error', (error) => {
    console.error('[测试] 请求错误:', error);
});

req.end();

// 测试node-telegram-bot-api库的行为
console.log('[测试] 现在测试node-telegram-bot-api库...');
try {
    const TelegramBot = require('node-telegram-bot-api');
    
    // 创建bot实例
    const bot = new TelegramBot(token, {
        baseApiUrl: baseApiUrl,
        request: {
            rejectUnauthorized: false
        }
    });
    
    // 使用库发送消息
    bot.sendMessage(chatId, `Library test: ${Date.now()}`)
        .then(response => {
            console.log('[测试] 使用库发送消息成功:', response.message_id);
        })
        .catch(error => {
            console.error('[测试] 使用库发送消息失败:', error);
            
            // 尝试使用修改后的方法
            console.log('[测试] 尝试使用修改后的方法...');
            
            // 直接访问底层请求方法
            const apiRequest = bot._request.bind(bot);
            apiRequest('sendMessage', {
                qs: {
                    chat_id: chatId,
                    text: `Modified library test: ${Date.now()}`
                }
            })
                .then(response => {
                    console.log('[测试] 修改后的方法成功:', response.message_id);
                })
                .catch(error => {
                    console.error('[测试] 修改后的方法失败:', error);
                });
        });
} catch (error) {
    console.error('[测试] 加载node-telegram-bot-api库失败:', error);
} 