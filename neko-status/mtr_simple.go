package main

import (
	"strconv"
	
	"github.com/gin-gonic/gin"
)

// 添加一个简单的替代函数，返回固定结果
func MTR(c *gin.Context) {
	host := c.Query("host")
	count := c.Query("count")
	if count == "" {
		count = "5"
	}
	_count, _ := strconv.Atoi(count)
	
	// 返回一个简单的固定结果
	resp(c, true, map[string]interface{}{
		"host": host,
		"count": _count,
		"message": "MTR功能暂时禁用，等待依赖问题解决",
	}, 200)
} 