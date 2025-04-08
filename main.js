const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store').default;

// 数据存储
const store = new Store({
  name: 'water-tracker-settings'
});

// 默认设置
let settings = {
    cupSize: 250, // 默认杯子大小250ml
    dailyTarget: 2000, // 默认每日目标2000ml
    notificationInterval: 60, // 默认每60分钟提醒一次
    workHours: {
        start: 9, // 默认工作时间开始于9点
        end: 18 // 默认工作时间结束于18点
    },
    workDays: [1, 2, 3, 4, 5] // 默认工作日为周一到周五
};

// 初始化设置
if (!store.get('settings')) {
    store.set('settings', settings);
}

// 初始化每日喝水记录
const today = new Date().toISOString().split('T')[0];
if (!store.get(`waterLog.${today}`)) {
    store.set(`waterLog.${today}`, {
        total: 0,
        logs: []
    });
}

let mainWindow = null;
let tray = null;

// 创建默认图标
const createDefaultIcon = () => {
    const iconPath = path.join(__dirname, 'assets', 'icons', 'icon.png');
    return nativeImage.createFromPath(iconPath);
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 800,
        // resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: createDefaultIcon()
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 创建快捷键打开开发者工具
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key === 'I') {
            mainWindow.webContents.openDevTools();
            event.preventDefault();
        }
    });

    // 禁用菜单栏
    mainWindow.setMenu(null);
}

// 创建托盘图标
function createTray() {
    tray = new Tray(createDefaultIcon());
    const contextMenu = Menu.buildFromTemplate([
        { label: '打开应用', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: '记录喝水', click: () => mainWindow.webContents.send('log-water') },
        { label: '打开开发者工具', click: () => mainWindow.webContents.openDevTools() },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
    ]);
    tray.setToolTip('喝水提醒');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow === null) {
            createWindow();
        } else {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
}

// 定时检查是否需要提醒喝水
let notificationInterval = null;

function scheduleNotification() {
    // 清除之前的定时器
    if (notificationInterval) {
        clearInterval(notificationInterval);
    }

    const settings = store.get('settings');
    const checkInterval = 1 * 60 * 1000; // 每分钟检查一次

    notificationInterval = setInterval(() => {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();
        const workDays = settings.workDays;

        // 检查是否在工作日工作时间内
        if (workDays.includes(day) && hour >= settings.workHours.start && hour < settings.workHours.end) {
            const today = new Date().toISOString().split('T')[0];
            const lastLog = store.get(`waterLog.${today}.logs`).slice(-1)[0];

            // 如果没有记录或者上次喝水时间已经超过提醒间隔
            if (!lastLog || (new Date() - new Date(lastLog.timestamp) > settings.notificationInterval * 60 * 1000)) {
                // 检查是否达到目标
                const totalToday = store.get(`waterLog.${today}.total`) || 0;
                if (totalToday < settings.dailyTarget) {
                    // 发送提醒
                    new Notification({
                        title: '喝水提醒',
                        body: `已经 ${settings.notificationInterval} 分钟没喝水了，该补充水分啦！`
                    }).show();

                    // 同时发送给渲染进程
                    if (mainWindow) {
                        mainWindow.webContents.send('drink-reminder');
                    }
                }
            }
        }
    }, checkInterval);
}

// IPC通信处理
ipcMain.on('log-water', (event, amount) => {
    const today = new Date().toISOString().split('T')[0];
    const currentLogs = store.get(`waterLog.${today}.logs`) || [];
    const currentTotal = store.get(`waterLog.${today}.total`) || 0;

    // 添加新记录
    const newLog = {
        amount,
        timestamp: new Date().toISOString()
    };

    currentLogs.push(newLog);
    store.set(`waterLog.${today}.logs`, currentLogs);
    store.set(`waterLog.${today}.total`, currentTotal + amount);

    // 返回更新后的数据
    event.reply('water-logged', {
        total: currentTotal + amount,
        logs: currentLogs
    });
});

ipcMain.on('get-settings', (event) => {
    event.reply('settings', store.get('settings'));
});

ipcMain.on('update-settings', (event, newSettings) => {
    store.set('settings', newSettings);
    // 当设置更新时，重新调度提醒
    scheduleNotification();
    event.reply('settings-updated', store.get('settings'));
});

ipcMain.on('get-water-log', (event, date) => {
    const logDate = date || new Date().toISOString().split('T')[0];
    event.reply('water-log', store.get(`waterLog.${logDate}`) || { total: 0, logs: [] });
});

// IPC通信处理 - 删除喝水记录
ipcMain.on('delete-water-log', (event, timestamp, date) => {
    const logDate = date || new Date().toISOString().split('T')[0];
    const waterLog = store.get(`waterLog.${logDate}`) || { total: 0, logs: [] };

    // 查找要删除的记录的索引
    const logIndexToDelete = waterLog.logs.findIndex(log => log.timestamp === timestamp);

    // 检查是否找到了记录
    if (logIndexToDelete !== -1) {
        // 计算删除的水量
        const deletedAmount = waterLog.logs[logIndexToDelete].amount;

        // 更新总量和日志
        waterLog.total = Math.max(0, waterLog.total - deletedAmount);
        waterLog.logs.splice(logIndexToDelete, 1);

        // 保存更新后的数据
        store.set(`waterLog.${logDate}`, waterLog);

        // 返回更新后的数据
        event.reply('water-logged', waterLog);
    } else {
        // 如果没有找到匹配的时间戳，可以考虑记录一个错误或通知用户
        console.warn(`Could not find water log entry with timestamp ${timestamp} for date ${logDate} to delete.`);
    }
});

// 应用启动完成后
app.whenReady().then(() => {
    createWindow();
    createTray();
    scheduleNotification();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 关闭所有窗口时退出应用，macOS除外
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
}); 