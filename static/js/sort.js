/**
 * @file sort.js
 * @description 服务器状态卡片排序、拖拽功能和数据管理系统
 */

// 创建命名空间，避免全局污染
const ServerCardSystem = (() => {
    // 内部变量和工具函数
    const config = {
      // 全局配置
      animation: {
        duration: 150,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)"
      },
      retry: {
        maxAttempts: 20,
        delay: 500
      },
      update: {
        interval: 2000,
        retryDelay: 5000
      }
    };

    // 工具函数
    const Utils = {
      // DOM辅助函数
      dom: {
        // 获取元素，支持选择器或元素
        get(selector, parent = document) {
          return typeof selector === 'string' ? parent.querySelector(selector) : selector;
        },
        // 获取多个元素
        getAll(selector, parent = document) {
          return Array.from(parent.querySelectorAll(selector));
        },
        // 创建元素
        create(tag, attributes = {}, children = []) {
          const element = document.createElement(tag);
          Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'class') {
              element.className = value;
            } else if (key === 'style' && typeof value === 'object') {
              Object.assign(element.style, value);
            } else {
              element.setAttribute(key, value);
            }
          });
          children.forEach(child => element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child));
          return element;
        },
        // 添加样式表
        addStyles(css, id) {
          if (id && document.getElementById(id)) return;
          const style = document.createElement('style');
          if (id) style.id = id;
          style.textContent = css;
          document.head.appendChild(style);
        }
      },

      // 异步辅助函数
      async: {
        // 等待条件满足
        waitFor(condition, timeout = 10000, interval = 100) {
          return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const check = () => {
              const result = condition();
              if (result) {
                resolve(result);
              } else if (Date.now() - startTime > timeout) {
                reject(new Error('Timeout waiting for condition'));
              } else {
                setTimeout(check, interval);
              }
            };
            check();
          });
        },
        // 延迟执行
        delay(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        },
        // 带重试的执行函数
        retry(fn, retries = 3, delay = 1000, backoff = 1.5) {
          return new Promise(async (resolve, reject) => {
            let attempt = 0;
            while (attempt < retries) {
              try {
                const result = await fn();
                return resolve(result);
              } catch (error) {
                attempt++;
                console.warn(`尝试 ${attempt}/${retries} 失败:`, error);
                if (attempt >= retries) {
                  return reject(error);
                }
                await Utils.async.delay(delay * Math.pow(backoff, attempt - 1));
              }
            }
          });
        }
      },

      // 事件辅助函数
      events: {
        // 自定义事件发布
        emit(name, detail = {}) {
          const event = new CustomEvent(name, { detail, bubbles: true });
          document.dispatchEvent(event);
          return event;
        },
        // 订阅事件
        on(name, handler) {
          document.addEventListener(name, handler);
          return () => document.removeEventListener(name, handler);
        },
        // 带防抖的事件处理
        debounce(fn, delay = 250) {
          let timer;
          return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
          };
        }
      },

      // 通知函数
      notify(message, type = 'info', duration = 3000) {
        if (typeof notice === 'function') {
          notice(message);
          return;
        }

        const typeColors = {
          error: 'bg-red-500',
          success: 'bg-green-500',
          info: 'bg-blue-500',
          warning: 'bg-amber-500'
        };

        const toast = Utils.dom.create('div', {
          class: `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${typeColors[type] || typeColors.info} text-white transition-opacity duration-300`
        }, [message]);

        document.body.appendChild(toast);

        setTimeout(() => {
          toast.classList.add('opacity-0');
          setTimeout(() => toast.remove(), 300);
        }, duration);
      },

      // 设备检测
      isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      },

      // 本地存储
      storage: {
        get(key, defaultValue = null) {
          try {
            const value = localStorage.getItem(key);
            return value !== null ? JSON.parse(value) : defaultValue;
          } catch {
            return defaultValue;
          }
        },
        set(key, value) {
          try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
          } catch {
            return false;
          }
        }
      }
    };

    // 状态管理模块
    const StateManager = (() => {
      const state = {
        isUpdating: false,
        lastUpdateTime: null,
        updateError: null,
        connectionStatus: 'disconnected',
        dragActive: false,
        sortType: 'default',
        sortDirection: 'desc'
      };

      const observers = new Map();

      // 更新状态并通知
      function setState(newState) {
        const changedKeys = [];

        // 记录变化的键
        Object.entries(newState).forEach(([key, value]) => {
          if (state[key] !== value) {
            state[key] = value;
            changedKeys.push(key);
          }
        });

        // 如果有变化，通知观察者
        if (changedKeys.length > 0) {
          notify(changedKeys);
        }
      }

      // 通知观察者状态变化
      function notify(changedKeys) {
        // 通知所有观察者
        observers.forEach((callback, keys) => {
          // 如果观察者关注任何变化，或者关注的键发生了变化
          if (keys === '*' || keys.some(key => changedKeys.includes(key))) {
            callback(state);
          }
        });
      }

      // 订阅状态变化
      function subscribe(callback, keys = '*') {
        const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
        observers.set(keys, callback);
        return id;
      }

      // 取消订阅
      function unsubscribe(id) {
        observers.delete(id);
      }

      // 获取当前状态
      function getState(key) {
        return key ? state[key] : {...state};
      }

      // 初始化
      function init() {
        // 监听统计更新事件
        Utils.events.on('statsUpdate', () => {
          setState({ lastUpdateTime: Date.now() });
        });

        return Promise.resolve(true);
      }

      return {
        getState,
        setState,
        subscribe,
        unsubscribe,
        init
      };
    })();

    // 数据管理模块
    const DataManager = (() => {
      let updateInterval = null;
      let retryTimeout = null;

      // 更新统计数据
      async function updateStats() {
        if (StateManager.getState('isUpdating')) return;

        try {
          StateManager.setState({ isUpdating: true });

          if (typeof StatsController === 'undefined') {
            throw new Error('StatsController not found');
          }

          await StatsController.update();

          StateManager.setState({
            lastUpdateTime: Date.now(),
            updateError: null,
            connectionStatus: 'connected'
          });

        } catch (error) {
          console.error('数据更新失败:', error);
          StateManager.setState({
            updateError: error.message || String(error),
            connectionStatus: 'error'
          });
          scheduleRetry();
        } finally {
          StateManager.setState({ isUpdating: false });
        }
      }

      // 启动自动更新
      function startAutoUpdate(interval = config.update.interval) {
        stopAutoUpdate();
        updateInterval = setInterval(() => updateStats(), interval);
      }

      // 停止自动更新
      function stopAutoUpdate() {
        if (updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }
      }

      // 安排重试
      function scheduleRetry(delay = config.update.retryDelay) {
        if (retryTimeout) {
          clearTimeout(retryTimeout);
        }
        retryTimeout = setTimeout(() => updateStats(), delay);
      }

      // 初始化
      async function init() {
        startAutoUpdate();
        return Promise.resolve(true);
      }

      // 获取卡片数据
      function getCardData(card) {
        return {
          id: card.dataset.sid,
          group: card.closest('.group-view')?.dataset.group,
          top: parseInt(card.dataset.top, 10) || 0,
          cpu: parseFloat(card.dataset.cpu) || 0,
          memory: parseFloat(card.dataset.memory) || 0,
          download: parseFloat(card.dataset.download) || 0,
          upload: parseFloat(card.dataset.upload) || 0,
          expiration: parseInt(card.dataset.expiration, 10) || 0,
          status: card.dataset.status || 'unknown'
        };
      }

      // 获取所有卡片数据
      function getAllCardsData() {
        return Utils.dom.getAll('.server-card').map(getCardData);
      }

      return {
        updateStats,
        startAutoUpdate,
        stopAutoUpdate,
        init,
        getCardData,
        getAllCardsData
      };
    })();

    // SortableJS 配置
    const SortableConfig = {
      // 基础配置
      base: {
        group: 'servers',
        animation: config.animation.duration,
        easing: config.animation.easing,
        delay: 100,
        delayOnTouchOnly: true,

        // 拖拽样式
        ghostClass: "sortable-ghost",
        dragClass: "sortable-drag",
        chosenClass: "sortable-chosen",

        // 性能优化
        forceFallback: false,
        fallbackTolerance: 3,
        fallbackOnBody: true,

        // 滚动设置
        scroll: true,
        scrollSensitivity: 30,
        scrollSpeed: 10,

        // 排序设置
        swapThreshold: 0.65,
        invertSwap: true,

        // 禁用离线和隐藏项
        filter: '.offline, .hidden',
        preventOnFilter: true
      },

      // 移动端配置
      mobile: {
        delay: 300,
        touchStartThreshold: 5,
        scrollSensitivity: 50
      },

      // 合并配置
      getConfig(isMobile) {
        return {
          ...this.base,
          ...(isMobile ? this.mobile : {})
        };
      }
    };

    // 拖拽状态
    const DragState = {
      active: false,
      source: null,
      sourceGroup: null,
      target: null,
      targetGroup: null,
      startIndex: -1
    };

    // API 接口
    const API = {
      endpoints: {
        updateGroup: (sid) => `/api/server/${sid}`,
        updateOrder: '/admin/servers/ord'
      },

      // 更新服务器分组
      async updateServerGroup(serverId, groupId) {
        try {
          const response = await fetch(this.endpoints.updateGroup(serverId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          if (!result.success) {
            throw new Error(result.message || '更新分组失败');
          }

          return result;
        } catch (error) {
          console.error('更新服务器分组失败:', error);
          throw error;
        }
      },

      // 更新服务器顺序
      async updateServerOrder(serverIds) {
        try {
          const response = await fetch(this.endpoints.updateOrder, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              servers: serverIds,
              group_context: true
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          if (!result.status) {
            throw new Error(result.msg || '更新排序失败');
          }

          return result;
        } catch (error) {
          console.error('更新服务器排序失败:', error);
          throw error;
        }
      }
    };

    // 拖拽动画
    const DragAnimations = {
      // CSS样式
      styles: `
        .sortable-ghost {
          opacity: 0.4;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(107, 114, 128, 0.5);
          transform: scale(0.9);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sortable-chosen {
          background: rgba(255, 255, 255, 0.1);
          transform: scale(1.02);
          z-index: 10;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }

        .sortable-drag {
          opacity: 0.9;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(107, 114, 128, 0.5);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          transform: scale(0.95);
          z-index: 100;
          transition: transform 0.3s, opacity 0.3s, box-shadow 0.3s;
        }

        .server-card {
          transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform, opacity, background-color, box-shadow;
        }

        .server-card.moving {
          transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .server-card.sort-disabled {
          cursor: no-drop;
        }

        @keyframes cardInsert {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .card-inserted {
          animation: cardInsert 200ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes success {
          0%, 100% {
            background-color: inherit;
          }
          50% {
            background-color: rgba(52, 211, 153, 0.3);
          }
        }

        @keyframes error {
          0%, 100% {
            background-color: inherit;
          }
          50% {
            background-color: rgba(239, 68, 68, 0.3);
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(59, 130, 246, 0);
          }
          50% {
            transform: scale(1.1);
            box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
          }
        }

        .tab-btn.drag-over {
          background-color: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.7);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
        }

        .tab-btn.drag-target {
          transform: scale(1.1);
          transition: transform 0.2s, box-shadow 0.2s, background-color 0.2s;
        }

        .tab-btn.drop-target {
          background-color: rgba(52, 211, 153, 0.3);
          border-color: rgba(52, 211, 153, 0.7);
          box-shadow: 0 0 15px rgba(52, 211, 153, 0.5);
        }
      `,

      // 初始化样式
      init() {
        Utils.dom.addStyles(this.styles, 'sortable-styles');
      },

      // 添加拖拽反馈
      addDragFeedback(element) {
        requestAnimationFrame(() => {
          element.style.transform = 'scale(1.02)';
          element.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
          element.style.transition = 'transform 0.2s, box-shadow 0.2s';
        });
      },

      // 移除拖拽反馈
      removeDragFeedback(element) {
        requestAnimationFrame(() => {
          element.style.transform = '';
          element.style.boxShadow = '';
        });
      },

      // 添加放置动画
      addDropAnimation(element, type = 'success') {
        element.style.animation = `${type} 0.5s cubic-bezier(0.4, 0, 0.2, 1)`;
        setTimeout(() => element.style.animation = '', 500);
      }
    };

    // 拖拽管理器
    const DragManager = (() => {
      const sortableInstances = new Map();
      let containers = [];

      // 检查拖拽是否启用
      function isDragEnabled() {
        const dragSortToggle = document.getElementById('enable-drag-sort');
        return dragSortToggle && dragSortToggle.checked && !dragSortToggle.disabled;
      }

      // 获取所有卡片容器
      function getContainers() {
        const elements = Utils.dom.getAll('.servers-group-cards, .group-cards');
        if (elements.length === 0) {
          console.log('未找到卡片容器元素');
        } else {
          console.log(`找到 ${elements.length} 个卡片容器元素`);
        }
        containers = elements;
        return containers;
      }

      // 初始化拖拽管理器
      async function init() {
        if (!isDragEnabled()) {
          console.log('拖拽功能已禁用');
          destroy();
          return Promise.resolve(false);
        }

        try {
          // 初始化动画样式
          DragAnimations.init();

          // 获取容器并创建可排序实例
          createSortables(getContainers());

          console.log('拖拽管理器初始化成功');
          return Promise.resolve(true);
        } catch (error) {
          console.error('拖拽管理器初始化失败:', error);
          return Promise.reject(error);
        }
      }

      // 创建可排序实例
      function createSortables(containers) {
        if (!isDragEnabled()) return [];

        containers.forEach(grid => {
          // 销毁旧实例
          if (sortableInstances.has(grid)) {
            sortableInstances.get(grid).destroy();
            sortableInstances.delete(grid);
          }

          const groupId = grid.closest('.group-view')?.dataset.group;
          const isAllView = groupId === 'all';

          // 设置卡片可拖拽属性
          Utils.dom.getAll('.server-card', grid).forEach(card => {
            card.draggable = isDragEnabled();
          });

          // 创建Sortable实例
          const sortable = new Sortable(grid, {
            ...SortableConfig.getConfig(Utils.isMobile()),

            // 允许所有视图内排序
            sort: true,
            group: {
              name: 'servers',
              pull: !isAllView,
              put: !isAllView
            },

            // 事件处理
            onStart: handleDragStart,
            onMove: handleDragMove,
            onEnd: handleDragEnd
          });

          sortableInstances.set(grid, sortable);
        });
      }

      // 拖拽开始处理
      function handleDragStart(evt) {
        if (!isDragEnabled()) {
          evt.preventDefault();
          return false;
        }

        const item = evt.item;
        const container = evt.from;
        const fromGroupId = container.closest('.group-view')?.dataset.group;

        // 记录拖拽状态
        Object.assign(DragState, {
          active: true,
          source: item,
          sourceGroup: fromGroupId,
          startIndex: Array.from(container.children).indexOf(item)
        });

        // 添加增强的视觉反馈
        requestAnimationFrame(() => {
          // 卡片效果
          item.style.opacity = '0.9';
          item.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
          item.style.transform = 'scale(0.95)';
          item.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.3)';
          item.style.zIndex = '100';
          item.style.transition = 'transform 0.2s, opacity 0.2s, box-shadow 0.2s';

          // 高亮分组标签
          const groupTabs = document.querySelectorAll('.tab-btn');
          groupTabs.forEach(tab => {
            if (tab.dataset.group !== 'all' && tab.dataset.group !== fromGroupId) {
              tab.style.animation = 'pulse 1.5s infinite';
              tab.style.boxShadow = '0 0 5px rgba(59, 130, 246, 0.3)';
            }
          });
        });

        // 更新全局状态
        StateManager.setState({ dragActive: true });

        // 添加拖拽中类
        document.body.classList.add('dragging-active');
      }

      // 拖拽移动处理
      function handleDragMove(evt, originalEvent) {
        if (!isDragEnabled()) {
          return false;
        }

        const { dragged, related, to, from } = evt;
        const toGroupId = to.closest('.group-view')?.dataset.group;
        const fromGroupId = from.closest('.group-view')?.dataset.group;

        // 禁止在分组视图内排序，只允许拖拽到分组标签
        if (toGroupId !== 'all' && toGroupId === fromGroupId) {
          return false;
        }

        // 禁止从其他视图拖入全部视图
        if (toGroupId === 'all' && fromGroupId !== 'all') {
          return false;
        }

        // 计算移动方向和动画
        handleMoveAnimation(dragged, related, to);

        // 更新拖拽状态
        Object.assign(DragState, {
          target: to,
          targetGroup: toGroupId
        });

        return true;
      }

      // 移动过程中的动画
      function handleMoveAnimation(dragged, related, container) {
        // 计算移动方向
        const dragRect = dragged.getBoundingClientRect();
        const relatedRect = related.getBoundingClientRect();
        const moveUp = dragRect.top < relatedRect.top;

        // 为其他卡片添加移动动画
        Array.from(container.children).forEach(child => {
          if (child === dragged) return;

          const childRect = child.getBoundingClientRect();
          if (moveUp && childRect.top > dragRect.top && childRect.top < relatedRect.top) {
            child.style.transform = 'translateY(calc(100% + 1rem))';
            child.classList.add('moving');
          } else if (!moveUp && childRect.top < dragRect.top && childRect.top > relatedRect.top) {
            child.style.transform = 'translateY(calc(-100% - 1rem))';
            child.classList.add('moving');
          } else {
            child.style.transform = '';
            child.classList.remove('moving');
          }
        });
      }

      // 拖拽结束处理
      async function handleDragEnd(evt) {
        const { item, to, from } = evt;
        const toGroupId = to.closest('.group-view')?.dataset.group;
        const fromGroupId = from.closest('.group-view')?.dataset.group;

        // 清理动画和样式
        cleanupDragEffects(to);

        // 移除拖动样式
        item.style.opacity = '';
        item.style.backgroundColor = '';

        // 重置拖拽状态
        Object.assign(DragState, {
          active: false,
          target: null,
          targetGroup: null
        });

        // 更新全局状态
        StateManager.setState({ dragActive: false });

        // 移除拖拽中类
        document.body.classList.remove('dragging-active');

        if (!to) return;

        try {
          // 添加插入动画
          item.classList.add('card-inserted');
          setTimeout(() => item.classList.remove('card-inserted'), 150);

          // 处理所有拖拽情况，包括分组内排序
          await updateCardPosition(item, toGroupId, to);
        } catch (error) {
          console.error('拖拽更新失败:', error);
          // 回滚到原始位置
          rollbackToOriginalPosition(item, from);
          // 显示错误通知
          Utils.notify(error.message || '更新失败', 'error');
        }
      }

      // 清理拖拽效果
      function cleanupDragEffects(container) {
        // 移除所有动画类
        if (container) {
          Array.from(container.children).forEach(child => {
            child.style.transform = '';
            child.style.transition = '';
            child.classList.remove('moving');
          });
        }

        // 清理标签页效果
        clearTabEffects();
      }

      // 回滚到原始位置
      function rollbackToOriginalPosition(item, container) {
        const children = Array.from(container.children);
        if (DragState.startIndex < children.length) {
          container.insertBefore(item, children[DragState.startIndex]);
        } else {
          container.appendChild(item);
        }
      }

      // 更新卡片位置
      async function updateCardPosition(card, groupId, container) {
        if (StateManager.getState('isUpdating')) {
          console.warn('状态更新中，请稍后再试');
          return;
        }

        try {
          StateManager.setState({ isUpdating: true });

          // 1. 如果是跨组拖拽
          const currentGroup = card.closest('.group-view')?.dataset.group;
          if (currentGroup !== groupId) {
            const targetContainer = document.querySelector(`.group-view[data-group="${groupId}"] .grid`);
            if (targetContainer) {
              // 在新组中插入卡片
              const cards = Utils.dom.getAll('.server-card', targetContainer);
              const insertIndex = findInsertIndex(cards, card);
              if (insertIndex === cards.length) {
                targetContainer.appendChild(card);
              } else {
                targetContainer.insertBefore(card, cards[insertIndex]);
              }
            }
            // 更新服务器分组
            await API.updateServerGroup(card.dataset.sid, groupId);
          }

          // 2. 更新排序
          if (container) {
            const cards = Utils.dom.getAll('.server-card', container);

            // 只更新当前分组内的排序
            const groupCards = cards.filter(c => c.closest('.group-view')?.dataset.group === groupId);
            if (groupCards.length > 0) {
              await API.updateServerOrder(groupCards.map(c => c.dataset.sid));
            }
          }

          Utils.notify('更新成功', 'success');
        } catch (error) {
          console.error('更新失败:', error);
          Utils.notify(error.message || '更新失败', 'error');
          throw error;
        } finally {
          StateManager.setState({ isUpdating: false });
        }
      }

      // 查找插入索引
      function findInsertIndex(cards, draggedCard) {
        // 如果没有其他卡片，插入到末尾
        if (cards.length === 0) return 0;

        // 获取拖拽卡片的位置
        const dragRect = draggedCard.getBoundingClientRect();

        // 找到第一个中心点在拖拽卡片下方的卡片
        for (let i = 0; i < cards.length; i++) {
          const cardRect = cards[i].getBoundingClientRect();
          const cardCenter = cardRect.top + cardRect.height / 2;

          if (dragRect.top < cardCenter) {
            return i;
          }
        }

        // 如果都在上方，插入到末尾
        return cards.length;
      }

      // 清理标签页效果
      function clearTabEffects() {
        Utils.dom.getAll('.tab-btn').forEach(tab => {
          tab.classList.remove('drag-over', 'drag-target', 'drop-target');
          tab.style.animation = '';
          tab.style.transform = '';
          tab.style.boxShadow = '';
          tab.style.borderColor = '';
          tab.style.backgroundColor = '';
          tab.style.transition = '';
        });
      }

      // 销毁资源
      function destroy() {
        try {
          // 清理排序实例
          sortableInstances.forEach(instance => {
            try {
              instance.destroy();
            } catch (error) {
              console.warn('清理排序实例失败:', error);
            }
          });
          sortableInstances.clear();

          // 移除所有卡片的 draggable 属性
          Utils.dom.getAll('.server-card').forEach(card => {
            card.draggable = false;
          });

          // 清理标签页效果
          clearTabEffects();

          // 清理状态
          Object.assign(DragState, {
            active: false,
            source: null,
            sourceGroup: null,
            target: null,
            targetGroup: null,
            startIndex: -1
          });

          // 移除拖拽中类
          document.body.classList.remove('dragging-active');

          console.log('拖拽功能已清理');
        } catch (error) {
          console.error('清理资源失败:', error);
        }
      }

      // 重置状态
      function reset() {
        destroy();
        return init();
      }

      return {
        init,
        destroy,
        reset,
        isDragEnabled,
        getContainers,
        createSortables,
        updateCardPosition,
        clearTabEffects
      };
    })();

    // 标签页管理器
    const TabManager = (() => {
      // 存储所有标签页的引用
      const tabs = new Map();

      // 初始化标签页管理器
      async function init() {
        try {
          // 1. 初始化所有标签页
          const tabElements = Utils.dom.getAll('.tab-btn');

          for (const tab of tabElements) {
            await initTab(tab);
          }

          // 2. 激活默认标签页
          const defaultTab = document.querySelector('.tab-btn[data-group="all"]');
          if (defaultTab) {
            await activateTab(defaultTab);
          }

          console.log('标签页管理器初始化完成');
          return true;
        } catch (error) {
          console.error('标签页管理器初始化失败:', error);
          throw error;
        }
      }

      // 初始化单个标签页
      async function initTab(tab) {
        try {
          // 1. 添加点击事件
          tab.addEventListener('click', async (e) => {
            e.preventDefault();
            if (StateManager.getState('isUpdating') || StateManager.getState('dragActive')) {
              console.warn('系统正忙，请稍后再试');
              return;
            }
            await activateTab(tab);
          });

          // 2. 如果是分组标签，添加拖拽处理
          if (tab.dataset.group && tab.dataset.group !== 'all') {
            addDragHandlers(tab);
          }

          // 3. 存储标签页引用
          tabs.set(tab.dataset.group, tab);

          return true;
        } catch (error) {
          console.error('标签页初始化失败:', error);
          throw error;
        }
      }

      // 激活标签页
      async function activateTab(tab) {
        try {
          // 1. 移除其他标签页的激活状态
          tabs.forEach(t => {
            t.classList.remove('active', 'text-white', 'bg-slate-700/60', 'border-primary-500');
          });

          // 2. 激活当前标签页
          tab.classList.add('active', 'text-white', 'bg-slate-700/60', 'border-primary-500');

          // 3. 切换视图
          const groupId = tab.dataset.group;
          switchView(groupId);

          return true;
        } catch (error) {
          console.error('视图切换失败:', error);
          Utils.notify('视图切换失败，请刷新页面重试', 'error');
          throw error;
        }
      }

      // 切换视图
      function switchView(groupId) {
        const views = Utils.dom.getAll('.group-view');

        views.forEach(view => {
          if (view.dataset.group === groupId) {
            view.classList.remove('hidden');
            // 使用 requestAnimationFrame 确保过渡动画顺滑
            requestAnimationFrame(() => {
              view.classList.remove('opacity-0');
              view.classList.add('opacity-100');
            });

            // 重新初始化当前视图的拖拽功能
            const container = view.querySelector('.grid');
            if (container) {
              DragManager.createSortables([container]);
            }
          } else {
            view.classList.add('opacity-0');
            view.classList.remove('opacity-100');
            // 等待过渡动画完成后隐藏
            setTimeout(() => {
              if (!view.classList.contains('opacity-100')) {
                view.classList.add('hidden');
              }
            }, 300);
          }
        });

        console.log('视图切换完成:', groupId);
      }

      // 添加拖拽处理程序
      function addDragHandlers(tab) {
        // 拖拽进入
        tab.addEventListener('dragenter', (e) => {
          e.preventDefault();
          if (tab.dataset.group !== 'all') {
            tab.classList.add('drag-target');
            tab.style.animation = 'pulse 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            // 增加放大效果
            tab.style.transform = 'scale(1.1)';
            tab.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.5)';
            tab.style.transition = 'transform 0.2s, box-shadow 0.2s';
          }
        });

        // 拖拽悬停
        tab.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (tab.dataset.group !== 'all') {
            DragManager.clearTabEffects();
            tab.classList.add('drag-over');
            // 增加边框闪烁效果
            tab.style.borderColor = 'rgba(59, 130, 246, 0.8)';
            tab.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
          }
        });

        // 拖拽离开
        tab.addEventListener('dragleave', (e) => {
          e.preventDefault();
          tab.classList.remove('drag-over', 'drag-target');
          tab.style.animation = '';
          // 清除所有效果
          tab.style.transform = '';
          tab.style.boxShadow = '';
          tab.style.borderColor = '';
          tab.style.backgroundColor = '';
          tab.style.transition = '';
        });

        // 拖拽放置
        tab.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          DragManager.clearTabEffects();

          if (!DragState.source || tab.dataset.group === 'all') return;

          try {
            // 增强放置效果
            tab.classList.add('drop-target');
            tab.style.transform = 'scale(1.15)';
            tab.style.boxShadow = '0 0 15px rgba(52, 211, 153, 0.7)';

            // 卡片缩小动画
            if (DragState.source) {
              DragState.source.style.transform = 'scale(0.8)';
              DragState.source.style.opacity = '0.7';
              DragState.source.style.transition = 'transform 0.3s, opacity 0.3s';
            }

            setTimeout(() => {
              tab.classList.remove('drop-target');
              tab.style.transform = '';
              tab.style.boxShadow = '';
            }, 300);

            await DragManager.updateCardPosition(DragState.source, tab.dataset.group);

            tab.style.animation = 'success 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            setTimeout(() => {
              tab.style.animation = '';
              tab.click();

              // 恢复卡片样式
              if (DragState.source) {
                DragState.source.style.transform = '';
                DragState.source.style.opacity = '';
                DragState.source.style.transition = '';
              }
            }, 500);
          } catch (error) {
            console.error('更新失败:', error);
            tab.style.animation = 'error 0.5s cubic-bezier(0.4, 0, 0.2, 1)';

            // 恢复卡片样式
            if (DragState.source) {
              DragState.source.style.transform = '';
              DragState.source.style.opacity = '';
              DragState.source.style.transition = '';
            }

            setTimeout(() => tab.style.animation = '', 500);
          }
        });
      }

      // 销毁资源
      function destroy() {
        try {
          tabs.forEach(tab => {
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
          });
          tabs.clear();
          console.log('标签页管理器已清理');
        } catch (error) {
          console.error('标签页管理器清理失败:', error);
        }
      }

      return {
        init,
        activateTab,
        destroy
      };
    })();

    // 性能监控器
    const PerformanceMonitor = (() => {
      const metrics = {
        updateTimes: [],
        errors: [],
        lastResponseTime: null
      };

      // 开始监控
      function startMonitoring() {
        StateManager.subscribe(handleStateChange, ['isUpdating', 'lastUpdateTime', 'updateError']);
      }

      // 处理状态变化
      function handleStateChange(state) {
        if (!state.isUpdating && state.lastUpdateTime) {
          recordUpdate(Date.now() - state.lastUpdateTime);
        }

        if (state.updateError) {
          recordError(state.updateError);
        }
      }

      // 记录更新时间
      function recordUpdate(duration) {
        metrics.updateTimes.push({
          time: Date.now(),
          duration
        });

        if (metrics.updateTimes.length > 100) {
          metrics.updateTimes.shift();
        }

        analyzePerformance();
      }

      // 记录错误
      function recordError(error) {
        metrics.errors.push({
          time: Date.now(),
          error: typeof error === 'string' ? error : error.message
        });

        if (metrics.errors.length > 50) {
          metrics.errors.shift();
        }
      }

      // 分析性能
      function analyzePerformance() {
        const recentUpdates = metrics.updateTimes.slice(-10);
        if (recentUpdates.length === 0) return;

        const avgDuration = recentUpdates.reduce((sum, record) => sum + record.duration, 0) / recentUpdates.length;

        if (avgDuration > 1000) {
          console.warn('性能警告: 数据更新平均耗时超过1秒');
        }
      }

      // 获取指标
      function getMetrics() {
        return {
          averageUpdateTime: calculateAverageUpdateTime(),
          errorRate: calculateErrorRate(),
          totalUpdates: metrics.updateTimes.length,
          totalErrors: metrics.errors.length
        };
      }

      // 计算平均更新时间
      function calculateAverageUpdateTime() {
        if (metrics.updateTimes.length === 0) return 0;
        const sum = metrics.updateTimes.reduce((acc, record) => acc + record.duration, 0);
        return sum / metrics.updateTimes.length;
      }

      // 计算错误率
      function calculateErrorRate() {
        if (metrics.updateTimes.length === 0) return 0;
        return metrics.errors.length / metrics.updateTimes.length;
      }

      return {
        startMonitoring,
        getMetrics
      };
    })();

    // 排序功能
    const SortingManager = (() => {
      // 获取排序值
      function getSortValue(card, type) {
        switch(type) {
          case 'default':
            return Number(card.dataset.top || 0);
          case 'cpu':
            return Number(card.dataset.cpu || 0);
          case 'memory':
            return Number(card.dataset.memory || 0);
          case 'download':
            return Number(card.dataset.download || 0);
          case 'upload':
            return Number(card.dataset.upload || 0);
          case 'expiration':
            return Number(card.dataset.expiration || 0);
          default:
            return 0;
        }
      }

      // 应用排序
      function applySort(type, direction = 'desc') {
        const activeGroupId = document.querySelector('.group-view:not(.hidden)')?.dataset.group;
        if (!activeGroupId) return;

        const container = activeGroupId === 'all' ?
            document.querySelector('.group-view[data-group="all"] .grid') :
            document.getElementById(`card-grid-${activeGroupId}`);

        if (!container) return;

        // 保存拖拽状态
        const cards = Utils.dom.getAll('.server-card', container);
        const dragStates = cards.map(card => ({
          element: card,
          state: {
            dragData: card.getAttribute('draggable'),
            dragEvents: card.getAttribute('data-has-drag-events')
          }
        }));

        // 临时禁用拖拽
        cards.forEach(card => {
          card.removeAttribute('draggable');
          card.removeAttribute('data-has-drag-events');
        });

        // 执行排序
        cards.sort((a, b) => {
          // 获取在线状态
          const isOnlineA = a.querySelector('[id$="_status_indicator"]')?.classList.contains('bg-green-500') || false;
          const isOnlineB = b.querySelector('[id$="_status_indicator"]')?.classList.contains('bg-green-500') || false;

          // 在线状态不同，在线的排在前面
          if (isOnlineA !== isOnlineB) {
            return isOnlineA ? -1 : 1;
          }

          // 获取排序值
          const valueA = getSortValue(a, type);
          const valueB = getSortValue(b, type);

          // 值相同时按top值排序
          if (valueA === valueB) {
            const topA = Number(a.dataset.top || 0);
            const topB = Number(b.dataset.top || 0);
            return topB - topA;
          }

          // 根据排序方向返回比较结果
          return direction === 'asc' ? valueA - valueB : valueB - valueA;
        });

        // 更新DOM
        const fragment = document.createDocumentFragment();
        cards.forEach(card => fragment.appendChild(card));
        container.appendChild(fragment);

        // 恢复拖拽状态
        dragStates.forEach(({element, state}) => {
          if (state.dragData) {
            element.setAttribute('draggable', state.dragData);
          }
          if (state.dragEvents) {
            element.setAttribute('data-has-drag-events', 'true');
          }
        });

        // 更新排序按钮状态
        if (typeof window.updateSortButtonStates === 'function') {
          window.updateSortButtonStates(type, direction);
        }

        // 更新状态
        StateManager.setState({
          sortType: type,
          sortDirection: direction
        });
      }

      return {
        applySort,
        getSortValue
      };
    })();

    // 系统初始化器
    const SystemInitializer = (() => {
      let initialized = false;

      // 初始化系统
      async function init() {
        if (initialized) return true;

        try {
          // 1. 等待页面完全加载
          await waitForPageLoad();

          // 2. 等待 StatsController 加载
          await waitForController();

          // 3. 等待首次数据更新完成
          await waitForDataLoad();

          // 4. 初始化各个管理器
          await Promise.all([
            TabManager.init(),
            StateManager.init(),
            DataManager.init(),
            DragManager.init()
          ]);

          // 5. 启动性能监控
          PerformanceMonitor.startMonitoring();

          initialized = true;
          console.log('系统初始化完成');
          return true;
        } catch (error) {
          console.error('系统初始化失败:', error);
          setTimeout(() => init(), 5000);
          return false;
        }
      }

      // 等待页面加载
      function waitForPageLoad() {
        return new Promise(resolve => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            window.addEventListener('load', resolve, { once: true });
          }
        });
      }

      // 等待控制器加载
      async function waitForController() {
        return Utils.async.waitFor(
          () => typeof StatsController !== 'undefined',
          config.retry.maxAttempts * config.retry.delay,
          config.retry.delay
        );
      }

      // 等待数据加载
      async function waitForDataLoad() {
        return Utils.async.waitFor(() => {
          // 检查是否有服务器卡片被渲染
          const cards = document.querySelectorAll('.server-card');
          if (cards.length === 0) return false;

          // 检查数据是否已加载
          return Array.from(cards).some(card => {
            const cpu = card.querySelector('[id$="_CPU"]');
            return cpu && cpu.textContent !== 'NaN';
          });
        }, config.retry.maxAttempts * config.retry.delay, config.retry.delay);
      }

      return {
        init,
        get isInitialized() {
          return initialized;
        }
      };
    })();

    // 导出主接口
    return {
      // 公共模块
      Utils,
      StateManager,
      DataManager,
      DragManager,
      TabManager,

      // 系统初始化
      init: SystemInitializer.init,

      // 排序功能
      applySort: SortingManager.applySort,

      // 其他辅助函数
      getPerformanceMetrics: PerformanceMonitor.getMetrics
    };
  })();

  // 系统主初始化入口
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // 初始化系统
      await ServerCardSystem.init();
    } catch (error) {
      console.error('系统启动失败:', error);
      ServerCardSystem.Utils.notify('系统启动失败，请刷新页面重试', 'error');
    }
  });

  // 拖拽排序开关控制
  document.addEventListener('DOMContentLoaded', () => {
    const dragSortToggle = document.getElementById('enable-drag-sort');
    if (!dragSortToggle) return;

    // 检查是否为游客或移动端
    const isGuest = document.body.classList.contains('guest-user');
    const isMobile = ServerCardSystem.Utils.isMobile();

    // 确保初始状态下禁用拖拽
    ServerCardSystem.Utils.dom.getAll('.server-card').forEach(card => {
      card.draggable = false;
    });

    if (isGuest || isMobile) {
      // 游客或移动端禁用拖拽功能
      dragSortToggle.checked = false;
      dragSortToggle.disabled = true;

      if (isGuest) {
        dragSortToggle.title = '游客不能使用拖拽排序功能';
      } else if (isMobile) {
        dragSortToggle.title = '移动端不支持拖拽排序功能';
      }

      localStorage.setItem('dragSortEnabled', 'false');
      ServerCardSystem.DragManager.destroy();
    } else {
      // 从localStorage读取之前的状态，默认为false
      const isDragEnabled = localStorage.getItem('dragSortEnabled') === 'true';
      dragSortToggle.checked = isDragEnabled;

      // 根据开关状态初始化或禁用拖拽功能
      if (isDragEnabled) {
        ServerCardSystem.DragManager.init();
      } else {
        ServerCardSystem.DragManager.destroy();
      }

      // 监听开关变化
      dragSortToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('dragSortEnabled', enabled);

        if (enabled) {
          ServerCardSystem.DragManager.init();
          if (typeof notice === 'function') {
            notice('已启用拖拽排序功能');
          }
        } else {
          ServerCardSystem.DragManager.destroy();
          if (typeof notice === 'function') {
            notice('已禁用拖拽排序功能');
          }
        }
      });
    }
  });

  // 导出全局接口
  // 为了保持兼容性，将部分功能暴露到全局作用域
  window.SystemInitializer = { init: ServerCardSystem.init };
  window.StateManager = ServerCardSystem.StateManager;
  window.DataManager = ServerCardSystem.DataManager;
  window.DragManager = ServerCardSystem.DragManager;
  window.TabManager = ServerCardSystem.TabManager;
  window.Utils = ServerCardSystem.Utils;
  window.DragState = ServerCardSystem.DragManager.DragState;
  // 移除这行代码，避免与stats.js中的applySort函数冲突
  // window.applySort = ServerCardSystem.applySort;