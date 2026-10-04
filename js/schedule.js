/**
 * IntelliDay - Schedule & Visual Timeline Module
 * Handles 24h dynamic timeline, current live task tracking, overdue detection,
 * and time-needle indicators.
 */

const Schedule = {
  currentDate: new Date().toISOString().split('T')[0],

  init() {
    this.render();
    this.startLiveTick();
  },

  setDate(dateStr) {
    this.currentDate = dateStr;
    this.render();
  },

  // Live timer tick every 10 seconds to update time needle & active task countdown
  startLiveTick() {
    setInterval(() => {
      this.updateActiveHeroCard();
      this.updateTimeNeedle();
      this.checkOverdueBanner();
    }, 10000);
  },

  // Render the entire timeline
  render() {
    this.renderTimelineSlots();
    this.updateActiveHeroCard();
    this.updateTimeNeedle();
    this.checkOverdueBanner();
  },

  activeFilter: 'all',

  setFilter(filterName) {
    this.activeFilter = filterName;
    document.querySelectorAll('.timeline-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filterName);
    });
    this.renderTimelineSlots();
  },

  renderTimelineSlots() {
    const container = document.getElementById('timeline-slots');
    if (!container) return;

    let tasks = window.Storage.getTasks().filter(t => t.date === this.currentDate);

    // Filter by active category/status
    if (this.activeFilter === 'pending') {
      tasks = tasks.filter(t => !t.completed);
    } else if (this.activeFilter !== 'all') {
      tasks = tasks.filter(t => t.category === this.activeFilter);
    }

    container.innerHTML = '';

    // Calculate dynamic hour range (defaults to 06:00 - 23:00, or expands if tasks exist earlier/later)
    let minHour = 6;
    let maxHour = 23;
    tasks.forEach(t => {
      const h = parseInt(t.time.split(':')[0], 10);
      if (!isNaN(h)) {
        if (h < minHour) minHour = Math.max(0, h);
        if (h > maxHour) maxHour = Math.min(23, h);
      }
    });

    for (let h = minHour; h <= maxHour; h++) {
      const hourStr = `${String(h).padStart(2, '0')}:00`;
      
      const slotEl = document.createElement('div');
      slotEl.className = 'timeline-slot';
      slotEl.id = `slot-${h}`;

      const timeLabel = document.createElement('div');
      timeLabel.className = 'slot-time';
      timeLabel.textContent = hourStr;

      const slotContent = document.createElement('div');
      slotContent.className = 'slot-content';

      // Find tasks matching this hour
      const matchingTasks = tasks.filter(t => {
        const taskHour = parseInt(t.time.split(':')[0], 10);
        return taskHour === h;
      });

      matchingTasks.sort((a, b) => a.time.localeCompare(b.time));

      matchingTasks.forEach(task => {
        const card = this.createTaskCard(task);
        slotContent.appendChild(card);
      });

      slotEl.appendChild(timeLabel);
      slotEl.appendChild(slotContent);
      container.appendChild(slotEl);
    }
  },

  createTaskCard(task) {
    const isUrgent = task.priority === 'urgent' || task.isUrgent;
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority} ${task.completed ? 'completed' : ''} ${isUrgent ? 'urgent-glow' : ''}`;
    card.id = `card-${task.id}`;

    const mainCol = document.createElement('div');
    mainCol.className = 'task-main-col';

    // Checkbox
    const checkbox = document.createElement('div');
    checkbox.className = 'custom-checkbox';
    checkbox.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    checkbox.onclick = (e) => {
      e.stopPropagation();
      this.toggleTaskCompletion(task.id);
    };

    // Task details
    const details = document.createElement('div');
    details.className = 'task-details';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const metaRow = document.createElement('div');
    metaRow.className = 'task-meta-row';
    metaRow.innerHTML = `
      <span>⏰ ${task.time} (${task.duration} daqiqa)</span>
      <span class="badge badge-${task.category}">${this.getCategoryLabel(task.category)}</span>
      ${isUrgent ? '<span class="badge badge-urgent">🚨 JUDA ZARUR</span>' : (task.priority === 'high' ? '<span class="badge" style="background:rgba(244,63,94,0.18);color:#f43f5e;font-weight:600;padding:2px 8px;border-radius:6px;font-size:0.75rem;">⚡ Shoshilinch</span>' : '')}
      ${task.recurring !== 'none' ? '<span>🔄 Har kuni</span>' : ''}
    `;

    details.appendChild(title);
    details.appendChild(metaRow);
    if (isUrgent && task.notes) {
      const noteEl = document.createElement('div');
      noteEl.className = 'task-notes-preview';
      noteEl.style.cssText = 'font-size: 0.78rem; color: #fca5a5; margin-top: 0.25rem; font-style: italic;';
      noteEl.textContent = `📌 ${task.notes}`;
      details.appendChild(noteEl);
    }
    mainCol.appendChild(checkbox);
    mainCol.appendChild(details);

    // Right actions: Edit and Delete
    const controls = document.createElement('div');
    controls.className = 'task-controls';
    controls.innerHTML = `
      <button class="btn-icon" title="Tahrirlash" onclick="App.openEditTaskModal('${task.id}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-icon" title="O‘chirish" onclick="Schedule.deleteTask('${task.id}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;

    card.appendChild(mainCol);
    card.appendChild(controls);
    return card;
  },

  getCategoryLabel(cat) {
    const map = {
      work: '💼 Ish',
      study: '📚 Ta’lim',
      sport: '🏃‍♂️ Sport',
      personal: '🧘 Shaxsiy',
      health: '🥗 Salomatlik',
      meeting: '👥 Uchrashuv'
    };
    return map[cat] || '📌 Boshqa';
  },

  toggleTaskCompletion(taskId) {
    const tasks = window.Storage.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    window.Storage.updateTask(task);

    if (task.completed) {
      if (window.NotificationManager) {
        window.NotificationManager.sound.playSuccess();
      }
      this.triggerConfetti();
    }

    this.render();
    if (window.Habits) window.Habits.updateProductivityScore();
    if (window.App) window.App.updateSidebarCoach();
  },

  deleteTask(taskId) {
    window.Storage.deleteTask(taskId);
    this.render();
    if (window.Habits) window.Habits.updateProductivityScore();
    if (window.App) window.App.updateSidebarCoach();
  },

  // Active Task Hero Card
  updateActiveHeroCard() {
    const todayStr = new Date().toISOString().split('T')[0];
    const cardEl = document.getElementById('hero-active-card');
    if (!cardEl) return;

    const tasks = window.Storage.getTasks().filter(t => t.date === todayStr);
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Find currently running task or next upcoming task
    let activeTask = null;
    let nextTask = null;

    for (const t of tasks) {
      const [th, tm] = t.time.split(':').map(Number);
      const startMin = th * 60 + tm;
      const endMin = startMin + t.duration;

      if (!t.completed && currentMins >= startMin && currentMins < endMin) {
        activeTask = { ...t, remainingMin: endMin - currentMins };
        break;
      }
      if (!t.completed && startMin > currentMins && (!nextTask || startMin < nextTask.startMin)) {
        nextTask = { ...t, startMin, waitMin: startMin - currentMins };
      }
    }

    const titleEl = document.getElementById('active-task-title');
    const timeEl = document.getElementById('active-task-time');
    const countdownEl = document.getElementById('active-task-countdown');
    const labelEl = document.getElementById('active-task-label');
    const actionsEl = document.getElementById('active-task-actions');
    const progressFill = document.getElementById('active-task-progress-fill');

    if (activeTask) {
      titleEl.textContent = activeTask.title;
      timeEl.textContent = `⏰ ${activeTask.time} (${activeTask.duration} daqiqa) • ${this.getCategoryLabel(activeTask.category)}`;
      countdownEl.textContent = `${activeTask.remainingMin}m`;
      labelEl.textContent = 'Qolgan vaqt';

      const elapsed = activeTask.duration - activeTask.remainingMin;
      const pct = Math.min(100, Math.round((elapsed / activeTask.duration) * 100));
      progressFill.style.width = `${pct}%`;

      actionsEl.innerHTML = `
        <button class="btn btn-success" onclick="Schedule.toggleTaskCompletion('${activeTask.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Bajardim
        </button>
        <button class="btn btn-secondary" onclick="Schedule.snoozeTask('${activeTask.id}', 15)">
          +15 daqiqa surish
        </button>
        <button class="btn btn-secondary" onclick="window.Pomodoro && window.Pomodoro.open()">
          🎯 Fokus rejimini yoqish
        </button>
      `;
    } else if (nextTask) {
      titleEl.textContent = `Keyingi: ${nextTask.title}`;
      timeEl.textContent = `⏰ Boshlanish vaqti: ${nextTask.time} • ${this.getCategoryLabel(nextTask.category)}`;
      countdownEl.textContent = `${nextTask.waitMin}m`;
      labelEl.textContent = 'Boshlanishigacha';
      progressFill.style.width = '0%';

      actionsEl.innerHTML = `
        <button class="btn btn-primary" onclick="Schedule.startNow('${nextTask.id}')">
          🚀 Hozir boshlash
        </button>
        <button class="btn btn-secondary" onclick="Schedule.snoozeTask('${nextTask.id}', 30)">
          +30 daqiqa surish
        </button>
      `;
    } else {
      titleEl.textContent = 'Hozircha bo‘sh vaqt';
      timeEl.textContent = 'Barcha rejalashtirilgan vazifalar bajarilgan yoki keyingi reja yo‘q';
      countdownEl.textContent = '--';
      labelEl.textContent = 'Erkin vaqt';
      progressFill.style.width = '100%';

      actionsEl.innerHTML = `
        <button class="btn btn-primary" onclick="App.openAddTaskModal()">
          + Yangi vazifa qo‘shish
        </button>
        <button class="btn btn-secondary" onclick="window.Pomodoro && window.Pomodoro.open()">
          🎯 25m Fokus sessiyasi
        </button>
      `;
    }
  },

  // Snooze / Reschedule task by X minutes
  snoozeTask(taskId, addMinutes) {
    const tasks = window.Storage.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const [h, m] = task.time.split(':').map(Number);
    const newTotalMinutes = h * 60 + m + addMinutes;
    const newH = String(Math.floor(newTotalMinutes / 60) % 24).padStart(2, '0');
    const newM = String(newTotalMinutes % 60).padStart(2, '0');
    task.time = `${newH}:${newM}`;

    window.Storage.updateTask(task);
    this.render();
  },

  startNow(taskId) {
    const tasks = window.Storage.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const now = new Date();
    task.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    window.Storage.updateTask(task);
    this.render();
  },

  // Overdue Banner
  checkOverdueBanner() {
    const banner = document.getElementById('overdue-banner');
    if (!banner) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const overdueTasks = window.Storage.getTasks().filter(t => {
      if (t.date !== todayStr || t.completed) return false;
      const [h, m] = t.time.split(':').map(Number);
      const endMins = h * 60 + m + t.duration;
      return currentMins > endMins;
    });

    if (overdueTasks.length > 0) {
      banner.style.display = 'flex';
      const first = overdueTasks[0];
      const textEl = document.getElementById('overdue-text');
      if (textEl) {
        textEl.innerHTML = `⚠️ <strong>"${first.title}"</strong> vazifasi vaqti o‘tib ketdi. Nima qilamiz?`;
      }
      const actionsEl = document.getElementById('overdue-action-btns');
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button class="btn btn-success" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="Schedule.toggleTaskCompletion('${first.id}')">Bajardim</button>
          <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="Schedule.snoozeTask('${first.id}', 30)">+30 daqiqa</button>
          <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="Schedule.postponeToTomorrow('${first.id}')">Ertaga surish</button>
        `;
      }
    } else {
      banner.style.display = 'none';
    }
  },

  postponeToTomorrow(taskId) {
    const tasks = window.Storage.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    task.date = tmrw.toISOString().split('T')[0];
    window.Storage.updateTask(task);
    this.render();
  },

  // Red Time Needle on the timeline
  updateTimeNeedle() {
    const needle = document.getElementById('current-time-needle');
    if (!needle) return;

    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    if (h < 6 || h > 23) {
      needle.style.display = 'none';
      return;
    }

    needle.style.display = 'flex';
    const slotEl = document.getElementById(`slot-${h}`);
    if (slotEl) {
      const topOffset = slotEl.offsetTop + (m / 60) * slotEl.offsetHeight;
      needle.style.top = `${topOffset}px`;
    }
  },

  // Confetti Particle Burst Animation
  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#06b6d4', '#6366f1', '#a855f7', '#10b981', '#f59e0b', '#f43f5e'];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2 + (Math.random() - 0.5) * 100,
        r: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.7) * 12,
        alpha: 1
      });
    }

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // gravity
        p.alpha -= 0.015;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      frame++;
      if (frame < 70) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(animate);
  }
};

window.Schedule = Schedule;
