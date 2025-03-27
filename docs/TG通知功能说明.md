# TG通知功能文档

## 概述

Nekonekostatus 的 Telegram 通知功能允许管理员通过 Telegram 接收服务器状态通知（如服务器上线、下线、流量超限等）。

## 功能链条

1.  **配置:** 管理员在管理后台 (`views/admin/setting.html` 或 `views/admin/notification_logs.html`) 配置 Telegram Bot 的相关信息，包括 Bot Token、Chat ID 列表、连接方式（Webhook 或 Polling）、API 基础 URL 和启用状态。这些配置存储在数据库的 `setting` 表中。
2.  **初始化:**
    *   系统启动时，`database/setting.js` 会初始化 `setting` 表，并读取 Telegram Bot 的配置。
    *   `modules/notification/index.js` 中的 `NotificationManager` 类会根据配置初始化 Telegram Bot 实例（`this.bot`）。
    *   `nekonekostatus.js` 中也会根据配置初始化 Telegram bot 实例，并赋值给 `svr.locals.bot`。
3.  **状态监测:** `modules/stats/index.js` 中的 `get()` 函数定期（每1.5秒）获取所有在线服务器的状态。
4.  **通知触发:** `modules/stats/index.js` 中的 `update(server)` 函数在检测到服务器状态变化（上线或下线）时，会调用 `notification.sendNotification()` 函数。
5.  **通知发送:**
    *   `modules/stats/index.js` 实例化 `NotificationManager` 类, 并调用 `sendNotification` 方法.
    *   `modules/notification/index.js` 中的 `sendNotification` 方法会调用 `this.bot.sendMessage()`（`node-telegram-bot-api` 库提供的方法）向指定的 Chat ID 发送消息。
    *   `nekonekostatus.js` 中的 `/admin/test-telegram` 路由可以用于测试 Telegram 通知功能。它会根据配置创建一个临时的 bot 实例（或使用现有的 bot 实例），并调用 `botInstance.funcs.notice()` 发送测试消息。
    *   `bot/index.js` 中定义了 `notice` 函数，该函数封装了 `bot.sendMessage()` 方法，并处理发送结果和错误。
6.  **日志记录:** `modules/notification/index.js` 中的 `sendNotification` 方法会调用 `logSuccess` 或 `logError` 方法记录通知发送的日志，日志存储在 `data/logs` 目录下，文件名格式为 `notification-YYYY-MM.log`。
7.  **日志查看:** 管理员在管理后台 (`views/admin/notification_logs.html`) 查看通知日志。前端通过 AJAX 请求从 `/admin/notification-logs` 接口获取日志数据，并显示在表格中。

## 相关文件

*   **后端 (Node.js):**
    *   `nekonekostatus.js`: 包含初始化Telegram bot的代码，处理`/admin/test-telegram`路由用于测试通知。
    *   `bot/index.js`: 定义Telegram bot的初始化和消息发送(`notice`函数)。
    *   `modules/notification/index.js`: 定义`NotificationManager`类，处理通知发送和日志记录。
    *   `modules/stats/index.js`: 调用`NotificationManager`发送服务器恢复和掉线通知。
    *   `modules/admin/index.js`: 定义`/admin/notification-logs`和`/admin/notification-logs-page`路由，用于获取和显示通知日志。
    *   `database/setting.js`: 存储 Telegram Bot 的配置信息。
*   **前端 (HTML/JavaScript):**
    *   `views/admin/notification_logs.html`: 管理后台页面，用于配置 Telegram Bot，查看通知日志。
    *   `views/admin/setting.html`: 系统设置页面, 包含Telegram bot配置.
    *   `views/admin/sidebar.html`: 侧边栏包含“通知管理”链接。
    *   `static/js/core.js`: 前端代码，包含显示通知的通用函数(`notice`函数)。

## 数据存储

*   **Telegram Bot 配置:** 存储在数据库的 `setting` 表中。
    *   `telegram.enabled`:  布尔值，表示是否启用 Telegram 通知。
    *   `telegram.token`:  Telegram Bot 的 Token。
    *   `telegram.chatIds`:  一个数组，包含接收通知的 Chat ID。
    *   `telegram.webhook`: 布尔值, 是否使用webhook.
    *   `telegram.baseApiUrl`: Telegram API 的基础 URL.
    *   `telegram.lastTestTime`:  上次测试通知的时间戳。
*   **通知日志:** 存储在 `data/logs` 目录下，文件名格式为 `notification-YYYY-MM.log`，每行是一个 JSON 格式的日志条目。

## 注意事项

*   `modules/notification/index.js` 中 `initialize` 方法创建 bot 实例时没有传入 webhook 选项, 应该根据配置传入选项, 并且没有使用传入的chatIds。
*   `modules/notification/index.js` 和 `nekonekostatus.js` 中都初始化了 Telegram bot, 存在重复. 应该只保留一个。 建议在`nekonekostatus.js`中初始化, 并传入`modules/notification`.
*   `views/admin/setting.html` 和 `views/admin/notification_logs.html` 都包含 Telegram bot 设置, 存在重复, 应该只保留一个.
