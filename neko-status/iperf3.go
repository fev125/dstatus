package main

import (
	"encoding/json"
	"errors"
	"os/exec"
	"neko-status/iperf3"
	"strconv"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func Iperf3(c *gin.Context) {
	host := c.PostForm("host")
	port, _ := strconv.Atoi(c.PostForm("count"))
	if port == 0 {
		port = 5201
	}
	reverse := c.PostForm("reverse") != ""
	time, _ := strconv.Atoi(c.PostForm("time"))
	if time == 0 {
		time = 10
	}
	parallel, _ := strconv.Atoi(c.PostForm("parallel"))
	if parallel == 0 {
		parallel = 1
	}
	protocol := c.PostForm("protocol")
	if protocol == "" {
		protocol = "tcp"
	}
	res, err := iperf3.Iperf3(host, port, reverse, time, parallel, protocol, nil)
	if err == nil {
		resp(c, true, res, 200)
	} else {
		resp(c, false, err, 500)
	}
}

func Iperf3Ws(c *gin.Context) {
	host := c.Query("host")
	port, _ := strconv.Atoi(c.Query("count"))
	if port == 0 {
		port = 5201
	}
	reverse := c.Query("reverse") != ""
	time, _ := strconv.Atoi(c.Query("time"))
	if time == 0 {
		time = 10
	}
	parallel, _ := strconv.Atoi(c.Query("parallel"))
	if parallel == 0 {
		parallel = 1
	}
	protocol := c.Query("protocol")
	if protocol == "" {
		protocol = "tcp"
	}
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	iperf3.Iperf3(host, port, reverse, time, parallel, protocol, ws)
}

// Iperf3Test 执行iperf3测试并返回结果
func Iperf3Test(host, port, duration, parallel string) (map[string]interface{}, error) {
	if host == "" {
		return nil, errors.New("host is required")
	}
	
	// 构建iperf3命令
	cmd := exec.Command("iperf3", "-c", host, "-p", port, "-t", duration, "-P", parallel, "-J")
	
	// 执行命令并获取输出
	output, err := cmd.CombinedOutput()
	if err != nil {
		// 如果iperf3命令不可用，返回模拟数据
		return map[string]interface{}{
			"host": host,
			"port": port,
			"duration": duration,
			"parallel": parallel,
			"message": "iperf3命令不可用或执行失败",
			"error": err.Error(),
		}, nil
	}
	
	// 解析JSON输出
	var result map[string]interface{}
	err = json.Unmarshal(output, &result)
	if err != nil {
		return nil, errors.New("failed to parse iperf3 output: " + err.Error())
	}
	
	return result, nil
}
