/**
 * IntelliDay - Professional Notifications & Web Audio Sound Engine
 * Supports:
 * - Service Worker Interactive Push Notifications (with actions)
 * - Multi-lead Time Reminders (5m before, at start, overdue)
 * - In-App Floating Toast Alerts with direct interactive buttons
 * - Telegram Bot Real Delivery
 * - Notification Center History & Bell Dropdown
 * - Mobile Audio Auto-unlock & Synthesized Chimes
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ambientSource = null;
    this.ambientGain = null;
    this.currentAmbientType = null;
    this.setupAutoUnlock();
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Auto-unlock Web Audio on first user interaction (crucial for mobile Safari/Chrome)
  setupAutoUnlock() {
    const unlock = () => {
      this.init();
      ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.removeEventListener(evt, unlock);
      });
    };
    ['click', 'touchstart', 'keydown'].forEach(evt => {
      document.addEventListener(evt, unlock, { once: true, passive: true });
    });
  }

  // Melodic two-tone chime for task reminders
  playChime() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.35); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, now + 0.2);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.55); // D6

      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.15);
      osc1.stop(now + 1.2);
      osc2.stop(now + 1.2);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // Digital urgent alarm for high-priority or overdue tasks
  playDigitalAlarm() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const pulses = [0, 0.18, 0.36];
      pulses.forEach(offset => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, now + offset); // B5
        osc.frequency.setValueAtTime(1318.51, now + offset + 0.08); // E6

        gain.gain.setValueAtTime(0.01, now + offset);
        gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.15);
      });
    } catch (e) {
      console.warn('Digital alarm error:', e);
    }
  }

  // Joyful chord for task completion
  playSuccess() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.01, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.08 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.65);
      });
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  // Deep Zen singing bowl tone for focus mode start
  playZenBowl() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(216, now); // Warm A3 resonant tone

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 2.5);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  playTone(toneName) {
    if (toneName === 'alarm') this.playDigitalAlarm();
    else if (toneName === 'bowl' || toneName === 'zen') this.playZenBowl();
    else if (toneName === 'success') this.playSuccess();
    else this.playChime();
  }

  playNotificationSound(priority = 'medium') {
    if (priority === 'high') {
      this.playDigitalAlarm();
      return;
    }
    const settings = window.Storage ? window.Storage.getSettings() : {};
    const tone = settings.soundTone || 'chime';
    this.playTone(tone);
  }

  // Ambient sound synthesizer: 'rain' or 'whitenoise'
  startAmbient(type = 'rain') {
    this.stopAmbient();
    try {
      this.init();
      if (!this.ctx) return;

      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'rain') {
          output[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5;
        } else {
          output[i] = white * 0.15;
        }
      }

      this.ambientSource = this.ctx.createBufferSource();
      this.ambientSource.buffer = noiseBuffer;
      this.ambientSource.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = type === 'rain' ? 'lowpass' : 'bandpass';
      filter.frequency.value = type === 'rain' ? 800 : 1200;

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 1);

      this.ambientSource.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(this.ctx.destination);

      this.ambientSource.start();
      this.currentAmbientType = type;
    } catch (e) {
      console.warn('Ambient noise error:', e);
    }
  }

  stopAmbient() {
    if (this.ambientSource) {
      try {
        this.ambientGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        setTimeout(() => {
          if (this.ambientSource) {
            this.ambientSource.stop();
            this.ambientSource.disconnect();
            this.ambientSource = null;
          }
        }, 550);
      } catch (e) {
        this.ambientSource = null;
      }
    }
    this.currentAmbientType = null;
  }
}

const NotificationManager = {
  sound: new SoundEngine(),
  firedAlerts: new Set(),
  isCenterOpen: false,

  init() {
    this.setupServiceWorkerListener();
    this.checkPermissionBanner();
    this.renderNotificationBell();

    // High-precision periodic check every 10 seconds
    setInterval(() => {
      this.checkScheduledTasks();
    }, 10000);
  },

  // Service Worker communication: handles notification action clicks (done, snooze)
  setupServiceWorkerListener() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data) return;
        const { type, action, taskId } = event.data;
        if (type === 'NOTIFICATION_ACTION' && taskId) {
          if (action === 'complete') {
            if (window.Schedule) window.Schedule.toggleTaskCompletion(taskId);
          } else if (action === 'snooze') {
            if (window.Schedule) window.Schedule.snoozeTask(taskId, 15);
          }
        }
      });
    }
  },

  // Permission Checks & UX Request
  getPermissionState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      alert('Kechirasiz, brauzeringiz tizimli bildirishnomalarni qo‘llab-quvvatlamaydi.');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      this.hidePermissionBanner();
      if (permission === 'granted') {
        this.sound.playSuccess();
        this.showNotification('🎉 Bildirishnomalar yoqildi!', {
          body: 'Endi rejalaringiz o‘z vaqtida eslatib turiladi!'
        });
        if (window.App) window.App.showToast('✅ Bildirishnomalarga ruxsat berildi!');
      } else if (permission === 'denied') {
        if (window.App) window.App.showToast('⚠️ Bildirishnomalar brauzer sozlamalarida bloklangan');
      }
      return permission === 'granted';
    } catch (e) {
      console.warn('Request permission error:', e);
      return false;
    }
  },

  checkPermissionBanner() {
    const banner = document.getElementById('notif-permission-banner');
    if (!banner) return;
    if (this.getPermissionState() === 'default') {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  },

  hidePermissionBanner() {
    const banner = document.getElementById('notif-permission-banner');
    if (banner) banner.style.display = 'none';
  },

  // Universal native notification sender (PWA ServiceWorker + Fallback)
  async showNotification(title, options = {}) {
    const settings = window.Storage ? window.Storage.getSettings() : { soundEnabled: true, notificationsEnabled: true };

    if (settings.soundEnabled) {
      this.sound.playNotificationSound(options.priority || 'medium');
    }

    if (!settings.notificationsEnabled || this.getPermissionState() !== 'granted') {
      return;
    }

    const notifOptions = {
      icon: './assets/icon.png',
      badge: './assets/icon.png',
      vibrate: [250, 100, 250, 100, 250],
      requireInteraction: options.priority === 'high',
      tag: options.tag || 'general-' + Date.now(),
      renotify: true,
      data: options.data || {},
      actions: options.actions || [
        { action: 'complete', title: '✅ Bajardim' },
        { action: 'snooze', title: '⏰ +15 daqiqa' }
      ],
      ...options
    };

    // Priority: Service Worker registration (works on Android PWA & background tabs)
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, notifOptions);
          return;
        }
      }
    } catch (e) {
      console.warn('Service worker showNotification error:', e);
    }

    // Fallback to Window Notification constructor
    try {
      const notif = new Notification(title, notifOptions);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('Window Notification error:', e);
    }
  },

  // In-App Interactive Toast Alert Banner (Stunning visual alert with action buttons)
  showInAppToastAlert({ title, body, taskId, priority, type }) {
    let container = document.getElementById('inapp-alerts-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'inapp-alerts-container';
      container.className = 'inapp-alerts-container';
      document.body.appendChild(container);
    }

    const alertCard = document.createElement('div');
    alertCard.className = `inapp-alert-card priority-${priority || 'medium'}`;

    const icon = type === '5min' ? '⏳' : (type === 'overdue' ? '⚠️' : '🔔');

    alertCard.innerHTML = `
      <div class="inapp-alert-header">
        <div class="inapp-alert-title-wrap">
          <span class="inapp-alert-icon">${icon}</span>
          <strong class="inapp-alert-title">${title}</strong>
        </div>
        <button class="inapp-alert-close-btn" title="Yopish">✕</button>
      </div>
      <div class="inapp-alert-body">${body}</div>
      <div class="inapp-alert-actions">
        ${taskId ? `
          <button class="btn btn-success inapp-action-done" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;">
            ✅ Bajardim
          </button>
          <button class="btn btn-secondary inapp-action-snooze" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;">
            ⏰ +15 daqiqa
          </button>
        ` : ''}
      </div>
      <div class="inapp-alert-progress">
        <div class="inapp-alert-progress-bar"></div>
      </div>
    `;

    // Bind actions
    const closeBtn = alertCard.querySelector('.inapp-alert-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => alertCard.remove();
    }

    const doneBtn = alertCard.querySelector('.inapp-action-done');
    if (doneBtn && taskId) {
      doneBtn.onclick = () => {
        if (window.Schedule) window.Schedule.toggleTaskCompletion(taskId);
        alertCard.remove();
      };
    }

    const snoozeBtn = alertCard.querySelector('.inapp-action-snooze');
    if (snoozeBtn && taskId) {
      snoozeBtn.onclick = () => {
        if (window.Schedule) window.Schedule.snoozeTask(taskId, 15);
        alertCard.remove();
      };
    }

    container.appendChild(alertCard);

    // Auto dismiss after 12s
    setTimeout(() => {
      if (alertCard.parentNode) {
        alertCard.classList.add('fade-out');
        setTimeout(() => alertCard.remove(), 300);
      }
    }, 12000);
  },

  // Telegram Real Push Sender
  async sendTelegram(token, chatId, title, body) {
    try {
      const nowStr = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
      const text = `🌟 *IntelliDay Eslatmasi*\n\n📌 *${title}*\n${body || ''}\n\n⏰ Vaqt: ${nowStr}`;
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });

      const data = await response.json();
      return data.ok === true;
    } catch (err) {
      console.warn('Telegram notification failed:', err);
      return false;
    }
  },

  async sendTelegramNotification(title, messageText = '') {
    const settings = window.Storage ? window.Storage.getSettings() : null;
    if (!settings || !settings.telegramBotToken || !settings.telegramChatId) {
      return false;
    }
    return this.sendTelegram(settings.telegramBotToken, settings.telegramChatId, title, messageText);
  },

  async testTelegramConnection(token, chatId) {
    if (!token || !chatId) {
      return { success: false, message: 'Iltimos, Bot Token va Chat ID maydonlarini to‘ldiring!' };
    }
    try {
      const success = await this.sendTelegram(
        token,
        chatId,
        'Sinov Xabari (Test)',
        'Tabriklaymiz! IntelliDay Telegram boti muvaffaqiyatli ulandi. Endi barcha muhim vazifalaringiz shu yerga yuboriladi.'
      );
      if (success) {
        return { success: true, message: '✅ Telegramga xabar yuborildi! Telegram ilovangizni tekshiring.' };
      } else {
        return { success: false, message: '❌ Bot Token yoki Chat ID noto‘g‘ri. Iltimos tekshirib qayta urinib ko‘ring.' };
      }
    } catch (e) {
      return { success: false, message: '❌ Telegram serveriga ulanishda xatolik yuz berdi.' };
    }
  },

  // Central Dispatcher: Fired when a task milestone is reached
  dispatchAlert({ task, alertType }) {
    let title = '';
    let body = '';
    let priority = task.priority || 'medium';

    if (alertType === '5min') {
      title = `⏳ 5 daqiqadan keyin: ${task.title}`;
      body = `Vazifa soat ${task.time} da boshlanadi (${task.duration} daqiqa)`;
    } else if (alertType === 'start') {
      title = `⏰ Vaqti bo‘ldi: ${task.title}`;
      body = `Rejangiz bo‘yicha hozir ushbu vazifani boshlash vaqti keldi! (${task.duration} daqiqa)`;
    } else if (alertType === 'overdue') {
      title = `⚠️ Eslatma: ${task.title}`;
      body = `Ushbu vazifangiz boshlanish vaqti o‘tib ketdi, ammo hali bajarilmadi.`;
      priority = 'high';
    }

    // 1. Native Push
    this.showNotification(title, {
      body,
      priority,
      tag: `task-${task.id}-${alertType}`,
      data: { taskId: task.id }
    });

    // 2. In-App Interactive Toast Alert
    this.showInAppToastAlert({
      title,
      body,
      taskId: task.id,
      priority,
      type: alertType
    });

    // 3. Save to Notification Center History
    if (window.Storage) {
      window.Storage.addNotificationHistory({
        title,
        body,
        taskId: task.id,
        priority,
        type: alertType
      });
      this.renderNotificationBell();
    }

    // 4. Send to Telegram
    this.sendTelegramNotification(title, body);
  },

  // High-reliability scheduler (checks minutes & lead times, impossible to miss)
  checkScheduledTasks() {
    if (!window.Storage) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const tasks = window.Storage.getTasks();

    tasks.forEach(task => {
      if (task.completed || task.date !== todayStr) return;

      const [th, tm] = task.time.split(':').map(Number);
      const startMins = th * 60 + tm;
      const diff = startMins - currentMins;

      // 1. Lead Time: Exactly 5 minutes before (diff === 5)
      const key5m = `${todayStr}_${task.id}_5min`;
      if (diff === 5 && !this.firedAlerts.has(key5m)) {
        this.firedAlerts.add(key5m);
        this.dispatchAlert({ task, alertType: '5min' });
      }

      // 2. Start Time: Diff between 0 and -2 minutes
      const keyStart = `${todayStr}_${task.id}_start`;
      if (diff <= 0 && diff >= -2 && !this.firedAlerts.has(keyStart)) {
        this.firedAlerts.add(keyStart);
        this.dispatchAlert({ task, alertType: 'start' });
      }

      // 3. Overdue Check: 15 to 30 minutes past start and still not done
      const keyOverdue = `${todayStr}_${task.id}_overdue`;
      if (diff <= -15 && diff >= -30 && !this.firedAlerts.has(keyOverdue)) {
        this.firedAlerts.add(keyOverdue);
        this.dispatchAlert({ task, alertType: 'overdue' });
      }
    });
  },

  // Notification Center Bell Dropdown
  renderNotificationBell() {
    const badge = document.getElementById('notif-bell-badge');
    if (!badge || !window.Storage) return;

    const history = window.Storage.getNotificationHistory();
    const unread = history.filter(n => !n.read).length;

    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  },

  toggleNotificationCenter() {
    const center = document.getElementById('notification-center-dropdown');
    if (!center) return;

    this.isCenterOpen = !this.isCenterOpen;
    center.classList.toggle('open', this.isCenterOpen);

    if (this.isCenterOpen) {
      this.renderNotificationCenterList();
    }
  },

  renderNotificationCenterList() {
    const listEl = document.getElementById('notif-center-list');
    if (!listEl || !window.Storage) return;

    const history = window.Storage.getNotificationHistory();
    listEl.innerHTML = '';

    if (history.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
          📭 Hozircha yangi bildirishnomalar yo‘q
        </div>
      `;
      return;
    }

    history.forEach(item => {
      const el = document.createElement('div');
      el.className = `notif-center-item ${item.read ? 'read' : 'unread'} priority-${item.priority || 'medium'}`;
      el.innerHTML = `
        <div class="notif-item-top">
          <strong class="notif-item-title">${item.title}</strong>
          <span class="notif-item-time">${item.time}</span>
        </div>
        <div class="notif-item-body">${item.body}</div>
      `;
      listEl.appendChild(el);
    });
  },

  markAllAsRead() {
    if (window.Storage) {
      window.Storage.markAllNotificationsAsRead();
      this.renderNotificationBell();
      this.renderNotificationCenterList();
      if (window.App) window.App.showToast('✅ Barcha bildirishnomalar o‘qildi deb belgilandi');
    }
  },

  clearAllNotifications() {
    if (window.Storage) {
      window.Storage.clearNotificationHistory();
      this.renderNotificationBell();
      this.renderNotificationCenterList();
      if (window.App) window.App.showToast('🗑️ Bildirishnomalar tarixi tozalandi');
    }
  },

  // Complete end-to-end Notification Test (Sound, Push, Toast)
  testFullNotification() {
    this.sound.playNotificationSound('high');
    this.showNotification('🎯 Test Bildirishnomasi', {
      body: 'Bu IntelliDay professional eslatma tizimi sinovidir. Tizim a’lo darajada ishlamoqda!',
      priority: 'high',
      actions: [
        { action: 'complete', title: '✅ Tushunarli' },
        { action: 'snooze', title: '⏰ Yopish' }
      ]
    });
    this.showInAppToastAlert({
      title: '🎯 Test Bildirishnomasi',
      body: 'Bu IntelliDay professional eslatma tizimi sinovidir. Tovush, ekran xabarnomasi va tizimli bildirishnoma tekshirildi!',
      priority: 'high',
      type: 'start'
    });
    if (window.App) window.App.showToast('🔔 Test bildirishnomasi yuborildi!');
  }
};

window.NotificationManager = NotificationManager;
