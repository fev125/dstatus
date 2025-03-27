/**
 * @description 修改说明：
 * 1. 修复登录密码验证失败的问题
 * 2. 在发送密码前进行MD5加密
 * 3. 保持原始密码字段不变，用于检查是否为默认密码
 * @modified 2024-03-21
 */

async function login(){
    try {
        // 显示加载中状态
        startloading();
        
        // 获取密码
        const password = V('password');
        if (!password) {
            notice('请输入密码', 'warning');
            endloading();
            return;
        }
        
        // 发送登录请求
        console.log('发送登录请求');
        var res = await postjson("/login", {
            password: md5(password),         // 对密码进行MD5加密
            originalPassword: password       // 保持原始密码用于检查是否为默认密码
        });
        
        // 处理响应
        endloading();
        console.log('登录响应:', res);
        
        if (res.status) {
            notice('登录成功', 'success');
            
            // 检查是否需要强制修改密码
            if (res.data.forceChangePassword) {
                // 延迟跳转到修改密码页面
                setTimeout(() => {
                    redirect('/admin/change-password');
                }, 500);
            } else {
                // 正常跳转到首页
                setTimeout(() => {
                    redirect('/');
                }, 500);
            }
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

// 绑定密码显示/隐藏功能
document.addEventListener('DOMContentLoaded', function() {
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    togglePassword.addEventListener('click', function() {
        // 切换密码显示类型
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // 切换图标
        const icon = this.querySelector('i');
        icon.textContent = type === 'password' ? 'visibility' : 'visibility_off';
    });
});