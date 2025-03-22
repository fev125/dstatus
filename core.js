"use strict";
function pr(status,data){return {status,data}};
function strB(b){
    var base=1024;
    if(b<base)return b.toString()+'B';
    if(b<base*base)return (b/base).toFixed(2)+'KB';
    if(b<base*base*base)return (b/base/base).toFixed(2)+'MB';
    if(b<base*base*base*base)return (b/base/base/base).toFixed(2)+'GB';
    else return (b/base/base/base/base).toFixed(2)+'TB';
}

/**
 * 格式化带宽数据为比特每秒
 * @param {number} b - 比特每秒的数值
 * @return {string} 格式化后的带宽字符串
 */
function strbps(b){
    var base=1000; // 带宽使用1000为基数
    if(b<128)return b.toFixed(2)+'bps';
    if(b<base*128)return (b/128).toFixed(2)+'Kbps';
    if(b<base*base*128)return (b/128/base).toFixed(2)+'Mbps';
    if(b<base*base*base*128)return (b/128/base/base).toFixed(2)+'Gbps';
    else return (b/128/base/base/base).toFixed(2)+'Tbps';
}

function parseNumber(data){
    for(var key in data)if(data[key]){
        if(typeof data[key]=='object')data[key]=parseNumber(data[key]);
        else{
            var num=Number(data[key]);
            if(num||num==0)data[key]=num;
        }
    }
    return data;
}
module.exports={
    pr,strB,strbps,parseNumber,
    uuid:require("uuid"),md5:require("md5"),
    turnDate(date){return new Date(date).toLocaleString()},
}