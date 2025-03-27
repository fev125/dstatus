/**
 * settings-sync.js
 * @description 全局设置同步工具，确保个性化设置在所有页面上实时生效
 * 1. 从sessionStorage读取最新设置
 * 2. 应用壁纸和卡片样式设置到当前页面
 * 3. 监听设置变更事件
 */

(function() {
    // 防止重复初始化
    if (window.settingsSyncInitialized) return;
    window.settingsSyncInitialized = true;
    
    // 应用壁纸设置
    function applyWallpaperSettings(settings) {
        if (!settings || !settings.wallpaper) return;
        
        const wallpaperSettings = settings.wallpaper;
        
        // 移除旧的壁纸样式
        const oldStyle = document.getElementById('dynamic-wallpaper-style');
        if (oldStyle) oldStyle.remove();
        
        // 只有启用壁纸时才应用
        if (!wallpaperSettings.enabled) {
            document.body.classList.remove('has-wallpaper');
            return;
        }
        
        // 创建新的样式元素
        const styleEl = document.createElement('style');
        styleEl.id = 'dynamic-wallpaper-style';
        
        let wallpaperCss = '';
        
        // 添加基本壁纸样式
        if (wallpaperSettings.url) {
            document.body.classList.add('has-wallpaper');
            
            let backgroundSize = 'cover';
            let backgroundRepeat = 'no-repeat';
            
            // 设置平铺方式
            if (wallpaperSettings.size === 'repeat') {
                backgroundSize = 'auto';
                backgroundRepeat = wallpaperSettings.repeat || 'repeat';
            } else {
                backgroundSize = wallpaperSettings.size || 'cover';
            }
            
            // 设置是否固定
            const attachment = wallpaperSettings.fixed ? 'fixed' : 'scroll';
            
            // 构建完整背景样式
            wallpaperCss += `
            body.has-wallpaper {
                background-image: url('${wallpaperSettings.url}') !important;
                background-size: ${backgroundSize} !important;
                background-repeat: ${backgroundRepeat} !important;
                background-attachment: ${attachment} !important;
                background-position: center center !important;
            }`;
            
            // 设置亮度
            if (wallpaperSettings.brightness !== undefined) {
                const brightness = wallpaperSettings.brightness / 100;
                document.documentElement.style.setProperty('--wp-brightness', brightness);
                wallpaperCss += `
                body.has-wallpaper::before {
                    opacity: ${1 - brightness} !important;
                }`;
            }
            
            // 设置模糊效果
            if (wallpaperSettings.blur && wallpaperSettings.blur.enabled) {
                const blurAmount = wallpaperSettings.blur.amount || 10;
                document.documentElement.style.setProperty('--wp-blur-amount', blurAmount + 'px');
                document.body.classList.add('has-blur-effect');
            } else {
                document.body.classList.remove('has-blur-effect');
                document.documentElement.style.setProperty('--wp-blur-amount', '0px');
            }
        } else {
            document.body.classList.remove('has-wallpaper');
        }
        
        // 添加样式到文档
        styleEl.textContent = wallpaperCss;
        document.head.appendChild(styleEl);
    }
    
    // 应用卡片设置
    function applyCardSettings(settings) {
        if (!settings || !settings.card) return;
        
        const cardSettings = settings.card;
        
        // 移除旧的卡片样式
        const oldStyle = document.getElementById('dynamic-card-style');
        if (oldStyle) oldStyle.remove();
        
        // 创建新的样式元素
        const styleEl = document.createElement('style');
        styleEl.id = 'dynamic-card-style';
        
        let cardCss = '';
        
        // 设置卡片背景颜色和透明度
        if (cardSettings.backgroundColor) {
            document.documentElement.style.setProperty('--card-bg-color', cardSettings.backgroundColor);
            if (cardSettings.backgroundOpacity !== undefined) {
                document.documentElement.style.setProperty('--card-bg-opacity', cardSettings.backgroundOpacity);
            }
        }
        
        // 设置卡片背景图片
        if (cardSettings.backgroundImage && cardSettings.backgroundImage.enabled && cardSettings.backgroundImage.url) {
            const cardBgImage = cardSettings.backgroundImage;
            document.documentElement.style.setProperty('--card-bg-image', `url('${cardBgImage.url}')`);
            document.documentElement.style.setProperty('--card-bg-image-opacity', cardBgImage.opacity || 0.8);
            
            // 添加全局CSS类，表示卡片有背景图片
            cardCss += `
            .card, .server-card {
                position: relative;
            }
            .card.has-bg-image::after, 
            .server-card.has-bg-image::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 0;
                background-image: var(--card-bg-image);
                background-size: cover;
                background-position: center;
                opacity: var(--card-bg-image-opacity, 0.8);
                border-radius: inherit;
                pointer-events: none;
            }`;
            
            // 查找所有卡片并添加背景图片类
            setTimeout(() => {
                document.querySelectorAll('.card, .server-card').forEach(card => {
                    card.classList.add('has-bg-image');
                });
            }, 0);
        } else {
            document.documentElement.style.removeProperty('--card-bg-image');
            // 移除所有卡片的背景图片类
            setTimeout(() => {
                document.querySelectorAll('.card, .server-card').forEach(card => {
                    card.classList.remove('has-bg-image');
                });
            }, 0);
        }
        
        // 添加样式到文档
        if (cardCss) {
            styleEl.textContent = cardCss;
            document.head.appendChild(styleEl);
        }
    }
    
    // 从sessionStorage读取设置并应用
    function loadAndApplySettings() {
        try {
            const settingsJson = sessionStorage.getItem('personalization-settings');
            if (settingsJson) {
                const settings = JSON.parse(settingsJson);
                console.log('从缓存加载个性化设置:', settings);
                
                // 应用壁纸设置
                applyWallpaperSettings(settings);
                
                // 应用卡片设置
                applyCardSettings(settings);
            }
        } catch (e) {
            console.error('加载设置时出错:', e);
        }
    }
    
    // 初始化监听器，接收设置更改事件
    function initSettingsListener() {
        window.addEventListener('personalization-settings-changed', function(e) {
            if (e.detail && e.detail.settings) {
                console.log('接收到设置更改事件:', e.detail.settings);
                
                // 更新缓存
                try {
                    sessionStorage.setItem('personalization-settings', JSON.stringify(e.detail.settings));
                } catch (e) {
                    console.warn('无法更新设置缓存:', e);
                }
                
                // 应用新设置
                applyWallpaperSettings(e.detail.settings);
                applyCardSettings(e.detail.settings);
            }
        });
    }
    
    // 页面加载完成后执行初始化
    document.addEventListener('DOMContentLoaded', function() {
        console.log('初始化全局设置同步');
        loadAndApplySettings();
        initSettingsListener();
    });
    
    // 对于已加载完成的页面，立即执行
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log('页面已加载，立即初始化设置同步');
        loadAndApplySettings();
        initSettingsListener();
    }
})(); 