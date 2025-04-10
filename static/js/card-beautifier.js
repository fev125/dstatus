/**
 * 卡片美化脚本
 * @description 用于自动应用卡片背景图片和样式设置
 * @modified 2024-08-11
 */

// 在页面加载时初始化卡片美化功能
document.addEventListener('DOMContentLoaded', function() {
    initCardBeautifier();
    initTouchSupport();
});

// 初始化卡片美化
function initCardBeautifier() {
    // 从会话存储中读取设置
    try {
        const storedSettings = sessionStorage.getItem('personalization-settings');
        if (storedSettings) {
            const settings = JSON.parse(storedSettings);
            applyCardStyles(settings);
        }
    } catch (e) {
        console.warn('无法读取个性化设置:', e);
    }
}

// 应用卡片样式
function applyCardStyles(settings) {
    if (!settings) return;

    const cards = document.querySelectorAll('.server-card');
    cards.forEach(card => {
        // 更新背景图片类名和样式
        if (settings.card?.backgroundImage?.enabled) {
            card.classList.add('has-bg-image');
        } else {
            card.classList.remove('has-bg-image');
        }

        // 更新模糊效果
        if (settings.blur?.enabled) {
            card.classList.add('blur-enabled');
            card.setAttribute('data-blur-quality', settings.blur.quality || 'normal');
        } else {
            card.classList.remove('blur-enabled');
        }
    });
}

// 监听设置更新事件
document.addEventListener('personalization-settings-updated', function(event) {
    console.log('卡片美化器收到设置更新事件:', event.detail);
    const settings = event.detail;
    if (settings) {
        applyCardStyles(settings);
    }
});

// 监听 postMessage 事件，实现跨页面通信
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'personalization-settings-updated' && event.data.settings) {
        console.log('卡片美化器收到 postMessage 设置更新:', event.data.settings);
        applyCardStyles(event.data.settings);
    }
});

/**
 * @description 初始化触摸事件支持
 * 解决触屏设备上卡片区域无法滑动的问题
 */
function initTouchSupport() {
    const serverCards = document.querySelectorAll('.server-card');
    serverCards.forEach(card => {
        setupTouchHandlers(card);
    });
}

/**
 * @description 设置卡片的触摸事件处理器
 * @param {HTMLElement} card - 需要处理的卡片元素
 */
function setupTouchHandlers(card) {
    let isScrolling = false;
    let startTouchY = 0;
    let startTouchX = 0;

    card.addEventListener('touchstart', function(e) {
        isScrolling = false;
        startTouchY = e.touches[0].clientY;
        startTouchX = e.touches[0].clientX;
    }, {passive: true});

    card.addEventListener('touchmove', function(e) {
        const touchY = e.touches[0].clientY;
        const touchX = e.touches[0].clientX;
        const deltaY = Math.abs(touchY - startTouchY);
        const deltaX = Math.abs(touchX - startTouchX);

        if (deltaY > 10 || deltaX > 10) {
            isScrolling = true;
        }
    }, {passive: true});

    card.addEventListener('touchend', function() {
        isScrolling = false;
    }, {passive: true});
}

// 监听WebSocket更新，确保动态创建的卡片也应用样式
document.addEventListener('statsSyncComplete', function() {
    initCardBeautifier();
});

// 监听卡片创建事件
document.addEventListener('cardCreated', function() {
    initCardBeautifier();
});