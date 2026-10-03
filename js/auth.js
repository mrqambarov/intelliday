/**
 * IntelliDay - Auth & Multi-User Identity System
 * Supports:
 * - 🔑 Login + Parol (PIN) bilan kirish
 * - ✈️ Telegram orqali kirish (1-klik bot havolasi yoki 6 xonali kod)
 * - 📐 Assistant Constructor (Shogird) & Sample Tailor (Chevar) Profile Perspectives
 * - 🔴 Real-Time Status (BUSY / FREE)
 */

const AuthManager = {
  currentUser: null,
  usersList: [],
  activeTab: 'login', // 'login' | 'telegram'
  tgPollTimer: null,
  tgPollCode: null,
  isSwitchMode: false,

  async init() {
    const urlParams = new URLSearchParams(window.location.search);

    // ?reset=1 / ?logout=1 -> sessiyani tozalash
    if (urlParams.get('reset_session') || urlParams.get('logout') || urlParams.get('reset')) {
      this.clearSession();
      window.history.replaceState({}, document.title, window.location.pathname);
      this.showLoginScreen(false);
      return;
    }

    // ?auth=123456 -> Telegram botdagi havola orqali kirish
    const authCode = urlParams.get('auth');
    if (authCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const ok = await this.loginWithCode(authCode);
      if (!ok) this.showLoginScreen(false);
      return;
    }

    // Saqlangan sessiya
    const saved = localStorage.getItem('intelliday_auth_user_v1');
    const sessionActive = sessionStorage.getItem('intelliday_session_started');
    if (saved) {
      try { this.currentUser = JSON.parse(saved); } catch (e) { this.currentUser = null; }
    }

    if (this.currentUser && sessionActive) {
      this.hideLoginScreen();
    } else {
      this.showLoginScreen(false);
    }

    // Real-vaqt holat yangilanishi
    if (window.Storage && window.Storage.sseSource) {
      window.Storage.sseSource.addEventListener('corporate_sync', (e) => {
        try {
          const fresh = JSON.parse(e.data);
          if (fresh.teamMembers && this.currentUser) {
            const up = fresh.teamMembers.find(t => t.id === this.currentUser.id);
            if (up) {
              this.currentUser = { ...this.currentUser, ...up };
              this.renderHeaderProfile();
              this.renderWorkerDashboard();
            }
          }
        } catch (err) {}
      });
    }
  },

  async fetchUsers() {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const json = await res.json();
        this.usersList = json.users || [];
      }
    } catch (e) {
      console.warn('[AUTH] Xodimlarni yuklashda xatolik:', e);
    }
  },

  renderHeaderProfile() {
    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl = document.getElementById('header-user-name');
    const badgeEl = document.getElementById('header-user-badge');
    const statusDotEl = document.getElementById('header-user-status-dot');

    if (!this.currentUser) {
      if (nameEl) nameEl.textContent = 'Kirish';
      if (badgeEl) badgeEl.textContent = 'Mehmon';
      return;
    }

    if (avatarEl) avatarEl.textContent = this.currentUser.avatar || '👤';
    const cleanName = (this.currentUser.name || '').replace(/\(Siz\)/i, '').trim();
    if (nameEl) nameEl.textContent = cleanName;

    const isBusy = this.currentUser.currentStatus === 'busy';
    const isPaused = this.currentUser.currentStatus === 'paused';

    if (badgeEl) {
      let roleText = 'Xodim';
      if (this.currentUser.role === 'head_constructor') roleText = 'Boshliq';
      else if (this.currentUser.role === 'assistant_constructor') roleText = 'Konstruktor';
      else if (this.currentUser.role === 'sample_tailor') roleText = 'Chevar';
      else if (this.currentUser.role === 'cutter') roleText = 'Bichuvchi';
      badgeEl.textContent = roleText;
      badgeEl.className = `user-role-badge ${this.currentUser.role}`;
    }

    if (statusDotEl) {
      statusDotEl.className = `user-status-dot ${isBusy ? 'status-busy' : isPaused ? 'status-paused' : 'status-free'}`;
      statusDotEl.title = isBusy ? 'Band (Hozir ishlamoqda)' : isPaused ? 'Tanaffusda' : 'Bo‘sh (Yangi ishga tayyor)';
    }

    if (window.CorporateManager) {
      CorporateManager.activeWorkerId = this.currentUser.id;
    }
  },

  applyUserRoleLayout() {
    if (!this.currentUser) return;
    const isBoss = this.currentUser.role === 'head_constructor';

    document.querySelectorAll('.boss-only-feature').forEach(el => {
      el.style.display = isBoss ? '' : 'none';
    });

    const workerDashboard = document.getElementById('worker-personal-dashboard');
    if (workerDashboard) {
      workerDashboard.style.display = isBoss ? 'none' : 'block';
    }

    if (!isBoss) {
      this.renderWorkerDashboard();
    }
  },

  // --------------------------------------------------------------------------
  // Butun ekranli login sahifasi
  // --------------------------------------------------------------------------
  showLoginScreen(isSwitchMode = false) {
    const screen = document.getElementById('login-screen');
    const app = document.getElementById('app');
    this.isSwitchMode = isSwitchMode && !!this.currentUser;

    if (screen) {
      screen.style.display = 'flex';
      screen.classList.remove('hidden');
    }
    if (app) app.style.display = 'none';

    this.renderLoginScreen();
  },

  hideLoginScreen() {
    this.stopTelegramPolling();
    const screen = document.getElementById('login-screen');
    const app = document.getElementById('app');

    if (screen) {
      screen.style.display = 'none';
      screen.classList.add('hidden');
    }
    if (app) app.style.display = 'block';

    this.renderHeaderProfile();
    this.applyUserRoleLayout();

    if (window.Schedule && typeof window.Schedule.render === 'function') {
      window.Schedule.render();
    }
  },

  // Eski chaqiruvlar bilan moslik
  openLoginModal() { this.showLoginScreen(true); },
  closeLoginModal() { if (this.currentUser) this.hideLoginScreen(); },
  renderModalContent() { this.renderLoginScreen(); },

  setAuthTab(tab) {
    this.activeTab = tab;
    this.stopTelegramPolling();
    this.renderLoginScreen();
  },

  renderLoginScreen() {
    const container = document.getElementById('login-screen-content');
    if (!container) return;

    let html = '';

    // Allaqachon kirgan foydalanuvchi profil tugmasini bosgan bo‘lsa
    if (this.currentUser) {
      const cleanCurName = (this.currentUser.name || '').replace(/\(Siz\)/i, '').trim();
      html += `
        <div class="login-current-session">
          <div class="login-current-user">
            <span class="login-current-avatar">${this.currentUser.avatar || '👤'}</span>
            <div>
              <div class="login-current-label">Hozirgi profil</div>
              <strong>${escapeHtml(cleanCurName)}</strong>
            </div>
          </div>
          <div class="login-current-actions">
            <button type="button" class="btn btn-primary btn-sm" id="login-back-btn" onclick="AuthManager.hideLoginScreen()">↩️ Qaytish</button>
            <button type="button" class="btn btn-secondary btn-sm" id="login-logout-btn" onclick="AuthManager.logout()">🚪 Chiqish</button>
          </div>
        </div>
      `;
    }

    html += `
      <div class="auth-tabs-nav">
        <button type="button" id="auth-tab-login" class="auth-tab-btn ${this.activeTab === 'login' ? 'active' : ''}" onclick="AuthManager.setAuthTab('login')">
          🔑 Login
        </button>
        <button type="button" id="auth-tab-telegram" class="auth-tab-btn ${this.activeTab === 'telegram' ? 'active' : ''}" onclick="AuthManager.setAuthTab('telegram')">
          ✈️ Telegram orqali
        </button>
      </div>
    `;

    if (this.activeTab === 'login') {
      html += `
        <form class="login-form" id="login-form" onsubmit="event.preventDefault(); AuthManager.submitLogin();" autocomplete="on">
          <div class="login-field">
            <label for="login-username">Login</label>
            <div class="login-input-wrap">
              <span class="login-input-icon">👤</span>
              <input type="text" id="login-username" class="form-input" placeholder="Login yoki Telegram username" autocomplete="username" required>
            </div>
          </div>

          <div class="login-field">
            <label for="login-password">Parol</label>
            <div class="login-input-wrap">
              <span class="login-input-icon">🔒</span>
              <input type="password" id="login-password" class="form-input" placeholder="••••••" autocomplete="current-password" required>
              <button type="button" class="login-eye-btn" id="login-toggle-password" onclick="AuthManager.togglePassword()" title="Parolni ko‘rsatish">👁</button>
            </div>
          </div>

          <div id="login-error" class="login-error" style="display:none;"></div>

          <button type="submit" class="btn btn-primary login-submit-btn" id="login-submit-btn">
            Tizimga kirish
          </button>
        </form>
      `;
    } else {
      html += `
        <div class="login-tg-panel">
          <div class="login-tg-icon">✈️</div>
          <p class="login-tg-text">
            Telegram akkauntingiz orqali bir bosishda kiring. Bot ochiladi — <b>START</b> tugmasini bosing va shu sahifaga qayting.
          </p>

          <button type="button" class="btn login-tg-btn" id="login-tg-start-btn" onclick="AuthManager.startTelegramLogin()">
            ✈️ Telegram orqali kirish
          </button>

          <div id="login-tg-status" class="login-tg-status"></div>

          <div class="login-divider"><span>yoki botdan olingan kod bilan</span></div>

          <form class="login-code-row" onsubmit="event.preventDefault(); AuthManager.submitTgCodeLogin();">
            <input type="text" id="tg-code-input" class="form-input login-code-input" placeholder="123456" maxlength="32" autocomplete="one-time-code">
            <button type="submit" class="btn btn-secondary" id="login-tg-code-btn">Kirish</button>
          </form>
          <div class="login-tg-hint">Botga <code>/login</code> deb yozing — 6 xonali kod keladi.</div>
          <div id="login-error" class="login-error" style="display:none;"></div>
        </div>
      `;
    }

    container.innerHTML = html;

    setTimeout(() => {
      const first = document.getElementById(this.activeTab === 'login' ? 'login-username' : 'tg-code-input');
      if (first && this.activeTab === 'login') first.focus();
    }, 50);
  },

  togglePassword() {
    const inp = document.getElementById('login-password');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  },

  showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  },

  async submitLogin() {
    const login = (document.getElementById('login-username')?.value || '').trim();
    const password = document.getElementById('login-password')?.value || '';
    const btn = document.getElementById('login-submit-btn');

    if (!login || !password) {
      this.showLoginError('Login va parolni kiriting');
      return;
    }

    this.showLoginError('');
    if (btn) { btn.disabled = true; btn.textContent = 'Tekshirilmoqda...'; }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.completeLogin(data.user, data.token);
      } else {
        this.showLoginError(data.error || 'Login yoki parol noto‘g‘ri');
        const p = document.getElementById('login-password');
        if (p) { p.value = ''; p.focus(); }
      }
    } catch (e) {
      this.showLoginError('Server bilan aloqa yo‘q');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Tizimga kirish'; }
    }
  },

  // 1-klik: t.me/bot?start=login_XXX ochiladi, sahifa natijani kutadi
  async startTelegramLogin() {
    const statusEl = document.getElementById('login-tg-status');
    this.showLoginError('');

    // Popup bloklanmasligi uchun oynani darhol ochamiz
    const tgWindow = window.open('about:blank', '_blank');

    try {
      const res = await fetch('/api/auth/telegram-start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Xatolik');

      if (tgWindow) tgWindow.location.href = data.url;
      else window.location.href = data.url;

      if (statusEl) {
        statusEl.innerHTML = `
          <span class="login-spinner"></span>
          Telegramda <b>@${escapeHtml(data.botUsername)}</b> botida <b>START</b> tugmasini bosing...
          <div style="margin-top:0.4rem;"><a href="${data.url}" target="_blank" rel="noopener">Bot ochilmadimi? Shu yerni bosing</a></div>
        `;
      }
      this.pollTelegramLogin(data.code);
    } catch (e) {
      if (tgWindow) tgWindow.close();
      this.showLoginError(e.message || 'Telegram bilan bog‘lanib bo‘lmadi');
    }
  },

  pollTelegramLogin(code) {
    this.stopTelegramPolling();
    this.tgPollCode = code;
    const startedAt = Date.now();

    this.tgPollTimer = setInterval(async () => {
      if (Date.now() - startedAt > 10 * 60000) {
        this.stopTelegramPolling();
        const s = document.getElementById('login-tg-status');
        if (s) s.innerHTML = 'Vaqt tugadi. Qaytadan urinib ko‘ring.';
        return;
      }
      try {
        const res = await fetch('/api/auth/telegram-check?code=' + encodeURIComponent(code));
        const data = await res.json();
        if (data.success && data.user) {
          this.stopTelegramPolling();
          this.completeLogin(data.user, data.token);
        } else if (data.status === 'expired') {
          this.stopTelegramPolling();
          const s = document.getElementById('login-tg-status');
          if (s) s.innerHTML = 'Havola eskirdi. Qaytadan bosing.';
        }
      } catch (e) {}
    }, 2000);
  },

  stopTelegramPolling() {
    if (this.tgPollTimer) clearInterval(this.tgPollTimer);
    this.tgPollTimer = null;
    this.tgPollCode = null;
  },

  async submitTgCodeLogin() {
    const code = (document.getElementById('tg-code-input')?.value || '').trim();
    if (!code || code.length < 4) {
      this.showLoginError('Kodni kiriting');
      return;
    }
    const ok = await this.loginWithCode(code);
    if (!ok) this.showLoginError('Kod noto‘g‘ri yoki eskirgan');
  },

  async loginWithCode(code) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.completeLogin(data.user, data.token);
        return true;
      }
    } catch (e) {}
    return false;
  },

  completeLogin(user, token) {
    this.setUserSession(user, token);
    this.hideLoginScreen();
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(`🎉 Xush kelibsiz, ${user.name}!`);
    }
    if (window.NotificationManager && window.NotificationManager.sound && window.NotificationManager.sound.playTone) {
      try { window.NotificationManager.sound.playTone('chime'); } catch (e) {}
    }
  },

  setUserSession(user, token) {
    this.currentUser = user;
    localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(user));
    if (token) localStorage.setItem('intelliday_auth_token_v1', token);
    sessionStorage.setItem('intelliday_session_started', 'true');

    this.renderHeaderProfile();
    this.applyUserRoleLayout();

    if (window.Storage && typeof window.Storage.loadUserPlan === 'function') {
      window.Storage.loadUserPlan(user.id);
    }
    if (window.CorporateManager) {
      CorporateManager.activeWorkerId = user.id;
      CorporateManager.fetchData();
    }
  },

  clearSession() {
    localStorage.removeItem('intelliday_auth_user_v1');
    localStorage.removeItem('intelliday_auth_token_v1');
    sessionStorage.removeItem('intelliday_session_started');
    this.currentUser = null;
  },

  logout() {
    this.clearSession();
    this.renderHeaderProfile();
    this.activeTab = 'login';
    this.showLoginScreen(false);
  },

  // --------------------------------------------------------------------------
  // Worker Perspective Dashboard (For Apprentice & Sample Tailor)
  // --------------------------------------------------------------------------
  async renderWorkerDashboard() {
    const container = document.getElementById('worker-personal-dashboard');
    if (!container || !this.currentUser) return;

    if (this.currentUser.role === 'head_constructor') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    // 1. Fetch orders and find my assigned stages
    let orders = [];
    if (window.CorporateManager && window.CorporateManager.data && window.CorporateManager.data.orders) {
      orders = window.CorporateManager.data.orders;
    } else {
      try {
        const r = await fetch('/api/corporate/data');
        if (r.ok) {
          const d = await r.json();
          orders = d.orders || [];
        }
      } catch(e){}
    }

    const myId = this.currentUser.id;
    const isBusy = this.currentUser.currentStatus === 'busy';
    const activeTask = this.currentUser.activeTask;

    // Filter stages assigned to me
    const incomingPending = [];
    const inProgressStages = [];
    const completedStages = [];

    orders.forEach(ord => {
      if (ord.status === 'completed' || ord.status === 'cancelled') return;
      (ord.stages || []).forEach(st => {
        if (st.assignedTo === myId) {
          const stageObj = {
            ...st,
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            orderTitle: ord.title,
            priority: ord.priority,
            orderNotes: ord.notes
          };

          if (st.status === 'in_progress') {
            inProgressStages.push(stageObj);
          } else if (st.status === 'pending' || st.status === 'accepted') {
            incomingPending.push(stageObj);
          } else if (st.status === 'completed') {
            completedStages.push(stageObj);
          }
        }
      });
    });

    let html = `
      <div class="worker-workspace-header glass-card">
        <div class="worker-welcome-meta">
          <div class="worker-big-avatar">${this.currentUser.avatar || '👤'}</div>
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <h2 style="margin: 0; font-size: 1.35rem; color: #fff;">${escapeHtml(this.currentUser.name)}</h2>
              <span class="user-role-badge ${this.currentUser.role}">${escapeHtml(this.currentUser.roleTitle || this.currentUser.role)}</span>
            </div>
            <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">
              Modelxona shaxsiy ish joyi va kun tartibi
            </p>
          </div>
        </div>

        <div class="worker-status-control">
          <span style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Hozirgi Holatingiz:</span>
          <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.25rem;">
            <div class="worker-live-status-pill ${isBusy ? 'busy' : 'free'}">
              <span class="pulse-dot ${isBusy ? 'red' : 'green'}"></span>
              <strong>${isBusy ? '🔴 BAND (Ishlayapsiz)' : '🟢 BO‘SH (Yangi vazifaga tayyorsiz)'}</strong>
            </div>
            <button class="btn btn-secondary btn-icon" onclick="AuthManager.openLoginModal()" title="Boshqa profilga o‘tish">
              🔄
            </button>
          </div>
        </div>
      </div>
    `;

    // 2. Active Task Live Card (If working right now)
    if (isBusy && activeTask) {
      const started = activeTask.startedAt ? new Date(activeTask.startedAt) : new Date();
      const elapsedMins = Math.max(1, Math.round((Date.now() - started.getTime()) / 60000));
      const hoursEst = activeTask.estimatedHours || 2;

      html += `
        <div class="glass-card active-task-banner pulse-border">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                <span class="order-num-pill">${escapeHtml(activeTask.orderNumber)}</span>
                <span class="badge" style="background: rgba(244,63,94,0.2); color: #f43f5e; border: 1px solid rgba(244,63,94,0.4);">
                  ⚡ HOZIR ISHLAYAPSIZ (BAND)
                </span>
              </div>
              <h3 style="margin: 0 0 0.35rem 0; font-size: 1.25rem; color: #fff;">
                ${escapeHtml(activeTask.stageName)}
              </h3>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">
                ⏱ Boshlangan vaqt: <strong>${started.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</strong> 
                (O‘tgan vaqt: <strong>${elapsedMins} daqiqa</strong> / Reja: <strong>${hoursEst} soat</strong>)
              </div>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="btn btn-secondary" onclick="AuthManager.pauseActiveTask('${activeTask.orderId}', '${activeTask.stageId}')">
                ⏸ Tanaffus
              </button>
              <button class="btn btn-primary" onclick="AuthManager.completeActiveTask('${activeTask.orderId}', '${activeTask.stageId}')" style="box-shadow: 0 0 15px rgba(99,102,241,0.4);">
                ✅ Bajarildi & Topshirish
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // 3. Incoming Tasks waiting for acceptance
    html += `
      <div style="margin-top: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
          <h3 style="margin: 0; font-size: 1.1rem; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
            <span>📩 Kelib tushgan yangi vazifalar</span>
            <span class="badge" style="background: rgba(99,102,241,0.2); color: var(--accent-indigo);">${incomingPending.length}</span>
          </h3>
        </div>
    `;

    if (incomingPending.length === 0) {
      html += `
        <div class="glass-card" style="text-align: center; padding: 1.5rem; color: var(--text-secondary); font-size: 0.9rem;">
          ☕ Ayni paytda yangi kelgan vazifalar yo‘q. Boshliq buyurtma biriktirishi bilan bu yerda chiqadi.
        </div>
      `;
    } else {
      html += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">`;
      incomingPending.forEach(st => {
        const isAccepted = st.status === 'accepted';
        html += `
          <div class="glass-card incoming-task-card ${isAccepted ? 'accepted-card' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                  <span class="order-num-pill">${escapeHtml(st.orderNumber)}</span>
                  <h4 style="margin: 0; font-size: 1.05rem; color: #fff;">${escapeHtml(st.name)}</h4>
                  ${isAccepted ? '<span class="badge" style="background: rgba(16,185,129,0.15); color: #34d399;">✓ Qabul qilingan</span>' : '<span class="badge" style="background: rgba(245,158,11,0.15); color: #f59e0b;">⏳ Qabul qilish kutilmoqda</span>'}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                  Zakaz: <strong>${escapeHtml(st.orderTitle)}</strong> • Mo‘ljallangan vaqt: <strong>${st.estimatedHours} soat</strong>
                </div>
                ${st.orderNotes ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.35rem; font-style: italic;">Ko‘rsatma: ${escapeHtml(st.orderNotes)}</div>` : ''}
              </div>

              <div style="display: flex; gap: 0.5rem; align-items: center;">
                ${!isAccepted ? `
                  <button class="btn btn-secondary" onclick="AuthManager.acceptTask('${st.orderId}', '${st.id}')">
                    📥 Qabul qilish
                  </button>
                ` : ''}
                <button class="btn btn-primary" onclick="AuthManager.startTask('${st.orderId}', '${st.id}')">
                  ▶️ Hozir Boshlash (Band bo‘lish)
                </button>
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  },

  async acceptTask(orderId, stageId) {
    if (!this.currentUser) return;
    try {
      const res = await fetch('/api/corporate/accept-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          orderId,
          stageId,
          scheduledTime: '09:30'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (window.App) window.App.showToast('📥 Vazifa qabul qilindi va kun tartibingizga qo‘shildi!');
        if (window.CorporateManager) await window.CorporateManager.fetchData();
        this.renderWorkerDashboard();
        // Refresh day view
        if (window.Views && typeof window.Views.renderCurrentView === 'function') {
          window.Views.renderCurrentView();
        }
      }
    } catch(e){
      alert('Vazifani qabul qilishda xatolik yuz berdi');
    }
  },

  async startTask(orderId, stageId) {
    if (!this.currentUser) return;
    try {
      const res = await fetch('/api/corporate/start-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          orderId,
          stageId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.currentUser = { ...this.currentUser, ...data.worker };
        localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(this.currentUser));
        this.renderHeaderProfile();
        if (window.App) window.App.showToast('⚡ Ish boshlandi! Holatingiz: 🔴 BAND');
        if (window.CorporateManager) await window.CorporateManager.fetchData();
        this.renderWorkerDashboard();
      }
    } catch(e){
      alert('Ishni boshlashda xatolik');
    }
  },

  async pauseActiveTask(orderId, stageId) {
    if (!this.currentUser) return;
    try {
      const res = await fetch('/api/corporate/pause-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          orderId,
          stageId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.currentUser = { ...this.currentUser, ...data.worker };
        localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(this.currentUser));
        this.renderHeaderProfile();
        this.renderWorkerDashboard();
      }
    } catch(e){}
  },

  async completeActiveTask(orderId, stageId) {
    if (!this.currentUser) return;
    const notes = prompt('Topshirish bo‘yicha izoh yoki qayd (ixtiyoriy):') || '';
    try {
      const res = await fetch('/api/corporate/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          orderId,
          stageId,
          notes
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.currentUser = { ...this.currentUser, ...data.worker };
        localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(this.currentUser));
        this.renderHeaderProfile();
        if (window.App) window.App.showToast('🎉 Vazifa topshirildi! Holatingiz yana 🟢 BO‘SH.');
        if (window.CorporateManager) await window.CorporateManager.fetchData();
        this.renderWorkerDashboard();
        if (window.Views && typeof window.Views.renderCurrentView === 'function') {
          window.Views.renderCurrentView();
        }
      }
    } catch(e){
      alert('Vazifani topshirishda xatolik yuz berdi');
    }
  }
};

window.AuthManager = AuthManager;
