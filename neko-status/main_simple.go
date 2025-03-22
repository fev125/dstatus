package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"neko-status/stat"
	"strconv"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v2"
)

type CONF struct {
	Mode int    `yaml:"mode"`
	Key  string `yaml:"key"`
	Port int    `yaml:"port"`
}

var (
	Config CONF
)

func resp(c *gin.Context, success bool, data interface{}, code int) {
	c.JSON(code, gin.H{
		"success": success,
		"data":    data,
	})
}

func main() {
	var confpath string
	var show_version bool
	flag.StringVar(&confpath, "c", "", "config path")
	flag.IntVar(&Config.Mode, "mode", 0, "access mode")
	flag.StringVar(&Config.Key, "key", "", "access key")
	flag.IntVar(&Config.Port, "port", 8080, "port")
	flag.BoolVar(&show_version, "v", false, "show version")
	flag.Parse()

	if confpath != "" {
		data, err := ioutil.ReadFile(confpath)
		if err != nil {
			log.Panic(err)
		}
		err = yaml.Unmarshal([]byte(data), &Config)
		if err != nil {
			panic(err)
		}
	}
	if show_version {
		fmt.Println("neko-status v1.0 (simple version)")
		return
	}
	API()
}

func API() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	
	// 简化API路由，移除中间件验证
	r.GET("/stat", func(c *gin.Context) {
		key := c.Request.Header.Get("key")
		queryKey := c.Query("key")
		
		fmt.Printf("请求头密钥: [%s], 查询密钥: [%s], 配置密钥: [%s]\n", key, queryKey, Config.Key)
		
		if key == Config.Key || queryKey == Config.Key {
			Stat(c)
		} else {
			resp(c, false, "Api key Incorrect", 500)
		}
	})
	
	r.GET("/iperf3", checkKey, Iperf3)
	r.GET("/iperf3ws", checkKey, Iperf3Ws)
	r.GET("/mtr", checkKey, MTR)
	r.GET("/walled", checkKey, Stat)
	
	fmt.Println("Api port:", Config.Port)
	fmt.Println("Api key:", Config.Key)
	r.Run(":" + strconv.Itoa(Config.Port))
}

func checkKey(c *gin.Context) {
	requestKey := c.Request.Header.Get("key")
	queryKey := c.Query("key")
	
	fmt.Printf("请求密钥: [%s], 查询密钥: [%s], 配置密钥: [%s]\n", requestKey, queryKey, Config.Key)
	
	if requestKey == Config.Key || queryKey == Config.Key {
		c.Next()
	} else {
		resp(c, false, "Api key Incorrect", 500)
		c.Abort()
	}
}

func Stat(c *gin.Context) {
	// 调用stat包中的GetStat函数获取真实系统状态
	res, err := stat.GetStat()
	if err != nil {
		resp(c, false, "获取系统状态失败: "+err.Error(), 500)
		return
	}
	resp(c, true, res, 200)
}

func MTR(c *gin.Context) {
	host := c.Query("host")
	count := c.Query("count")
	if count == "" {
		count = "5"
	}
	_count, _ := strconv.Atoi(count)
	
	resp(c, true, map[string]interface{}{
		"host": host,
		"count": _count,
		"message": "MTR功能暂时禁用，等待依赖问题解决",
	}, 200)
}

func Iperf3(c *gin.Context) {
	host := c.Query("host")
	port, _ := strconv.Atoi(c.Query("port"))
	if port == 0 {
		port = 5201
	}
	
	resp(c, true, map[string]interface{}{
		"host": host,
		"port": port,
		"message": "Iperf3功能暂时禁用，等待依赖问题解决",
	}, 200)
}

func Iperf3Ws(c *gin.Context) {
	host := c.Query("host")
	port, _ := strconv.Atoi(c.Query("port"))
	if port == 0 {
		port = 5201
	}
	
	resp(c, true, map[string]interface{}{
		"host": host,
		"port": port,
		"message": "Iperf3 WebSocket功能暂时禁用，等待依赖问题解决",
	}, 200)
} 