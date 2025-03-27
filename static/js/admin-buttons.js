/**
 * @description 管理页面按钮控制脚本
 * 1. 实现保存按钮在页面滚动时的行为控制
 * 2. 当页面向下滚动一定距离后，按钮位置固定在页面底部
 * 3. 当页面滚动到底部附近时，按钮上移，避免挡住底部内容
 * @modified 2023-10-24
 */
document.addEventListener('DOMContentLoaded', function() {
    // 获取保存按钮元素 - 更新选择器适应新的类结构
    const saveButton = document.querySelector('.fixed.bottom-6.right-6.z-50');
    
    if (!saveButton) return; // 如果页面上没有保存按钮，则退出
    
    // 初始按钮位置
    const initialBottom = 24; // 6rem = 24px
    
    // 页面滚动事件处理
    window.addEventListener('scroll', function() {
        // 获取页面滚动位置
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        // 获取页面总高度
        const totalHeight = document.documentElement.scrollHeight;
        // 获取视口高度
        const viewportHeight = window.innerHeight;
        // 计算距离底部的距离
        const distanceToBottom = totalHeight - scrollTop - viewportHeight;
        
        // 如果滚动到接近底部（100px以内），调整按钮位置向上移动
        if (distanceToBottom < 100) {
            // 当接近底部时，按钮上移，确保不会遮挡底部内容
            saveButton.style.bottom = `${initialBottom + (100 - distanceToBottom)}px`;
        } else {
            // 恢复初始位置
            saveButton.style.bottom = `${initialBottom}px`;
        }
        
        // 当页面滚动超过一定距离时，增加按钮的透明度和阴影
        if (scrollTop > 300) {
            saveButton.style.opacity = '1';
            saveButton.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)';
        } else {
            // 页面顶部时稍微降低透明度
            saveButton.style.opacity = '0.9';
            saveButton.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        }
    });
}); 