// 获取Electron的ipcRenderer模块
const { ipcRenderer } = require('electron');

// DOM元素 - 控件
const customAmount = document.getElementById('custom-amount');
const logWaterBtn = document.getElementById('log-water-btn');
const cupSizeInput = document.getElementById('cup-size');
const dailyTargetInput = document.getElementById('daily-target');
const notificationIntervalInput = document.getElementById('notification-interval');
const workStartSelect = document.getElementById('work-start');
const workEndSelect = document.getElementById('work-end');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const datePicker = document.getElementById('date-picker');
const reminderToast = document.getElementById('reminder-toast');

// DOM元素 - 显示
const waterPercentage = document.getElementById('water-percentage');
const waterWave = document.getElementById('water-wave');
const waterConsumed = document.getElementById('water-consumed');
const waterTarget = document.getElementById('water-target');
const waterRemaining = document.getElementById('water-remaining');
const waterLogsContainer = document.getElementById('water-logs');
const cupOptions = document.getElementById('cup-options');
const nextReminder = document.getElementById('next-reminder');

// 设置面板相关
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsPanel = document.getElementById('settings-panel');

// 工作日复选框数组
const workdayCheckboxes = [
    document.getElementById('sunday'),
    document.getElementById('monday'),
    document.getElementById('tuesday'),
    document.getElementById('wednesday'),
    document.getElementById('thursday'),
    document.getElementById('friday'),
    document.getElementById('saturday')
];

// 当前设置和数据
let currentSettings = null;
let currentWaterLog = null;
let selectedDate = new Date().toISOString().split('T')[0];
let selectedCupSize = null;

// 初始化日期选择器
datePicker.value = selectedDate;

// 设置面板显示/隐藏
settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
});

// 初始化时间选择下拉列表
function initTimeSelects() {
    // 清空现有选项
    workStartSelect.innerHTML = '';
    workEndSelect.innerHTML = '';

    // 添加时间选项（0-23时）
    for (let i = 0; i < 24; i++) {
        const hourText = i < 10 ? `0${i}:00` : `${i}:00`;

        const startOption = document.createElement('option');
        startOption.value = i;
        startOption.textContent = hourText;
        workStartSelect.appendChild(startOption);

        const endOption = document.createElement('option');
        endOption.value = i;
        endOption.textContent = hourText;
        workEndSelect.appendChild(endOption);
    }
}

// 更新设置UI
function updateSettingsUI(settings) {
    cupSizeInput.value = settings.cupSize;
    dailyTargetInput.value = settings.dailyTarget;
    notificationIntervalInput.value = settings.notificationInterval;
    workStartSelect.value = settings.workHours.start;
    workEndSelect.value = settings.workHours.end;

    // 更新工作日复选框
    workdayCheckboxes.forEach((checkbox) => {
        checkbox.checked = settings.workDays.includes(parseInt(checkbox.value));
    });

    // 更新杯子选择
    updateCupOptions(settings.cupSize);

    // 更新目标显示
    waterTarget.textContent = `${settings.dailyTarget} ml`;
}

// 更新杯子选择选项
function updateCupOptions(cupSize) {
    cupOptions.innerHTML = '';

    // 添加不同的杯子大小选项
    const cupSizes = [
        { value: cupSize, name: '标准杯', icon: 'bi-cup-fill' },
        { value: cupSize / 2, name: '半杯', icon: 'bi-cup' },
        { value: cupSize * 1.5, name: '大杯', icon: 'bi-cup-straw' },
        { value: cupSize * 2, name: '特大杯', icon: 'bi-cup-hot-fill' }
    ];

    cupSizes.forEach(cup => {
        const cupOption = document.createElement('div');
        cupOption.className = 'cup-option';
        cupOption.dataset.value = cup.value;

        cupOption.innerHTML = `
            <div class="cup-icon">
                <i class="bi ${cup.icon}"></i>
            </div>
            <div class="cup-details">
                <div class="cup-name">&nbsp;&nbsp;${cup.name}</div>
                <div class="cup-name">&nbsp;&nbsp;${cup.value}ml</div>
            </div>
        `;

        cupOption.addEventListener('click', () => selectCup(cupOption));
        cupOptions.appendChild(cupOption);
    });

    // 默认选中第一个
    if (cupOptions.firstChild) {
        selectCup(cupOptions.firstChild);
    }
}

// 选择杯子
function selectCup(cupElement) {
    // 移除所有选中状态
    document.querySelectorAll('.cup-option').forEach(cup => {
        cup.classList.remove('selected');
    });

    // 设置当前选中
    cupElement.classList.add('selected');
    selectedCupSize = parseFloat(cupElement.dataset.value);
}

// 计算下次提醒时间
function calculateNextReminderTime() {
    if (!currentSettings || !currentWaterLog || !currentWaterLog.logs || currentWaterLog.logs.length === 0) {
        nextReminder.textContent = '--:--:--';
        return;
    }

    const now = new Date();
    const lastLog = currentWaterLog.logs[currentWaterLog.logs.length - 1];
    const lastLogTime = new Date(lastLog.timestamp);
    
    // 计算基础的下次提醒时间（基于上次记录时间）
    let nextReminderTime = new Date(lastLogTime.getTime() + currentSettings.notificationInterval * 60 * 1000);
    
    // 如果下次提醒时间已经过去，则从当前时间开始计算
    if (nextReminderTime < now) {
        nextReminderTime = new Date(now.getTime() + currentSettings.notificationInterval * 60 * 1000);
    }
    
    // 获取当前时间的小时和星期几
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    
    // 检查当前是否在工作时间内
    const isCurrentWorkTime = currentSettings.workDays.includes(currentDay) && 
                             currentHour >= currentSettings.workHours.start && 
                             currentHour < currentSettings.workHours.end;
    
    // 如果当前不在工作时间内，找到下一个工作时间
    if (!isCurrentWorkTime) {
        // 计算到下一个工作日的天数
        let daysToAdd = 0;
        let nextWorkDay = currentDay;
        
        do {
            daysToAdd++;
            nextWorkDay = (currentDay + daysToAdd) % 7;
        } while (!currentSettings.workDays.includes(nextWorkDay));
        
        // 设置时间为下一个工作日的开始时间
        nextReminderTime = new Date(now);
        nextReminderTime.setDate(nextReminderTime.getDate() + daysToAdd);
        nextReminderTime.setHours(currentSettings.workHours.start, 0, 0, 0);
    } else {
        // 当前在工作时间内，检查计算出的提醒时间是否超出工作时间
        const reminderHour = nextReminderTime.getHours();
        const reminderDay = nextReminderTime.getDay();
        
        // 检查是否超出工作时间或不在工作日
        if (!currentSettings.workDays.includes(reminderDay) || 
            reminderHour < currentSettings.workHours.start || 
            reminderHour >= currentSettings.workHours.end) {
            
            // 如果超出工作时间，设置到下一个工作日的开始时间
            let daysToAdd = 1;
            let nextWorkDay = (reminderDay + daysToAdd) % 7;
            
            while (!currentSettings.workDays.includes(nextWorkDay)) {
                daysToAdd++;
                nextWorkDay = (reminderDay + daysToAdd) % 7;
            }
            
            nextReminderTime.setDate(nextReminderTime.getDate() + daysToAdd);
            nextReminderTime.setHours(currentSettings.workHours.start, 0, 0, 0);
        }
    }
    
    // 确保时间格式正确（处理进位）
    const totalMinutes = nextReminderTime.getHours() * 60 + nextReminderTime.getMinutes();
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const seconds = nextReminderTime.getSeconds();
    
    // 格式化时间为 HH:mm:ss
    nextReminder.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// 更新喝水进度
function updateWaterProgress(waterLog, dailyTarget) {
    const total = waterLog.total || 0;
    const percentage = Math.min(Math.round((total / dailyTarget) * 100), 100);
    const remaining = Math.max(dailyTarget - total, 0);

    // 更新进度百分比和波浪高度
    waterPercentage.textContent = `${percentage}%`;
    waterWave.style.top = `${100 - percentage}%`;

    // 更新统计信息
    waterConsumed.textContent = `${total} ml`;
    waterRemaining.textContent = `${remaining} ml`;

    // 更新下次提醒时间
    calculateNextReminderTime();

    // 更新波浪颜色
    if (percentage < 30) {
        waterWave.style.background = 'linear-gradient(to bottom, #FF9800, #F44336)';
    } else if (percentage < 70) {
        waterWave.style.background = 'linear-gradient(to bottom, #FFEB3B, #FF9800)';
    } else {
        waterWave.style.background = 'linear-gradient(to bottom, #64C1FF, #0091EA)';
    }
}

// 更新喝水记录列表
function updateWaterLogs(logs) {
    waterLogsContainer.innerHTML = '';

    if (!logs || logs.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'text-center text-muted py-4';
        emptyMessage.textContent = '今天还没有喝水记录';
        waterLogsContainer.appendChild(emptyMessage);
        return;
    }

    // 按时间降序排序
    const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 创建记录项
    sortedLogs.forEach((log) => {
        const logItem = document.createElement('div');
        logItem.className = 'water-log-item';

        const timeDiv = document.createElement('div');
        timeDiv.className = 'log-time';
        const logTime = new Date(log.timestamp);
        timeDiv.textContent = logTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        const amountDiv = document.createElement('div');
        amountDiv.className = 'log-amount';
        amountDiv.textContent = `${log.amount} ml`;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'log-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.title = '删除记录';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteWaterLog(log.timestamp);
        });

        actionsDiv.appendChild(deleteBtn);

        logItem.appendChild(timeDiv);
        logItem.appendChild(amountDiv);
        logItem.appendChild(actionsDiv);
        waterLogsContainer.appendChild(logItem);
    });
}

// 删除喝水记录 - 现在接收 timestamp
function deleteWaterLog(timestamp) {
    // 显示确认对话框
    if (confirm('确定删除这条喝水记录吗？')) {
        // 发送 timestamp 而不是 index
        ipcRenderer.send('delete-water-log', timestamp, selectedDate);
    }
}

// 初始化设置和数据
function initApp() {
    initTimeSelects();

    // 获取设置
    ipcRenderer.send('get-settings');

    // 获取今日喝水记录
    requestWaterLog(selectedDate);
}

// 请求特定日期的喝水记录
function requestWaterLog(date) {
    ipcRenderer.send('get-water-log', date);
}

// 事件监听：记录喝水
logWaterBtn.addEventListener('click', () => {
    // 获取水量，优先使用自定义数量，如果为0则使用选定的杯子大小
    const amount = parseInt(customAmount.value) || selectedCupSize;

    if (amount > 0) {
        ipcRenderer.send('log-water', amount);
        // 清空自定义数量
        customAmount.value = 0;
    }
});

// 事件监听：保存设置
saveSettingsBtn.addEventListener('click', () => {
    // 获取工作日数组
    const workDays = [];
    workdayCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            workDays.push(parseInt(checkbox.value));
        }
    });

    // 构建新设置对象
    const newSettings = {
        cupSize: parseInt(cupSizeInput.value),
        dailyTarget: parseInt(dailyTargetInput.value),
        notificationInterval: parseInt(notificationIntervalInput.value),
        workHours: {
            start: parseInt(workStartSelect.value),
            end: parseInt(workEndSelect.value)
        },
        workDays: workDays
    };

    // 发送到主进程
    ipcRenderer.send('update-settings', newSettings);

    // 关闭设置面板
    settingsPanel.classList.remove('active');
});

// 日期选择器变化
datePicker.addEventListener('change', (e) => {
    selectedDate = e.target.value;
    requestWaterLog(selectedDate);
});

// IPC事件监听：接收设置
ipcRenderer.on('settings', (event, settings) => {
    currentSettings = settings;
    updateSettingsUI(settings);
});

// IPC事件监听：接收喝水记录
ipcRenderer.on('water-log', (event, waterLog) => {
    currentWaterLog = waterLog;
    if (currentSettings) {
        updateWaterProgress(waterLog, currentSettings.dailyTarget);
        updateWaterLogs(waterLog.logs);
    }
});

// IPC事件监听：设置更新后
ipcRenderer.on('settings-updated', (event, settings) => {
    currentSettings = settings;
    updateSettingsUI(settings);

    // 更新进度条，以防目标变化
    if (currentWaterLog) {
        updateWaterProgress(currentWaterLog, settings.dailyTarget);
    }
});

// IPC事件监听：喝水记录后
ipcRenderer.on('water-logged', (event, waterLog) => {
    currentWaterLog = waterLog;
    if (currentSettings) {
        updateWaterProgress(waterLog, currentSettings.dailyTarget);
        updateWaterLogs(waterLog.logs);
    }
});

// IPC事件监听：接收喝点水吧
ipcRenderer.on('drink-reminder', () => {
    // 使用Bootstrap的Toast组件显示提醒
    const toast = new bootstrap.Toast(reminderToast);
    toast.show();
    
    // 更新下次提醒时间
    calculateNextReminderTime();
});

// 初始化应用
initApp(); 