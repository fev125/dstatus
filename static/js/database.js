/**
 * 数据库管理模块
 * 提供数据库备份和恢复功能
 */
window.DatabaseManager = {
    /**
     * 下载数据库备份
     */
    downloadBackup() {
        window.location.href = '/admin/db/backup';
    },

    /**
     * 开始恢复流程
     */
    startRestore() {
        document.getElementById('dbFileInput').click();
    },

    /**
     * 处理文件选择
     * @param {HTMLInputElement} input - 文件输入元素
     */
    handleFileSelect(input) {
        if (!input.files || !input.files[0]) return;
        
        const file = input.files[0];
        if (!file.name.endsWith('.db')) {
            this.showError('请选择正确的数据库文件（.db）');
            return;
        }

        this.showDialog();
        this.handleRestore(file);
    },

    /**
     * 处理数据库恢复
     * @param {File} file - 数据库文件
     */
    async handleRestore(file) {
        try {
            const formData = new FormData();
            formData.append('database', file);

            this.showState('upload');
            const response = await fetch('/admin/db/restore', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status) {
                // 显示恢复成功状态
                this.showState('success');
                
                // 更新状态消息，提示手动重启
                const restartMessage = `
                    <div class="space-y-3">
                        <p>数据库恢复成功！</p>
                        <p>请按照以下方式手动重启系统：</p>
                        
                        <div class="space-y-2">
                            <p>1. 如果使用PM2：</p>
                            <pre class="bg-slate-800 px-3 py-2 rounded font-mono text-sm">pm2 restart nekonekostatus</pre>
                        </div>
                        
                        <div class="space-y-2">
                            <p>2. 如果使用Forever：</p>
                            <pre class="bg-slate-800 px-3 py-2 rounded font-mono text-sm">forever restart nekonekostatus.js</pre>
                        </div>
                        
                        <div class="space-y-2">
                            <p>3. 如果使用Docker：</p>
                            <pre class="bg-slate-800 px-3 py-2 rounded font-mono text-sm">docker restart dstatus</pre>
                        </div>
                        
                        <div class="space-y-2">
                            <p>4. 其他情况：</p>
                            <p class="text-sm">请直接重启应用</p>
                        </div>
                        
                        <p class="text-yellow-400 mt-4">重启后系统将加载新的数据库内容。</p>
                    </div>
                `;
                
                this.updateRestartStatus(restartMessage);
            } else {
                this.showError(result.data);
            }
        } catch (error) {
            console.error('恢复过程出错:', error);
            this.showError('恢复过程出错: ' + error.message);
        }
    },

    /**
     * 更新重启状态显示
     */
    updateRestartStatus(message) {
        const messageElement = document.getElementById('restartMessage');
        if (messageElement) {
            messageElement.innerHTML = message;
        }
    },

    /**
     * 显示对话框
     */
    showDialog() {
        const dialog = document.getElementById('restoreDialog');
        dialog.classList.remove('hidden');
        dialog.classList.add('flex');
    },

    /**
     * 关闭对话框
     */
    closeDialog() {
        const dialog = document.getElementById('restoreDialog');
        dialog.classList.add('hidden');
        dialog.classList.remove('flex');
        this.resetStates();
    },

    /**
     * 显示特定状态
     * @param {string} state - 状态名称
     */
    showState(state) {
        this.resetStates();
        const element = document.getElementById(`${state}State`);
        if (element) {
            element.classList.remove('hidden');
        }
    },

    /**
     * 重置所有状态
     */
    resetStates() {
        ['upload', 'restore', 'restart', 'success', 'error'].forEach(state => {
            const element = document.getElementById(`${state}State`);
            if (element) {
                element.classList.add('hidden');
            }
        });
    },

    /**
     * 显示错误
     * @param {string} message - 错误信息
     */
    showError(message) {
        this.showState('error');
        document.getElementById('errorMessage').textContent = message;
    },

    /**
     * 显示完成状态
     */
    showCompleted() {
        this.showState('success');
        this.updateRestartStatus('恢复完成，系统已重启');
    }
}; 