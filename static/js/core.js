/**
 * 核心工具函数
 */

// 显示加载中
function startloading() {
    document.getElementById('loading').classList.remove('hidden');
}

// 隐藏加载中
function endloading() {
    document.getElementById('loading').classList.add('hidden');
}

// 显示通知
function notice(msg, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 ease-in-out translate-x-full`;
    
    // 根据类型设置样式
    switch(type) {
        case 'success':
            notification.className += ' bg-green-500 text-white';
            break;
        case 'error':
            notification.className += ' bg-red-500 text-white';
            break;
        case 'warning':
            notification.className += ' bg-yellow-500 text-white';
            break;
        default:
            notification.className += ' bg-blue-500 text-white';
    }
    
    // 设置内容
    notification.innerHTML = `
        <div class="flex items-center">
            <span class="text-sm font-medium">${msg}</span>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // 自动关闭
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 发送POST请求
async function postjson(url, data) {
    return await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(res => res.json());
}

// 获取元素值
function V(id) {
    return document.getElementById(id).value;
}

// 获取元素
function E(id) {
    return document.getElementById(id);
}

// 页面跳转
function redirect(url) {
    window.location.href = url;
}

function copy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    notice("复制成功", "success");
}

function open(url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.click();
}

function sleep(ti){return new Promise((resolve)=>setTimeout(resolve,ti));}
function refreshPage(ti=600){sleep(ti).then(()=>{window.location.reload()});}
function redirect(url,ti=600){sleep(ti).then(()=>{window.location=url});}

function setQuery(key,val){
    var x=new URLSearchParams(window.location.search);
    x.set(key,val);
    window.location.search=x.toString();
}
function delQuery(key){
    var x=new URLSearchParams(window.location.search);
    x.delete(key);
    window.location.search=x.toString();
}
window.onload=()=>{
    document.querySelectorAll("[href]").forEach(x=>{
        if(x.tagName!='A'&&x.tagName!='LINK')
            x.onclick=()=>{open(x.getAttribute("href"));};
    });
    document.querySelectorAll(".ccp").forEach(x=>{
        x.onclick=(x)=>{copy(x.target.innerText);};
        x.setAttribute("mdui-tooltip","{content:'点击复制'}");
    });
};