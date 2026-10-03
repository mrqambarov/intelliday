/**
 * IntelliDay - Main Application Controller
 * Coordinates UI events, AI Assistant interactions, PWA installation, and Modals.
 */

const App = {
  selectedDate: new Date(),
  deferredPrompt: null,

  init() {
    this.setupTheme();
    this.updateDateDisplay();
    this.bindEvents();
    this.setupServiceWorker();
    this.setupPWAInstall();

    // Init components
    if (window.Storage) window.Storage.init();
    if (window.AuthManager) window.AuthManager.init();
    if (window.Schedule) window.Schedule.init();
    if (window.Habits) window.Habits.init();
    if (window.Pomodoro) window.Pomodoro.init();
    if (window.NotificationManager) window.NotificationManager.init();
    if (window.ViewsManager) window.ViewsManager.init();
    if (window.CorporateManager) window.CorporateManager.init();

    // Backdrop click closes modals cleanly
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', (e) => {
        if (e.target === bd) bd.classList.remove('open');
      });
    });

    // Live sync callback for remote updates (from phone or Telegram bot)
    if (window.Storage && window.Storage.registerUpdateCallback) {
      window.Storage.registerUpdateCallback(() => {
        if (window.Schedule) window.Schedule.render();
        if (window.Habits) {
          window.Habits.render();
          window.Habits.updateProductivityScore();
        }
        if (window.ViewsManager && window.ViewsManager.currentView !== 'day') {
          window.ViewsManager.setView(window.ViewsManager.currentView);
        }
        this.updateSidebarCoach();
      });
    }

    this.updateSidebarCoach();

    // Close notification center when clicking outside
    document.addEventListener('click', (e) => {
      const bellWrapper = document.querySelector('.notif-bell-wrapper');
      if (bellWrapper && !bellWrapper.contains(e.target)) {
        const dropdown = document.getElementById('notification-center-dropdown');
        if (dropdown && dropdown.classList.contains('open')) {
          dropdown.classList.remove('open');
          if (window.NotificationManager) window.NotificationManager.isCenterOpen = false;
        }
      }
    });
  },

  bindEvents() {
    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);

      // Escape closes any open modal
      if (e.key === 'Escape') {
        this.closeAllModals();
        return;
      }

      // Ctrl + K or '/' focuses AI quick prompt
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (!isInput && e.key === '/')) {
        e.preventDefault();
        const input = document.getElementById('ai-prompt-input');
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      // Ctrl + P triggers clean schedule print
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.printSchedule();
        return;
      }

      if (isInput) return;

      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        this.openAddTaskModal();
      } else if (key === 'h') {
        e.preventDefault();
        this.openAddHabitModal();
      } else if (key === 'p') {
        e.preventDefault();
        if (window.Pomodoro) window.Pomodoro.open();
      } else if (key === 'm') {
        e.preventDefault();
        this.openMagicPlanModal();
      } else if (key === 'a') {
        e.preventDefault();
        this.runAIAutopilot();
      } else if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        this.openShortcutsModal();
      }
    });
  },

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    if (window.Pomodoro) window.Pomodoro.close();
  },

  printSchedule() {
    window.print();
  },

  setupTheme() {
    const settings = window.Storage.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);

    const settings = window.Storage.getSettings();
    settings.theme = next;
    window.Storage.saveSettings(settings);
  },

  updateDateDisplay() {
    const pill = document.getElementById('current-date-pill');
    const headerDate = document.getElementById('timeline-header-date');
    
    const weekdays = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
    const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    
    const day = this.selectedDate.getDate();
    const month = months[this.selectedDate.getMonth()];
    const weekday = weekdays[this.selectedDate.getDay()];
    const dateFormatted = `${day}-${month}, ${weekday}`;

    if (pill) pill.innerHTML = `📅 <span>${dateFormatted}</span>`;
    if (headerDate) headerDate.textContent = dateFormatted;
  },

  navigateDate(offset) {
    this.selectedDate.setDate(this.selectedDate.getDate() + offset);
    this.updateDateDisplay();
    const dateStr = this.selectedDate.toISOString().split('T')[0];
    if (window.Schedule) {
      window.Schedule.setDate(dateStr);
    }
  },

  goToToday() {
    this.selectedDate = new Date();
    this.updateDateDisplay();
    const dateStr = this.selectedDate.toISOString().split('T')[0];
    if (window.Schedule) {
      window.Schedule.setDate(dateStr);
    }
  },

  updateSidebarCoach() {
    const coachMsgEl = document.getElementById('ai-coach-message');
    if (!coachMsgEl) return;

    try {
      const tasks = window.Storage ? window.Storage.getTasks() : [];
      const habits = window.Storage ? window.Storage.getHabits() : [];
      const advice = (window.SmartAssistant && typeof window.SmartAssistant.generateCoachAdvice === 'function')
        ? window.SmartAssistant.generateCoachAdvice(tasks, habits)
        : 'Bugungi vazifalaringizni rejalashtiring va samaradorlikni oshiring!';
      coachMsgEl.textContent = advice;
    } catch(e) {
      console.warn('updateSidebarCoach error:', e);
    }
  },

  // Process AI Assistant Input
  handleAIInput(inputText) {
    const text = inputText || document.getElementById('ai-prompt-input')?.value;
    if (!text || !text.trim()) return;

    const inputField = document.getElementById('ai-prompt-input');
    if (inputField) inputField.value = '';

    const result = window.SmartAssistant.parseInput(text);

    if (result.type === 'CREATE_TASK') {
      window.Storage.addTask(result.task);
      if (window.Schedule) window.Schedule.render();
      if (window.Habits) window.Habits.updateProductivityScore();
      this.updateSidebarCoach();

      if (window.NotificationManager) {
        window.NotificationManager.sound.playSuccess();
        window.NotificationManager.showNotification('✅ Reja jadvalga qo‘shildi!', {
          body: `"${result.task.title}" soat ${result.task.time} ga belgilandi.`
        });
      }

      this.showToast(`✅ "${result.task.title}" soat ${result.task.time} ga qo‘shildi!`);
    } else if (result.type === 'CREATE_HABIT') {
      window.Storage.addHabit(result.title);
      if (window.Habits) window.Habits.renderHabits();
      if (window.Habits) window.Habits.updateProductivityScore();
      this.updateSidebarCoach();
      this.showToast(`✨ Yangi odat qo‘shildi: "${result.title}"`);
    } else if (result.type === 'TRIGGER_AUTOPILOT') {
      this.runAIAutopilot();
    } else if (result.type === 'TRIGGER_MAGIC_PLAN') {
      this.openMagicPlanModal();
    } else if (result.type === 'TRIGGER_SHIFT_TOMORROW') {
      this.shiftRemainingToTomorrow();
    } else if (result.type === 'TRIGGER_FOCUS') {
      if (window.Pomodoro) {
        window.Pomodoro.open();
        window.Pomodoro.start();
      }
    } else if (result.type === 'QUERY_COACH' || result.type === 'QUERY_AGENDA') {
      const advice = window.SmartAssistant.generateCoachAdvice(window.Storage.getTasks(), window.Storage.getHabits());
      this.showToast(`🤖 Yordamchi: ${advice}`, 6000);
      window.SmartAssistant.speak(advice);
    } else if (result.type === 'QUERY_OVERDUE') {
      if (window.Schedule) window.Schedule.checkOverdueBanner();
      this.showToast('⚠️ Qolib ketgan vazifalar yuqori kartada aks etdi.');
    }
  },

  // Voice Microphone Toggle
  toggleVoiceInput() {
    const micBtn = document.getElementById('ai-mic-btn');
    const assistant = window.SmartAssistant;

    if (!assistant.recognition) {
      alert('Kechirasiz, brauzeringiz ovozli qidiruvni qo‘llab-quvvatlamaydi. Chrome yoki Edge brauzeridan foydalanishingiz mumkin.');
      return;
    }

    if (micBtn.classList.contains('listening')) {
      assistant.recognition.stop();
      micBtn.classList.remove('listening');
    } else {
      micBtn.classList.add('listening');
      assistant.recognition.start();

      assistant.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const inputField = document.getElementById('ai-prompt-input');
        if (inputField) inputField.value = transcript;
        micBtn.classList.remove('listening');
        this.handleAIInput(transcript);
      };

      assistant.recognition.onerror = () => {
        micBtn.classList.remove('listening');
      };

      assistant.recognition.onend = () => {
        micBtn.classList.remove('listening');
      };
    }
  },

  // Modal Controls
  openAddTaskModal() {
    const modal = document.getElementById('task-modal');
    if (!modal) return;
    
    // Reset form for new task
    const form = modal.querySelector('form');
    if (form) form.reset();

    const idInput = document.getElementById('task-form-id');
    if (idInput) idInput.value = '';

    const modalTitle = document.getElementById('task-modal-title');
    if (modalTitle) modalTitle.textContent = 'Yangi Vazifa Qo‘shish';

    const submitBtn = document.getElementById('task-modal-submit-btn');
    if (submitBtn) submitBtn.textContent = 'Saqlash';

    const dateInput = document.getElementById('task-form-date');
    if (dateInput) {
      dateInput.value = this.selectedDate.toISOString().split('T')[0];
    }
    modal.classList.add('open');
  },

  openEditTaskModal(taskId) {
    const modal = document.getElementById('task-modal');
    if (!modal) return;

    const task = window.Storage.getTasks().find(t => t.id === taskId);
    if (!task) return;

    const idInput = document.getElementById('task-form-id');
    if (idInput) idInput.value = task.id;

    const titleInput = document.getElementById('task-form-title');
    if (titleInput) titleInput.value = task.title;

    const timeInput = document.getElementById('task-form-time');
    if (timeInput) timeInput.value = task.time;

    const durInput = document.getElementById('task-form-duration');
    if (durInput) durInput.value = task.duration || 30;

    const dateInput = document.getElementById('task-form-date');
    if (dateInput) dateInput.value = task.date;

    const priorityInput = document.getElementById('task-form-priority');
    if (priorityInput) priorityInput.value = task.priority || 'medium';

    const catRadio = document.querySelector(`input[name="task-category"][value="${task.category}"]`);
    if (catRadio) catRadio.checked = true;

    const recInput = document.getElementById('task-form-recurring');
    if (recInput) recInput.checked = (task.recurring !== 'none');

    const notesInput = document.getElementById('task-form-notes');
    if (notesInput) notesInput.value = task.notes || '';

    const modalTitle = document.getElementById('task-modal-title');
    if (modalTitle) modalTitle.textContent = 'Vazifani Tahrirlash';

    const submitBtn = document.getElementById('task-modal-submit-btn');
    if (submitBtn) submitBtn.textContent = 'O‘zgarishlarni saqlash';

    modal.classList.add('open');
  },

  closeAddTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('open');
  },

  saveTaskFromForm(event) {
    event.preventDefault();
    const taskId = document.getElementById('task-form-id')?.value;
    const title = document.getElementById('task-form-title').value.trim();
    const time = document.getElementById('task-form-time').value;
    const duration = parseInt(document.getElementById('task-form-duration').value, 10) || 30;
    const date = document.getElementById('task-form-date').value;
    const priority = document.getElementById('task-form-priority').value;
    const category = document.querySelector('input[name="task-category"]:checked')?.value || 'personal';
    const recurring = document.getElementById('task-form-recurring').checked ? 'daily' : 'none';
    const notes = document.getElementById('task-form-notes').value.trim();

    if (!title || !time) return;

    if (taskId) {
      // Editing existing task
      const tasks = window.Storage.getTasks();
      const existing = tasks.find(t => t.id === taskId);
      if (existing) {
        existing.title = title;
        existing.time = time;
        existing.duration = duration;
        existing.date = date;
        existing.priority = priority;
        existing.category = category;
        existing.recurring = recurring;
        existing.notes = notes;
        window.Storage.updateTask(existing);
        this.showToast('✏️ Vazifa muvaffaqiyatli tahrirlandi!');
      }
    } else {
      // New task
      const newTask = {
        id: 'task-' + Date.now(),
        title,
        time,
        duration,
        date,
        priority,
        category,
        recurring,
        notes,
        completed: false
      };
      window.Storage.addTask(newTask);
      this.showToast('✅ Yangi vazifa muvaffaqiyatli saqlandi!');
    }

    this.closeAddTaskModal();
    if (window.Schedule) window.Schedule.render();
    if (window.Habits) window.Habits.updateProductivityScore();
    if (window.ViewsManager && window.ViewsManager.currentView !== 'day') {
      window.ViewsManager.setView(window.ViewsManager.currentView);
    }
    this.updateSidebarCoach();

    event.target.reset();
  },

  async openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    const settings = window.Storage.getSettings();
    document.getElementById('set-sound').checked = settings.soundEnabled;
    document.getElementById('set-notif').checked = settings.notificationsEnabled;
    document.getElementById('set-tg-token').value = settings.telegramBotToken || settings.telegramToken || '';
    
    const apiKeyInput = document.getElementById('set-api-key');
    if (apiKeyInput) apiKeyInput.value = settings.apiKey || settings.geminiApiKey || '';

    const toneSelect = document.getElementById('set-sound-tone');
    if (toneSelect) toneSelect.value = settings.soundTone || 'chime';

    // Fetch live group configuration from server
    await this.refreshTelegramGroups();

    modal.classList.add('open');
  },

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('open');
  },

  toggleTokenVisibility() {
    const input = document.getElementById('set-tg-token');
    const btn = document.getElementById('btn-toggle-token');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = '🙈';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = '👁️';
    }
  },

  async refreshTelegramGroups() {
    const constInput = document.getElementById('set-tg-constructor-group');
    const modelInput = document.getElementById('set-tg-modelxona-group');
    const constBadge = document.getElementById('tg-status-constructor');
    const modelBadge = document.getElementById('tg-status-modelxona');
    const botBadge = document.getElementById('tg-bot-status-badge');

    try {
      const res = await fetch('/api/telegram/groups-status');
      if (res.ok) {
        const data = await res.json();
        if (data.constructorGroupId && constInput && !constInput.value) {
          constInput.value = data.constructorGroupId;
        }
        if (data.modelxonaGroupId && modelInput && !modelInput.value) {
          modelInput.value = data.modelxonaGroupId;
        }

        if (constBadge) {
          if (data.constructorGroupId) {
            constBadge.textContent = `🟢 Ulangan: ${data.constructorGroupName || 'Konstruktorlar'}`;
            constBadge.style.background = 'rgba(16,185,129,0.18)';
            constBadge.style.color = '#34d399';
          } else {
            constBadge.textContent = '⚪ Ulanmagan';
            constBadge.style.background = 'rgba(255,255,255,0.08)';
            constBadge.style.color = 'var(--text-muted)';
          }
        }

        if (modelBadge) {
          if (data.modelxonaGroupId) {
            modelBadge.textContent = `🟢 Ulangan: ${data.modelxonaGroupName || 'Modelxona'}`;
            modelBadge.style.background = 'rgba(16,185,129,0.18)';
            modelBadge.style.color = '#34d399';
          } else {
            modelBadge.textContent = '⚪ Ulanmagan';
            modelBadge.style.background = 'rgba(255,255,255,0.08)';
            modelBadge.style.color = 'var(--text-muted)';
          }
        }

        if (botBadge) {
          if (data.hasToken) {
            botBadge.textContent = data.botActive ? '🟢 Bot Faol (Tinglamoqda)' : '🟡 Token Saqlangan';
            botBadge.style.color = '#34d399';
          } else {
            botBadge.textContent = '⚪ Token Kiritilmagan';
            botBadge.style.color = '#f59e0b';
          }
        }
      }
    } catch(e) {
      console.warn('Guruh holatini olishda xatolik:', e);
    }
  },

  async testGroupMessage(groupType) {
    const token = document.getElementById('set-tg-token')?.value.trim();
    const customId = groupType === 'constructor' 
      ? document.getElementById('set-tg-constructor-group')?.value.trim()
      : document.getElementById('set-tg-modelxona-group')?.value.trim();

    const groupName = groupType === 'constructor' ? 'Konstruktorlar guruhi' : 'Modelxona guruhi';

    this.showToast(`⏳ ${groupName}ga interaktiv test vazifa yuborilmoqda...`);

    try {
      const res = await fetch('/api/telegram/send-group-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupType, customGroupId: customId, token })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`✅ "${groupName}"ga test vazifa va tugmalar muvaffaqiyatli yuborildi! Telegramni tekshiring.`, 5000);
        if (window.NotificationManager && window.NotificationManager.sound) {
          window.NotificationManager.sound.playTone('success');
        }
        await this.refreshTelegramGroups();
      } else {
        alert(`Guruhga yuborishda xatolik:\n${data.error || 'Noma’lum xatolik'}`);
      }
    } catch(e) {
      alert('Server bilan aloqada xatolik');
    }
  },

  testSound(type = 'chime') {
    if (window.NotificationManager && window.NotificationManager.sound) {
      window.NotificationManager.sound.playTone(type);
    }
  },

  async saveSettingsForm(event) {
    event.preventDefault();
    const settings = window.Storage.getSettings();
    settings.soundEnabled = document.getElementById('set-sound').checked;
    settings.notificationsEnabled = document.getElementById('set-notif').checked;
    settings.telegramBotToken = document.getElementById('set-tg-token').value.trim();
    settings.telegramToken = settings.telegramBotToken;
    
    const constGroupId = document.getElementById('set-tg-constructor-group')?.value.trim() || '';
    const modelGroupId = document.getElementById('set-tg-modelxona-group')?.value.trim() || '';

    const apiKeyInput = document.getElementById('set-api-key');
    if (apiKeyInput) {
      settings.apiKey = apiKeyInput.value.trim();
      settings.geminiApiKey = settings.apiKey;
    }

    const toneSelect = document.getElementById('set-sound-tone');
    if (toneSelect) settings.soundTone = toneSelect.value;

    window.Storage.saveSettings(settings);

    // Save group configuration to server
    try {
      await fetch('/api/telegram/save-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.telegramBotToken,
          constructorGroupId: constGroupId,
          modelxonaGroupId: modelGroupId
        })
      });
    } catch(e){}

    this.closeSettingsModal();
    this.showToast('💾 Sozlamalar va Telegram guruhlar konfiguratsiyasi saqlandi!');
  },

  // --- AUTONOMOUS AI METHODS ---
  runAIAutopilot() {
    if (!window.SmartAssistant) return;
    this.showToast('🤖 AI Avtopilot: Rejalar tahlil qilinmoqda...');
    const res = window.SmartAssistant.autoRebalanceSchedule();
    this.showToast(res.message, 5000);
    window.SmartAssistant.speak(res.message);
  },

  openMagicPlanModal() {
    const modal = document.getElementById('magic-plan-modal');
    if (modal) modal.classList.add('open');
  },

  closeMagicPlanModal() {
    const modal = document.getElementById('magic-plan-modal');
    if (modal) modal.classList.remove('open');
  },

  applyMagicPlan(theme = 'balanced') {
    if (!window.SmartAssistant) return;
    const res = window.SmartAssistant.applyMagicPlan(theme);
    this.showToast(res.message, 5000);
    this.closeMagicPlanModal();
  },

  shiftRemainingToTomorrow() {
    if (!window.SmartAssistant) return;
    const res = window.SmartAssistant.shiftRemainingToTomorrow();
    this.showToast(res.message, 5000);
    window.SmartAssistant.speak(res.message);
  },

  openAIChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
      modal.classList.add('open');
      const input = document.getElementById('ai-chat-input');
      if (input) input.focus();
    }
  },

  closeAIChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) modal.classList.remove('open');
  },

  async sendAIChatMessage() {
    const input = document.getElementById('ai-chat-input');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    input.value = '';

    const list = document.getElementById('ai-chat-messages');
    if (!list) return;

    // User bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-bubble user-bubble';
    userMsg.textContent = userText;
    list.appendChild(userMsg);
    list.scrollTop = list.scrollHeight;

    // AI thinking bubble
    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-bubble ai-bubble';
    aiMsg.innerHTML = '<span class="pulse-dot"></span> <em>AI o‘ylamoqda...</em>';
    list.appendChild(aiMsg);
    list.scrollTop = list.scrollHeight;

    const response = await window.SmartAssistant.askAI(userText);
    aiMsg.textContent = response;
    list.scrollTop = list.scrollHeight;
  },

  // Phone QR & Wi-Fi Link Modal
  openPhoneModal() {
    const modal = document.getElementById('phone-modal');
    if (modal) {
      let displayUrl = (window.Storage && window.Storage.serverInfo && window.Storage.serverInfo.available)
        ? window.Storage.serverInfo.url
        : window.location.origin;

      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const port = window.location.port ? `:${window.location.port}` : ':8080';
        const serverIp = (window.Storage && window.Storage.serverInfo && window.Storage.serverInfo.ip) || '10.10.10.100';
        displayUrl = `http://${serverIp}${port}`;
      }

      const urlEl = document.getElementById('phone-modal-url');
      if (urlEl) urlEl.textContent = displayUrl;

      const qrImg = document.getElementById('phone-qr-img');
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(displayUrl)}`;
      }
      modal.classList.add('open');
    }
  },

  closePhoneModal() {
    const modal = document.getElementById('phone-modal');
    if (modal) modal.classList.remove('open');
  },

  copyPhoneUrl() {
    const urlEl = document.getElementById('phone-modal-url');
    const url = urlEl ? urlEl.textContent.trim() : window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('📋 Havola nusxalandi: ' + url);
      }).catch(() => {
        this.showToast('Havola: ' + url);
      });
    } else {
      this.showToast('Havola: ' + url);
    }
  },

  // Add Habit Modal Handlers
  openAddHabitModal() {
    const modal = document.getElementById('add-habit-modal');
    if (modal) {
      modal.classList.add('open');
      const input = document.getElementById('habit-name-input');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 80);
      }
    }
  },

  closeAddHabitModal() {
    const modal = document.getElementById('add-habit-modal');
    if (modal) modal.classList.remove('open');
  },

  selectHabitEmoji(emoji) {
    const hidden = document.getElementById('selected-habit-emoji');
    if (hidden) hidden.value = emoji;
    document.querySelectorAll('#habit-emoji-picker .emoji-chip').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === emoji);
    });
  },

  saveNewHabit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const nameInput = document.getElementById('habit-name-input');
    const emojiInput = document.getElementById('selected-habit-emoji');
    const title = nameInput ? nameInput.value.trim() : '';
    const icon = emojiInput ? emojiInput.value : '💧';
    if (!title) return;

    window.Storage.addHabit(title, icon);
    if (window.Habits) {
      window.Habits.renderHabits();
      window.Habits.updateProductivityScore();
    }
    this.updateSidebarCoach();
    this.closeAddHabitModal();
    this.showToast(`✨ Yangi odat qo‘shildi: "${title}"`);
  },

  // Shortcuts Modal Handlers
  openShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.add('open');
  },

  closeShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.remove('open');
  },

  // Backup & Import
  exportBackup() {
    window.Storage.exportDataJSON();
    this.showToast('📦 Zaxira fayli yuklab olindi!');
  },

  importBackup(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const ok = window.Storage.importDataJSON(e.target.result);
      if (ok) {
        if (window.Schedule) window.Schedule.render();
        if (window.Habits) window.Habits.init();
        this.updateSidebarCoach();
        this.showToast('🎉 Ma’lumotlar muvaffaqiyatli tiklandi!');
        this.closeSettingsModal();
      } else {
        alert('Faylni o‘qishda xatolik yuz berdi. Iltimos to‘g‘ri JSON faylini tanlang.');
      }
    };
    reader.readAsText(file);
  },

  // Toast feedback banner
  showToast(msg, duration = 3000) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 5rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(16, 23, 37, 0.95);
        color: #fff;
        border: 1px solid var(--accent-cyan);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        padding: 0.75rem 1.4rem;
        border-radius: var(--radius-full);
        font-size: 0.88rem;
        font-weight: 600;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        pointer-events: none;
        backdrop-filter: blur(12px);
        animation: popIn 0.25s ease;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.style.display = 'flex';

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  },

  // PWA Service Worker & Install Prompt
  setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.log('ServiceWorker registration error:', err);
        });
      });
    }
  },

  setupPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
      }
    });
  },

  installPWA() {
    if (!this.deferredPrompt) {
      alert('Ilovani o‘rnatish uchun brauzeringiz menyusidan "Bosh ekranga qo‘shish" (Add to Home screen) yoki o‘rnatish tugmasini bosing.');
      return;
    }
    this.deferredPrompt.prompt();
    this.deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.style.display = 'none';
      }
      this.deferredPrompt = null;
    });
  },

  // Mobile Bottom Navigation Tab Switcher
  switchMobileTab(tab) {
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (tab === 'schedule') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tab === 'focus') {
      if (window.Pomodoro) window.Pomodoro.open();
    } else if (tab === 'habits') {
      const habitWidget = document.getElementById('habits-widget');
      if (habitWidget) habitWidget.scrollIntoView({ behavior: 'smooth' });
    } else if (tab === 'assistant') {
      this.openAIChatModal();
    }
  },

  bindEvents() {
    // AI Input enter key
    const aiInput = document.getElementById('ai-prompt-input');
    if (aiInput) {
      aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleAIInput();
        }
      });
    }

    // Keyboard shortcuts: 'n' for new task, 'p' for pomodoro
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.openAddTaskModal();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (window.Pomodoro) window.Pomodoro.open();
      }
    });
  }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
