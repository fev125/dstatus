package stat

import (
	"neko-status/walled"
	"os"
	"runtime"
	"time"
	"os/exec"
	"strings"
	"strconv"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/disk"
	"github.com/shirou/gopsutil/host"
	"github.com/shirou/gopsutil/mem"
	"github.com/shirou/gopsutil/net"
	"github.com/shirou/gopsutil/cpu"
)

/**
 * @description 检测是否在容器环境中运行
 * 1. 通过检查容器特定文件判断
 * 2. 通过检查cgroup信息判断
 * @modified 2025-02-27
 */
func isContainerEnvironment() bool {
	// 检查是否存在Docker环境标志文件
	_, err := os.Stat("/.dockerenv")
	if err == nil {
		return true
	}
	
	// 检查cgroup信息
	if runtime.GOOS == "linux" {
		content, err := os.ReadFile("/proc/1/cgroup")
		if err == nil {
			return strings.Contains(string(content), "docker") || 
				strings.Contains(string(content), "kubepods") ||
				strings.Contains(string(content), "lxc")
		}
	}
	
	return false
}

/**
 * @description 通过系统命令获取硬盘信息 (Unix/Linux/macOS)
 * 1. 作为gopsutil库的备用方案
 * 2. 直接解析df命令输出
 * 3. 支持多种Unix系统
 * @modified 2025-02-27
 */
func getDiskInfoFromCommand(path string) (gin.H, error) {
	var cmd *exec.Cmd
	
	// 根据不同系统使用不同参数
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("df", "-k", path)
	default: // linux and other unix-like
		cmd = exec.Command("df", "-k", "-P", path)
	}
	
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("执行df命令失败: %v", err)
	}
	
	// 解析输出
	lines := strings.Split(string(output), "\n")
	if len(lines) < 2 {
		return nil, fmt.Errorf("df命令输出格式不正确")
	}
	
	// 第二行包含数据
	fields := strings.Fields(lines[1])
	if len(fields) < 5 {
		return nil, fmt.Errorf("df命令输出字段不足")
	}
	
	// 解析数值 (df输出的单位是KB)
	total, _ := strconv.ParseUint(fields[1], 10, 64)
	used, _ := strconv.ParseUint(fields[2], 10, 64)
	free, _ := strconv.ParseUint(fields[3], 10, 64)
	
	// 转换为字节
	const kbToBytes = 1024
	return gin.H{
		"total": total * kbToBytes,
		"used":  used * kbToBytes,
		"free":  free * kbToBytes,
	}, nil
}

// 获取macOS系统的CPU使用率
func getMacOSCPUUsage() ([]float64, error) {
	cmd := exec.Command("top", "-l", "1", "-n", "0")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	
	outputStr := string(output)
	lines := strings.Split(outputStr, "\n")
	
	// 查找包含CPU使用率信息的行
	var cpuLine string
	for _, line := range lines {
		if strings.Contains(line, "CPU usage") {
			cpuLine = line
			break
		}
	}
	
	if cpuLine == "" {
		return []float64{0.0}, fmt.Errorf("无法找到CPU使用率信息")
	}
	
	// 解析CPU使用率
	parts := strings.Split(cpuLine, ":")
	if len(parts) < 2 {
		return []float64{0.0}, fmt.Errorf("CPU使用率格式不正确")
	}
	
	usageParts := strings.Split(parts[1], ",")
	if len(usageParts) < 3 {
		return []float64{0.0}, fmt.Errorf("CPU使用率格式不正确")
	}
	
	// 提取用户CPU使用率
	userPart := strings.TrimSpace(usageParts[0])
	userPercent := strings.TrimSuffix(userPart, "% user")
	userPercent = strings.TrimSpace(userPercent)
	
	// 提取系统CPU使用率
	sysPart := strings.TrimSpace(usageParts[1])
	sysPercent := strings.TrimSuffix(sysPart, "% sys")
	sysPercent = strings.TrimSpace(sysPercent)
	
	// 提取空闲CPU百分比
	idlePart := strings.TrimSpace(usageParts[2])
	idlePercent := strings.TrimSuffix(idlePart, "% idle")
	idlePercent = strings.TrimSpace(idlePercent)
	
	// 转换为浮点数
	userFloat, err1 := strconv.ParseFloat(userPercent, 64)
	sysFloat, err2 := strconv.ParseFloat(sysPercent, 64)
	_, err3 := strconv.ParseFloat(idlePercent, 64)
	
	if err1 != nil || err2 != nil || err3 != nil {
		return []float64{0.0}, fmt.Errorf("解析CPU使用率失败")
	}
	
	// 计算总CPU使用率
	totalUsage := userFloat + sysFloat
	
	// 返回每个核心的使用率（这里简化为所有核心使用相同的使用率）
	numCPU := runtime.NumCPU()
	result := make([]float64, numCPU)
	for i := 0; i < numCPU; i++ {
		result[i] = totalUsage
	}
	
	return result, nil
}

/**
 * @description 获取系统硬盘数据的增强实现
 * 1. 支持多种操作系统和环境
 * 2. 提供多级降级策略
 * 3. 增强错误处理
 * @modified 2025-02-27
 */
func getDiskData(res gin.H) {
	// 确定根路径
	rootPath := "/"
	if runtime.GOOS == "windows" {
		rootPath = "C:\\"
	}
	
	// 尝试使用gopsutil获取磁盘信息
	diskUsage, err := disk.Usage(rootPath)
	if err != nil {
		fmt.Printf("使用disk.Usage获取硬盘信息失败: %v，尝试备用方法\n", err)
		
		// 如果在Unix类系统上，尝试使用命令行工具
		if runtime.GOOS == "linux" || runtime.GOOS == "darwin" || runtime.GOOS == "freebsd" {
			diskInfo, cmdErr := getDiskInfoFromCommand(rootPath)
			if cmdErr == nil {
				res["disk"] = diskInfo
				fmt.Printf("已使用备用方法获取硬盘信息\n")
				return
			}
			fmt.Printf("备用方法也失败: %v，使用默认值\n", cmdErr)
		}
		
		// 提供默认值
		res["disk"] = gin.H{
			"total": uint64(0),
			"used":  uint64(0),
			"free":  uint64(0),
		}
	} else {
		// 成功获取到硬盘信息
		res["disk"] = gin.H{
			"total": diskUsage.Total,
			"used":  diskUsage.Used,
			"free":  diskUsage.Free,
		}
	}
}

/**
 * @description 获取所有磁盘分区信息的增强实现
 * 1. 支持多种操作系统
 * 2. 过滤无效分区
 * 3. 增强错误处理
 * @modified 2025-02-27
 */
func getAllPartitionsData(res gin.H) {
	// 获取所有分区的使用情况
	partitions, err := disk.Partitions(true)
	if err != nil {
		fmt.Printf("获取分区信息失败: %v\n", err)
		return
	}
	
	disks := []gin.H{}
	for _, partition := range partitions {
		// 跳过某些特殊文件系统
		if shouldSkipFilesystem(partition.Fstype) {
			continue
		}
		
		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil {
			fmt.Printf("获取分区 %s 使用情况失败: %v\n", partition.Mountpoint, err)
			continue
		}
		
		// 跳过总容量为0或无效的分区
		if usage.Total == 0 {
			continue
		}
		
		disks = append(disks, gin.H{
			"device":  partition.Device,
			"mount":   partition.Mountpoint,
			"fstype":  partition.Fstype,
			"total":   usage.Total,
			"used":    usage.Used,
			"free":    usage.Free,
			"percent": usage.UsedPercent,
		})
	}
	
	res["disks"] = disks
}

/**
 * @description 判断是否应该跳过特定文件系统类型
 * 1. 过滤虚拟文件系统
 * 2. 过滤特殊文件系统
 * @modified 2025-02-27
 */
func shouldSkipFilesystem(fstype string) bool {
	// 定义需要跳过的文件系统类型
	skipFsTypes := map[string]bool{
		"devfs":     true,
		"tmpfs":     true,
		"devtmpfs":  true,
		"none":      true,
		"proc":      true,
		"sysfs":     true,
		"cgroup":    true,
		"cgroup2":   true,
		"pstore":    true,
		"debugfs":   true,
		"securityfs": true,
		"autofs":    true,
	}
	
	return skipFsTypes[fstype]
}

// GetStat 获取系统状态信息
func GetStat() (map[string]interface{}, error) {
	timer := time.NewTimer(500 * time.Millisecond)
	res := gin.H{
		"walled": walled.Walled,
	}
	CPU1, err := cpu.Times(true)
	if err != nil {
		return nil, err
	}
	NET1, err := net.IOCounters(true)
	if err != nil {
		return nil, err
	}
	<-timer.C
	CPU2, err := cpu.Times(true)
	if err != nil {
		return nil, err
	}
	NET2, err := net.IOCounters(true)
	if err != nil {
		return nil, err
	}
	MEM, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}
	SWAP, err := mem.SwapMemory()
	if err != nil {
		return nil, err
	}
	res["mem"] = gin.H{
		"virtual": MEM,
		"swap":    SWAP,
	}

	single := make([]float64, len(CPU1))
	var idle, total, multi float64
	idle, total = 0, 0
	for i, c1 := range CPU1 {
		c2 := CPU2[i]
		single[i] = 1 - (c2.Idle-c1.Idle)/(c2.Total()-c1.Total())
		idle += c2.Idle - c1.Idle
		total += c2.Total() - c1.Total()
	}
	multi = 1 - idle/total
	// info, err := cpu.Info()
	// if err != nil {
	// 	return nil, err
	// }
	res["cpu"] = gin.H{
		// "info":   info,
		"multi":  multi,
		"single": single,
	}

	var in, out, in_total, out_total uint64
	in, out, in_total, out_total = 0, 0, 0, 0
	res["net"] = gin.H{
		"devices": gin.H{},
	}
	for i, x := range NET2 {
		_in := x.BytesRecv - NET1[i].BytesRecv
		_out := x.BytesSent - NET1[i].BytesSent
		res["net"].(gin.H)["devices"].(gin.H)[x.Name] = gin.H{
			"delta": gin.H{
				"in":  float64(_in) / 0.5,
				"out": float64(_out) / 0.5,
			},
			"total": gin.H{
				"in":  x.BytesRecv,
				"out": x.BytesSent,
			},
		}
		if x.Name == "lo" {
			continue
		}
		in += _in
		out += _out
		in_total += x.BytesRecv
		out_total += x.BytesSent
	}
	res["net"].(gin.H)["delta"] = gin.H{
		"in":  float64(in) / 0.5,
		"out": float64(out) / 0.5,
	}
	res["net"].(gin.H)["total"] = gin.H{
		"in":  in_total,
		"out": out_total,
	}
	host, err := host.Info()
	if err != nil {
		return nil, err
	}
	res["host"] = host

	// 获取硬盘信息 - 使用增强的实现
	getDiskData(res)
	
	// 获取所有分区信息 - 使用增强的实现
	getAllPartitionsData(res)

	return res, nil
}
