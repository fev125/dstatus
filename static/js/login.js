async function login(){
    try {
        // 显示加载中状态
        startloading();
        
        // 获取密码并进行MD5加密
        const password = V('password');
        if (!password) {
            notice('请输入密码', 'warning');
            endloading();
            return;
        }
        
        // 发送登录请求
        console.log('发送登录请求');
        var res = await postjson("/login", {
            password: md5(password),
        });
        
        // 处理响应
        endloading();
        console.log('登录响应:', res);
        
        if (res.status) {
            notice('登录成功', 'success');
            setTimeout(() => {
                redirect('/');
            }, 500);
        } else {
            notice(res.data || '登录失败', 'error');
        }
    } catch (error) {
        console.error('登录错误:', error);
        endloading();
        notice('登录过程发生错误', 'error');
    }
}

// 绑定登录按钮点击事件
document.getElementById('login').onclick = login;

// 绑定回车键事件
document.onkeyup = function(e) {
    var event = e || window.event;
    var key = event.which || event.keyCode || event.charCode;
    if (key == 13) login();
};