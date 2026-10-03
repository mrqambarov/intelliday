/**
 * IntelliDay - Pomodoro Focus Mode & Ambient Sounds Module
 * Manages focus sessions, breaks, and soothing ambient sound generators.
 */

const Pomodoro = {
  mode: 'work', // 'work', 'shortBreak', 'longBreak'
  timeRemaining: 25 * 60,
  timerInterval: null,
  isRunning: false,
  ambientSound: 'none', // 'none', 'rain', 'whitenoise'

  durations: {
    work: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60
  },

  init() {
    this.updateDisplay();
  },

  open() {
    const modal = document.getElementById('pomodoro-modal');
    if (modal) modal.classList.add('open');
  },

  close() {
    const modal = document.getElementById('pomodoro-modal');
    if (modal) modal.classList.remove('open');
  },

  setMode(newMode) {
    this.pause();
    this.mode = newMode;
    this.timeRemaining = this.durations[newMode];

    document.querySelectorAll('.pomo-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === newMode);
    });

    this.updateDisplay();
  },

  toggleTimer() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  },

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    if (window.NotificationManager) {
      window.NotificationManager.sound.playZenBowl();
    }

    if (this.ambientSound !== 'none' && window.NotificationManager) {
      window.NotificationManager.sound.startAmbient(this.ambientSound);
    }

    const startBtn = document.getElementById('pomo-toggle-btn');
    if (startBtn) {
      startBtn.textContent = 'Pauza qilish';
      startBtn.classList.replace('btn-primary', 'btn-secondary');
    }

    this.timerInterval = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
        this.updateDisplay();
      } else {
        this.onComplete();
      }
    }, 1000);
  },

  pause() {
    this.isRunning = false;
    clearInterval(this.timerInterval);

    if (window.NotificationManager) {
      window.NotificationManager.sound.stopAmbient();
    }

    const startBtn = document.getElementById('pomo-toggle-btn');
    if (startBtn) {
      startBtn.textContent = 'Fokusni boshlash';
      startBtn.classList.replace('btn-secondary', 'btn-primary');
    }
  },

  reset() {
    this.pause();
    this.timeRemaining = this.durations[this.mode];
    this.updateDisplay();
  },

  onComplete() {
    this.pause();
    if (window.NotificationManager) {
      window.NotificationManager.sound.playSuccess();
      window.NotificationManager.showNotification('🎯 Fokus sessiyasi tugadi!', {
        body: this.mode === 'work' ? 'Ajoyib natija! Endi 5 daqiqa tanaffus qiling va ko‘zingizga dam bering.' : 'Tanaffus tugadi. Yangi fokusga tayyormisiz?'
      });
    }

    if (this.mode === 'work') {
      this.setMode('shortBreak');
    } else {
      this.setMode('work');
    }
  },

  setAmbient(type) {
    this.ambientSound = type;
    document.querySelectorAll('.sound-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sound === type);
    });

    if (this.isRunning && window.NotificationManager) {
      if (type === 'none') {
        window.NotificationManager.sound.stopAmbient();
      } else {
        window.NotificationManager.sound.startAmbient(type);
      }
    }
  },

  updateDisplay() {
    const mins = Math.floor(this.timeRemaining / 60);
    const secs = this.timeRemaining % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const displayEl = document.getElementById('pomo-display');
    if (displayEl) {
      displayEl.textContent = timeStr;
    }

    // Also update document title when running
    if (this.isRunning) {
      document.title = `(${timeStr}) Fokus rejimi - IntelliDay`;
    } else {
      document.title = 'IntelliDay - Aqlli Kun Tartibi';
    }
  }
};

window.Pomodoro = Pomodoro;
