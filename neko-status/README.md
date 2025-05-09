# Neko-Status 客户端

Neko-Status 是一个轻量级的服务器状态监控客户端，用于收集和报告服务器的系统信息，包括CPU、内存、硬盘和网络使用情况。

## 功能特性

- 收集CPU使用率
- 收集内存使用情况
- 收集硬盘使用情况
- 收集网络流量统计
- 支持MTR网络诊断（简化版）
- 支持Iperf3网络性能测试（简化版）

## 支持的平台

### 主要操作系统

- **Linux** (amd64, arm64, arm7, arm6, arm5, 386, mips, mipsle, mips64, mips64le, ppc64le, s390x, riscv64)
- **macOS** (amd64, arm64/M1/M2/M3, 通用二进制)
- **Windows** (amd64, 386, arm64)
- **FreeBSD** (amd64, 386, arm64)
- **NetBSD** (amd64, 386)
- **OpenBSD** (amd64, 386)
- **DragonFly BSD** (amd64)

### 通用版本

- Linux通用版本 (linux_universal)
- macOS通用版本 (darwin_universal)
- 全局通用版本 (universal)

## 安装

1. 从release目录下载适合您平台的二进制文件
2. 解压缩文件：`tar -xzf neko-status_<platform>_<arch>.tar.gz`
3. 赋予执行权限：`chmod +x neko-status_<platform>_<arch>`
4. 运行客户端：`./neko-status_<platform>_<arch>`

### 通用版本

我们提供了三种通用版本，方便不同用户使用：

#### Linux通用版本

适用于大多数Linux服务器（基于x86_64架构）：

```bash
tar -xzf neko-status_linux_universal.tar.gz
chmod +x neko-status_linux_universal
./neko-status_linux_universal
```

#### macOS通用版本

适用于所有Intel芯片的Mac电脑：

```bash
tar -xzf neko-status_darwin_universal.tar.gz
chmod +x neko-status_darwin_universal
./neko-status_darwin_universal
```

#### 全局通用版本

如果您不确定应该使用哪个平台版本，可以尝试使用全局通用版本（基于Linux x86_64）：

```bash
tar -xzf neko-status_universal.tar.gz
chmod +x neko-status_universal
./neko-status_universal
```

## 使用方法

### 基本用法

```bash
./neko-status_<platform>_<arch> -key <your_api_key> -port <port_number>
```

### 命令行参数

- `-c <config_path>`: 指定配置文件路径
- `-mode <mode>`: 设置访问模式
- `-key <api_key>`: 设置API密钥
- `-port <port>`: 设置监听端口（默认：8080）
- `-v`: 显示版本信息

### 配置文件

您可以创建一个YAML格式的配置文件：

```yaml
mode: 0
key: "your_api_key"
port: 8080
```

## API接口

### 获取系统状态

```
GET /stat?key=<your_api_key>
```

返回系统状态信息，包括CPU、内存、硬盘和网络使用情况。

### MTR网络诊断

```
GET /mtr?key=<your_api_key>&host=<target_host>&count=<count>
```

执行MTR网络诊断（简化版）。

### Iperf3网络性能测试

```
GET /iperf3?key=<your_api_key>&host=<target_host>&port=<port>
```

执行Iperf3网络性能测试（简化版）。

## 构建

如果您想自己构建Neko-Status客户端，可以使用以下命令：

```bash
# 构建所有平台版本
./build-simple.sh

# 打包所有平台版本
./package.sh
```

## 平台选择指南

### Linux系统

- **Linux x86_64 (64位)**: 使用 `neko-status_linux_amd64` 或 `neko-status_linux_universal`
- **Linux x86 (32位)**: 使用 `neko-status_linux_386`
- **Linux ARM (树莓派等)**:
  - 树莓派 4/3B+/3/2: 使用 `neko-status_linux_arm7`
  - 树莓派 1/Zero: 使用 `neko-status_linux_arm6`
  - 旧版ARM设备: 使用 `neko-status_linux_arm5`
- **Linux ARM64 (新型ARM设备)**: 使用 `neko-status_linux_arm64`
- **MIPS设备 (路由器等)**:
  - 大端序: 使用 `neko-status_linux_mips` 或 `neko-status_linux_mips64`
  - 小端序: 使用 `neko-status_linux_mipsle` 或 `neko-status_linux_mips64le`
  - 软浮点: 使用带 `softfloat` 后缀的版本
- **其他特殊架构**:
  - IBM Power: 使用 `neko-status_linux_ppc64le`
  - IBM Z: 使用 `neko-status_linux_s390x`
  - RISC-V: 使用 `neko-status_linux_riscv64`

### macOS系统

- **macOS Intel**: 使用 `neko-status_darwin_amd64` 或 `neko-status_darwin_universal`
- **macOS M1/M2/M3**: 使用 `neko-status_darwin_arm64` 或 `neko-status_darwin_universal`

### Windows系统

- **Windows x64 (64位)**: 使用 `neko-status_windows_amd64.exe`
- **Windows x86 (32位)**: 使用 `neko-status_windows_386.exe`
- **Windows ARM64**: 使用 `neko-status_windows_arm64.exe`

### BSD系统

- **FreeBSD**: 使用 `neko-status_freebsd_amd64` 或 `neko-status_freebsd_386` 或 `neko-status_freebsd_arm64`
- **NetBSD**: 使用 `neko-status_netbsd_amd64` 或 `neko-status_netbsd_386`
- **OpenBSD**: 使用 `neko-status_openbsd_amd64` 或 `neko-status_openbsd_386`
- **DragonFly BSD**: 使用 `neko-status_dragonfly_amd64`

### 不确定使用哪个版本

- **Linux系统**: 尝试 `neko-status_linux_universal`
- **macOS系统**: 尝试 `neko-status_darwin_universal`
- **其他系统**: 尝试 `neko-status_universal`

## 注意事项

- 此版本使用真实数据采集，可以准确反映服务器状态
- 请确保API密钥的安全性
- 建议在防火墙后面运行，限制对API端口的访问
- 通用版本是针对特定操作系统的，不是真正的跨平台二进制文件
- 某些平台版本（如OpenBSD、RISC-V等）可能因依赖库兼容性问题而构建失败
- Windows版本使用.exe文件后缀，并以zip格式打包
- 如果您的平台不在支持列表中，请尝试使用通用版本或联系我们请求支持