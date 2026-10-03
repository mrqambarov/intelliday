/**
 * IntelliDay - Advanced Views & Analytics Module
 * Supports:
 * - Day View (Timeline)
 * - Week View (7-Day Interactive Columns)
 * - Month View (Full Calendar Grid with Task Dots & Progress)
 * - Analytics Dashboard (SVG Area Charts, Category Donut, Heatmap, Habits Streaks)
 */

const ViewsManager = {
  currentView: 'day', // 'day' | 'week' | 'month' | 'analytics'
  weekOffset: 0,
  monthOffset: 0,
  analyticsRange: 7, // 7 or 30 days

  init() {
    this.bindViewTabs();
  },

  bindViewTabs() {
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = btn.dataset.view;
        if (view) this.setView(view);
      });
    });
  },

  setView(viewName) {
    this.currentView = viewName;

    // Update Tab UI
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Containers
    const dayContainer = document.getElementById('day-view-section');
    const weekContainer = document.getElementById('week-view-section');
    const monthContainer = document.getElementById('month-view-section');
    const analyticsContainer = document.getElementById('analytics-view-section');

    if (dayContainer) dayContainer.style.display = viewName === 'day' ? 'block' : 'none';
    if (weekContainer) weekContainer.style.display = viewName === 'week' ? 'block' : 'none';
    if (monthContainer) monthContainer.style.display = viewName === 'month' ? 'block' : 'none';
    if (analyticsContainer) analyticsContainer.style.display = viewName === 'analytics' ? 'block' : 'none';

    // Render active view
    if (viewName === 'day') {
      if (window.Schedule) window.Schedule.render();
    } else if (viewName === 'week') {
      this.renderWeekView();
    } else if (viewName === 'month') {
      this.renderMonthView();
    } else if (viewName === 'analytics') {
      this.renderAnalyticsView();
    }
  },

  // ==========================================================================
  // WEEK VIEW
  // ==========================================================================
  navigateWeek(direction) {
    if (direction === 0) this.weekOffset = 0;
    else this.weekOffset += direction;
    this.renderWeekView();
  },

  getWeekDates(offsetWeeks = 0) {
    const today = new Date();
    // Monday as first day of week
    const currentDay = today.getDay();
    const distanceToMonday = (currentDay + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - distanceToMonday + (offsetWeeks * 7));
    monday.setHours(0, 0, 0, 0);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      week.push(d);
    }
    return week;
  },

  renderWeekView() {
    const container = document.getElementById('week-view-content');
    const titleEl = document.getElementById('week-view-title');
    if (!container) return;

    const weekDates = this.getWeekDates(this.weekOffset);
    const allTasks = window.Storage.getTasks();
    const todayStr = new Date().toISOString().split('T')[0];

    // Format week title
    const firstDay = weekDates[0];
    const lastDay = weekDates[6];
    const optStart = { day: 'numeric', month: 'short' };
    const optEnd = { day: 'numeric', month: 'short', year: 'numeric' };
    const titleStr = `${firstDay.toLocaleDateString('uz-UZ', optStart)} — ${lastDay.toLocaleDateString('uz-UZ', optEnd)}`;
    if (titleEl) titleEl.textContent = titleStr;

    const weekdayNames = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

    let html = '<div class="week-grid-container">';

    weekDates.forEach((dateObj, idx) => {
      const dateStr = dateObj.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      const dayTasks = allTasks.filter(t => t.date === dateStr);
      dayTasks.sort((a, b) => a.time.localeCompare(b.time));

      const doneCount = dayTasks.filter(t => t.completed).length;
      const totalCount = dayTasks.length;
      const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

      html += `
        <div class="week-day-column ${isToday ? 'is-today' : ''}">
          <div class="week-day-header">
            <div>
              <span class="week-day-name">${weekdayNames[idx]}</span>
              <div class="week-day-num">${dateObj.getDate()}</div>
            </div>
            <div class="week-day-badge ${percent === 100 && totalCount > 0 ? 'badge-complete' : ''}">
              ${totalCount > 0 ? `${doneCount}/${totalCount} (${percent}%)` : 'Rejasiz'}
            </div>
          </div>

          <div class="week-tasks-list">
      `;

      if (dayTasks.length === 0) {
        html += `<div class="week-empty-slot">Vazifalar yo‘q</div>`;
      } else {
        dayTasks.forEach(task => {
          html += `
            <div class="week-task-item priority-${task.priority} ${task.completed ? 'completed' : ''}" onclick="App.openEditTaskModal('${task.id}')">
              <div class="week-task-top">
                <span class="week-task-time">${task.time}</span>
                <span class="badge badge-${task.category}" style="font-size: 0.68rem; padding: 0.15rem 0.4rem;">${task.category}</span>
              </div>
              <div class="week-task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</div>
              <div class="week-task-actions">
                <button type="button" class="week-check-btn ${task.completed ? 'checked' : ''}" onclick="event.stopPropagation(); ViewsManager.toggleTask('${task.id}')">
                  ${task.completed ? '✓ Bajarildi' : '○ Bajarish'}
                </button>
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
          <button class="week-add-btn" onclick="ViewsManager.addTaskForDate('${dateStr}')">
            + Vazifa qo‘shish
          </button>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  toggleTask(taskId) {
    if (window.Schedule) {
      window.Schedule.toggleTaskCompletion(taskId);
      this.renderWeekView();
    }
  },

  addTaskForDate(dateStr) {
    if (window.App) {
      window.App.openAddTaskModal();
      const dateInput = document.getElementById('task-form-date');
      if (dateInput) dateInput.value = dateStr;
    }
  },

  // ==========================================================================
  // MONTH VIEW
  // ==========================================================================
  navigateMonth(direction) {
    if (direction === 0) this.monthOffset = 0;
    else this.monthOffset += direction;
    this.renderMonthView();
  },

  renderMonthView() {
    const container = document.getElementById('month-view-content');
    const titleEl = document.getElementById('month-view-title');
    if (!container) return;

    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + this.monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const monthNames = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const allTasks = window.Storage.getTasks();
    const todayStr = new Date().toISOString().split('T')[0];

    const weekDays = ['Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan', 'Yak'];
    let html = '<div class="month-grid">';

    // Header row
    weekDays.forEach(wd => {
      html += `<div class="month-header-cell">${wd}</div>`;
    });

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      html += `<div class="month-day-cell other-month"><span class="month-cell-num">${d}</span></div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayTasks = allTasks.filter(t => t.date === dateStr);
      const doneCount = dayTasks.filter(t => t.completed).length;
      const totalCount = dayTasks.length;
      const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

      html += `
        <div class="month-day-cell ${isToday ? 'is-today' : ''} ${totalCount > 0 ? 'has-tasks' : ''}" onclick="ViewsManager.selectMonthDay('${dateStr}')">
          <div class="month-cell-top">
            <span class="month-cell-num">${day}</span>
            ${totalCount > 0 ? `<span class="month-count-pill ${percent === 100 ? 'all-done' : ''}">${doneCount}/${totalCount}</span>` : ''}
          </div>

          <div class="month-cell-content">
            ${dayTasks.slice(0, 3).map(t => `
              <div class="month-task-dot-item ${t.completed ? 'done' : ''}">
                <span class="task-category-dot cat-${t.category}"></span>
                <span class="month-task-dot-title">${escapeHtml(t.title)}</span>
              </div>
            `).join('')}
            ${dayTasks.length > 3 ? `<div class="month-more-badge">+${dayTasks.length - 3} ta reja</div>` : ''}
          </div>

          ${totalCount > 0 ? `
            <div class="month-progress-bar">
              <div class="month-progress-fill" style="width: ${percent}%;"></div>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Next month padding days to complete 35 or 42 grid
    const totalCells = firstDayIndex + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let j = 1; j <= remaining; j++) {
      html += `<div class="month-day-cell other-month"><span class="month-cell-num">${j}</span></div>`;
    }

    html += '</div>';
    container.innerHTML = html;
  },

  selectMonthDay(dateStr) {
    if (window.App && window.Schedule) {
      window.Schedule.setDate(dateStr);
      window.App.selectedDate = new Date(dateStr + 'T00:00:00');
      window.App.updateDateDisplay();
      this.setView('day');
    }
  },

  // ==========================================================================
  // ANALYTICS & PRODUCTIVITY DASHBOARD
  // ==========================================================================
  setAnalyticsRange(days) {
    this.analyticsRange = days;
    document.querySelectorAll('.analytics-range-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.range, 10) === days);
    });
    this.renderAnalyticsView();
  },

  renderAnalyticsView() {
    const container = document.getElementById('analytics-view-content');
    if (!container) return;

    const days = this.analyticsRange || 7;
    const allTasks = window.Storage.getTasks();
    const habits = window.Storage.getHabits();
    const habitLogs = (window.Storage.getHabitsData && window.Storage.getHabitsData().habitLogs) || {};

    // 1. Calculate Daily Trend Data for the past N days
    const trendData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalTasksPastN = 0;
    let completedTasksPastN = 0;
    let totalScheduledMinutes = 0;
    const categoryMinutes = {};

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayTasks = allTasks.filter(t => t.date === dateStr);
      
      const done = dayTasks.filter(t => t.completed).length;
      const total = dayTasks.length;
      const score = total > 0 ? Math.round((done / total) * 100) : 0;

      dayTasks.forEach(t => {
        totalScheduledMinutes += (t.duration || 30);
        categoryMinutes[t.category] = (categoryMinutes[t.category] || 0) + (t.duration || 30);
      });

      totalTasksPastN += total;
      completedTasksPastN += done;

      const opt = days <= 7 ? { weekday: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' };
      trendData.push({
        date: dateStr,
        label: d.toLocaleDateString('uz-UZ', opt),
        done,
        total,
        score
      });
    }

    const avgScore = totalTasksPastN > 0 ? Math.round((completedTasksPastN / totalTasksPastN) * 100) : 0;
    const scheduledHours = (totalScheduledMinutes / 60).toFixed(1);

    // 2. Heatmap: Tasks by 24h of day
    const hourHistogram = new Array(24).fill(0);
    allTasks.forEach(t => {
      if (t.completed && t.time) {
        const h = parseInt(t.time.split(':')[0], 10);
        if (!isNaN(h) && h >= 0 && h < 24) hourHistogram[h]++;
      }
    });

    // 3. Category Data Breakdown
    const categoryLabels = {
      work: '💼 Ish & Loyihalar',
      study: '📚 Ta’lim & Kitob',
      sport: '🏃‍♂️ Sport & Harakat',
      personal: '🧘 Shaxsiy & Hordiq',
      health: '🥗 Salomatlik',
      meeting: '👥 Uchrashuvlar'
    };
    const categoryColors = {
      work: '#06b6d4',
      study: '#6366f1',
      sport: '#10b981',
      personal: '#a855f7',
      health: '#f59e0b',
      meeting: '#f43f5e'
    };

    // Build SVG Trend Chart
    const svgTrend = this.generateAreaChartSVG(trendData);

    // Build SVG Category Donut
    const svgDonut = this.generateCategoryDonutSVG(categoryMinutes, totalScheduledMinutes, categoryColors);

    // AI Insight dynamically generated
    const bestDay = [...trendData].sort((a, b) => b.score - a.score)[0] || { label: 'Bugun', score: avgScore };
    let aiSummary = `Oxirgi ${days} kun davomida jami <strong>${completedTasksPastN} ta vazifa</strong> muvaffaqiyatli bajarildi (Samaradorlik: <strong>${avgScore}%</strong>). `;
    if (bestDay && bestDay.total > 0) {
      aiSummary += `Eng sermahsul kuningiz: <strong>${bestDay.label} (${bestDay.score}%)</strong> bo‘ldi. `;
    }
    if (avgScore >= 75) {
      aiSummary += `Siz juda yuqori intizom bilan harakat qilyapsiz, bu sur’atni saqlab qoling! 🚀`;
    } else {
      aiSummary += `Kechikkan ishlarni kamaytirish uchun oraga 10 daqiqalik tanaffuslar qo‘yish tavsiya etiladi. 💡`;
    }

    container.innerHTML = `
      <div class="analytics-dashboard-grid">
        
        <!-- Summary KPI Cards -->
        <div class="analytics-kpi-row">
          <div class="kpi-card glass-card">
            <div class="kpi-icon" style="color: var(--accent-emerald);">🎯</div>
            <div class="kpi-content">
              <span class="kpi-title">O‘rtacha Natija</span>
              <div class="kpi-value">${avgScore}%</div>
              <span class="kpi-subtitle">Oxirgi ${days} kun bo‘yicha</span>
            </div>
          </div>

          <div class="kpi-card glass-card">
            <div class="kpi-icon" style="color: var(--accent-cyan);">✅</div>
            <div class="kpi-content">
              <span class="kpi-title">Bajarilgan Vazifalar</span>
              <div class="kpi-value">${completedTasksPastN} <span style="font-size: 0.95rem; font-weight: normal; color: var(--text-muted);">/ ${totalTasksPastN}</span></div>
              <span class="kpi-subtitle">Rejalashtirilgan topshiriqlar</span>
            </div>
          </div>

          <div class="kpi-card glass-card">
            <div class="kpi-icon" style="color: var(--accent-indigo);">⏱️</div>
            <div class="kpi-content">
              <span class="kpi-title">Foydali Vaqt</span>
              <div class="kpi-value">${scheduledHours} <span style="font-size: 0.95rem; font-weight: normal; color: var(--text-muted);">soat</span></div>
              <span class="kpi-subtitle">Fokus va chuqur mehnat</span>
            </div>
          </div>

          <div class="kpi-card glass-card">
            <div class="kpi-icon" style="color: var(--accent-purple);">🔥</div>
            <div class="kpi-content">
              <span class="kpi-title">Faol Odatlar</span>
              <div class="kpi-value">${habits.length} ta</div>
              <span class="kpi-subtitle">Muntazam rivojlanish</span>
            </div>
          </div>
        </div>

        <!-- AI Executive Insight Banner -->
        <div class="glass-card analytics-ai-banner">
          <div style="font-size: 1.8rem;">🤖</div>
          <div>
            <div style="font-weight: 700; font-size: 1rem; color: #fff; margin-bottom: 0.25rem;">AI Yordamchi Tahlili & Xulosasi</div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; margin: 0;">${aiSummary}</p>
          </div>
        </div>

        <!-- Productivity Trend Area Chart -->
        <div class="glass-card analytics-chart-card">
          <div class="chart-header">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem;">Samaradorlik Dinamikasi</h3>
              <span style="font-size: 0.78rem; color: var(--text-muted);">Kunlar bo‘yicha vazifalar bajarilish foizi</span>
            </div>
            <div class="analytics-range-picker">
              <button class="chip-btn analytics-range-btn ${days === 7 ? 'active' : ''}" data-range="7" onclick="ViewsManager.setAnalyticsRange(7)">7 kun</button>
              <button class="chip-btn analytics-range-btn ${days === 30 ? 'active' : ''}" data-range="30" onclick="ViewsManager.setAnalyticsRange(30)">30 kun</button>
            </div>
          </div>
          <div class="chart-canvas-wrapper">
            ${svgTrend}
          </div>
        </div>

        <!-- Category Distribution & Habits Streak Grid -->
        <div class="analytics-two-col">
          
          <!-- Category Donut Card -->
          <div class="glass-card analytics-chart-card">
            <div class="chart-header">
              <h3 style="margin: 0; font-size: 1.1rem;">Kategoriyalar Taqsimoti</h3>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-top: 0.5rem;">
              ${svgDonut}
              <div class="category-legend-list">
                ${Object.keys(categoryMinutes).length === 0 ? '<div style="color: var(--text-muted); font-size: 0.85rem;">Ma’lumotlar yetarli emas</div>' : 
                  Object.keys(categoryMinutes).map(cat => {
                    const mins = categoryMinutes[cat] || 0;
                    const p = totalScheduledMinutes > 0 ? Math.round((mins / totalScheduledMinutes) * 100) : 0;
                    return `
                      <div class="category-legend-item">
                        <span class="legend-color-box" style="background: ${categoryColors[cat] || '#888'};"></span>
                        <span class="legend-label">${categoryLabels[cat] || cat}:</span>
                        <strong class="legend-value">${(mins / 60).toFixed(1)}s (${p}%)</strong>
                      </div>
                    `;
                  }).join('')
                }
              </div>
            </div>
          </div>

          <!-- Habit Streaks Leaderboard -->
          <div class="glass-card analytics-chart-card">
            <div class="chart-header">
              <h3 style="margin: 0; font-size: 1.1rem;">Odatlar & Streak Matritsasi</h3>
            </div>
            <div class="habits-streak-leaderboard">
              ${habits.map(h => {
                const streak = h.streak || 0;
                return `
                  <div class="streak-leader-row">
                    <div class="streak-emoji">${h.icon || '⭐'}</div>
                    <div class="streak-info">
                      <strong>${escapeHtml(h.title)}</strong>
                      <div class="streak-bar-bg">
                        <div class="streak-bar-fill" style="width: ${Math.min(100, Math.max(15, streak * 5))}%;"></div>
                      </div>
                    </div>
                    <div class="streak-badge-pill">
                      🔥 ${streak} kun
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

        </div>

      </div>
    `;
  },

  generateAreaChartSVG(trendData) {
    const width = 640;
    const height = 220;
    const padding = { top: 20, right: 30, bottom: 40, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const count = trendData.length;
    if (count === 0) return '';

    const stepX = chartW / (count - 1 || 1);
    const points = trendData.map((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + (chartH - (d.score / 100) * chartH);
      return { x, y, score: d.score, label: d.label };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const cpX = (prev.x + cur.x) / 2;
      pathD += ` C ${cpX} ${prev.y}, ${cpX} ${cur.y}, ${cur.x} ${cur.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

    // Horizontal grid lines (0%, 25%, 50%, 75%, 100%)
    let gridLines = '';
    [0, 25, 50, 75, 100].forEach(val => {
      const y = padding.top + (chartH - (val / 100) * chartH);
      gridLines += `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
        <text x="${padding.left - 8}" y="${y + 4}" fill="#64748b" font-size="10" text-anchor="end">${val}%</text>
      `;
    });

    // Data points & X Labels
    let dotsHtml = '';
    points.forEach((p, i) => {
      dotsHtml += `
        <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#06b6d4" stroke="#0a0d14" stroke-width="2" />
        <text x="${p.x}" y="${p.y - 8}" fill="#06b6d4" font-size="10" font-weight="700" text-anchor="middle">${p.score}%</text>
      `;
      // Show every label if <= 7, or every 5th if > 7
      if (trendData.length <= 7 || i % 5 === 0 || i === trendData.length - 1) {
        dotsHtml += `
          <text x="${p.x}" y="${height - 10}" fill="#94a3b8" font-size="11" text-anchor="middle">${p.label}</text>
        `;
      }
    });

    return `
      <svg class="analytics-svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; overflow: visible;">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        ${gridLines}
        <path d="${areaD}" fill="url(#areaGradient)" />
        <path d="${pathD}" fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round" />
        ${dotsHtml}
      </svg>
    `;
  },

  generateCategoryDonutSVG(catMinutes, totalMinutes, catColors) {
    if (!totalMinutes || totalMinutes === 0) {
      return `
        <svg viewBox="0 0 160 160" width="160" height="160">
          <circle cx="80" cy="80" r="60" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="24" />
          <text x="80" y="85" text-anchor="middle" fill="#64748b" font-size="12">Rejalar yo‘q</text>
        </svg>
      `;
    }

    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPercent = 0;
    let strokesHtml = '';

    Object.keys(catMinutes).forEach(cat => {
      const mins = catMinutes[cat] || 0;
      if (mins <= 0) return;
      const percent = mins / totalMinutes;
      const strokeDash = `${percent * circumference} ${circumference}`;
      const strokeOffset = -accumulatedPercent * circumference;
      const color = catColors[cat] || '#06b6d4';

      strokesHtml += `
        <circle 
          cx="80" cy="80" r="${radius}" 
          fill="none" 
          stroke="${color}" 
          stroke-width="22"
          stroke-dasharray="${strokeDash}" 
          stroke-dashoffset="${strokeOffset}" 
          transform="rotate(-90 80 80)"
        />
      `;
      accumulatedPercent += percent;
    });

    return `
      <div style="position: relative; width: 160px; height: 160px;">
        <svg viewBox="0 0 160 160" width="160" height="160">
          <circle cx="80" cy="80" r="${radius}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="22" />
          ${strokesHtml}
        </svg>
        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
          <span style="font-size: 1.15rem; font-weight: 800; color: #fff;">${(totalMinutes / 60).toFixed(0)}s</span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Jami vaqt</span>
        </div>
      </div>
    `;
  }
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.ViewsManager = ViewsManager;
