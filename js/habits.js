/**
 * IntelliDay - Daily Habits & Productivity Scoring
 * Computes daily completion rate, tracks streaks, and visualizes circle stats.
 */

const Habits = {
  init() {
    this.renderHabits();
    this.updateProductivityScore();
  },

  renderHabits() {
    const listEl = document.getElementById('habit-list');
    if (!listEl) return;

    const habits = window.Storage.getHabits();
    listEl.innerHTML = '';

    if (habits.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">
          Hozircha odatlar yo‘q. Yangi odat qo‘shing!
        </div>
      `;
      return;
    }

    const dayNames = ['D', 'S', 'Ch', 'P', 'J', 'Sh', 'Ya'];
    const todayDayIndex = (new Date().getDay() + 6) % 7; // 0 = Mon, 6 = Sun

    habits.forEach(habit => {
      const item = document.createElement('div');
      item.className = `habit-item ${habit.doneToday ? 'done' : ''}`;
      item.id = `habit-${habit.id}`;

      // Build 7-day mini heatmap dots
      let dotsHtml = '';
      for (let i = 0; i < 7; i++) {
        const isToday = i === todayDayIndex;
        let isActive = false;
        if (isToday) {
          isActive = !!habit.doneToday;
        } else if (i < todayDayIndex) {
          // If day was earlier this week, infer from streak
          const daysAgo = todayDayIndex - i;
          isActive = (habit.streak || 0) >= daysAgo;
        }
        dotsHtml += `<span class="habit-dot ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}" title="${dayNames[i]}: ${isActive ? 'Bajarilgan' : 'Bajarilmagan'}"></span>`;
      }

      item.innerHTML = `
        <div class="habit-left">
          <span class="habit-icon">${habit.icon || '⭐'}</span>
          <div class="habit-streak-wrap">
            <div class="habit-title">${habit.title}</div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="habit-streak">🔥 ${habit.streak || 0} kun</span>
              <div class="habit-weekly-dots">${dotsHtml}</div>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="custom-checkbox ${habit.doneToday ? 'checked' : ''}" onclick="Habits.toggleHabit('${habit.id}')" title="Bugun bajarildi deb belgilash">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="btn-icon habit-delete-btn" onclick="Habits.deleteHabit('${habit.id}')" title="Odatni o‘chirish" style="padding: 0.2rem; opacity: 0.6;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;

      listEl.appendChild(item);
    });
  },

  toggleHabit(habitId) {
    window.Storage.toggleHabit(habitId);
    if (window.NotificationManager) {
      window.NotificationManager.sound.playSuccess();
    }
    this.renderHabits();
    this.updateProductivityScore();
    if (window.App) window.App.updateSidebarCoach();
  },

  promptAddHabit() {
    if (window.App && typeof window.App.openAddHabitModal === 'function') {
      window.App.openAddHabitModal();
      return;
    }
    const title = prompt('Yangi odat nomini kiriting:');
    if (!title || !title.trim()) return;
    window.Storage.addHabit(title, '⭐');
    this.renderHabits();
    this.updateProductivityScore();
  },

  deleteHabit(habitId) {
    if (!confirm('Haqiqatan ham ushbu odatni o‘chirmoqchimisiz?')) return;
    window.Storage.deleteHabit(habitId);
    this.renderHabits();
    this.updateProductivityScore();
    if (window.App) {
      window.App.updateSidebarCoach();
      window.App.showToast('🗑️ Odat o‘chirildi');
    }
  },

  updateProductivityScore() {
    const todayStr = new Date().toISOString().split('T')[0];
    const tasks = window.Storage.getTasks().filter(t => t.date === todayStr);
    const habits = window.Storage.getHabits();

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;

    const totalHabits = habits.length;
    const completedHabits = habits.filter(h => h.doneToday).length;

    const totalItems = totalTasks + totalHabits;
    const completedItems = completedTasks + completedHabits;

    const score = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Update Circle UI
    const percentEl = document.getElementById('score-percent');
    if (percentEl) percentEl.textContent = `${score}%`;

    const progressCircle = document.getElementById('score-progress-circle');
    if (progressCircle) {
      const radius = 54;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (score / 100) * circumference;
      progressCircle.style.strokeDasharray = `${circumference}`;
      progressCircle.style.strokeDashoffset = `${offset}`;
    }

    // Update bottom stats
    const doneTasksEl = document.getElementById('stat-done-tasks');
    if (doneTasksEl) doneTasksEl.textContent = `${completedTasks} / ${totalTasks}`;

    const doneHabitsEl = document.getElementById('stat-done-habits');
    if (doneHabitsEl) doneHabitsEl.textContent = `${completedHabits} / ${totalHabits}`;
  }
};

window.Habits = Habits;
