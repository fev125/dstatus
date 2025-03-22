"use strict";
// const config=require("../config");
// const db=require("../database")();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
module.exports=(token,chatIds,options={})=>{
    // 根据选项决定是使用webhook还是polling模式
    const botOptions = {};
    
    // 配置API基础URL
    // 默认使用官方API，如果无法访问可以通过options.baseApiUrl配置反向代理地址
    const baseApiUrl = options.baseApiUrl || 'https://api.telegram.org';
    console.log(`[TelegramBot] 使用API地址: ${baseApiUrl}`);
    console.log(`[TelegramBot] 使用的Token: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
    console.log(`[TelegramBot] ChatIds配置: ${JSON.stringify(chatIds)}`);
    
    // 移除直接的curl测试，因为在中国大陆环境下会失败
    
    if (options.webhook) {
        // webhook模式配置
        console.log('使用webhook模式初始化Telegram Bot');
        botOptions.webhook = {
            // 使用提供的端口或默认为标准HTTPS端口443
            port: options.webhookPort || 443
        };
    } else {
        // polling模式配置
        console.log('使用polling模式初始化Telegram Bot');
        botOptions.polling = {
            // 添加polling特定选项
            params: {
                timeout: 10, // 长轮询超时时间（秒）
                limit: 100   // 每次获取的更新数量限制
            },
            retryTimeout: 5000 // 出错重试间隔（毫秒）
        };
    }
    
    // 添加请求配置，增加超时时间并允许自签名证书
    botOptions.request = {
        timeout: 30000, // 30秒超时
        rejectUnauthorized: false, // 允许自签名证书，解决self-signed certificate错误
        // 添加重试和错误处理选项
        simple: false, // 不自动抛出HTTP错误
        forever: true, // 保持连接
        gzip: true,    // 启用gzip压缩
        // 添加调试信息
        verbose: true,  // 启用详细日志
        json: false     // 禁用自动JSON解析，使用纯文本请求
    };
    
    // 设置基础API URL
    botOptions.baseApiUrl = baseApiUrl;
    
    // 初始化Bot实例
    console.log(`[TelegramBot] 初始化Bot实例，选项:`, JSON.stringify(botOptions));
    const bot=new TelegramBot(token, botOptions);
    
    // 重写sendMessage方法，使用URL查询参数而不是表单数据
    const originalSendMessage = bot.sendMessage;
    bot.sendMessage = function(chatId, text, options = {}) {
        console.log(`[TelegramBot] 重写的sendMessage方法被调用`);
        console.log(`[TelegramBot] chatId: ${chatId}, text长度: ${text?.length || 0}`);
        
        // 使用_request方法直接发送请求，通过查询参数传递数据
        return this._request('sendMessage', {
            qs: {
                chat_id: chatId,
                text: text,
                ...options
            }
        });
    };
    
    // 添加错误处理
    bot.on('polling_error', (error) => {
        console.error(`[Telegram Bot] 轮询错误: ${error.code} - ${error.message}`);
        // 如果是解析错误，可能是网络问题，记录更多信息
        if (error.code === 'EPARSE') {
            console.error('[Telegram Bot] 解析响应失败，可能是网络问题或API地址无法访问');
            console.error(`[Telegram Bot] 请检查网络连接或尝试使用代理服务器`);
        }
    });
function isPm(msg){return msg.from.id==msg.chat.id;}
var Masters=new Set();
// console.log(masters);
// for(var chatId of masters)Masters.add(chatId);
async function notice(str){
    if (!chatIds || chatIds.length === 0) {
        throw new Error('未配置 Chat ID');
    }

    // 检查消息内容是否有效
    if (!str || typeof str !== 'string' || str.trim().length === 0) {
        throw new Error('消息内容为空或无效');
    }

    console.log(`[Bot] 发送通知，消息长度: ${str.length}`);
    console.log(`[Bot] 消息内容(原始): "${str}"`);
    console.log(`[Bot] 消息内容(字节): ${Buffer.from(str).toString('hex')}`);
    
    const results = [];
    const errors = [];

    for(var chatId of chatIds){
        try{
            if (!chatId) {
                throw new Error('无效的 Chat ID');
            }
            
            // 最简单的实现 - 直接调用，不传递任何选项
            const result = await bot.sendMessage(chatId, str);
            console.log(`[通知发送成功] Chat ID: ${chatId}`);
            results.push({ chatId, success: true });
        } catch(e){
            const errorMsg = `[通知发送失败] Chat ID: ${chatId}, 错误: ${e.message}`;
            console.error(errorMsg);
            console.error(`[通知发送失败] 详细错误:`, e);
            errors.push({ chatId, error: e.message });
        }
    }
    
    // 汇总发送结果
    const summary = {
        total: chatIds.length,
        success: results.length,
        failed: errors.length,
        results,
        errors
    };

    if (errors.length === chatIds.length) {
        // 所有发送都失败
        throw new Error(JSON.stringify(summary));
    }

    return summary;
}
var funcs={
    isPm,
    notice,
    // Masters,
},cmds=[];
for(var mod of [])cmds.push.apply(cmds,mod(bot,funcs,db));
return {
    bot,
    funcs,
    cmds
}
}