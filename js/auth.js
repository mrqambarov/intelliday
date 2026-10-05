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
  sessionToken: null,
  sessionExpiresAt: null,
  heartbeatTimer: null,
  activeTab: 'login', // 'login' | 'telegram'
  tgPollTimer: null,
  tgPollCode: null,
  tgCountdownTimer: null,
  pendingAlertMsg: '',
  isSwitchMode: false,

  async init() {
    this.bindNavigationGuards();

    const urlParams = new URLSearchParams(window.location.search);

    // ?reset=1 / ?logout=1 -> sessiyani tozalash
    if (urlParams.get('reset_session') || urlParams.get('logout') || urlParams.get('reset')) {
      await this.clearSession();
      window.history.replaceState({}, document.title, window.location.pathname);
      this.showLoginScreen(false, '👋 Tizimdan chiqildi');
      return;
    }

    // ?auth=123456 -> Telegram botdagi havola orqali kirish
    const authCode = urlParams.get('auth');
    if (authCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const ok = await this.loginWithCode(authCode);
      if (!ok) this.showLoginScreen(false, 'Telegram kirish kodi noto‘g‘ri yoki eskirgan');
      return;
    }

    // Saqlangan sessiya tokeni
    const token = localStorage.getItem('intelliday_auth_token_v1');
    if (!token) {
      this.clearSession(false);
      this.showLoginScreen(false);
      return;
    }

    // Serverda sessiyani tekshirish
    try {
      const res = await fetch('/api/auth/session', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          this.currentUser = data.user;
          this.sessionToken = token;
          this.sessionExpiresAt = data.expiresAt;
          localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(data.user));
          sessionStorage.setItem('intelliday_session_started', 'true');
          this.hideLoginScreen();
          this.startHeartbeat();
          this.setupSseListener();
          return;
        }
      }
    } catch (e) {
      console.warn('[AUTH] Sessiyani serverda tekshirishda xatolik:', e);
    }

    // Sessiya yaroqsiz yoki tugagan bo'lsa
    await this.clearSession(false);
    this.showLoginScreen(false, 'Sessiyangiz muddati tugadi. Xavfsizlik uchun qaytadan kiring.');
  },

  setupSseListener() {
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
          if (this.currentUser && window.Storage && typeof window.Storage.loadUserPlan === 'function') {
            window.Storage.loadUserPlan(this.currentUser.id);
          }
        } catch (err) {}
      });
    }
  },

  bindNavigationGuards() {
    window.addEventListener('popstate', () => {
      if (!this.currentUser) {
        this.showLoginScreen(false);
      }
    });
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && !this.currentUser) {
        this.showLoginScreen(false);
      }
    });
  },

  getSafeEmoji(userOrAvatar) {
    if (!userOrAvatar) return '👤';
    const av = typeof userOrAvatar === 'object' ? (userOrAvatar.avatar || '') : (userOrAvatar || '');
    if (!av || av.startsWith('data:') || av.startsWith('http://') || av.startsWith('https://') || av.startsWith('/') || av.length > 8) {
      const role = (typeof userOrAvatar === 'object' ? userOrAvatar.role : '') || '';
      const id = (typeof userOrAvatar === 'object' ? userOrAvatar.id : '') || '';
      if (role === 'head_constructor') return '👑';
      if (role === 'assistant_constructor') return id.includes('qobil') ? '📏' : '📐';
      if (role === 'cutter') return '✂️';
      if (role === 'sample_tailor') return '🪡';
      return '👤';
    }
    return av;
  },

  renderAvatarHtml(userOrAvatar, extraClass = '', size = '') {
    if (!userOrAvatar) return `<span class="${extraClass}">👤</span>`;
    const av = typeof userOrAvatar === 'object' ? (userOrAvatar.avatar || '') : (userOrAvatar || '');
    if (av && (av.startsWith('data:') || av.startsWith('http://') || av.startsWith('https://') || av.startsWith('/'))) {
      const style = size ? `style="width:${size};height:${size};border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;"` : '';
      return `<img src="${av}" alt="Avatar" class="avatar-img-round ${extraClass}" ${style}>`;
    }
    const emoji = this.getSafeEmoji(userOrAvatar);
    return `<span class="${extraClass}">${emoji}</span>`;
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

    if (avatarEl) {
      if (this.currentUser.avatar && (this.currentUser.avatar.startsWith('data:') || this.currentUser.avatar.startsWith('http') || this.currentUser.avatar.startsWith('/'))) {
        avatarEl.innerHTML = `<img src="${this.currentUser.avatar}" alt="Avatar" class="avatar-img-round">`;
      } else {
        avatarEl.textContent = this.currentUser.avatar || '👤';
      }
    }
    const cleanName = (this.currentUser.name || '').replace(/\(Siz\)/i, '').trim();
    if (nameEl) nameEl.textContent = cleanName;

    const settingsAvatarEl = document.getElementById('settings-acc-avatar-preview');
    const settingsNameEl = document.getElementById('settings-acc-name-preview');
    if (settingsAvatarEl) {
      if (this.currentUser.avatar && (this.currentUser.avatar.startsWith('data:') || this.currentUser.avatar.startsWith('http') || this.currentUser.avatar.startsWith('/'))) {
        settingsAvatarEl.innerHTML = `<img src="${this.currentUser.avatar}" alt="Avatar" class="avatar-img-round" style="width: 36px; height: 36px; display: inline-block;">`;
      } else {
        settingsAvatarEl.textContent = this.currentUser.avatar || '👤';
      }
    }
    if (settingsNameEl) settingsNameEl.textContent = cleanName;

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
  // --------------------------------------------------------------------------
  // Butun ekranli login sahifasi (Xavfsiz, hech qanday aylanma qaytishsiz)
  // --------------------------------------------------------------------------
  showLoginScreen(isSwitchMode = false, customError = '') {
    this.pendingAlertMsg = customError || '';
    const screen = document.getElementById('login-screen');
    const app = document.getElementById('app');
    this.isSwitchMode = isSwitchMode && !!this.currentUser;

    if (screen) {
      screen.style.display = 'flex';
      screen.classList.remove('hidden');
    }
    if (app) app.style.display = 'none';

    this.renderLoginScreen(customError);
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

  // Profil almashtirish — seansni tozalab yangi login talab qiladi
  switchAccount() {
    this.clearSession(true);
    this.renderHeaderProfile();
    this.activeTab = 'login';
    window.history.replaceState(null, document.title, window.location.pathname);
    this.showLoginScreen(false, 'Boshqa profil bilan kirish uchun login va parolingizni kiriting');
  },

  openLoginModal() { this.switchAccount(); },
  closeLoginModal() { if (this.currentUser) this.hideLoginScreen(); },
  renderModalContent() { this.renderLoginScreen(); },

  setAuthTab(tab) {
    this.activeTab = tab;
    this.stopTelegramPolling();
    this.renderLoginScreen();
  },

  renderLoginScreen(initialError = '') {
    const container = document.getElementById('login-screen-content');
    if (!container) return;

    const errMsg = initialError || this.pendingAlertMsg || '';
    this.pendingAlertMsg = '';

    let html = `
      <div class="auth-tabs-nav">
        <button type="button" id="auth-tab-login" class="auth-tab-btn ${this.activeTab === 'login' ? 'active' : ''}" onclick="AuthManager.setAuthTab('login')">
          🔑 Parol bilan kirish
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
            <label for="login-username">Login yoki Telegram username</label>
            <div class="login-input-wrap">
              <span class="login-input-icon">👤</span>
              <input type="text" id="login-username" class="form-input" placeholder="masalan: admin yoki @mrqambarov" autocomplete="username" required>
            </div>
          </div>

          <div class="login-field">
            <label for="login-password">Parol</label>
            <div class="login-input-wrap">
              <span class="login-input-icon">🔒</span>
              <input type="password" id="login-password" class="form-input" placeholder="••••••••" autocomplete="current-password" required>
              <button type="button" class="login-eye-btn" id="login-toggle-password" onclick="AuthManager.togglePassword()" title="Parolni ko‘rsatish">👁️</button>
            </div>
          </div>

          <div class="login-remember-row">
            <label class="login-remember-label">
              <input type="checkbox" id="login-remember-me" checked>
              <span>Meni eslab qolish (7 kun)</span>
            </label>
            <a href="javascript:void(0)" class="login-forgot-link" onclick="AuthManager.setAuthTab('telegram')">
              Parolni unutdingizmi?
            </a>
          </div>

          <div id="login-error" class="login-error" style="${errMsg ? 'display:flex;' : 'display:none;'}">
            <span>⚠️</span>
            <span id="login-error-text">${escapeHtml(errMsg)}</span>
          </div>

          <button type="submit" class="btn btn-primary login-submit-btn" id="login-submit-btn">
            <span>Tizimga kirish</span>
            <span style="font-size: 1.1rem; line-height: 1;">➔</span>
          </button>

          <div class="login-security-badge">
            <span>🔒</span>
            <span>256-bit shifrlangan xavfsiz seans • IntelliDay Security v3.5</span>
          </div>
        </form>
      `;
    } else {
      html += `
        <div class="login-tg-panel">
          <div class="login-tg-icon">✈️</div>
          <p class="login-tg-text">
            Telegram orqali 1-klikda xavfsiz kiring yoki botdan 6 xonali bir martalik kod oling.
          </p>

          <button type="button" class="btn login-tg-btn" id="login-tg-start-btn" onclick="AuthManager.startTelegramLogin()">
            <span>✈️ Telegram botda 1-bosishda tasdiqlash</span>
          </button>

          <div id="login-tg-status" class="login-tg-status"></div>

          <div class="login-divider"><span>yoki 6 xonali bir martalik kod bilan</span></div>

          <form class="login-code-row" onsubmit="event.preventDefault(); AuthManager.submitTgCodeLogin();">
            <input type="text" id="tg-code-input" class="form-input login-code-input" placeholder="123456" maxlength="6" inputmode="numeric" autocomplete="one-time-code" oninput="AuthManager.handleCodeInput(this)">
            <button type="submit" class="btn btn-secondary" id="login-tg-code-btn">Kirish ➔</button>
          </form>

          <div class="login-tg-hint">💡 Botga <code>/login</code> deb yozsangiz, darhol 6 xonali kirish kodi keladi.</div>

          <div id="login-error" class="login-error" style="${errMsg ? 'display:flex; margin-top:0.75rem;' : 'display:none;'}">
            <span>⚠️</span>
            <span id="login-error-text">${escapeHtml(errMsg)}</span>
          </div>

          <div class="login-security-badge">
            <span>🛡️</span>
            <span>Telegram orqali ikki bosqichli xavfsiz avtorizatsiya</span>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    setTimeout(() => {
      const first = document.getElementById(this.activeTab === 'login' ? 'login-username' : 'tg-code-input');
      if (first) first.focus();
    }, 50);
  },

  handleCodeInput(input) {
    const val = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = val;
    if (val.length === 6) {
      this.submitTgCodeLogin();
    }
  },

  togglePassword() {
    const inp = document.getElementById('login-password');
    const btn = document.getElementById('login-toggle-password');
    if (inp) {
      const isPass = inp.type === 'password';
      inp.type = isPass ? 'text' : 'password';
      if (btn) btn.textContent = isPass ? '🙈' : '👁️';
    }
  },

  showLoginError(msg) {
    const el = document.getElementById('login-error');
    const textEl = document.getElementById('login-error-text');
    if (!el) return;
    if (msg) {
      if (textEl) textEl.textContent = msg;
      else el.textContent = msg;
      el.style.display = 'flex';
      // Trigger shake animation
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    } else {
      el.style.display = 'none';
    }
  },

  async submitLogin() {
    const login = (document.getElementById('login-username')?.value || '').trim();
    const password = document.getElementById('login-password')?.value || '';
    const rememberMe = !!document.getElementById('login-remember-me')?.checked;
    const btn = document.getElementById('login-submit-btn');

    if (!login || !password) {
      this.showLoginError('Login va parolni kiriting');
      return;
    }

    this.showLoginError('');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="login-spinner"></span> Tekshirilmoqda...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password, rememberMe })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.completeLogin(data.user, data.token, data.expiresAt);
      } else {
        this.showLoginError(data.error || 'Login yoki parol noto‘g‘ri');
        const p = document.getElementById('login-password');
        if (p) { p.value = ''; p.focus(); }
      }
    } catch (e) {
      this.showLoginError('Server bilan aloqa yo‘q. Tarmoqni tekshiring.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Tizimga kirish</span> <span style="font-size:1.1rem; line-height:1;">➔</span>';
      }
    }
  },

  // 1-klik: t.me/bot?start=login_XXX ochiladi, sahifa natijani kutadi
  async startTelegramLogin() {
    const statusEl = document.getElementById('login-tg-status');
    this.showLoginError('');

    const tgWindow = window.open('about:blank', '_blank');

    try {
      const res = await fetch('/api/auth/telegram-start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Xatolik');

      if (tgWindow) tgWindow.location.href = data.url;
      else window.location.href = data.url;

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-bottom:0.35rem;">
            <span class="login-spinner"></span>
            <strong>Botda START tugmasini bosing</strong>
          </div>
          <div>Qolgan vaqt: <b id="login-tg-countdown" style="color:var(--accent-cyan); font-family:monospace;">10:00</b></div>
          <div style="margin-top:0.45rem; font-size:0.78rem;">
            <a href="${data.url}" target="_blank" rel="noopener">Bot ochilmadimi? Shu yerni bosing</a>
          </div>
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
    const durationMs = 10 * 60 * 1000;

    const updateCountdown = () => {
      const remainingMs = Math.max(0, durationMs - (Date.now() - startedAt));
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      const timeEl = document.getElementById('login-tg-countdown');
      if (timeEl) timeEl.textContent = timeStr;
    };

    updateCountdown();
    this.tgCountdownTimer = setInterval(updateCountdown, 1000);

    this.tgPollTimer = setInterval(async () => {
      if (Date.now() - startedAt > durationMs) {
        this.stopTelegramPolling();
        const s = document.getElementById('login-tg-status');
        if (s) s.innerHTML = '<span style="color:#f43f5e;">⌛ Vaqt tugadi. Qaytadan urinib ko‘ring.</span>';
        return;
      }
      try {
        const res = await fetch('/api/auth/telegram-check?code=' + encodeURIComponent(code));
        const data = await res.json();
        if (data.success && data.user) {
          this.stopTelegramPolling();
          this.completeLogin(data.user, data.token, data.expiresAt);
        } else if (data.status === 'expired') {
          this.stopTelegramPolling();
          const s = document.getElementById('login-tg-status');
          if (s) s.innerHTML = '<span style="color:#f43f5e;">⌛ Havola eskirgan. Qaytadan bosing.</span>';
        }
      } catch (e) {}
    }, 2000);
  },

  stopTelegramPolling() {
    if (this.tgPollTimer) clearInterval(this.tgPollTimer);
    if (this.tgCountdownTimer) clearInterval(this.tgCountdownTimer);
    this.tgPollTimer = null;
    this.tgCountdownTimer = null;
    this.tgPollCode = null;
  },

  async submitTgCodeLogin() {
    const code = (document.getElementById('tg-code-input')?.value || '').trim();
    if (!code || code.length < 4) {
      this.showLoginError('6 xonali kodni kiriting');
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
        this.completeLogin(data.user, data.token, data.expiresAt);
        return true;
      }
    } catch (e) {}
    return false;
  },

  completeLogin(user, token, expiresAt) {
    this.sessionToken = token;
    this.sessionExpiresAt = expiresAt;
    this.setUserSession(user, token);
    this.hideLoginScreen();
    this.startHeartbeat();

    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(`🎉 Xush kelibsiz, ${user.name}!`);
    }
    if (window.NotificationManager && window.NotificationManager.sound && window.NotificationManager.sound.playTone) {
      try { window.NotificationManager.sound.playTone('chime'); } catch (e) {}
    }
  },

  startHeartbeat() {
    this.stopHeartbeat();
    // Har 5 daqiqada faol sessiyani serverda yangilash (keep-alive)
    this.heartbeatTimer = setInterval(async () => {
      if (!this.currentUser || !this.sessionToken) {
        this.stopHeartbeat();
        return;
      }
      try {
        const res = await fetch('/api/auth/session', {
          headers: { 'Authorization': 'Bearer ' + this.sessionToken }
        });
        if (!res.ok) {
          // Server 401 qaytardi (sessiya tugagan yoki bekor qilingan)
          this.handleSessionExpired();
          return;
        }
        const data = await res.json();
        if (data.expiresAt) this.sessionExpiresAt = data.expiresAt;
      } catch (e) {
        // Tarmoq xatoligi bo'lsa darhol uzmaymiz
      }
    }, 5 * 60 * 1000);
  },

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  },

  handleSessionExpired() {
    this.stopHeartbeat();
    this.clearSession(false);
    this.renderHeaderProfile();
    window.history.replaceState(null, document.title, window.location.pathname);
    this.showLoginScreen(false, '⚠️ Xavfsizlik: Sessiyangiz muddati tugadi. Iltimos, qaytadan tizimga kiring.');
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast('⚠️ Sessiya muddati tugadi. Qaytadan kiring.', 4000);
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

  async clearSession(notifyServer = true) {
    const token = this.sessionToken || localStorage.getItem('intelliday_auth_token_v1');
    if (notifyServer && token) {
      try {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        }).catch(() => {});
      } catch (e) {}
    }

    localStorage.removeItem('intelliday_auth_user_v1');
    localStorage.removeItem('intelliday_auth_token_v1');
    localStorage.removeItem('intelliday_auth_session_v1');
    sessionStorage.clear();

    this.currentUser = null;
    this.sessionToken = null;
    this.sessionExpiresAt = null;
    this.stopHeartbeat();
    this.stopTelegramPolling();
  },

  async logout() {
    await this.clearSession(true);
    this.renderHeaderProfile();
    this.activeTab = 'login';
    window.history.replaceState(null, document.title, window.location.pathname);
    this.showLoginScreen(false, '👋 Tizimdan muvaffaqiyatli chiqildi');
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
          <div class="worker-big-avatar">${this.renderAvatarHtml(this.currentUser)}</div>
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
            <button class="btn btn-secondary btn-icon" onclick="AuthManager.switchAccount()" title="Boshqa profilga o‘tish">
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
        const isUrgent = st.priority === 'urgent';
        html += `
          <div class="glass-card incoming-task-card ${isAccepted ? 'accepted-card' : ''}" style="${isUrgent ? 'border-color: rgba(239,68,68,0.45); box-shadow: 0 0 16px rgba(239,68,68,0.22);' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; flex-wrap: wrap;">
                  <span class="order-num-pill">${escapeHtml(st.orderNumber)}</span>
                  <h4 style="margin: 0; font-size: 1.05rem; color: #fff;">${escapeHtml(st.name)}</h4>
                  ${isUrgent ? '<span class="badge badge-urgent">🚨 JUDA ZARUR</span>' : ''}
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
  },

  // ==========================================================================
  // Akkaunt & Profil Sozlamalari Boshqaruvi
  // ==========================================================================
  async openAccountModal() {
    if (!this.currentUser) {
      this.showLoginScreen(false);
      return;
    }

    const modal = document.getElementById('account-settings-modal');
    if (!modal) return;

    // Fresh data from server
    try {
      const res = await fetch(`/api/user/profile?userId=${encodeURIComponent(this.currentUser.id)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.user) {
          this.currentUser = { ...this.currentUser, ...json.user };
          localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(this.currentUser));
          if (json.botUsername) this.cachedBotUsername = json.botUsername;
        }
      }
    } catch (e) {}

    const u = this.currentUser;

    // Avatar preview
    const previewEl = document.getElementById('acc-avatar-preview');
    const avatarValEl = document.getElementById('acc-avatar-value');
    if (previewEl) {
      if (u.avatar && (u.avatar.startsWith('data:') || u.avatar.startsWith('http') || u.avatar.startsWith('/'))) {
        previewEl.innerHTML = `<img src="${u.avatar}" alt="Avatar" class="avatar-img-round">`;
      } else {
        previewEl.textContent = u.avatar || '👤';
      }
    }
    if (avatarValEl) avatarValEl.value = u.avatar || '👤';

    // Header info
    const cleanName = (u.name || '').replace(/\(Siz\)/i, '').trim();
    const previewNameEl = document.getElementById('acc-preview-name');
    if (previewNameEl) previewNameEl.textContent = cleanName;

    const roleBadgeEl = document.getElementById('acc-role-badge');
    if (roleBadgeEl) {
      let roleText = 'Xodim';
      if (u.role === 'head_constructor') roleText = 'Boshliq';
      else if (u.role === 'assistant_constructor') roleText = 'Konstruktor';
      else if (u.role === 'sample_tailor') roleText = 'Chevar';
      else if (u.role === 'cutter') roleText = 'Bichuvchi';
      roleBadgeEl.textContent = roleText;
      roleBadgeEl.className = `user-role-badge ${u.role}`;
    }

    const loginBadgeEl = document.getElementById('acc-login-badge');
    if (loginBadgeEl) loginBadgeEl.textContent = `@${u.login || u.id}`;

    // General inputs
    const nameInput = document.getElementById('acc-name-input');
    if (nameInput) nameInput.value = cleanName;

    const phoneInput = document.getElementById('acc-phone-input');
    if (phoneInput) phoneInput.value = u.phone || '';

    const roleTitleDisplay = document.getElementById('acc-role-title-display');
    if (roleTitleDisplay) roleTitleDisplay.value = u.roleTitle || 'Xodim';

    const loginDisplay = document.getElementById('acc-login-display');
    if (loginDisplay) loginDisplay.value = u.login || u.id;

    // Telegram inputs & status
    const tgUserInput = document.getElementById('acc-telegram-username');
    if (tgUserInput) tgUserInput.value = u.telegramUsername || '';

    const tgStatusBadge = document.getElementById('acc-tg-status-badge');
    if (tgStatusBadge) {
      if (u.telegramChatId) {
        tgStatusBadge.textContent = '🟢 Ulangan';
        tgStatusBadge.style.background = 'rgba(16,185,129,0.2)';
        tgStatusBadge.style.color = '#34d399';
      } else {
        tgStatusBadge.textContent = '🟡 Ulanmagan';
        tgStatusBadge.style.background = 'rgba(245,158,11,0.2)';
        tgStatusBadge.style.color = '#fbbf24';
      }
    }

    const botLink = document.getElementById('acc-tg-bot-link');
    if (botLink) {
      const botName = this.cachedBotUsername || 'IntelliDayBot';
      botLink.href = `https://t.me/${botName}`;
    }

    // Passwords clear
    const curPass = document.getElementById('acc-current-password');
    if (curPass) curPass.value = '';
    const newPass = document.getElementById('acc-new-password');
    if (newPass) newPass.value = '';
    const confPass = document.getElementById('acc-confirm-password');
    if (confPass) confPass.value = '';

    // Preferences
    if (window.Storage) {
      const s = window.Storage.getSettings();
      const soundTgl = document.getElementById('acc-sound-toggle');
      if (soundTgl) soundTgl.checked = !!s.soundEnabled;
      const notifTgl = document.getElementById('acc-notif-toggle');
      if (notifTgl) notifTgl.checked = !!s.notificationsEnabled;
    }

    // Default tab
    this.switchAccountTab('general');

    // Hide emoji drawer
    const drawer = document.getElementById('acc-emoji-picker-drawer');
    if (drawer) drawer.style.display = 'none';

    modal.classList.add('open');
  },

  closeAccountModal() {
    const modal = document.getElementById('account-settings-modal');
    if (modal) modal.classList.remove('open');
    const drawer = document.getElementById('acc-emoji-picker-drawer');
    if (drawer) drawer.style.display = 'none';
  },

  switchAccountTab(tabName) {
    document.querySelectorAll('.account-nav-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.account-tab-pane').forEach(p => {
      p.style.display = 'none';
    });
    const target = document.getElementById(`acc-pane-${tabName}`);
    if (target) target.style.display = 'block';
  },

  toggleEmojiPicker() {
    const drawer = document.getElementById('acc-emoji-picker-drawer');
    if (drawer) {
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    }
  },

  selectAvatarEmoji(emoji) {
    const previewEl = document.getElementById('acc-avatar-preview');
    const avatarValEl = document.getElementById('acc-avatar-value');
    if (previewEl) previewEl.innerHTML = emoji;
    if (avatarValEl) avatarValEl.value = emoji;
    const drawer = document.getElementById('acc-emoji-picker-drawer');
    if (drawer) drawer.style.display = 'none';
  },

  resetAvatarToDefault() {
    if (!this.currentUser) return;
    let defEmoji = '👤';
    if (this.currentUser.role === 'head_constructor') defEmoji = '👑';
    else if (this.currentUser.role === 'assistant_constructor') defEmoji = (this.currentUser.id || '').includes('qobil') ? '📏' : '📐';
    else if (this.currentUser.role === 'sample_tailor') defEmoji = '🪡';
    else if (this.currentUser.role === 'cutter') defEmoji = '✂️';

    this.selectAvatarEmoji(defEmoji);
  },

  handleAvatarFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Iltimos, rasm faylini tanlang (JPG, PNG, WEBP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Square 200x200 canvas with center-crop
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const base64Url = canvas.toDataURL('image/jpeg', 0.85);

        const previewEl = document.getElementById('acc-avatar-preview');
        const avatarValEl = document.getElementById('acc-avatar-value');
        if (previewEl) {
          previewEl.innerHTML = `<img src="${base64Url}" alt="Avatar" class="avatar-img-round">`;
        }
        if (avatarValEl) {
          avatarValEl.value = base64Url;
        }

        const drawer = document.getElementById('acc-emoji-picker-drawer');
        if (drawer) drawer.style.display = 'none';

        if (window.App && typeof window.App.showToast === 'function') {
          window.App.showToast('📷 Rasm yuklandi! Saqlash uchun "Saqlash" tugmasini bosing.');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  togglePassField(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  },

  syncPref(key, val) {
    if (!window.Storage) return;
    if (key === 'sound') {
      window.Storage.updateSettings({ soundEnabled: !!val });
      const setSound = document.getElementById('set-sound');
      if (setSound) setSound.checked = !!val;
    } else if (key === 'notif') {
      window.Storage.updateSettings({ notificationsEnabled: !!val });
      const setNotif = document.getElementById('set-notif');
      if (setNotif) setNotif.checked = !!val;
    }
  },

  async saveAccountSettings(event) {
    if (event) event.preventDefault();
    if (!this.currentUser) return;

    const name = (document.getElementById('acc-name-input')?.value || '').trim();
    const phone = (document.getElementById('acc-phone-input')?.value || '').trim();
    const telegramUsername = (document.getElementById('acc-telegram-username')?.value || '').trim();
    const avatar = (document.getElementById('acc-avatar-value')?.value || '').trim();

    const currentPassword = (document.getElementById('acc-current-password')?.value || '').trim();
    const newPassword = (document.getElementById('acc-new-password')?.value || '').trim();
    const confirmPassword = (document.getElementById('acc-confirm-password')?.value || '').trim();

    if (!name) {
      alert('Ism va familiya kiritilishi shart!');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 4) {
        alert('Yangi parol kamida 4 ta belgidan iborat bo‘lishi kerak!');
        return;
      }
      if (newPassword !== confirmPassword) {
        alert('Yangi parollar bir-biriga mos kelmadi. Iltimos, qayta tekshiring.');
        return;
      }
      if (!currentPassword) {
        alert('Parolni yangilash uchun joriy (hozirgi) parolingizni kiriting!');
        return;
      }
    }

    const saveBtn = document.getElementById('acc-save-btn');
    const origBtnText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Saqlanmoqda...';
    }

    try {
      const payload = {
        userId: this.currentUser.id,
        name,
        phone,
        telegramUsername,
        avatar
      };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Saqlashda xatolik yuz berdi');
      }

      // Update current user
      this.currentUser = { ...this.currentUser, ...data.user };
      localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(this.currentUser));

      this.renderHeaderProfile();
      this.applyUserRoleLayout();

      if (window.App && typeof window.App.showToast === 'function') {
        window.App.showToast('✅ Akkaunt sozlamalari muvaffaqiyatli saqlandi!');
      }
      this.closeAccountModal();

      if (newPassword && window.App && typeof window.App.showToast === 'function') {
        window.App.showToast('🔐 Parolingiz muvaffaqiyatli yangilandi!');
      }
    } catch (e) {
      alert('Xatolik: ' + e.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = origBtnText;
      }
    }
  }
};

window.AuthManager = AuthManager;
