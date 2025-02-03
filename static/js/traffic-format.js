/**
 * 流量单位转换工具函数
 * 提供GB和Bytes之间的转换
 */

/**
 * 将字节数转换为GB
 * @param {number} bytes 字节数
 * @returns {number} GB值,保留2位小数
 */
function bytesToGB(bytes) {
    if (!bytes) return 0;
    return Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
}

/**
 * 将GB转换为字节数
 * @param {number} gb GB值
 * @returns {number} 字节数
 */
function gbToBytes(gb) {
    if (!gb) return 0;
    return Math.floor(gb * 1024 * 1024 * 1024);
} 