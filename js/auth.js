/**
 * IntelliDay - Auth & Multi-User Identity System
 * Supports:
 * - ✈️ Telegram Login (1-click link from bot, 6-digit verification code)
 * - 👤 Employee Quick Switch & PIN Code
 * - 📐 Assistant Constructor (Shogird) & Sample Tailor (Chevar) Profile Perspectives
 * - 🔴 Real-Time Status (BUSY / FREE)
 */

const escapeHtml = window.escapeHtml || function(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const AuthManager = {
  currentUser: null,
  usersList: [
    { id: 'tm_boss', name: 'Bosh Konstruktor', role: 'head_constructor', roleTitle: 'Bosh Konstruktor / Bo‘lim rahbari', avatar: '👑', currentStatus: 'free', activeTask: null, telegramUsername: '@bosh_konstruktor' },
    { id: 'tm_dilnoza', name: 'Dilnoza Aliyeva', role: 'assistant_constructor', roleTitle: 'Yordamchi Konstruktor (Shogird)', avatar: '📐', currentStatus: 'busy', activeTask: { orderNumber: 'ZAK-103', stageName: 'Murakkab andaza & Drapovka' }, telegramUsername: '@dilnoza_pattern' },
    { id: 'tm_kamola', name: 'Kamola Rustamova', role: 'assistant_constructor', roleTitle: 'Yordamchi Konstruktor (Andaza & Gradatsiya)', avatar: '📏', currentStatus: 'busy', activeTask: { orderNumber: 'ZAK-102', stageName: 'Andaza loyihalash' }, telegramUsername: '@kamola_andaza' },
    { id: 'tm_malika', name: 'Malika Usmonova', role: 'sample_tailor', roleTitle: 'Modelxona Usta Chevari (Oliy toifa)', avatar: '🪡', currentStatus: 'free', activeTask: null, telegramUsername: '@malika_chevar' },
    { id: 'tm_shahnoza', name: 'Shahnoza Karimova', role: 'sample_tailor', roleTitle: 'Namuna Tikuvchi Chevar', avatar: '🧵', currentStatus: 'free', activeTask: null, telegramUsername: '@shahnoza_tikuv' },
    { id: 'tm_nigora', name: 'Nigora Fayzullayeva', role: 'sample_tailor', roleTitle: 'Namuna Tikuvchi Chevar', avatar: '✂️', currentStatus: 'free', activeTask: null, telegramUsername: '@nigora_namuna' }
  ],
  activeTab: 'quick', // 'quick' | 'telegram'
  codeCountdownTimer: null,
  isMandatoryLogin: false,

  async init() {
    await this.fetchUsers();

    // Check URL parameters for 1-click Telegram login or session reset
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset_session') || urlParams.get('logout') || urlParams.get('reset')) {
      localStorage.removeItem('intelliday_auth_user_v1');
      localStorage.removeItem('intelliday_auth_token_v1');
      sessionStorage.removeItem('intelliday_session_started');
      this.currentUser = null;
      window.history.replaceState({}, document.title, window.location.pathname);
      this.showLoginScreen(false);
      return;
    }

    const authCode = urlParams.get('auth');
    if (authCode) {
      await this.loginWithCode(authCode);
      // Clean up URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check saved user session
    const saved = localStorage.getItem('intelliday_auth_user_v1');
    const sessionActive = sessionStorage.getItem('intelliday_session_started');

    if (saved) {
      try {
        const u = JSON.parse(saved);
        const match = this.usersList.find(x => x.id === u.id);
        this.currentUser = match || u;
      } catch (e) {
        this.currentUser = null;
      }
    }

    this.renderHeaderProfile();
    this.applyUserRoleLayout();

    // "birinchi oddiy butun ekranda login sahifasi tursin"
    // If not logged in OR if no active session in this browser tab: show full-screen login immediately!
    if (!this.currentUser || !sessionActive) {
      this.showLoginScreen(false);
    } else {
      this.hideLoginScreen();
    }

    // Listen for SSE updates on corporate sync to update status
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
        } catch(err){}
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
      else if (this.currentUser.role === 'assistant_constructor') roleText = 'Shogird';
      else if (this.currentUser.role === 'sample_tailor') roleText = 'Chevar';

      badgeEl.textContent = roleText;
      badgeEl.className = `user-role-badge ${this.currentUser.role}`;
    }

    if (statusDotEl) {
      statusDotEl.className = `user-status-dot ${isBusy ? 'status-busy' : isPaused ? 'status-paused' : 'status-free'}`;
      statusDotEl.title = isBusy ? 'Band (Hozir ishlamoqda)' : isPaused ? 'Tanaffusda' : 'Bo‘sh (Yangi ishga tayyor)';
    }

    // Update worker select if corporate module exists
    if (window.CorporateManager) {
      CorporateManager.activeWorkerId = this.currentUser.id;
    }
  },

  applyUserRoleLayout() {
    if (!this.currentUser) return;
    const isBoss = this.currentUser.role === 'head_constructor';
    
    // Elements only visible to Boss
    const bossOnlyElements = document.querySelectorAll('.boss-only-feature');
    bossOnlyElements.forEach(el => {
      el.style.display = isBoss ? '' : 'none';
    });

    // Elements visible to Apprentice/Tailor
    const workerDashboard = document.getElementById('worker-personal-dashboard');
    if (workerDashboard) {
      workerDashboard.style.display = isBoss ? 'none' : 'block';
    }

    // Refresh views
    if (!isBoss) {
      this.renderWorkerDashboard();
    }
  },

  activeRoleFilter: 'all', // 'all' | 'head_constructor' | 'assistant_constructor' | 'sample_tailor'
  isSwitchMode: false,

  showLoginScreen(isSwitchMode = false) {
    const screen = document.getElementById('login-screen');
    const app = document.getElementById('app');

    this.isSwitchMode = isSwitchMode && !!this.currentUser;

    if (screen) {
      screen.style.display = 'flex';
      screen.classList.remove('hidden');
    }
    if (app && !this.isSwitchMode) {
      app.style.display = 'none';
    }

    this.renderLoginScreen();
  },

  hideLoginScreen() {
    const screen = document.getElementById('login-screen');
    const app = document.getElementById('app');

    if (screen) {
      screen.style.display = 'none';
      screen.classList.add('hidden');
    }
    if (app) {
      app.style.display = 'block';
    }

    this.renderHeaderProfile();
    this.applyUserRoleLayout();

    if (window.Schedule && typeof window.Schedule.render === 'function') {
      window.Schedule.render();
    }
    if (window.CorporateManager && typeof window.CorporateManager.fetchData === 'function') {
      window.CorporateManager.fetchData();
    }
  },

  // Compatibility aliases
  openLoginModal(isMandatory = false) {
    this.showLoginScreen(true);
  },

  closeLoginModal() {
    this.hideLoginScreen();
  },

  guestLogin() {
    sessionStorage.setItem('intelliday_session_started', 'true');
    this.hideLoginScreen();
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast('👀 Mehmon rejimida tizimga kirdingiz');
    }
  },

  setAuthTab(tab) {
    this.activeTab = tab;
    this.renderLoginScreen();
  },

  setRoleFilter(role) {
    this.activeRoleFilter = role;
    this.renderLoginScreen();
  },

  renderModalContent() {
    this.renderLoginScreen();
  },

  renderLoginScreen() {
    const container = document.getElementById('login-screen-content') || document.getElementById('auth-modal-body');
    if (!container) return;

    // Filter users list based on role
    let filteredUsers = this.usersList;
    if (this.activeRoleFilter !== 'all') {
      filteredUsers = this.usersList.filter(u => u.role === this.activeRoleFilter);
    }

    const bossCount = this.usersList.filter(u => u.role === 'head_constructor').length;
    const constructorCount = this.usersList.filter(u => u.role === 'assistant_constructor').length;
    const tailorCount = this.usersList.filter(u => u.role === 'sample_tailor').length;

    let html = '';

    // If user is already authenticated and just opened switcher:
    if (this.currentUser) {
      const cleanCurName = (this.currentUser.name || '').replace(/\(Siz\)/i, '').trim();
      html += `
        <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 14px; padding: 0.85rem 1.25rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; gap: 1rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.6rem;">${this.currentUser.avatar || '👤'}</span>
            <div>
              <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Hozirgi faol profil</div>
              <strong style="color: #fff; font-size: 1rem;">${escapeHtml(cleanCurName)}</strong>
              <span class="user-role-badge ${this.currentUser.role}" style="margin-left: 0.4rem; font-size: 0.72rem;">${escapeHtml(this.currentUser.roleTitle || this.currentUser.role)}</span>
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="AuthManager.hideLoginScreen()" style="padding: 0.55rem 1.25rem; font-size: 0.88rem; font-weight: 700;">
            ↩️ Ish stoliga qaytish
          </button>
        </div>
      `;
    }

    html += `
      <!-- Navigation Tabs (Team vs Telegram) -->
      <div class="auth-tabs-nav">
        <button class="auth-tab-btn ${this.activeTab === 'quick' ? 'active' : ''}" onclick="AuthManager.setAuthTab('quick')">
          👥 Jamoa Portali (1-klikda kirish)
        </button>
        <button class="auth-tab-btn ${this.activeTab === 'telegram' ? 'active' : ''}" onclick="AuthManager.setAuthTab('telegram')">
          ✈️ Telegram orqali kirish (Bot Login)
        </button>
      </div>
    `;

    if (this.activeTab === 'quick') {
      html += `
        <!-- Role Filter Chips -->
        <div class="auth-role-filters">
          <button class="auth-filter-chip ${this.activeRoleFilter === 'all' ? 'active' : ''}" onclick="AuthManager.setRoleFilter('all')">
            Barchasi (${this.usersList.length})
          </button>
          <button class="auth-filter-chip ${this.activeRoleFilter === 'head_constructor' ? 'active' : ''}" onclick="AuthManager.setRoleFilter('head_constructor')">
            👑 Boshliq (${bossCount})
          </button>
          <button class="auth-filter-chip ${this.activeRoleFilter === 'assistant_constructor' ? 'active' : ''}" onclick="AuthManager.setRoleFilter('assistant_constructor')">
            📐 Konstruktorlar (${constructorCount})
          </button>
          <button class="auth-filter-chip ${this.activeRoleFilter === 'sample_tailor' ? 'active' : ''}" onclick="AuthManager.setRoleFilter('sample_tailor')">
            🪡 Chevarlar (${tailorCount})
          </button>
        </div>

        <!-- Luxury Employee Cards Grid -->
        <div class="auth-portal-grid">
          ${filteredUsers.map(u => {
            const isCurrent = this.currentUser && this.currentUser.id === u.id;
            const isBusy = u.currentStatus === 'busy';
            const isPaused = u.currentStatus === 'paused';
            const cleanName = (u.name || '').replace(/\(Siz\)/i, '').trim();

            let roleBadgeClass = 'role-constructor';
            let roleBadgeTitle = u.roleTitle || 'Xodim';
            if (u.role === 'head_constructor') {
              roleBadgeClass = 'role-boss';
            } else if (u.role === 'sample_tailor') {
              roleBadgeClass = 'role-tailor';
            }

            let taskPreview = '✨ Yangi vazifaga tayyor';
            if (isBusy && u.activeTask) {
              taskPreview = `⚡ ${escapeHtml(u.activeTask.orderNumber)}: ${escapeHtml(u.activeTask.stageName)}`;
            } else if (isPaused) {
              taskPreview = '☕ Qisqa tanaffusda';
            }

            return `
              <div class="auth-portal-card-item ${isCurrent ? 'is-current-user' : ''}" onclick="AuthManager.quickLogin('${u.id}')">
                <div class="auth-card-main">
                  <div class="auth-card-avatar-wrap">
                    <span class="auth-avatar-char">${u.avatar || '👤'}</span>
                    <span class="auth-beacon-dot ${isBusy ? 'busy' : isPaused ? 'paused' : 'free'}"></span>
                  </div>

                  <div class="auth-card-details">
                    <div class="auth-card-header-line">
                      <h4 class="auth-card-name">${escapeHtml(cleanName)}</h4>
                      ${isCurrent ? '<span class="auth-current-pill">Faol</span>' : ''}
                    </div>
                    <div class="auth-card-role ${roleBadgeClass}">${escapeHtml(roleBadgeTitle)}</div>
                    
                    <div class="auth-card-task-snippet ${isBusy ? 'snippet-busy' : 'snippet-free'}">
                      ${isBusy ? '🔴' : isPaused ? '🟡' : '🟢'} ${taskPreview}
                    </div>
                  </div>
                </div>

                <div class="auth-card-footer-actions">
                  <button type="button" class="btn btn-primary auth-action-enter-btn" onclick="event.stopPropagation(); AuthManager.quickLogin('${u.id}')">
                    ⚡ Kirish
                  </button>
                  <button type="button" class="btn btn-secondary auth-action-pin-btn" onclick="event.stopPropagation(); AuthManager.selectUserForPin('${u.id}')" title="PIN kod bilan kirish">
                    🔑 PIN
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Optional PIN Entry Section -->
        <div id="pin-entry-section" class="auth-pin-drawer" style="display: none;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span id="selected-user-label" style="font-weight: 700; color: #fff; font-size: 0.95rem;"></span>
            </div>
            <span style="font-size: 0.75rem; color: var(--accent-cyan); background: rgba(6,182,212,0.1); padding: 0.2rem 0.6rem; border-radius: 4px;">Standart PIN: 1234</span>
          </div>

          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <input type="password" id="auth-pin-input" class="form-input" placeholder="••••" value="1234" maxlength="6" style="font-size: 1.4rem; letter-spacing: 0.4rem; text-align: center; width: 140px;" onkeydown="if(event.key==='Enter') AuthManager.submitPinLogin()">
            <button class="btn btn-primary" onclick="AuthManager.submitPinLogin()" style="flex: 1; padding: 0.7rem 1.25rem; font-weight: 700;">
              🚀 Profilga Kirish
            </button>
            <button class="btn btn-secondary" onclick="document.getElementById('pin-entry-section').style.display='none'">
              Yopish
            </button>
          </div>
          <div id="pin-error-msg" style="color: #f43f5e; font-size: 0.82rem; margin-top: 0.5rem; display: none;"></div>
        </div>
      `;
    } else {
      // Telegram Tab
      html += `
        <div class="auth-telegram-panel">
          <div class="tg-info-banner">
            <div class="tg-banner-icon">✈️</div>
            <div>
              <h4 style="margin: 0 0 0.35rem 0; color: #fff; font-size: 1.05rem;">
                Telegram orqali 1-klikda kirish
              </h4>
              <p style="margin: 0; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.5;">
                O‘z shaxsiy profilingizga Telegram bot yordamida tezkor kirishingiz mumkin. Botga <code>/login</code> deb yozing yoki quyidagi shakldan foydalaning:
              </p>
            </div>
          </div>

          <div class="auth-tg-form-box">
            <div class="form-group" style="margin-bottom: 1.25rem;">
              <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">Telegram Username (@username):</label>
              <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="tg-username-input" class="form-input" placeholder="@dilnoza_pattern" value="${this.currentUser && this.currentUser.telegramUsername ? this.currentUser.telegramUsername : '@bosh_konstruktor'}" style="font-size: 0.95rem;">
                <button class="btn btn-secondary" onclick="AuthManager.requestTgCode()" style="white-space: nowrap; font-size: 0.88rem; padding: 0.65rem 1rem;">
                  📩 Kod so‘rash
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 1.25rem;">
              <label class="form-label" style="font-size: 0.85rem; font-weight: 600;">6 xonali tasdiqlash kodi:</label>
              <div style="display: flex; gap: 0.75rem;">
                <input type="text" id="tg-code-input" class="form-input" placeholder="123456" maxlength="6" style="font-size: 1.45rem; letter-spacing: 0.4rem; text-align: center; width: 170px; font-weight: 700; font-family: monospace;" onkeydown="if(event.key==='Enter') AuthManager.submitTgCodeLogin()">
                <button class="btn btn-primary" onclick="AuthManager.submitTgCodeLogin()" style="flex: 1; font-weight: 700; font-size: 0.95rem;">
                  🔐 Tasdiqlash va Kirish
                </button>
              </div>
              <div id="tg-login-status" style="font-size: 0.84rem; margin-top: 0.65rem; color: var(--text-secondary);"></div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-light); padding-top: 1rem; margin-top: 1rem;">
              <span style="font-size: 0.8rem; color: var(--text-muted);">Sinov uchun darhol kod kerakmi?</span>
              <button type="button" class="chip-btn" onclick="AuthManager.generateInstantDemoCode()" style="font-size: 0.8rem; padding: 0.35rem 0.8rem;">
                🧪 1-klikda sinov kodi olish
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Portal Bottom Status Bar
    html += `
      <div class="auth-portal-bottom-bar">
        <div class="auth-portal-active-user-meta">
          ${this.currentUser ? `
            <span style="font-size: 0.82rem; color: var(--text-muted);">Hozirgi profil:</span>
            <strong style="color: #fff; font-size: 0.86rem; margin-left: 0.35rem;">
              ${this.currentUser.avatar || '👤'} ${escapeHtml(this.currentUser.name)}
            </strong>
            <button type="button" class="btn btn-secondary btn-sm" onclick="AuthManager.logout()" style="margin-left: 0.6rem; font-size: 0.78rem; padding: 0.25rem 0.65rem;">
              🚪 Chiqish
            </button>
          ` : `
            <button type="button" class="btn btn-secondary btn-sm" onclick="AuthManager.guestLogin()" style="font-size: 0.82rem; padding: 0.4rem 0.85rem;">
              👀 Mehmon sifatida ko‘rish
            </button>
          `}
        </div>

        <div>
          ${this.currentUser ? `
            <button type="button" class="btn btn-secondary" onclick="AuthManager.hideLoginScreen()" style="padding: 0.45rem 1.15rem; font-size: 0.84rem;">
              ↩️ Dasturga qaytish
            </button>
          ` : `
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              🔒 IntelliDay Atelier & Studio v2.4
            </span>
          `}
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  async generateInstantDemoCode() {
    const defaultUser = this.usersList[1] || this.usersList[0];
    try {
      const res = await fetch('/api/auth/telegram-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: defaultUser.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const codeInput = document.getElementById('tg-code-input');
        const statusEl = document.getElementById('tg-login-status');
        if (codeInput) codeInput.value = data.code;
        if (statusEl) {
          statusEl.innerHTML = `
            <span style="color: var(--accent-emerald);">
              ✅ Sinov kodi tayyorlandi: <b>${data.code}</b> (${data.userName} uchun). "Tasdiqlash va Kirish" tugmasini bosing!
            </span>
          `;
        }
      }
    } catch(e){}
  },

  async quickLogin(userId) {
    const u = this.usersList.find(x => x.id === userId);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin: '1234', quickLoginId: userId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.setUserSession(data.user, data.token);
        this.closeLoginModal();
        if (window.App) window.App.showToast(`🎉 Xush kelibsiz, ${data.user.name}!`);
        if (window.NotificationManager && window.NotificationManager.sound) {
          window.NotificationManager.sound.playTone('chime');
        }
      } else if (u) {
        this.setUserSession(u, 'tok_' + Date.now());
        this.closeLoginModal();
        if (window.App) window.App.showToast(`🎉 Xush kelibsiz, ${u.name}!`);
      }
    } catch(e) {
      if (u) {
        this.setUserSession(u, 'tok_' + Date.now());
        this.closeLoginModal();
        if (window.App) window.App.showToast(`🎉 Xush kelibsiz, ${u.name}!`);
      }
    }
  },

  selectedUserIdForPin: null,
  selectUserForPin(userId) {
    this.selectedUserIdForPin = userId;
    const cards = document.querySelectorAll('.auth-user-card');
    cards.forEach(c => c.classList.remove('selected'));

    const u = this.usersList.find(x => x.id === userId);
    if (!u) return;

    const pinSection = document.getElementById('pin-entry-section');
    const label = document.getElementById('selected-user-label');
    const pinInput = document.getElementById('auth-pin-input');

    if (pinSection && label) {
      pinSection.style.display = 'block';
      label.innerHTML = `${u.avatar} ${escapeHtml(u.name)} (${escapeHtml(u.roleTitle || u.role)})`;
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
      }
    }
  },

  async submitPinLogin() {
    const pinInput = document.getElementById('auth-pin-input');
    const errEl = document.getElementById('pin-error-msg');
    const pin = pinInput ? pinInput.value.trim() : '';

    if (!this.selectedUserIdForPin) return;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.selectedUserIdForPin, pin })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.setUserSession(data.user, data.token);
        this.closeLoginModal();
        if (window.App) window.App.showToast(`🎉 Xush kelibsiz, ${data.user.name}!`);
      } else {
        if (errEl) {
          errEl.textContent = data.error || 'PIN-kod noto‘g‘ri';
          errEl.style.display = 'block';
        }
      }
    } catch (e) {
      if (errEl) {
        errEl.textContent = 'Server bilan aloqa xatoligi';
        errEl.style.display = 'block';
      }
    }
  },

  async requestTgCode() {
    const input = document.getElementById('tg-username-input');
    const statusEl = document.getElementById('tg-login-status');
    const username = input ? input.value.trim() : '';

    if (!username) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#f43f5e;">Username yoki xodimni kiriting</span>`;
      return;
    }

    if (statusEl) statusEl.innerHTML = `<span>⏳ Kod yuborilmoqda...</span>`;

    try {
      const res = await fetch('/api/auth/telegram-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUsername: username })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (statusEl) {
          statusEl.innerHTML = `
            <span style="color:var(--accent-emerald);">
              ✅ Kod tayyorlandi! <b>${data.code}</b> (Kodni quyidagi maydonga kiriting)
            </span>
          `;
        }
        const codeInput = document.getElementById('tg-code-input');
        if (codeInput) {
          codeInput.value = data.code;
          codeInput.focus();
        }
      } else {
        if (statusEl) statusEl.innerHTML = `<span style="color:#f43f5e;">${data.error || 'Xatolik'}</span>`;
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#f43f5e;">Server bilan ulanishda xatolik</span>`;
    }
  },

  async submitTgCodeLogin() {
    const codeInput = document.getElementById('tg-code-input');
    const statusEl = document.getElementById('tg-login-status');
    const code = codeInput ? codeInput.value.trim() : '';

    if (!code) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#f43f5e;">Kodni kiriting</span>`;
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.setUserSession(data.user, data.token);
        this.closeLoginModal();
        if (window.App) window.App.showToast(`🎉 Xush kelibsiz, ${data.user.name}!`);
      } else {
        if (statusEl) statusEl.innerHTML = `<span style="color:#f43f5e;">${data.error || 'Kod eskirgan yoki noto‘g‘ri'}</span>`;
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#f43f5e;">Server bilan ulanishda xatolik</span>`;
    }
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
        this.setUserSession(data.user, data.token);
        if (window.App) window.App.showToast(`🎉 Telegram orqali muvaffaqiyatli kirdingiz: ${data.user.name}!`);
      }
    } catch(e){}
  },

  setUserSession(user, token) {
    this.currentUser = user;
    localStorage.setItem('intelliday_auth_user_v1', JSON.stringify(user));
    if (token) localStorage.setItem('intelliday_auth_token_v1', token);

    this.renderHeaderProfile();
    this.applyUserRoleLayout();

    // Reload tasks/plans in Storage
    if (window.Storage && typeof window.Storage.loadUserPlan === 'function') {
      window.Storage.loadUserPlan(user.id);
    }
    if (window.CorporateManager) {
      CorporateManager.activeWorkerId = user.id;
      CorporateManager.fetchData();
    }
  },

  logout() {
    localStorage.removeItem('intelliday_auth_user_v1');
    localStorage.removeItem('intelliday_auth_token_v1');
    sessionStorage.removeItem('intelliday_session_started');
    this.currentUser = null;
    this.renderHeaderProfile();
    this.showLoginScreen(false);
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast('🚪 Tizimdan muvaffaqiyatli chiqildi');
    }
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
