/**
 * IntelliDay - Storage & Real-Time Sync Engine
 * Manages LocalStorage, REST API, Server-Sent Events (SSE) and Multi-Device Conflict Resolution.
 */

const STORAGE_KEYS = {
  TASKS: 'intelliday_tasks_v1',
  HABITS: 'intelliday_habits_v1',
  HABIT_LOGS: 'intelliday_habit_logs_v1',
  SETTINGS: 'intelliday_settings_v1',
  NOTIFICATIONS: 'intelliday_notifications_v1',
  LAST_SYNC: 'intelliday_last_sync_v1'
};

function getDefaultTasks() {
  const todayStr = new Date().toISOString().split('T')[0];
  return [
    {
      id: 'task-1',
      title: 'Ertalabki badantarbiya va tetiklashish',
      time: '07:00',
      duration: 30,
      category: 'sport',
      priority: 'medium',
      date: todayStr,
      completed: true,
      recurring: 'daily',
      notes: 'Suv ichish va 15 daqiqa yengil cho‘zilish mashqlari',
      updatedAt: Date.now() - 3600000
    },
    {
      id: 'task-2',
      title: 'Kunlik rejalarni ko‘rib chiqish & Fokus',
      time: '08:30',
      duration: 20,
      category: 'personal',
      priority: 'high',
      date: todayStr,
      completed: true,
      recurring: 'daily',
      notes: 'Eng muhim 3 ta vazifani belgilash',
      updatedAt: Date.now() - 3000000
    },
    {
      id: 'task-3',
      title: 'Asosiy loyiha ustida chuqur ishlash (Deep Work)',
      time: '10:00',
      duration: 90,
      category: 'work',
      priority: 'high',
      date: todayStr,
      completed: false,
      recurring: 'none',
      notes: 'Telefonni ovozsiz qilib, chalg‘imasdan bajarish',
      updatedAt: Date.now() - 2000000
    },
    {
      id: 'task-4',
      title: 'Tushlik & Yengil sayr',
      time: '13:00',
      duration: 45,
      category: 'health',
      priority: 'low',
      date: todayStr,
      completed: false,
      recurring: 'daily',
      notes: 'Toza havoda nafas olish',
      updatedAt: Date.now() - 1000000
    },
    {
      id: 'task-5',
      title: 'Ingliz tili / yangi ko‘nikma o‘rganish',
      time: '16:30',
      duration: 45,
      category: 'study',
      priority: 'medium',
      date: todayStr,
      completed: false,
      recurring: 'daily',
      notes: '15 ta yangi so‘z va audio eshitish',
      updatedAt: Date.now()
    },
    {
      id: 'task-6',
      title: 'Muhim qo‘ng‘iroq / jamoa bilan uchrashuv',
      time: '18:00',
      duration: 30,
      category: 'meeting',
      priority: 'high',
      date: todayStr,
      completed: false,
      recurring: 'none',
      notes: 'Kunlik hisobot va natijalar',
      updatedAt: Date.now()
    },
    {
      id: 'task-7',
      title: 'Kitob o‘qish & Kun sarhisobi',
      time: '21:30',
      duration: 30,
      category: 'personal',
      priority: 'medium',
      date: todayStr,
      completed: false,
      recurring: 'daily',
      notes: 'Kamida 20 sahifa mutolaa',
      updatedAt: Date.now()
    }
  ];
}

function getDefaultHabits() {
  const todayStr = new Date().toISOString().split('T')[0];
  return [
    { id: 'h-1', title: '2 litr toza suv ichish', icon: '💧', streak: 5, doneToday: true, lastDoneDate: todayStr },
    { id: 'h-2', title: '30 daqiqa kitob mutolaasi', icon: '📖', streak: 12, doneToday: false, lastDoneDate: null },
    { id: 'h-3', title: 'Ertalabki yugurish / mashq', icon: '🏃‍♂️', streak: 4, doneToday: true, lastDoneDate: todayStr },
    { id: 'h-4', title: 'Telefonni 22:30 da o‘chirish', icon: '🌙', streak: 3, doneToday: false, lastDoneDate: null }
  ];
}

function getDefaultSettings() {
  return {
    theme: 'dark',
    soundEnabled: true,
    soundTone: 'chime',
    notificationsEnabled: true,
    pomodoroWorkTime: 25,
    pomodoroBreakTime: 5,
    telegramChatId: '',
    telegramBotToken: '',
    geminiApiKey: ''
  };
}

const Storage = {
  serverInfo: {
    available: false,
    ip: '127.0.0.1',
    port: 8080,
    url: 'http://localhost:8080'
  },
  syncStatus: 'offline', // 'synced' | 'syncing' | 'offline'
  sseSource: null,
  syncDebounceTimer: null,
  onUpdateCallbacks: [],

  init() {
    this.checkServerAndSync();
    window.addEventListener('online', () => this.checkServerAndSync());
  },

  registerUpdateCallback(fn) {
    if (typeof fn === 'function') this.onUpdateCallbacks.push(fn);
  },

  notifyUpdate() {
    this.onUpdateCallbacks.forEach(fn => {
      try { fn(); } catch(e){}
    });
  },

  // --------------------------------------------------------------------------
  // Server Discovery & Real-Time Sync
  // --------------------------------------------------------------------------
  async checkServerAndSync() {
    this.updateSyncBadge('syncing', 'Tekshirilmoqda...');
    try {
      const res = await fetch('/api/info', { cache: 'no-store' });
      if (res.ok) {
        const info = await res.json();
        this.serverInfo = {
          available: true,
          ip: info.ip || '127.0.0.1',
          port: info.port || 8080,
          url: info.url || `http://${info.ip}:${info.port}`
        };

        // Update phone modal display if element exists
        const phoneEl = document.getElementById('phone-modal-url');
        if (phoneEl) phoneEl.textContent = this.serverInfo.url;

        // Perform initial pull from server
        await this.pullFromServer();

        // Connect SSE for Real-Time Live updates
        this.connectSSE();

        this.updateSyncBadge('synced', 'Sinxron');
      } else {
        this.updateSyncBadge('offline', 'Lokal');
      }
    } catch (err) {
      this.serverInfo.available = false;
      this.updateSyncBadge('offline', 'Lokal');
    }
  },

  updateSyncBadge(status, label) {
    this.syncStatus = status;
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    badge.className = `sync-status-badge status-${status}`;
    const labelEl = badge.querySelector('.sync-label');
    if (labelEl) labelEl.textContent = label;

    if (status === 'synced') {
      badge.title = 'Barcha qurilmalar bilan sinxronlangan (Server faol)';
    } else if (status === 'syncing') {
      badge.title = 'Server bilan ma’lumot almashinmoqda...';
    } else {
      badge.title = 'Lokal rejim (Serverga ulanmagan)';
    }
  },

  async pullFromServer() {
    if (!this.serverInfo.available) return;
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (res.ok) {
        const serverData = await res.json();
        const localTasks = this.getTasks();

        // If server is brand new with empty tasks, seed server with local tasks
        if ((!serverData.tasks || serverData.tasks.length === 0) && localTasks.length > 0) {
          this.pushToServer();
          return;
        }

        // Smart merge tasks
        const taskMap = new Map();
        localTasks.forEach(t => taskMap.set(t.id, t));
        if (Array.isArray(serverData.tasks)) {
          serverData.tasks.forEach(st => {
            const lt = taskMap.get(st.id);
            if (!lt) {
              taskMap.set(st.id, st);
            } else {
              // Compare updatedAt or completion
              const sTime = st.updatedAt || 0;
              const lTime = lt.updatedAt || 0;
              if (sTime >= lTime) {
                taskMap.set(st.id, st);
              }
            }
          });
        }

        const mergedTasks = Array.from(taskMap.values());
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(mergedTasks));

        // Habits
        if (Array.isArray(serverData.habits) && serverData.habits.length > 0) {
          // Normalize habits to match frontend structure
          const formatted = serverData.habits.map(h => ({
            id: h.id,
            title: h.title || h.name || 'Odat',
            icon: h.icon || h.emoji || '⭐',
            streak: h.streak || 0,
            doneToday: false,
            lastDoneDate: null
          }));
          localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(formatted));
        }

        // Settings (Telegram token etc)
        if (serverData.settings) {
          const localSettings = this.getSettings();
          const mergedSettings = { ...localSettings, ...serverData.settings };
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(mergedSettings));
        }

        this.notifyUpdate();
      }
    } catch (e) {
      console.warn('[SYNC] Pull error:', e);
    }
  },

  pushToServer() {
    if (!this.serverInfo.available) return;
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);

    this.updateSyncBadge('syncing', 'Saqlanmoqda...');

    this.syncDebounceTimer = setTimeout(async () => {
      try {
        const payload = {
          tasks: this.getTasks(),
          habits: this.getHabits(),
          settings: this.getSettings(),
          updatedAt: Date.now()
        };

        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          this.updateSyncBadge('synced', 'Sinxron');
        } else {
          this.updateSyncBadge('offline', 'Xatolik');
        }
      } catch (err) {
        this.updateSyncBadge('offline', 'Lokal');
      }
    }, 400);
  },

  connectSSE() {
    if (this.sseSource) {
      this.sseSource.close();
    }

    try {
      this.sseSource = new EventSource('/api/events');

      this.sseSource.addEventListener('init', () => {
        this.updateSyncBadge('synced', 'Sinxron');
      });

      this.sseSource.addEventListener('sync', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (Array.isArray(data.tasks)) {
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(data.tasks));
          }
          this.notifyUpdate();
          this.showSyncFlash('🔄 Real-vaqt: Ma’lumotlar sinxronlandi');
        } catch (err) {}
      });

      this.sseSource.addEventListener('task_created', (e) => {
        try {
          const { task, allTasks } = JSON.parse(e.data);
          if (allTasks) {
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(allTasks));
          } else if (task) {
            const list = this.getTasks().filter(t => t.id !== task.id);
            list.push(task);
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(list));
          }
          this.notifyUpdate();
          this.showSyncFlash(`📱 Yangi reja qo‘shildi: "${task.title}"`);
        } catch (err) {}
      });

      this.sseSource.addEventListener('task_updated', (e) => {
        try {
          const { task, allTasks } = JSON.parse(e.data);
          if (allTasks) {
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(allTasks));
          } else if (task) {
            const list = this.getTasks().map(t => t.id === task.id ? task : t);
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(list));
          }
          this.notifyUpdate();
          this.showSyncFlash(`✅ Vazifa yangilandi: "${task.title}"`);
        } catch (err) {}
      });

      this.sseSource.addEventListener('habit_updated', (e) => {
        try {
          this.pullFromServer();
          this.showSyncFlash('🔥 Odatlar yangilandi!');
        } catch (err) {}
      });

      this.sseSource.addEventListener('autopilot_run', (e) => {
        try {
          const { allTasks } = JSON.parse(e.data);
          if (allTasks) {
            localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(allTasks));
          }
          this.notifyUpdate();
          this.showSyncFlash('🤖 AI Avtopilot ishga tushdi va jadval yangilandi!');
        } catch (err) {}
      });

      this.sseSource.onerror = () => {
        this.updateSyncBadge('offline', 'Lokal');
      };
    } catch (e) {
      console.warn('[SSE] EventSource init failed:', e);
    }
  },

  showSyncFlash(msg) {
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(msg);
    }
  },

  getCurrentUserStorageKey(prefix) {
    if (window.AuthManager && window.AuthManager.currentUser && window.AuthManager.currentUser.id !== 'tm_boss') {
      return `${prefix}_${window.AuthManager.currentUser.id}`;
    }
    return prefix;
  },

  async loadUserPlan(userId) {
    try {
      const res = await fetch(`/api/user/${userId}/plan`);
      if (res.ok) {
        const json = await res.json();
        if (json.plan && Array.isArray(json.plan.tasks)) {
          const key = userId === 'tm_boss' ? STORAGE_KEYS.TASKS : `${STORAGE_KEYS.TASKS}_${userId}`;
          localStorage.setItem(key, JSON.stringify(json.plan.tasks));
          this.notifyUpdate();
          if (window.Views && typeof window.Views.renderCurrentView === 'function') {
            window.Views.renderCurrentView();
          }
        }
      }
    } catch(e){}
  },

  // --------------------------------------------------------------------------
  // Tasks CRUD
  // --------------------------------------------------------------------------
  getTasks() {
    try {
      const key = this.getCurrentUserStorageKey(STORAGE_KEYS.TASKS);
      const data = localStorage.getItem(key);
      if (!data) {
        if (window.AuthManager && window.AuthManager.currentUser && window.AuthManager.currentUser.id !== 'tm_boss') {
          return [];
        }
        const initial = getDefaultTasks();
        this.saveTasks(initial);
        return initial;
      }
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  },

  saveTasks(tasks) {
    try {
      const key = this.getCurrentUserStorageKey(STORAGE_KEYS.TASKS);
      localStorage.setItem(key, JSON.stringify(tasks));
      
      const userId = (window.AuthManager && window.AuthManager.currentUser) ? window.AuthManager.currentUser.id : 'tm_boss';
      if (userId === 'tm_boss') {
        this.pushToServer();
      } else {
        fetch(`/api/user/${userId}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks })
        }).catch(()=>{});
      }
    } catch (e) {
      console.error('Error saving tasks:', e);
    }
  },

  addTask(task) {
    task.updatedAt = Date.now();
    const tasks = this.getTasks();
    tasks.push(task);
    this.saveTasks(tasks);
    return task;
  },

  updateTask(updatedTask) {
    updatedTask.updatedAt = Date.now();
    const tasks = this.getTasks().map(t => t.id === updatedTask.id ? updatedTask : t);
    this.saveTasks(tasks);
    return updatedTask;
  },

  deleteTask(taskId) {
    const tasks = this.getTasks().filter(t => t.id !== taskId);
    this.saveTasks(tasks);
  },

  // --------------------------------------------------------------------------
  // Habits CRUD
  // --------------------------------------------------------------------------
  getHabits() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HABITS);
      let habits = data ? JSON.parse(data) : getDefaultHabits();
      const todayStr = new Date().toISOString().split('T')[0];
      let changed = false;

      habits = habits.map(h => {
        const isDoneToday = h.lastDoneDate === todayStr;
        if (h.doneToday !== isDoneToday) {
          h.doneToday = isDoneToday;
          changed = true;
        }
        return h;
      });

      if (changed) {
        localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
      }
      return habits;
    } catch (e) {
      return getDefaultHabits();
    }
  },

  saveHabits(habits) {
    localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
    this.pushToServer();
  },

  toggleHabit(habitId) {
    const todayStr = new Date().toISOString().split('T')[0];
    const habits = this.getHabits().map(h => {
      if (h.id === habitId) {
        const nextState = !h.doneToday;
        return {
          ...h,
          doneToday: nextState,
          lastDoneDate: nextState ? todayStr : null,
          streak: nextState ? ((h.streak || 0) + 1) : Math.max(0, (h.streak || 1) - 1)
        };
      }
      return h;
    });
    this.saveHabits(habits);
    return habits;
  },

  addHabit(title, icon = '⭐') {
    const habits = this.getHabits();
    const newHabit = {
      id: 'h-' + Date.now(),
      title: title.trim(),
      icon: icon || '⭐',
      streak: 0,
      doneToday: false,
      lastDoneDate: null
    };
    habits.push(newHabit);
    this.saveHabits(habits);
    return newHabit;
  },

  deleteHabit(habitId) {
    const habits = this.getHabits().filter(h => h.id !== habitId);
    this.saveHabits(habits);
    return habits;
  },

  // --------------------------------------------------------------------------
  // Settings CRUD
  // --------------------------------------------------------------------------
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) {
        const initial = getDefaultSettings();
        this.saveSettings(initial);
        return initial;
      }
      return { ...getDefaultSettings(), ...JSON.parse(data) };
    } catch (e) {
      return getDefaultSettings();
    }
  },

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.pushToServer();
  },

  // --------------------------------------------------------------------------
  // Backup & Restore
  // --------------------------------------------------------------------------
  exportDataJSON() {
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      tasks: this.getTasks(),
      habits: this.getHabits(),
      settings: this.getSettings()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intelliday_zaxira_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importDataJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        this.saveTasks(parsed.tasks);
      }
      if (parsed.habits && Array.isArray(parsed.habits)) {
        this.saveHabits(parsed.habits);
      }
      if (parsed.settings) {
        this.saveSettings(parsed.settings);
      }
      this.pushToServer();
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // Notification History
  // --------------------------------------------------------------------------
  getNotificationHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  saveNotificationHistory(notifs) {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    } catch (e) {
      console.error('Error saving notification history:', e);
    }
  },

  addNotificationHistory(item) {
    const list = this.getNotificationHistory();
    const entry = {
      id: 'notif-' + Date.now(),
      title: item.title,
      body: item.body || '',
      time: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toISOString().split('T')[0],
      read: false,
      taskId: item.taskId || null,
      priority: item.priority || 'medium',
      type: item.type || 'alert'
    };
    list.unshift(entry);
    if (list.length > 30) list.pop();
    this.saveNotificationHistory(list);
    return entry;
  },

  markAllNotificationsAsRead() {
    const list = this.getNotificationHistory().map(n => ({ ...n, read: true }));
    this.saveNotificationHistory(list);
    return list;
  },

  clearNotificationHistory() {
    this.saveNotificationHistory([]);
  }
};

window.Storage = Storage;
