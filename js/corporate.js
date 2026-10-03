/**
 * IntelliDay - Corporate Atelier & Construction Studio Module
 * Specially designed for:
 * - Chief Constructor (Bosh Konstruktor - Boshliq)
 * - Assistant Constructors (Yordamchi konstruktorlar - Shogirdlar)
 * - Sample Tailors (Modelxona namuna tikuvchi chevar qizlar)
 * 
 * Features:
 * - Smart Lead Time & Queue Bottleneck Calculation (ETA Prediction)
 * - Live Order Kanban & Stage Pipeline
 * - Real-Time Team Workload & Availability Tracker
 * - Personal Worker View (Queue, Start, Complete buttons)
 */

const CorporateManager = {
  data: {
    teamMembers: [],
    orders: [],
    settings: {
      workStartHour: 8.5,
      workEndHour: 17.5,
      lunchStart: 13.0,
      lunchEnd: 14.0,
      delayBufferPercent: 15
    }
  },
  currentViewTab: 'orders', // 'orders' | 'calculator' | 'team' | 'worker'
  activeWorkerId: 'all', // 'all' (Chief view) or employee ID
  isCorporateMode: false,

  init() {
    this.fetchData();
    this.bindTabEvents();
    
    // Register SSE listener if Storage is available
    if (window.Storage && window.Storage.sseSource) {
      window.Storage.sseSource.addEventListener('corporate_sync', (e) => {
        try {
          const freshData = JSON.parse(e.data);
          this.data = freshData;
          this.render();
          if (window.App && typeof window.App.showToast === 'function') {
            window.App.showToast('🏢 Modelxona ma’lumotlari yangilandi');
          }
        } catch(err){}
      });
    }
  },

  async fetchData() {
    try {
      const res = await fetch('/api/corporate/data');
      if (res.ok) {
        this.data = await res.json();
        this.render();
      }
    } catch (e) {
      console.warn('[CORPORATE] Serverdan ma’lumot olishda xatolik:', e);
    }
  },

  toggleMode(toCorporate = null) {
    if (toCorporate !== null) {
      this.isCorporateMode = toCorporate;
    } else {
      this.isCorporateMode = !this.isCorporateMode;
    }

    const personalContainer = document.getElementById('personal-mode-container');
    const corporateContainer = document.getElementById('corporate-mode-container');
    const modeBtn = document.getElementById('app-mode-toggle-btn');

    if (personalContainer) personalContainer.style.display = this.isCorporateMode ? 'none' : 'block';
    if (corporateContainer) corporateContainer.style.display = this.isCorporateMode ? 'block' : 'none';

    if (modeBtn) {
      modeBtn.className = `btn ${this.isCorporateMode ? 'btn-primary' : 'btn-secondary'} mode-toggle-pill`;
      modeBtn.innerHTML = this.isCorporateMode 
        ? `🏢 <strong>Modelxona Rejimi</strong> <span class="badge" style="background:rgba(255,255,255,0.2); font-size:0.7rem;">Korporativ</span>`
        : `🧘 <strong>Shaxsiy Rejim</strong> <span class="badge" style="background:rgba(255,255,255,0.1); font-size:0.7rem;">Kun tartibi</span>`;
    }

    if (this.isCorporateMode) {
      this.fetchData();
      this.render();
    }
  },

  bindTabEvents() {
    document.querySelectorAll('.corp-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.setTab(tab);
      });
    });
  },

  setTab(tabName) {
    this.currentViewTab = tabName;
    document.querySelectorAll('.corp-subtab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    const ordersSec = document.getElementById('corp-orders-section');
    const calcSec = document.getElementById('corp-calc-section');
    const teamSec = document.getElementById('corp-team-section');
    const workerSec = document.getElementById('corp-worker-section');

    if (ordersSec) ordersSec.style.display = tabName === 'orders' ? 'block' : 'none';
    if (calcSec) calcSec.style.display = tabName === 'calculator' ? 'block' : 'none';
    if (teamSec) teamSec.style.display = tabName === 'team' ? 'block' : 'none';
    if (workerSec) workerSec.style.display = tabName === 'worker' ? 'block' : 'none';

    this.render();
  },

  render() {
    this.renderKPIs();
    if (this.currentViewTab === 'orders') {
      this.renderOrders();
    } else if (this.currentViewTab === 'calculator') {
      this.initCalculatorForm();
    } else if (this.currentViewTab === 'team') {
      this.renderTeam();
    } else if (this.currentViewTab === 'worker') {
      this.renderWorkerPortal();
    }
  },

  // --------------------------------------------------------------------------
  // KPI Header Overview
  // --------------------------------------------------------------------------
  renderKPIs() {
    const orders = this.data.orders || [];
    const team = this.data.teamMembers || [];

    const activeOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
    const completedOrders = orders.filter(o => o.status === 'completed');

    // Count busy workers
    const busyWorkerIds = new Set();
    activeOrders.forEach(ord => {
      (ord.stages || []).forEach(st => {
        if (st.status === 'in_progress' && st.assignedTo) {
          busyWorkerIds.add(st.assignedTo);
        }
      });
    });

    const elActive = document.getElementById('corp-kpi-active-orders');
    const elCompleted = document.getElementById('corp-kpi-completed-orders');
    const elTeamBusy = document.getElementById('corp-kpi-team-busy');
    const elLeadTime = document.getElementById('corp-kpi-avg-leadtime');

    if (elActive) elActive.textContent = `${activeOrders.length} ta`;
    if (elCompleted) elCompleted.textContent = `${completedOrders.length} ta`;
    if (elTeamBusy) elTeamBusy.textContent = `${busyWorkerIds.size} / ${team.length} nafar`;
    if (elLeadTime) elLeadTime.textContent = activeOrders.length > 0 ? '2.5 kun' : 'Bo‘sh';
  },

  // --------------------------------------------------------------------------
  // Orders Pipeline & Kanban
  // --------------------------------------------------------------------------
  renderOrders() {
    const container = document.getElementById('corp-orders-list');
    if (!container) return;

    const orders = this.data.orders || [];
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">👗</div>
          <h3>Modelxonada hali zakazlar yo‘q</h3>
          <p style="color: var(--text-secondary); margin-bottom: 1.25rem;">Yangi kiyim namunasini hisoblash va xodimlarga taqsimlash uchun tugmani bosing:</p>
          <button class="btn btn-primary" onclick="CorporateManager.setTab('calculator')">+ Yangi Zakaz Qo‘shish & ETA Hisoblash</button>
        </div>
      `;
      return;
    }

    let html = '<div class="corp-orders-grid">';

    orders.forEach(ord => {
      const isCompleted = ord.status === 'completed';
      const stages = ord.stages || [];
      const completedCount = stages.filter(s => s.status === 'completed').length;
      const progressPercent = stages.length > 0 ? Math.round((completedCount / stages.length) * 100) : 0;

      // Find active stage
      const currentStage = stages.find(s => s.status === 'in_progress') || stages.find(s => s.status === 'pending');
      const assignedEmp = currentStage ? this.data.teamMembers.find(t => t.id === currentStage.assignedTo) : null;

      // ETA format
      let etaBadge = '';
      if (ord.calculatedETA) {
        const etaDate = new Date(ord.calculatedETA);
        const now = new Date();
        const diffHours = (etaDate - now) / 3600000;
        const opt = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const formatted = etaDate.toLocaleDateString('uz-UZ', opt);

        if (isCompleted) {
          etaBadge = `<span class="badge" style="background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">✓ Topshirilgan</span>`;
        } else if (diffHours < 0) {
          etaBadge = `<span class="badge" style="background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.3);">⚠️ Kechikmoqda (${formatted})</span>`;
        } else if (diffHours < 24) {
          etaBadge = `<span class="badge" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);">⏳ Bugun/Ertaga (${formatted})</span>`;
        } else {
          etaBadge = `<span class="badge" style="background: rgba(6,182,212,0.15); color: #06b6d4; border: 1px solid rgba(6,182,212,0.3);">📅 Tayyor bo‘lishi: ${formatted}</span>`;
        }
      }

      html += `
        <div class="glass-card corp-order-card ${isCompleted ? 'order-completed' : ''}">
          <div class="corp-order-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="order-num-pill">${escapeHtml(ord.orderNumber || 'ZAK')}</span>
                <h3 style="margin: 0; font-size: 1.05rem; color: #fff;">${escapeHtml(ord.title)}</h3>
              </div>
              <span style="font-size: 0.78rem; color: var(--text-muted);">Mijoz / Bo‘lim: <strong>${escapeHtml(ord.clientOrDept || 'Ichki buyurtma')}</strong></span>
              ${Array.isArray(ord.models) && ord.models.length ? `
                <div class="order-models-line">
                  <span class="calc-sum-chip">👗 ${ord.models.length} ta model</span>
                  <span class="calc-sum-chip alt">🧵 Jami ${ord.totalPieces || ord.models.reduce((s, m) => s + (m.qty || 0), 0)} dona</span>
                  ${ord.models.map(m => `<span class="order-model-tag">${escapeHtml(m.name)} × ${m.qty}</span>`).join('')}
                </div>
              ` : ''}
            </div>
            <div>
              ${etaBadge}
            </div>
          </div>

          <!-- Progress Bar -->
          <div style="margin: 1rem 0 0.75rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.35rem;">
              <span style="color: var(--text-secondary);">Jami bosqichlar: ${completedCount}/${stages.length} bajarildi</span>
              <strong style="color: var(--accent-cyan);">${progressPercent}%</strong>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${progressPercent}%; background: var(--gradient-brand); transition: width 0.3s;"></div>
            </div>
          </div>

          <!-- Stages Stepper Grid -->
          <div class="corp-stages-timeline">
      `;

      stages.forEach((st, idx) => {
        const emp = this.data.teamMembers.find(t => t.id === st.assignedTo);
        const isDone = st.status === 'completed';
        const isRunning = st.status === 'in_progress';

        html += `
          <div class="stage-step-pill ${isDone ? 'done' : ''} ${isRunning ? 'active' : ''}">
            <div class="stage-step-indicator">
              ${isDone ? '✓' : idx + 1}
            </div>
            <div class="stage-step-body">
              <span class="stage-step-name">${escapeHtml(st.name)}</span>
              <span class="stage-step-assigned">
                ${emp ? `${emp.avatar} ${emp.name.split(' ')[0]}` : 'Noma’lum'} • ${st.estimatedHours}s${st.multiplier > 1 ? ` (${st.unitHours}s × ${st.multiplier})` : ''}
              </span>
            </div>
            ${!isCompleted ? `
              <div class="stage-step-actions">
                ${isRunning ? `
                  <button type="button" class="btn btn-primary" style="padding: 0.2rem 0.55rem; font-size: 0.7rem;" onclick="CorporateManager.completeStage('${ord.id}', '${st.id}')">
                    ✓ Bajarildi
                  </button>
                ` : !isDone ? `
                  <button type="button" class="btn btn-secondary" style="padding: 0.2rem 0.55rem; font-size: 0.7rem;" onclick="CorporateManager.startStage('${ord.id}', '${st.id}')">
                    ▶ Boshlash
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>
        `;
      });

      html += `
          </div>

          ${ord.notes ? `
            <div style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-secondary);">
              📝 <strong>Qayd:</strong> ${escapeHtml(ord.notes)}
            </div>
          ` : ''}

          <!-- Order Footer Actions -->
          <div class="corp-order-footer">
            <span style="font-size: 0.72rem; color: var(--text-muted);">
              Kiritildi: ${new Date(ord.createdAt || Date.now()).toLocaleDateString('uz-UZ')}
            </span>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="CorporateManager.recalculateOrder('${ord.id}')" title="Qaytadan muddatni hisoblash">
                🔄 Qayta hisoblash
              </button>
              <button class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; color: #f43f5e;" onclick="CorporateManager.deleteOrder('${ord.id}')" title="O‘chirish">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  async startStage(orderId, stageId) {
    try {
      const res = await fetch('/api/corporate/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, stageId, status: 'in_progress' })
      });
      if (res.ok) {
        if (window.App) window.App.showToast('▶️ Bosqich boshlandi deb belgilandi');
        this.fetchData();
      }
    } catch(e){}
  },

  async completeStage(orderId, stageId) {
    try {
      const res = await fetch('/api/corporate/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, stageId, status: 'completed' })
      });
      if (res.ok) {
        if (window.App) {
          window.App.showToast('🎉 Bosqich muvaffaqiyatli yakunlandi va keyingisiga uzatildi!');
          if (window.NotificationManager && window.NotificationManager.sound) {
            window.NotificationManager.sound.playSuccess();
          }
        }
        this.fetchData();
      }
    } catch(e){}
  },

  async deleteOrder(orderId) {
    if (!confirm('Ushbu zakazni o‘chirmoqchimisiz?')) return;
    this.data.orders = this.data.orders.filter(o => o.id !== orderId);
    await this.syncWithServer();
    this.render();
  },

  async recalculateOrder(orderId) {
    const ord = this.data.orders.find(o => o.id === orderId);
    if (!ord) return;

    try {
      const res = await fetch('/api/corporate/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ord)
      });
      if (res.ok) {
        if (window.App) window.App.showToast('🔄 Muddatlar yangilandi!');
        this.fetchData();
      }
    } catch(e){}
  },

  // --------------------------------------------------------------------------
  // Smart Lead Time & Queue Bottleneck Calculator
  // --------------------------------------------------------------------------
  initCalculatorForm() {
    const team = this.data.teamMembers || [];

    // Helper to generate employee select options by role
    const getOptions = (filterRole) => {
      const matches = team.filter(t => !filterRole || t.role === filterRole || t.role === 'head_constructor');
      return matches.map(m => `<option value="${m.id}">${m.avatar} ${m.name} (${m.roleTitle})</option>`).join('');
    };

    const container = document.getElementById('corp-calculator-content');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-card" style="max-width: 800px; margin: 0 auto; padding: 1.75rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
          <div style="font-size: 2rem;">🧮</div>
          <div>
            <h2 style="margin: 0; font-size: 1.35rem;">Yangi Zakaz & Tayyor Bo‘lish Muddatini Hisoblash</h2>
            <span style="font-size: 0.82rem; color: var(--text-muted);">
              Xodimlarning navbatdagi ishlarini va ish vaqtlarini inobatga olgan holda aniq tayyor bo‘lish sanasini hisoblash
            </span>
          </div>
        </div>

        <form id="calc-order-form" onsubmit="CorporateManager.handleCreateOrderSubmit(event)">
          
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Zakaz Nomi</label>
              <input type="text" id="calc-title" class="form-input" placeholder="Masalan: Yozgi kolleksiya 2026" required>
            </div>
            <div class="form-group">
              <label class="form-label">Zakaz Raqami</label>
              <input type="text" id="calc-ordernum" class="form-input" value="ZAK-${Math.floor(100 + Math.random() * 900)}" required>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Buyurtmachi / Bo‘lim</label>
              <input type="text" id="calc-client" class="form-input" placeholder="Masalan: Savdo bo‘limi / Eksport" required>
            </div>
            <div class="form-group">
              <label class="form-label">Muhimlik Darajasi</label>
              <select id="calc-priority" class="form-select">
                <option value="medium">🟡 O‘rta (Oddiy tartibda)</option>
                <option value="high">🔴 Yuqori (Shoshilinch navbat)</option>
                <option value="low">🟢 Qulay (Ixtiyoriy)</option>
              </select>
            </div>
          </div>

          <!-- Models list: har bir model nomi va undan nechta tikilishi -->
          <h4 style="margin: 1.25rem 0 0.75rem; color: var(--accent-cyan); display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
            <span>👗 Modellar va Tikiladigan Soni:</span>
            <span class="calc-models-summary" id="calc-models-summary"></span>
          </h4>

          <div class="calc-stages-box" id="calc-models-list">
            ${this.modelRowHtml(1)}
            <button type="button" class="calc-add-model-btn" id="calc-add-model-btn" onclick="CorporateManager.addModelRow()">
              ➕ Yana model qo‘shish
            </button>
          </div>

          <!-- Dynamic Stages Setup -->
          <h4 style="margin: 1.25rem 0 0.75rem; color: var(--accent-cyan); display: flex; align-items: center; justify-content: space-between;">
            <span>Ish Bosqichlari va Biriktirilgan Xodimlar:</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">Vaqt 1 model / 1 dona uchun kiritiladi</span>
          </h4>

          <div class="calc-stages-box" id="calc-stages-list">
            <!-- Stage 1: Lekalo -->
            <div class="calc-stage-row" data-basis="model">
              <span class="calc-stage-step">1</span>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">1-bosqich: Andaza (Lekalo)</label>
                <input type="text" class="form-input calc-st-name" value="Andaza & Gradatsiya (Lekalo)" required>
              </div>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Mas’ul Konstruktor</label>
                <select class="form-select calc-st-emp">
                  ${getOptions('assistant_constructor')}
                </select>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">1 model uchun (soat)</label>
                <input type="number" class="form-input calc-st-hours" value="4.0" step="0.5" min="0.5" max="40" oninput="CorporateManager.livePreviewETA()">
                <span class="calc-st-total"></span>
              </div>
            </div>

            <!-- Stage 2: Bichish -->
            <div class="calc-stage-row" data-basis="piece">
              <span class="calc-stage-step">2</span>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">2-bosqich: Bichish & Tayyorlov</label>
                <input type="text" class="form-input calc-st-name" value="Bichish & Dublyaj" required>
              </div>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Mas’ul Bichuvchi</label>
                <select class="form-select calc-st-emp">
                  ${getOptions('cutter')}
                </select>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">1 dona uchun (soat)</label>
                <input type="number" class="form-input calc-st-hours" value="1.5" step="0.5" min="0.5" max="40" oninput="CorporateManager.livePreviewETA()">
                <span class="calc-st-total"></span>
              </div>
            </div>

            <!-- Stage 3: Namuna tikish -->
            <div class="calc-stage-row" data-basis="piece">
              <span class="calc-stage-step">3</span>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">3-bosqich: Namuna Tikish</label>
                <input type="text" class="form-input calc-st-name" value="Modelxonada Namuna Tikish" required>
              </div>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Modelxona Chevari</label>
                <select class="form-select calc-st-emp">
                  ${getOptions('sample_tailor')}
                </select>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">1 dona uchun (soat)</label>
                <input type="number" class="form-input calc-st-hours" value="6.0" step="0.5" min="0.5" max="80" oninput="CorporateManager.livePreviewETA()">
                <span class="calc-st-total"></span>
              </div>
            </div>

            <!-- Stage 4: Primera -->
            <div class="calc-stage-row" data-basis="model">
              <span class="calc-stage-step">4</span>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">4-bosqich: Primera & Bosh Tekshiruv</label>
                <input type="text" class="form-input calc-st-name" value="Primera & Bosh Tekshiruv" required>
              </div>
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Tekshiruvchi (Bosh Konstruktor)</label>
                <select class="form-select calc-st-emp">
                  ${getOptions('head_constructor')}
                </select>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">1 model uchun (soat)</label>
                <input type="number" class="form-input calc-st-hours" value="1.0" step="0.5" min="0.5" max="10" oninput="CorporateManager.livePreviewETA()">
                <span class="calc-st-total"></span>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Qo‘shimcha texnik talablar (Izoh)</label>
            <textarea id="calc-notes" class="form-textarea" rows="2" placeholder="Mato turi, iplar, furnitura yoki andaza o‘lchovlari bo‘yicha eslatmalar..."></textarea>
          </div>

          <!-- Live ETA Result Simulation Box -->
          <div class="calc-live-result-box" id="calc-live-result-box">
            <div class="calc-result-header">
              <span>🎯 Aqlli Hisoblangan Tayyor Bo‘lish Sanasi (ETA):</span>
              <strong id="calc-result-eta" style="color: var(--accent-cyan); font-size: 1.15rem;">Hisoblanmoqda...</strong>
            </div>
            <div class="calc-result-details" id="calc-result-details">
              Xodimlar navbati va bo‘sh vaqtlari tekshirilmoqda...
            </div>
          </div>

          <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button type="submit" class="btn btn-primary" style="flex: 2; padding: 0.75rem 1rem;">
              🚀 Zakazni Tasdiqlash & Xodimlarga Biriktirish
            </button>
            <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="CorporateManager.setTab('orders')">
              Bekor qilish
            </button>
          </div>

        </form>
      </div>
    `;

    this.livePreviewETA();
  },

  modelRowHtml(index) {
    return `
      <div class="calc-model-row">
        <span class="calc-stage-step calc-model-idx">${index}</span>
        <div class="form-group" style="flex: 3; margin-bottom: 0; min-width: 160px;">
          <label class="form-label" style="font-size: 0.75rem;">Model nomi / raqami</label>
          <input type="text" class="form-input calc-model-name" placeholder="Masalan: Model #55 — Yozgi sarafan" required>
        </div>
        <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 100px;">
          <label class="form-label" style="font-size: 0.75rem;">Necha dona tikiladi</label>
          <input type="number" class="form-input calc-model-qty" value="1" min="1" max="999" step="1" required oninput="CorporateManager.livePreviewETA()">
        </div>
        <button type="button" class="calc-model-remove" title="Modelni o‘chirish" onclick="CorporateManager.removeModelRow(this)">✕</button>
      </div>
    `;
  },

  addModelRow() {
    const btn = document.getElementById('calc-add-model-btn');
    if (!btn) return;
    const count = document.querySelectorAll('.calc-model-row').length;
    btn.insertAdjacentHTML('beforebegin', this.modelRowHtml(count + 1));
    const rows = document.querySelectorAll('.calc-model-row');
    rows[rows.length - 1].querySelector('.calc-model-name')?.focus();
    this.renumberModelRows();
    this.livePreviewETA();
  },

  removeModelRow(btn) {
    const rows = document.querySelectorAll('.calc-model-row');
    if (rows.length <= 1) return;
    btn.closest('.calc-model-row')?.remove();
    this.renumberModelRows();
    this.livePreviewETA();
  },

  renumberModelRows() {
    const rows = document.querySelectorAll('.calc-model-row');
    rows.forEach((row, i) => {
      const idx = row.querySelector('.calc-model-idx');
      if (idx) idx.textContent = i + 1;
      const rm = row.querySelector('.calc-model-remove');
      if (rm) rm.disabled = rows.length <= 1;
    });
  },

  collectModelsFromForm() {
    const models = [];
    document.querySelectorAll('.calc-model-row').forEach((row, i) => {
      const name = row.querySelector('.calc-model-name')?.value.trim() || `Model ${i + 1}`;
      const qty = Math.max(1, parseInt(row.querySelector('.calc-model-qty')?.value, 10) || 1);
      models.push({ name, qty });
    });
    if (models.length === 0) models.push({ name: 'Model 1', qty: 1 });
    const totalPieces = models.reduce((s, m) => s + m.qty, 0);
    return { models, modelCount: models.length, totalPieces };
  },

  collectStagesFromForm() {
    const { modelCount, totalPieces } = this.collectModelsFromForm();
    const rows = document.querySelectorAll('.calc-stage-row');
    const stages = [];
    rows.forEach((row, i) => {
      const name = row.querySelector('.calc-st-name')?.value.trim() || `Bosqich ${i + 1}`;
      const assignedTo = row.querySelector('.calc-st-emp')?.value || '';
      const unitHours = parseFloat(row.querySelector('.calc-st-hours')?.value) || 2;
      const qtyBasis = row.dataset.basis === 'piece' ? 'piece' : 'model';
      const multiplier = qtyBasis === 'piece' ? totalPieces : modelCount;
      const hours = parseFloat((unitHours * multiplier).toFixed(2));

      const totalEl = row.querySelector('.calc-st-total');
      if (totalEl) {
        totalEl.textContent = `× ${multiplier} ${qtyBasis === 'piece' ? 'dona' : 'model'} = ${hours} soat`;
      }

      stages.push({
        id: `st_new_${i + 1}`,
        name,
        assignedTo,
        unitHours,
        qtyBasis,
        multiplier,
        estimatedHours: hours,
        status: i === 0 ? 'in_progress' : 'pending'
      });
    });
    return stages;
  },

  updateModelsSummary() {
    const el = document.getElementById('calc-models-summary');
    if (!el) return;
    const { modelCount, totalPieces } = this.collectModelsFromForm();
    el.innerHTML = `
      <span class="calc-sum-chip">👗 ${modelCount} ta model</span>
      <span class="calc-sum-chip alt">🧵 Jami ${totalPieces} dona</span>
    `;
  },

  async livePreviewETA() {
    this.renumberModelRows();
    this.updateModelsSummary();
    const stages = this.collectStagesFromForm();
    const resultBox = document.getElementById('calc-live-result-box');
    const etaTextEl = document.getElementById('calc-result-eta');
    const detailsEl = document.getElementById('calc-result-details');

    if (!resultBox || !etaTextEl) return;

    try {
      const res = await fetch('/api/corporate/calculate-eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages })
      });

      if (res.ok) {
        const data = await res.json();
        etaTextEl.textContent = data.finalETAFormatted || 'Aniqlanmadi';
        detailsEl.innerHTML = `
          <div style="line-height: 1.6; margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
            ${data.explanation.replace(/\n/g, '<br>')}
          </div>
          <div style="margin-top: 0.5rem; font-size: 0.78rem; color: var(--accent-emerald);">
            ✓ +15% texnik kechikish va tanaffus buferi qo‘shildi. Shanba/yakshanba va tushlik (13:00-14:00) hisobga olindi.
          </div>
        `;
      }
    } catch(e) {
      etaTextEl.textContent = 'Server bilan aloqa yo‘q';
    }
  },

  async handleCreateOrderSubmit(event) {
    event.preventDefault();
    const title = document.getElementById('calc-title')?.value.trim();
    const orderNumber = document.getElementById('calc-ordernum')?.value.trim();
    const clientOrDept = document.getElementById('calc-client')?.value.trim();
    const priority = document.getElementById('calc-priority')?.value || 'medium';
    const notes = document.getElementById('calc-notes')?.value.trim() || '';

    const stages = this.collectStagesFromForm();
    if (!title || stages.length === 0) return;

    const { models, modelCount, totalPieces } = this.collectModelsFromForm();

    const payload = {
      title,
      orderNumber,
      clientOrDept,
      priority,
      notes,
      models,
      modelCount,
      totalPieces,
      stages
    };

    try {
      const res = await fetch('/api/corporate/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        if (window.App) {
          window.App.showToast(`✅ "${orderNumber}" zakazi modelxona navbatiga muvaffaqiyatli qo‘shildi!`, 4000);
          if (window.NotificationManager && window.NotificationManager.sound) {
            window.NotificationManager.sound.playSuccess();
          }
        }
        await this.fetchData();
        this.setTab('orders');
      }
    } catch (e) {
      alert('Zakazni saqlashda xatolik yuz berdi');
    }
  },

  // --------------------------------------------------------------------------
  // Team Workload & Capacity View
  // --------------------------------------------------------------------------
  renderTeam() {
    const container = document.getElementById('corp-team-list');
    if (!container) return;

    const team = this.data.teamMembers || [];
    const orders = this.data.orders || [];

    let html = '<div class="corp-team-grid">';

    team.forEach(tm => {
      // Find all tasks assigned to this employee
      const activeTasks = [];
      const queueTasks = [];

      orders.forEach(ord => {
        if (ord.status === 'completed' || ord.status === 'cancelled') return;
        (ord.stages || []).forEach(st => {
          if (st.assignedTo === tm.id) {
            if (st.status === 'in_progress') {
              activeTasks.push({ ...st, orderNumber: ord.orderNumber, orderTitle: ord.title });
            } else if (st.status === 'pending') {
              queueTasks.push({ ...st, orderNumber: ord.orderNumber, orderTitle: ord.title });
            }
          }
        });
      });

      const totalQueueHours = [...activeTasks, ...queueTasks].reduce((acc, t) => acc + (t.estimatedHours || 0), 0);
      const isBusy = activeTasks.length > 0;
      const isHeavy = totalQueueHours > 8;

      let statusBadge = '';
      if (activeTasks.length > 0) {
        statusBadge = `<span class="badge" style="background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.3);">🔴 Ish jarayonida</span>`;
      } else if (queueTasks.length > 0) {
        statusBadge = `<span class="badge" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);">🟡 Navbatda ish bor</span>`;
      } else {
        statusBadge = `<span class="badge" style="background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">🟢 Bo‘sh (Tayyor)</span>`;
      }

      html += `
        <div class="glass-card corp-member-card">
          <div class="corp-member-header">
            <div class="corp-member-avatar">${tm.avatar || '👤'}</div>
            <div style="flex: 1;">
              <h3 style="margin: 0; font-size: 1.05rem; color: #fff;">${escapeHtml(tm.name)}</h3>
              <span style="font-size: 0.78rem; color: var(--accent-cyan); font-weight: 600;">${escapeHtml(tm.roleTitle || tm.role)}</span>
            </div>
            <div>
              ${statusBadge}
            </div>
          </div>

          <!-- Capacity Bar -->
          <div style="margin: 0.85rem 0;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.35rem;">
              <span style="color: var(--text-secondary);">Bandlik yuki:</span>
              <strong style="color: ${isHeavy ? '#f43f5e' : 'var(--text-main)'};">${totalQueueHours} soatlik ish navbatda</strong>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, (totalQueueHours / 16) * 100)}%; background: ${isHeavy ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'var(--gradient-brand)'};"></div>
            </div>
          </div>

          <!-- Current Task Box -->
          <div class="corp-member-curtask">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.25rem;">Hozirgi bajarayotgan ishi:</span>
            ${activeTasks.length > 0 ? `
              <div style="font-size: 0.85rem; color: #fff; font-weight: 600;">
                📌 [${escapeHtml(activeTasks[0].orderNumber)}] ${escapeHtml(activeTasks[0].name)}
              </div>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(activeTasks[0].orderTitle)} (${activeTasks[0].estimatedHours} soat)</span>
            ` : `
              <span style="font-size: 0.82rem; color: var(--text-muted); font-style: italic;">Ayni paytda faol ish yo‘q</span>
            `}
          </div>

          <!-- Queue items -->
          <div style="margin-top: 0.75rem;">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 0.25rem;">
              Navbatdagi namunalar (${queueTasks.length} ta):
            </span>
            ${queueTasks.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                ${queueTasks.slice(0, 3).map(q => `
                  <div style="font-size: 0.78rem; padding: 0.3rem 0.5rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); display: flex; justify-content: space-between;">
                    <span>[${escapeHtml(q.orderNumber)}] ${escapeHtml(q.name)}</span>
                    <span style="color: var(--text-muted); font-family: monospace;">${q.estimatedHours}s</span>
                  </div>
                `).join('')}
                ${queueTasks.length > 3 ? `<span style="font-size: 0.72rem; color: var(--accent-cyan);">+ yana ${queueTasks.length - 3} ta ish navbatda</span>` : ''}
              </div>
            ` : `
              <span style="font-size: 0.78rem; color: var(--text-muted);">Navbatda kutilayotgan ishlar yo‘q</span>
            `}
          </div>

        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  // --------------------------------------------------------------------------
  // Worker View (Shogirdlar va Chevarlar uchun shaxsiy navbat portali)
  // --------------------------------------------------------------------------
  renderWorkerPortal() {
    const container = document.getElementById('corp-worker-content');
    if (!container) return;

    const team = this.data.teamMembers || [];
    const orders = this.data.orders || [];

    let selectorHtml = `
      <div class="glass-card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
        <label class="form-label" style="font-size: 0.95rem; margin-bottom: 0.5rem;">
          👤 Xodim sifatida kirish (Shogird yoki Chevar tanlang):
        </label>
        <select class="form-select" id="worker-select-picker" onchange="CorporateManager.switchWorker(this.value)">
          <option value="all">👑 Bosh Konstruktor (Barcha xodimlarni kuzatish)</option>
          ${team.filter(t => t.id !== 'tm_boss').map(t => `
            <option value="${t.id}" ${this.activeWorkerId === t.id ? 'selected' : ''}>
              ${t.avatar} ${t.name} — ${t.roleTitle}
            </option>
          `).join('')}
        </select>
      </div>
    `;

    // Filter stages for selected worker
    const worker = team.find(t => t.id === this.activeWorkerId);

    let myStages = [];
    orders.forEach(ord => {
      if (ord.status === 'completed' || ord.status === 'cancelled') return;
      (ord.stages || []).forEach(st => {
        if (this.activeWorkerId === 'all' || st.assignedTo === this.activeWorkerId) {
          myStages.push({
            ...st,
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            orderTitle: ord.title,
            priority: ord.priority,
            notes: ord.notes
          });
        }
      });
    });

    let listHtml = '';
    if (myStages.length === 0) {
      listHtml = `
        <div class="glass-card" style="text-align: center; padding: 2.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">☕</div>
          <h3>Ajoyib! Ayni damda sizda bajarilmagan ishlar yo‘q.</h3>
          <p style="color: var(--text-secondary); font-size: 0.88rem;">Bosh konstruktor yangi namuna biriktirishi bilan bu yerda paydo bo‘ladi.</p>
        </div>
      `;
    } else {
      listHtml += '<div style="display: flex; flex-direction: column; gap: 0.85rem;">';
      myStages.forEach(st => {
        const isRunning = st.status === 'in_progress';
        const isDone = st.status === 'completed';

        listHtml += `
          <div class="glass-card" style="padding: 1.15rem 1.25rem; border-left: 4px solid ${isRunning ? 'var(--accent-cyan)' : 'var(--border-light)'};">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                  <span class="order-num-pill">${escapeHtml(st.orderNumber)}</span>
                  <h3 style="margin: 0; font-size: 1.1rem; color: #fff;">${escapeHtml(st.name)}</h3>
                  <span class="badge ${isRunning ? 'badge-work' : ''}">${isRunning ? '⚡ Jarayonda' : '⏳ Navbatda'}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                  Zakaz: <strong>${escapeHtml(st.orderTitle)}</strong> • Rejalashtirilgan vaqt: <strong>${st.estimatedHours} soat</strong>
                </div>
                ${st.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem;">Qayd: ${escapeHtml(st.notes)}</div>` : ''}
              </div>

              <div style="display: flex; gap: 0.5rem; align-items: center;">
                ${isRunning ? `
                  <button class="btn btn-primary" style="padding: 0.45rem 1rem; font-size: 0.85rem;" onclick="CorporateManager.completeStage('${st.orderId}', '${st.id}')">
                    ✅ Tikib bo‘ldim (Topshirish)
                  </button>
                ` : !isDone ? `
                  <button class="btn btn-secondary" style="padding: 0.45rem 1rem; font-size: 0.85rem;" onclick="CorporateManager.startStage('${st.orderId}', '${st.id}')">
                    ▶️ Ishni boshlash
                  </button>
                ` : '<span style="color: var(--accent-emerald);">✓ Bajarilgan</span>'}
              </div>
            </div>
          </div>
        `;
      });
      listHtml += '</div>';
    }

    container.innerHTML = selectorHtml + listHtml;
  },

  switchWorker(workerId) {
    this.activeWorkerId = workerId;
    this.renderWorkerPortal();
  },

  async syncWithServer() {
    try {
      await fetch('/api/corporate/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
    } catch(e){}
  }
};

window.CorporateManager = CorporateManager;
