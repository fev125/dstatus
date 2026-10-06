<p align="center"><img src="https://dstatus.sh/apple-touch-icon.png" width="80" alt="DStatus"></p>

<h1 align="center">DStatus · 服务器监控与 AI 运维</h1>

<p align="center">
实时监控服务器状态、网络质量与续费周期。AI 登录节点排查故障，确认后执行修复。<br>
自部署，一条命令安装，免费版最多接入 3 个节点。
</p>

<p align="center">
<a href="https://dstatus.sh">官网</a> ·
<a href="https://docs.dstatus.sh">文档</a> ·
<a href="https://demo.vps.mom">在线演示</a> ·
<a href="https://dstatus.sh/pricing">价格</a> ·
<a href="https://dstatus.sh/client">iPhone 与 Mac 客户端</a> ·
<a href="https://t.me/+O0oAAVsLp-4wMWQ1">Telegram 交流群</a>
</p>

![DStatus 面板首页](https://dstatus.sh/img/home-1200.webp)

## 安装

```bash
curl -fsSL dstatus.sh | bash
```

安装后进入后台即可接入节点，步骤见[快速开始](https://docs.dstatus.sh/quick-start)。需要更多节点时在后台填入许可证，已接入的节点无需重装。

## 功能

| 功能 | 说明 |
|---|---|
| 节点监控 | CPU、内存、磁盘、带宽实时刷新；卡片与列表视图，按地区、分组、标签筛选 |
| AI 运维 | 读取面板实时数据与历史记录，按优先级列出待处理事项；登录节点排查与修复，执行前由管理员确认，也可设为自动执行 |
| 值守大屏 | Orbit 三维地球大屏，正常、异常、离线态势常驻，异常按严重程度实时排序 |
| 告警通知 | 资源、流量、TCPing、HTTP、MTR 路由变化与续费事件规则；Telegram、邮件、Webhook、App 推送；短抖动抑制、静默时段、投递追踪 |
| 网络质量 | 持续 TCPing 电信、联通、移动等目标，按小时记录延迟、丢包与抖动，晚高峰独立统计 |
| MTR 路由 | 定时逐跳检测，记录每一跳的延迟与归属网络，线路切换或运营商变化时告警 |
| IP 质量与流媒体解锁 | 出口 IP 的风险、属性与位置；定时检测 Netflix、Disney+、YouTube Premium、ChatGPT 等平台可用性 |
| 资产与续费 | 价格、计费周期与到期日，本期费用与未来续费预计，到期前提醒 |
| 运维工具 | WebSSH、SFTP、SSH 脚本、节点自动发现与接入审核、Agent 批量升级 |
| 访问控制 | 公开、口令、私有三种访客模式；管理员两步验证；操作审计 |
| 主题 | 日间、夜间与跟随系统，五套配色，自定义 Logo 与 CSS |
| 客户端 | macOS 版已开放下载；iOS 版 TestFlight 公测；远程 MCP 可接入 Claude、Codex |

被控常驻内存约 30 MB（3 台 Linux 节点实测 28–42 MB）；1 核 1G 的主控实测接入 100 台，内存约 230 MB。数据保存在自有服务器，支持 SQLite 与 PostgreSQL。

## 关于本仓库

- [Releases](https://github.com/fev125/dstatus/releases) 发布 DStatus Agent 安装包。
- 仓库中的源码为早期开源版本，已停止更新；当前版本的安装与使用以官网和文档为准。

## English

DStatus is a self-hosted server monitoring and AI operations panel for people running many VPS and edge nodes. It covers real-time resource metrics, network quality (TCPing latency, jitter and packet loss to China Telecom, Unicom and Mobile), scheduled MTR route tracing with route-change alerts, IP quality and streaming unlock checks, Telegram / email / webhook / app push alerts, WebSSH with SFTP, renewal tracking, and an AI assistant that investigates nodes and runs fixes after admin approval. Install with `curl -fsSL dstatus.sh | bash`; the free tier covers 3 nodes. Website: https://dstatus.sh · Docs: https://docs.dstatus.sh
