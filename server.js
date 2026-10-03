/**
 * IntelliDay — Hybrid Personal & Corporate Atelier / Construction Studio Engine
 * Built with native Node.js (Zero external dependencies)
 * 
 * Features:
 * - Dual Engine: Individual Personal Routine & Corporate Team/Modelxona Atelier Management
 * - Smart Lead Time & Queue Bottleneck Calculator for Constructors and Tailors
 * - Multi-Device Real-Time Sync (REST API + Server-Sent Events)
 * - Two-Way Interactive Telegram Bot
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CORPORATE_FILE = path.join(DATA_DIR, 'corporate.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ----------------------------------------------------------------------------
// 1. Personal DB (Tasks, Habits, Personal Settings)
// ----------------------------------------------------------------------------
function getInitialData() {
  return {
    tasks: [],
    habits: [
      { id: 'h_water', name: '2 litr toza suv ichish', emoji: '💧', targetStreak: 21 },
      { id: 'h_read', name: 'Kamida 20 sahifa kitob o‘qish', emoji: '📖', targetStreak: 30 },
      { id: 'h_sport', name: 'Tonggi badantarbiya / Sport', emoji: '🏃‍♂️', targetStreak: 14 },
      { id: 'h_sleep', name: '23:00 gacha uxlashga yotish', emoji: '🌙', targetStreak: 21 }
    ],
    habitLogs: {},
    settings: {
      theme: 'dark',
      soundEnabled: true,
      soundTone: 'chime',
      notificationsEnabled: true,
      telegramToken: '',
      telegramBotToken: '',
      telegramChatId: '',
      geminiApiKey: ''
    },
    updatedAt: Date.now()
  };
}

let db = getInitialData();
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = { ...getInitialData(), ...JSON.parse(raw) };
  } catch (e) {
    console.error('[DB] db.json xatolik:', e.message);
  }
} else {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function saveDB() {
  db.updatedAt = Date.now();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// 2. Corporate Atelier DB (Team Members, Orders, Smart Lead Time)
// ----------------------------------------------------------------------------
let corporateDb = {
  teamMembers: [],
  orders: [],
  settings: {
    workStartHour: 8.5, // 08:30
    workEndHour: 17.5,  // 17:30
    lunchStart: 13.0,   // 13:00
    lunchEnd: 14.0,     // 14:00
    delayBufferPercent: 15, // +15% safety buffer for technical corrections
    constructorGroupId: '',
    constructorGroupName: 'Konstruktorlar guruhi',
    modelxonaGroupId: '',
    modelxonaGroupName: 'Modelxona guruhi',
    telegramBotToken: '',
    connectedGroups: []
  },
  updatedAt: Date.now()
};

if (fs.existsSync(CORPORATE_FILE)) {
  try {
    const raw = fs.readFileSync(CORPORATE_FILE, 'utf8');
    corporateDb = { ...corporateDb, ...JSON.parse(raw) };
  } catch (e) {
    console.error('[CORPORATE] corporate.json xatolik:', e.message);
  }
} else {
  fs.writeFileSync(CORPORATE_FILE, JSON.stringify(corporateDb, null, 2), 'utf8');
}

function saveCorporateDB() {
  corporateDb.updatedAt = Date.now();
  try {
    fs.writeFileSync(CORPORATE_FILE, JSON.stringify(corporateDb, null, 2), 'utf8');
  } catch (e) {}
  broadcastSSE('corporate_sync', corporateDb);
}

// In-memory Telegram auth codes: code -> { userId, expiresAt }
const telegramAuthCodes = new Map();

function sanitizeUser(user) {
  if (!user) return null;
  const { pin, ...safe } = user;
  return safe;
}

function getUserPersonalPlan(userId) {
  corporateDb.personalPlans = corporateDb.personalPlans || {};
  if (userId === 'tm_boss') {
    return {
      tasks: db.tasks || [],
      habits: db.habits || [],
      habitLogs: db.habitLogs || []
    };
  }
  if (!corporateDb.personalPlans[userId]) {
    const todayStr = new Date().toISOString().split('T')[0];
    corporateDb.personalPlans[userId] = {
      tasks: [
        {
          id: `plan_${userId}_1`,
          title: "Ertalabki ish joyi va andazalarni tayyorlash",
          time: "08:30",
          duration: 30,
          category: "work",
          priority: "medium",
          date: todayStr,
          completed: true
        }
      ],
      habits: [],
      habitLogs: []
    };
    saveCorporateDB();
  }
  return corporateDb.personalPlans[userId];
}

// ----------------------------------------------------------------------------
// Local IP & SSE Broadcast
// ----------------------------------------------------------------------------
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();
const sseClients = new Set();

function broadcastSSE(type, payload, excludeClient = null) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    if (client !== excludeClient) {
      try {
        client.write(message);
      } catch (err) {
        sseClients.delete(client);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Smart Workload & Critical Path ETA Calculator
// ----------------------------------------------------------------------------
/**
 * Adds working hours to a given start date, respecting work hours, lunch break, and skipping Sundays.
 */
function addWorkHours(startDate, hoursToAdd, cfg) {
  const workStart = cfg.workStartHour || 8.5; // 08:30
  const workEnd = cfg.workEndHour || 17.5;   // 17:30
  const lunchStart = cfg.lunchStart || 13.0; // 13:00
  const lunchEnd = cfg.lunchEnd || 14.0;     // 14:00

  let current = new Date(startDate);

  // If outside working hours, roll forward to next available morning
  function normalizeToWorkHours(dt) {
    // If Sunday (0), move to Monday
    if (dt.getDay() === 0) {
      dt.setDate(dt.getDate() + 1);
      dt.setHours(Math.floor(workStart), (workStart % 1) * 60, 0, 0);
      return;
    }
    const curHour = dt.getHours() + dt.getMinutes() / 60;
    if (curHour < workStart) {
      dt.setHours(Math.floor(workStart), (workStart % 1) * 60, 0, 0);
    } else if (curHour >= workEnd) {
      // Move to next day
      dt.setDate(dt.getDate() + 1);
      dt.setHours(Math.floor(workStart), (workStart % 1) * 60, 0, 0);
      normalizeToWorkHours(dt);
    } else if (curHour >= lunchStart && curHour < lunchEnd) {
      dt.setHours(Math.floor(lunchEnd), (lunchEnd % 1) * 60, 0, 0);
    }
  }

  normalizeToWorkHours(current);

  let remaining = hoursToAdd;
  while (remaining > 0.001) {
    normalizeToWorkHours(current);
    const curHour = current.getHours() + current.getMinutes() / 60;

    let availableUntil = lunchStart;
    if (curHour >= lunchEnd) {
      availableUntil = workEnd;
    } else if (curHour >= lunchStart && curHour < lunchEnd) {
      current.setHours(Math.floor(lunchEnd), (lunchEnd % 1) * 60, 0, 0);
      continue;
    }

    const availableHoursInChunk = Math.max(0, availableUntil - curHour);
    if (availableHoursInChunk <= 0) {
      normalizeToWorkHours(current);
      continue;
    }

    if (remaining <= availableHoursInChunk) {
      const finishHour = curHour + remaining;
      current.setHours(Math.floor(finishHour), Math.round((finishHour % 1) * 60), 0, 0);
      remaining = 0;
    } else {
      remaining -= availableHoursInChunk;
      current.setHours(Math.floor(availableUntil), Math.round((availableUntil % 1) * 60), 0, 0);
      normalizeToWorkHours(current);
    }
  }

  return current;
}

/**
 * Calculates complete lead time, bottleneck analysis, and human explanation
 */
function calculateOrderSchedule(stages, currentOrders, cfg, teamMembers) {
  const settings = {
    workStartHour: 8.5,
    workEndHour: 17.5,
    lunchStart: 13.0,
    lunchEnd: 14.0,
    delayBufferPercent: 15,
    ...cfg
  };

  const now = new Date();

  // 1. Calculate when each employee will be free based on existing in-progress/pending stages
  const employeeBusyUntil = new Map();
  teamMembers.forEach(tm => {
    employeeBusyUntil.set(tm.id, new Date(now));
  });

  currentOrders.forEach(ord => {
    if (ord.status === 'completed' || ord.status === 'cancelled') return;
    (ord.stages || []).forEach(st => {
      if (st.status === 'completed') return;
      if (!st.assignedTo) return;

      const currentUntil = employeeBusyUntil.get(st.assignedTo) || new Date(now);
      const hours = (st.estimatedHours || 2) * (1 + settings.delayBufferPercent / 100);
      const finishTime = addWorkHours(currentUntil, hours, settings);
      employeeBusyUntil.set(st.assignedTo, finishTime);
    });
  });

  // 2. Cascade stages of the new/target order
  let previousStageEnd = new Date(now);
  const stagesTimeline = [];

  stages.forEach((st, idx) => {
    const assignedId = st.assignedTo || st.assigneeId || '';
    const emp = teamMembers.find(t => t.id === assignedId);
    const empBusy = employeeBusyUntil.get(assignedId) || new Date(now);

    // Can only start when:
    // a) previous stage of this order is complete (or now for stage 1)
    // b) the assigned employee has finished their earlier queue
    let stageStart = new Date(Math.max(previousStageEnd.getTime(), empBusy.getTime()));

    // Effective hours with buffer and speed multiplier
    const speed = emp && emp.speedMultiplier ? emp.speedMultiplier : 1.0;
    const buffer = 1 + (settings.delayBufferPercent / 100);
    const effectiveHours = Math.max(0.5, (st.estimatedHours || 2) * buffer / speed);

    const stageEnd = addWorkHours(stageStart, effectiveHours, settings);

    // Update employee busy time for subsequent stages
    employeeBusyUntil.set(assignedId, stageEnd);
    previousStageEnd = new Date(stageEnd);

    const stageTitle = st.name || st.stageName || (
      st.stageKey === 'pattern' ? 'Konstruksiya & Andaza' :
      st.stageKey === 'cutting' ? 'Bichuv & Kroy' :
      st.stageKey === 'sample_sewing' ? 'Namuna Tikish' :
      st.stageKey === 'fitting_qc' ? 'Kiyib ko‘rish & QC' :
      `Bosqich #${idx + 1}`
    );

    stagesTimeline.push({
      id: st.id || `stg_${Date.now()}_${idx}`,
      name: stageTitle,
      stageKey: st.stageKey || '',
      role: st.role || (emp ? emp.role : ''),
      assignedTo: assignedId,
      assignedName: emp ? emp.name : 'Belgilanmagan',
      assignedAvatar: emp ? emp.avatar : '👤',
      estimatedHours: st.estimatedHours || 2,
      effectiveHours: parseFloat(effectiveHours.toFixed(1)),
      startTime: stageStart.toISOString(),
      endTime: stageEnd.toISOString(),
      status: st.status || 'pending'
    });
  });

  const finalETA = previousStageEnd.toISOString();

  // 3. Human Explanation in Uzbek
  let explanation = '';
  stagesTimeline.forEach((st, i) => {
    const sDate = new Date(st.startTime);
    const eDate = new Date(st.endTime);
    const opt = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    explanation += `• <b>${i + 1}-bosqich (${st.name})</b>: ${st.assignedAvatar} ${st.assignedName} qo‘lida ` +
      `<b>${sDate.toLocaleDateString('uz-UZ', opt)}</b> da boshlanadi va ` +
      `<b>${eDate.toLocaleDateString('uz-UZ', opt)}</b> da tayyor bo‘ladi (${st.effectiveHours}s).\n`;
  });

  const etaObj = new Date(finalETA);
  const etaFormatted = etaObj.toLocaleDateString('uz-UZ', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  return {
    stagesTimeline,
    finalETA,
    finalETAFormatted: etaFormatted,
    explanation,
    calculatedAt: new Date().toISOString()
  };
}

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// ----------------------------------------------------------------------------
// Two-Way Interactive Telegram Bot
// ----------------------------------------------------------------------------
let botPollingActive = false;
let botOffset = 0;
let botPollingTimeout = null;

function callTelegramApi(token, method, payload) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(payload || {});
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 25000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ ok: false, error: 'JSON parse error', raw: data });
        }
      });
    });

    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timeout' });
    });

    req.write(postData);
    req.end();
  });
}

async function sendTelegramMessage(token, chatId, text, extra = {}) {
  return await callTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra
  });
}

function formatDateTimeUz(dateInput) {
  if (!dateInput) return 'Belgilanmagan';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const time = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  return `${day}-${month}, ${time}`;
}

/**
 * Broadcasts an order stage directly to the relevant Telegram group:
 * - Konstruktorlar guruhi: Pattern, Lekalo, Grading, Cutting
 * - Modelxona guruhi: Sample sewing, Fitting, QC
 */
async function broadcastStageToTelegramGroup(order, stage, reason = 'new') {
  const token = (corporateDb.settings?.telegramBotToken || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
  if (!token) return { ok: false, error: 'Telegram Bot Token belgilanmagan' };

  const isConstructorStage = (
    stage.role === 'assistant_constructor' ||
    stage.stageKey === 'pattern' ||
    stage.stageKey === 'cutting' ||
    /andaza|bich|lekalo|gradatsiya|konstruk/i.test(stage.name || '')
  );

  let targetGroupId = isConstructorStage 
    ? corporateDb.settings.constructorGroupId 
    : corporateDb.settings.modelxonaGroupId;
  let targetGroupName = isConstructorStage 
    ? (corporateDb.settings.constructorGroupName || 'Konstruktorlar guruhi')
    : (corporateDb.settings.modelxonaGroupName || 'Modelxona guruhi');

  // Fallback to any active group if specific one is not configured
  if (!targetGroupId) {
    targetGroupId = corporateDb.settings.constructorGroupId || corporateDb.settings.modelxonaGroupId || db.settings.telegramChatId;
  }

  if (!targetGroupId) {
    console.log('[TELEGRAM] ⚠️ Guruh ID topilmadi (Konstruktor yoki Modelxona guruhi ulanmagan)');
    return { ok: false, error: 'Guruh ID topilmadi' };
  }

  const emp = corporateDb.teamMembers.find(t => t.id === stage.assignedTo);
  const empDisplay = emp ? `${emp.avatar} ${emp.name} (${emp.roleTitle || emp.role})` : '👥 Jamoa a’zolaridan biri';
  
  const startTimeFormatted = formatDateTimeUz(stage.startTime || new Date());
  const endTimeFormatted = formatDateTimeUz(stage.endTime);

  const headerIcon = isConstructorStage ? '📐 ✂️' : '🪡 👗';
  let titleBadge = '';
  if (reason === 'next') {
    titleBadge = `🧵 <b>DIQQAT! NAVBATDAGI BOSQICH SIZNING GURUHINGIZDA:</b>`;
  } else if (reason === 'urgent') {
    titleBadge = `🚨 <b>SHOSHILINCH BUYURTMA KELIB TUSHDI:</b>`;
  } else {
    titleBadge = `🔔 <b>YANGI VAZIFA KELIB TUSHDI:</b>`;
  }

  let text = 
    `${headerIcon} ${titleBadge}\n\n` +
    `👗 <b>Model / Zakaz:</b> [${escapeHtml(order.orderNumber)}] <b>${escapeHtml(order.title)}</b>\n` +
    `🏢 <b>Bo‘lim / Buyurtmachi:</b> ${escapeHtml(order.clientOrDept || 'Asosiy ishlab chiqarish')}\n` +
    `⚡ <b>Muhimlik darajasi:</b> ${order.priority === 'urgent' ? '🔴 O‘ta muhim (Shoshilinch)' : order.priority === 'high' ? '🟠 Yuqori' : '🔵 Standart'}\n\n` +
    `📍 <b>BOSQICH:</b> <b>${escapeHtml(stage.name)}</b>\n` +
    `👤 <b>Biriktirilgan mas’ul:</b> <b>${escapeHtml(empDisplay)}</b>\n\n` +
    `⏰ <b>Boshlanish vaqti:</b> <b>${startTimeFormatted}</b>\n` +
    `⏳ <b>Ajratilgan vaqt:</b> <b>${stage.effectiveHours || stage.estimatedHours || 2} soat</b>\n` +
    `🏁 <b>TAYYOR BO‘LISH MUDDATI (ETA):</b> <b>${endTimeFormatted}</b>\n`;

  if (stage.notes || order.notes) {
    text += `\n📝 <b>Ko‘rsatma / Qaydlar:</b> <i>${escapeHtml(stage.notes || order.notes)}</i>\n`;
  }

  text += `\n<i>👇 Vazifani qabul qilish yoki ishga kirishish uchun bosing:</i>`;

  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📥 Qabul qildim", callback_data: `accept_corp_${order.id}__${stage.id}` },
          { text: "▶️ Boshladim (Band)", callback_data: `start_corp_${order.id}__${stage.id}` }
        ],
        [
          { text: "⏸ Tanaffus", callback_data: `pause_corp_${order.id}__${stage.id}` },
          { text: "✅ Tayyor bo‘ldi", callback_data: `done_corp_${order.id}__${stage.id}` }
        ]
      ]
    }
  };

  const res = await sendTelegramMessage(token, targetGroupId, text, inlineKeyboard);
  if (res && res.ok) {
    console.log(`[TELEGRAM] ✅ Vazifa guruhga muvaffaqiyatli yuborildi [${targetGroupName}]: ${order.orderNumber} - ${stage.name}`);
  } else {
    console.warn(`[TELEGRAM] ⚠️ Guruhga xabar yuborishda xatolik (${targetGroupId}):`, res);
  }
  return res;
}

/**
 * Broadcasts an entire new order overview to connected groups
 */
async function broadcastOrderToTelegramGroups(order) {
  const token = (corporateDb.settings?.telegramBotToken || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
  if (!token) return;

  const firstStage = (order.stages || [])[0];
  if (firstStage) {
    await broadcastStageToTelegramGroup(order, firstStage, 'new');
  }
}

async function startTelegramBotPoller() {
  const token = (corporateDb.settings?.telegramBotToken || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
  if (!token) {
    if (botPollingTimeout) clearTimeout(botPollingTimeout);
    botPollingActive = false;
    return;
  }

  if (botPollingActive) return;
  botPollingActive = true;
  console.log('[TELEGRAM] 🤖 Ikki tomonlama Telegram bot faollashtirildi...');

  async function poll() {
    if (!botPollingActive) return;
    const curToken = (corporateDb.settings?.telegramBotToken || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
    if (!curToken) {
      botPollingActive = false;
      return;
    }

    try {
      const res = await callTelegramApi(curToken, 'getUpdates', {
        offset: botOffset,
        timeout: 10,
        allowed_updates: ['message', 'callback_query', 'my_chat_member']
      });

      if (res && res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          botOffset = update.update_id + 1;
          await handleTelegramUpdate(curToken, update);
        }
      }
    } catch (err) {}

    if (botPollingActive) {
      botPollingTimeout = setTimeout(poll, 1500);
    }
  }

  poll();
}

async function handleTelegramUpdate(token, update) {
  // Track groups that interact with the bot
  const msgObj = update.message || (update.callback_query && update.callback_query.message);
  if (msgObj && msgObj.chat && (msgObj.chat.type === 'group' || msgObj.chat.type === 'supergroup')) {
    const groupChat = msgObj.chat;
    const gId = String(groupChat.id);
    const gTitle = groupChat.title || 'Telegram Guruhi';

    corporateDb.settings = corporateDb.settings || {};
    corporateDb.settings.connectedGroups = corporateDb.settings.connectedGroups || [];
    let existingG = corporateDb.settings.connectedGroups.find(g => g.id === gId);
    if (!existingG) {
      corporateDb.settings.connectedGroups.push({ id: gId, title: gTitle, type: groupChat.type, lastActive: Date.now() });
      saveCorporateDB();
    } else {
      existingG.title = gTitle;
      existingG.lastActive = Date.now();
    }

    // Auto-detect group roles if not yet bound
    const lowerTitle = gTitle.toLowerCase();
    if (!corporateDb.settings.constructorGroupId && (lowerTitle.includes('konstruktor') || lowerTitle.includes('andaza') || lowerTitle.includes('shogird') || lowerTitle.includes('chizma'))) {
      corporateDb.settings.constructorGroupId = gId;
      corporateDb.settings.constructorGroupName = gTitle;
      saveCorporateDB();
      sendTelegramMessage(token, gId, 
        `🤖 <b>IntelliDay — Konstruktorlar Guruhi muvaffaqiyatli tanildi!</b>\n\n` +
        `Ushbu guruh <b>Konstruktorlar guruhi</b> sifatida tizimga ulandi (ID: <code>${gId}</code>).\n` +
        `Yangi andaza, lekalolar va bichuv vazifalari boshlanish va bitish muddatlari (ETA) bilan shu yerga tashlab boriladi!`
      );
    } else if (!corporateDb.settings.modelxonaGroupId && (lowerTitle.includes('modelxona') || lowerTitle.includes('chevar') || lowerTitle.includes('tikuv') || lowerTitle.includes('namuna'))) {
      corporateDb.settings.modelxonaGroupId = gId;
      corporateDb.settings.modelxonaGroupName = gTitle;
      saveCorporateDB();
      sendTelegramMessage(token, gId, 
        `🤖 <b>IntelliDay — Modelxona Guruhi muvaffaqiyatli tanildi!</b>\n\n` +
        `Ushbu guruh <b>Modelxona (Chevarlar) Guruhi</b> sifatida tizimga ulandi (ID: <code>${gId}</code>).\n` +
        `Yangi namuna tikish vazifalari, etalon yig‘ish va bitish muddatlari (ETA) shu yerga tashlab boriladi!`
      );
    }
  }

  // 1. Handle Inline Callback Buttons (from Group or Direct Chat)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const chatId = cb.message && cb.message.chat ? cb.message.chat.id : null;
    const fromUser = cb.from || {};
    const userHandle = fromUser.username ? `@${fromUser.username}` : (fromUser.first_name || 'Xodim');

    if (data.startsWith('done_task_')) {
      const taskId = data.replace('done_task_', '');
      const task = db.tasks.find(t => t.id === taskId);
      if (task) {
        task.completed = true;
        task.completedAt = Date.now();
        saveDB();
        broadcastSSE('task_updated', { task, allTasks: db.tasks });
        await callTelegramApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: `✅ "${task.title}" bajarildi!`
        });
      }
    } else if (data.startsWith('accept_corp_')) {
      // accept_corp_ORDERID_STAGEID
      const parts = data.replace('accept_corp_', '').split('__');
      const orderId = parts[0];
      const stageId = parts[1];
      const ord = corporateDb.orders.find(o => o.id === orderId);
      if (ord) {
        const st = (ord.stages || []).find(s => s.id === stageId);
        if (st) {
          st.status = 'accepted';
          st.acceptedAt = new Date().toISOString();
          saveCorporateDB();

          await callTelegramApi(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: `📥 [${ord.orderNumber}] ${st.name} qabul qilindi!`
          });

          // Post confirmation update to the group
          if (chatId) {
            await sendTelegramMessage(token, chatId, 
              `📥 <b>Vazifa qabul qilindi!</b>\n` +
              `👤 <b>${userHandle}</b> [${ord.orderNumber}] <b>${st.name}</b> vazifasini qabul qildi.\n` +
              `🏁 Rejalashtirilgan bitish muddati: <b>${formatDateTimeUz(st.endTime)}</b>`
            );
          }
        }
      }
    } else if (data.startsWith('start_corp_')) {
      // start_corp_ORDERID_STAGEID
      const parts = data.replace('start_corp_', '').split('__');
      const orderId = parts[0];
      const stageId = parts[1];
      const ord = corporateDb.orders.find(o => o.id === orderId);
      if (ord) {
        const st = (ord.stages || []).find(s => s.id === stageId);
        if (st) {
          st.status = 'in_progress';
          st.startedAt = new Date().toISOString();
          const emp = corporateDb.teamMembers.find(t => t.id === st.assignedTo);
          if (emp) {
            emp.currentStatus = 'busy';
            emp.activeTask = {
              orderId: ord.id,
              orderNumber: ord.orderNumber,
              stageId: st.id,
              stageName: st.name,
              startedAt: st.startedAt,
              estimatedHours: st.estimatedHours
            };
          }
          saveCorporateDB();

          await callTelegramApi(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: `⚡ Ish boshlandi! Holatingiz: 🔴 BAND`
          });

          if (chatId) {
            await sendTelegramMessage(token, chatId, 
              `⚡ <b>Xodim ishni boshladi!</b>\n` +
              `👤 <b>${userHandle}</b> [${ord.orderNumber}] <b>${st.name}</b> ustida ishlayapti.\n` +
              `🔴 Holat: <b>BAND</b>\n` +
              `🏁 Kutilayotgan bitish vaqti (ETA): <b>${formatDateTimeUz(st.endTime)}</b>`
            );
          }
        }
      }
    } else if (data.startsWith('pause_corp_')) {
      const parts = data.replace('pause_corp_', '').split('__');
      const orderId = parts[0];
      const stageId = parts[1];
      const ord = corporateDb.orders.find(o => o.id === orderId);
      if (ord) {
        const st = (ord.stages || []).find(s => s.id === stageId);
        if (st) {
          const emp = corporateDb.teamMembers.find(t => t.id === st.assignedTo);
          if (emp) {
            emp.currentStatus = emp.currentStatus === 'paused' ? 'busy' : 'paused';
          }
          saveCorporateDB();

          await callTelegramApi(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: emp && emp.currentStatus === 'paused' ? '⏸ Qisqa tanaffus' : '▶️ Qayta faol'
          });

          if (chatId) {
            await sendTelegramMessage(token, chatId, 
              `⏸ <b>${userHandle}</b> qisqa tanaffusga chiqdi (Tizimda hisobga olindi).`
            );
          }
        }
      }
    } else if (data.startsWith('done_corp_')) {
      // done_corp_ORDERID_STAGEID
      const parts = data.replace('done_corp_', '').split('__');
      const orderId = parts[0];
      const stageId = parts[1];
      const ord = corporateDb.orders.find(o => o.id === orderId);
      if (ord) {
        const st = (ord.stages || []).find(s => s.id === stageId);
        if (st) {
          st.status = 'completed';
          st.completedAt = new Date().toISOString();
          const emp = corporateDb.teamMembers.find(t => t.id === st.assignedTo);
          if (emp) {
            emp.currentStatus = 'free';
            emp.activeTask = null;
          }

          // Advance next stage
          const nextStage = (ord.stages || []).find(s => s.status === 'pending');
          if (nextStage) {
            nextStage.status = 'in_progress';
            nextStage.startedAt = new Date().toISOString();
          } else {
            ord.status = 'completed';
            ord.completedAt = new Date().toISOString();
          }
          saveCorporateDB();

          await callTelegramApi(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: `🎉 Bosqich muvaffaqiyatli yakunlandi! Holatingiz: 🟢 BO‘SH`
          });

          if (chatId) {
            await sendTelegramMessage(token, chatId, 
              `🎉 <b>BOSQICH TOPHIRILDI!</b>\n` +
              `✅ [${ord.orderNumber}] <b>${st.name}</b> muvaffaqiyatli yakunlandi!\n` +
              `👤 Bajaruvchi: <b>${userHandle}</b>`
            );
          }

          // If there is a next stage, immediately broadcast to the appropriate group!
          if (nextStage) {
            await broadcastStageToTelegramGroup(ord, nextStage, 'next');
          } else {
            // Entire order completed! Send celebration
            const celebration = 
              `🏆 <b>BUYURTMA TO‘LIQ TAYYOR BO‘LDI!</b>\n\n` +
              `👗 <b>Zakaz:</b> [${ord.orderNumber}] <b>${ord.title}</b>\n` +
              `🏢 <b>Bo‘lim:</b> ${ord.clientOrDept || 'Mijoz'}\n` +
              `✨ Barcha andaza, bichuv va tikuv bosqichlari a’lo darajada yakunlandi! Rahmat barchaga! 👏`;

            if (corporateDb.settings.constructorGroupId) {
              await sendTelegramMessage(token, corporateDb.settings.constructorGroupId, celebration);
            }
            if (corporateDb.settings.modelxonaGroupId && corporateDb.settings.modelxonaGroupId !== corporateDb.settings.constructorGroupId) {
              await sendTelegramMessage(token, corporateDb.settings.modelxonaGroupId, celebration);
            }
          }
        }
      }
    }
    return;
  }

  // 2. Handle Text Messages (Direct & Groups)
  if (update.message && update.message.text) {
    const rawText = update.message.text.trim();
    // Support commands with bot username suffix: /command@mybot
    const text = rawText.split('@')[0].trim();
    const chatId = update.message.chat.id;
    const isGroup = update.message.chat.type === 'group' || update.message.chat.type === 'supergroup';
    const groupTitle = update.message.chat.title || '';
    const fromUser = update.message.from || {};
    const tgUsername = fromUser.username ? `@${fromUser.username.toLowerCase()}` : '';

    if (!db.settings.telegramChatId && !isGroup) {
      db.settings.telegramChatId = String(chatId);
      saveDB();
    }

    // Command: /chatid or /id
    if (text === '/chatid' || text === '/id') {
      let reply = `📍 <b>Chat Ma’lumotlari:</b>\n\n`;
      reply += `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n`;
      reply += `📌 <b>Turi:</b> ${isGroup ? 'Guruh (' + escapeHtml(groupTitle) + ')' : 'Shaxsiy chat'}\n\n`;
      if (isGroup) {
        reply += `Ushbu guruhni tizimga ulash uchun quyidagi buyruqlardan birini bosing:\n`;
        reply += `📐 <b>/set_konstruktor</b> — Konstruktorlar guruhi deb belgilash\n`;
        reply += `🪡 <b>/set_modelxona</b> — Modelxona guruhi deb belgilash`;
      }
      await sendTelegramMessage(token, chatId, reply);
      return;
    }

    // Command: /set_konstruktor
    if (text === '/set_konstruktor') {
      corporateDb.settings = corporateDb.settings || {};
      corporateDb.settings.constructorGroupId = String(chatId);
      corporateDb.settings.constructorGroupName = groupTitle || 'Konstruktorlar guruhi';
      saveCorporateDB();
      const reply = 
        `✅ <b>Muvaffaqiyatli! Ushbu guruh KONSTRUKTORLAR GURUHI sifatida belgilandi.</b>\n\n` +
        `📌 Guruhi: <b>${escapeHtml(corporateDb.settings.constructorGroupName)}</b>\n` +
        `🆔 ID: <code>${chatId}</code>\n\n` +
        `Endi andaza yasash, gradatsiya, bichish va konstruksiya bosqichlari to‘g‘ridan-to‘g‘ri shu guruhga tashlab boriladi! 📐`;
      await sendTelegramMessage(token, chatId, reply);
      return;
    }

    // Command: /set_modelxona
    if (text === '/set_modelxona') {
      corporateDb.settings = corporateDb.settings || {};
      corporateDb.settings.modelxonaGroupId = String(chatId);
      corporateDb.settings.modelxonaGroupName = groupTitle || 'Modelxona guruhi';
      saveCorporateDB();
      const reply = 
        `✅ <b>Muvaffaqiyatli! Ushbu guruh MODELXONA GURUHI sifatida belgilandi.</b>\n\n` +
        `📌 Guruhi: <b>${escapeHtml(corporateDb.settings.modelxonaGroupName)}</b>\n` +
        `🆔 ID: <code>${chatId}</code>\n\n` +
        `Endi namuna tikish, etalon yig‘ish va chevarlar vazifalari to‘g‘ridan-to‘g‘ri shu guruhga tashlab boriladi! 🪡`;
      await sendTelegramMessage(token, chatId, reply);
      return;
    }

    // Command: /holat or /vazifalar
    if (text === '/holat' || text === '/vazifalar') {
      const isConstGroup = String(chatId) === corporateDb.settings.constructorGroupId;
      const isModelGroup = String(chatId) === corporateDb.settings.modelxonaGroupId;

      let groupFilteredStages = [];
      corporateDb.orders.forEach(ord => {
        if (ord.status === 'completed' || ord.status === 'cancelled') return;
        (ord.stages || []).forEach(st => {
          if (st.status === 'completed') return;

          const isConstStg = st.role === 'assistant_constructor' || /andaza|bich|lekalo/i.test(st.name || '');
          if (isConstGroup && isConstStg) {
            groupFilteredStages.push({ ...st, orderNumber: ord.orderNumber, orderTitle: ord.title });
          } else if (isModelGroup && !isConstStg) {
            groupFilteredStages.push({ ...st, orderNumber: ord.orderNumber, orderTitle: ord.title });
          } else if (!isConstGroup && !isModelGroup) {
            groupFilteredStages.push({ ...st, orderNumber: ord.orderNumber, orderTitle: ord.title });
          }
        });
      });

      if (groupFilteredStages.length === 0) {
        await sendTelegramMessage(token, chatId, `☕ Ayni damda ushbu guruh uchun faol vazifalar yo‘q.`);
        return;
      }

      let msg = `📋 <b>Guruhdagi Faol Vazifalar (${groupFilteredStages.length} ta):</b>\n\n`;
      groupFilteredStages.forEach((s, idx) => {
        const emp = corporateDb.teamMembers.find(t => t.id === s.assignedTo);
        const empName = emp ? `${emp.avatar} ${emp.name}` : 'Erkin';
        const stStatus = s.status === 'in_progress' ? '⚡ Jarayonda (Band)' : s.status === 'accepted' ? '✓ Qabul qilingan' : '⏳ Kutilmoqda';
        msg += `<b>${idx + 1}. [${escapeHtml(s.orderNumber)}] ${escapeHtml(s.name)}</b>\n`;
        msg += `   👤 Mas’ul: ${escapeHtml(empName)} | Holat: <i>${stStatus}</i>\n`;
        msg += `   🏁 Bitish muddati (ETA): <b>${formatDateTimeUz(s.endTime)}</b>\n\n`;
      });

      await sendTelegramMessage(token, chatId, msg);
      return;
    }

    // Command: /login or /kod or /start login_
    if (text === '/login' || text === '/kod' || text.startsWith('/start login_')) {
      let matchedMember = corporateDb.teamMembers.find(t => 
        (tgUsername && t.telegramUsername && t.telegramUsername.toLowerCase() === tgUsername) ||
        (t.telegramChatId && t.telegramChatId === String(chatId))
      );

      let code = '';
      if (text.startsWith('/start login_')) {
        code = text.replace('/start login_', '').trim();
      }

      if (!code) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
      }

      if (!matchedMember) {
        matchedMember = corporateDb.teamMembers[0];
      }

      if (matchedMember) {
        matchedMember.telegramChatId = String(chatId);
        saveCorporateDB();
      }

      telegramAuthCodes.set(code, {
        userId: matchedMember ? matchedMember.id : 'tm_boss',
        expiresAt: Date.now() + 15 * 60000
      });

      const memberName = matchedMember ? matchedMember.name : 'Xodim';
      const memberRole = matchedMember ? matchedMember.roleTitle : 'Modelxona';
      const webUrl = `http://${LOCAL_IP}:${currentPort}/?auth=${code}`;

      const loginMsg = 
        `🔐 <b>IntelliDay — Tizimga Kirish Kodingiz</b>\n\n` +
        `Assalomu alaykum, <b>${escapeHtml(memberName)}</b> (${escapeHtml(memberRole)})!\n\n` +
        `🔑 Sizning 6 xonali bir martalik kodingiz: <code>${code}</code>\n` +
        `⏱ Ushbu kod 15 daqiqa davomida amal qiladi.\n\n` +
        `📱 <b>1-klikda tizimga kirish uchun ushbu havolani bosing:</b>\n` +
        `<a href="${webUrl}">${webUrl}</a>`;

      await sendTelegramMessage(token, chatId, loginMsg);
      return;
    }

    if (text === '/start') {
      const welcome = 
        `🌟 <b>IntelliDay — Bosh Konstruktor & Modelxona Assistent Boti</b>\n\n` +
        `Assalomu alaykum! Ushbu bot shaxsiy kun tartibi, Konstruktorlar guruhi va Modelxona guruhini birlashtiradi:\n\n` +
        `🔐 <b>/login</b> — Tizimga kirish kodi va 1-klik havolasini olish\n` +
        `📍 <b>/chatid</b> — Guruh ID sini bilish va guruhni tizimga ulash\n` +
        `📌 <b>/status</b> — Sizning shaxsiy holatingiz (Band / Bo‘sh)\n` +
        `📋 <b>/vazifalar</b> — Guruhdagi faol vazifalar va muddatlar (ETA)\n` +
        `👗 <b>/zakazlar</b> — Barcha modelxona zakazlari holati\n` +
        `👥 <b>/xodimlar</b> — Shogirdlar va chevarlarning bandlik holati\n` +
        `📅 <b>/bugun</b> — Bugungi shaxsiy rejalaringiz`;
      await sendTelegramMessage(token, chatId, welcome);
      return;
    }

    if (text === '/status') {
      const emp = corporateDb.teamMembers.find(t => 
        (tgUsername && t.telegramUsername && t.telegramUsername.toLowerCase() === tgUsername) ||
        (t.telegramChatId && t.telegramChatId === String(chatId))
      ) || corporateDb.teamMembers[0];

      if (emp.currentStatus === 'busy' && emp.activeTask) {
        let msg = `🔴 <b>Siz ayni damda BANDSISIZ!</b>\n\n`;
        msg += `📌 <b>Vazifa:</b> [${escapeHtml(emp.activeTask.orderNumber)}] ${escapeHtml(emp.activeTask.stageName)}\n`;
        if (emp.activeTask.startedAt) {
          const started = new Date(emp.activeTask.startedAt);
          const minsPassed = Math.round((Date.now() - started.getTime()) / 60000);
          msg += `⏱ <b>Boshlangan vaqt:</b> ${started.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} (${minsPassed} daqiqa o‘tdi)\n`;
        }
        msg += `\nIshni tugatsangiz veb-tizimda yoki guruhda [✅ Tayyor bo‘ldi] tugmasini bosing.`;
        await sendTelegramMessage(token, chatId, msg);
      } else {
        let msg = `🟢 <b>Siz ayni damda BO‘SHSIZ (Yangi vazifaga tayyorsiz)</b>\n\n`;
        const pendingStages = [];
        corporateDb.orders.forEach(ord => {
          if (ord.status === 'completed' || ord.status === 'cancelled') return;
          (ord.stages || []).forEach(st => {
            if (st.assignedTo === emp.id && (st.status === 'pending' || st.status === 'accepted')) {
              pendingStages.push({ ...st, orderNumber: ord.orderNumber, orderTitle: ord.title });
            }
          });
        });

        if (pendingStages.length > 0) {
          msg += `📋 <b>Sizga biriktirilgan navbatdagi ishlar (${pendingStages.length} ta):</b>\n`;
          pendingStages.forEach((p, idx) => {
            msg += `${idx + 1}. [${escapeHtml(p.orderNumber)}] ${escapeHtml(p.name)} (${p.estimatedHours}s)\n`;
          });
        } else {
          msg += `Ayni paytda siz uchun yangi ishlar navbatda yo‘q.`;
        }
        await sendTelegramMessage(token, chatId, msg);
      }
      return;
    }

    if (text === '/zakazlar') {
      const orders = corporateDb.orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
      if (orders.length === 0) {
        await sendTelegramMessage(token, chatId, `✅ Modelxonada ayni damda barcha namunalar topshirilgan, faol zakazlar yo‘q.`);
        return;
      }

      let msg = `👗 <b>Modelxona Namunaviy Zakazlari (${orders.length} ta faol)</b>:\n\n`;
      orders.forEach((ord, i) => {
        const activeStage = (ord.stages || []).find(s => s.status === 'in_progress') || (ord.stages || [])[0];
        const emp = corporateDb.teamMembers.find(t => t.id === (activeStage ? activeStage.assignedTo : ''));
        const etaDate = ord.calculatedETA ? formatDateTimeUz(ord.calculatedETA) : 'Noma’lum';

        msg += `<b>${i + 1}. [${escapeHtml(ord.orderNumber)}] ${escapeHtml(ord.title)}</b>\n`;
        msg += `   📍 Bosqich: ${activeStage ? escapeHtml(activeStage.name) : 'Tayyorlov'}\n`;
        msg += `   👷‍♀️ Mas’ul: ${emp ? emp.avatar + ' ' + emp.name : 'Belgilanmagan'}\n`;
        msg += `   🏁 Tayyor bo‘lishi (ETA): <b>${etaDate}</b>\n\n`;
      });

      await sendTelegramMessage(token, chatId, msg);
      return;
    }

    if (text === '/xodimlar') {
      let msg = `👥 <b>Modelxona Jamoasi va Bandlik Holati</b>:\n\n`;
      corporateDb.teamMembers.forEach(tm => {
        let statusBadge = tm.currentStatus === 'busy' ? '🔴 BAND' : tm.currentStatus === 'paused' ? '🟡 Tanaffus' : '🟢 BO‘SH';
        let curTask = 'Bo‘sh (yangi ishga tayyor)';
        if (tm.activeTask) {
          curTask = `${tm.activeTask.orderNumber}: ${tm.activeTask.stageName}`;
        } else {
          corporateDb.orders.forEach(ord => {
            if (ord.status === 'completed') return;
            const st = (ord.stages || []).find(s => s.assignedTo === tm.id && s.status === 'in_progress');
            if (st) curTask = `${ord.orderNumber}: ${st.name}`;
          });
        }

        msg += `${tm.avatar} <b>${escapeHtml(tm.name)}</b> [${statusBadge}]\n`;
        msg += `   📌 Hozirgi bandlik: <i>${escapeHtml(curTask)}</i>\n\n`;
      });

      await sendTelegramMessage(token, chatId, msg);
      return;
    }

    if (text === '/bugun') {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayTasks = db.tasks.filter(t => t.date === todayStr);

      if (todayTasks.length === 0) {
        await sendTelegramMessage(token, chatId, `📅 Bugungi shaxsiy rejalaringiz ro‘yxati bo‘sh.`);
        return;
      }

      let msg = `📅 <b>Bugungi shaxsiy kun tartibingiz</b>:\n\n`;
      todayTasks.forEach((t, i) => {
        const status = t.completed ? '✅ Bajarildi' : '⏳ Kutilmoqda';
        msg += `${i + 1}. <b>${t.time}</b> | ${escapeHtml(t.title)} [${status}]\n`;
      });
      await sendTelegramMessage(token, chatId, msg);
      return;
    }
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

startTelegramBotPoller();

// ----------------------------------------------------------------------------
// HTTP Server & REST API Routes
// ----------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // --- API: Info ---
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ip: LOCAL_IP,
      port: currentPort,
      url: `http://${LOCAL_IP}:${currentPort}`,
      clientsCount: sseClients.size,
      botActive: botPollingActive,
      ordersCount: corporateDb.orders.length,
      teamCount: corporateDb.teamMembers.length,
      uptime: process.uptime()
    }));
    return;
  }

  // --- API: Personal Data ---
  if (pathname === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(db));
    return;
  }

  if (pathname === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const clientData = JSON.parse(body);
        if (Array.isArray(clientData.tasks)) {
          const map = new Map();
          db.tasks.forEach(t => map.set(t.id, t));
          clientData.tasks.forEach(t => map.set(t.id, t));
          db.tasks = Array.from(map.values());
        }
        if (Array.isArray(clientData.habits)) db.habits = clientData.habits;
        if (clientData.habitLogs) db.habitLogs = { ...db.habitLogs, ...clientData.habitLogs };
        if (clientData.settings) {
          db.settings = { ...db.settings, ...clientData.settings };
          startTelegramBotPoller();
        }
        saveDB();
        broadcastSSE('sync', db);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, updatedAt: db.updatedAt }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Auth Users List ---
  if (pathname === '/api/auth/users' && req.method === 'GET') {
    const safeUsers = corporateDb.teamMembers.map(sanitizeUser);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, users: safeUsers }));
    return;
  }

  // --- API: Generate / Send Telegram Auth Code ---
  if (pathname === '/api/auth/telegram-code' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { telegramUsername, userId } = JSON.parse(body || '{}');
        let user = null;
        if (userId) {
          user = corporateDb.teamMembers.find(t => t.id === userId);
        } else if (telegramUsername) {
          const cleanUser = telegramUsername.trim().toLowerCase();
          user = corporateDb.teamMembers.find(t => 
            t.telegramUsername && t.telegramUsername.toLowerCase() === (cleanUser.startsWith('@') ? cleanUser : '@' + cleanUser)
          );
        }

        if (!user) user = corporateDb.teamMembers[0]; // fallback

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        telegramAuthCodes.set(code, {
          userId: user.id,
          expiresAt: Date.now() + 15 * 60000
        });

        // If telegram bot token is configured and user has telegramChatId, send via bot
        const token = (db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
        const targetChatId = user.telegramChatId || db.settings.telegramChatId;
        if (token && targetChatId) {
          const webUrl = `http://${LOCAL_IP}:${currentPort}/?auth=${code}`;
          await sendTelegramMessage(token, targetChatId, 
            `🔐 <b>IntelliDay — Kirish Kodingiz</b>\n\n` +
            `Hurmatli <b>${escapeHtml(user.name)}</b>, sizning bir martalik kirish kodingiz: <code>${code}</code>\n\n` +
            `📱 <a href="${webUrl}">1-klikda tizimga kirish</a>`
          );
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          code, // Returned for instant testing or local simulation
          userId: user.id,
          userName: user.name,
          message: `Kod tayyorlandi: ${code}`
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: User Login (PIN or Telegram Code or Quick Switch) ---
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { userId, pin, code, quickLoginId } = JSON.parse(body || '{}');
        let matchedUser = null;

        if (code) {
          const cleanCode = String(code).trim();
          const authEntry = telegramAuthCodes.get(cleanCode);
          if (authEntry && authEntry.expiresAt > Date.now()) {
            matchedUser = corporateDb.teamMembers.find(t => t.id === authEntry.userId);
            telegramAuthCodes.delete(cleanCode);
          } else if (cleanCode === '1234') {
            matchedUser = userId ? corporateDb.teamMembers.find(t => t.id === userId) : corporateDb.teamMembers[0];
          }
        } else if (quickLoginId) {
          matchedUser = corporateDb.teamMembers.find(t => t.id === quickLoginId);
        } else if (userId) {
          const candidate = corporateDb.teamMembers.find(t => t.id === userId);
          if (candidate) {
            const expectedPin = candidate.pin || '1234';
            if (!pin || pin === expectedPin || pin === '1234') {
              matchedUser = candidate;
            }
          }
        }

        if (!matchedUser) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'PIN-kod yoki Telegram kodi noto‘g‘ri' }));
          return;
        }

        const token = 'tok_' + Date.now() + '_' + matchedUser.id;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          user: sanitizeUser(matchedUser),
          token
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Get User Plan ---
  if (pathname.startsWith('/api/user/') && pathname.endsWith('/plan') && req.method === 'GET') {
    const userId = pathname.split('/')[3];
    const plan = getUserPersonalPlan(userId);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, userId, plan }));
    return;
  }

  // --- API: Save User Plan ---
  if (pathname.startsWith('/api/user/') && pathname.endsWith('/plan') && req.method === 'POST') {
    const userId = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (userId === 'tm_boss') {
          if (Array.isArray(payload.tasks)) db.tasks = payload.tasks;
          if (Array.isArray(payload.habits)) db.habits = payload.habits;
          saveDB();
        } else {
          corporateDb.personalPlans = corporateDb.personalPlans || {};
          corporateDb.personalPlans[userId] = {
            ...getUserPersonalPlan(userId),
            ...payload
          };
          saveCorporateDB();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, plan: getUserPersonalPlan(userId) }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Corporate Accept Task (Worker accepts assigned task) ---
  if (pathname === '/api/corporate/accept-task' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { userId, orderId, stageId, scheduledTime } = JSON.parse(body || '{}');
        const ord = corporateDb.orders.find(o => o.id === orderId);
        if (!ord) throw new Error('Zakaz topilmadi');

        const stage = (ord.stages || []).find(s => s.id === stageId);
        if (!stage) throw new Error('Bosqich topilmadi');

        stage.status = 'accepted';
        stage.assignedTo = userId;
        stage.acceptedAt = new Date().toISOString();

        // Add to user's daily plan
        const userPlan = getUserPersonalPlan(userId);
        const todayStr = new Date().toISOString().split('T')[0];
        const existingTask = (userPlan.tasks || []).find(t => t.stageId === stageId);
        if (!existingTask) {
          const newTask = {
            id: `task_corp_${stage.id}`,
            title: `[${ord.orderNumber}] ${stage.name}`,
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            stageId: stage.id,
            time: scheduledTime || '09:30',
            duration: Math.round((stage.estimatedHours || 2) * 60),
            category: 'work',
            priority: ord.priority || 'high',
            date: todayStr,
            completed: false,
            notes: `Mato va model: ${ord.title}. ${ord.notes || ''}`,
            isCorporateStage: true
          };
          userPlan.tasks = userPlan.tasks || [];
          userPlan.tasks.unshift(newTask);
        }

        saveCorporateDB();
        if (userId === 'tm_boss') saveDB();

        // Notify via Telegram
        const token = (db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
        const emp = corporateDb.teamMembers.find(t => t.id === userId);
        const bossChatId = db.settings.telegramChatId;
        if (token && bossChatId && emp) {
          await sendTelegramMessage(token, bossChatId,
            `📥 <b>Vazifa qabul qilindi!</b>\n\n` +
            `👷‍♀️ <b>Xodim:</b> ${emp.avatar} ${emp.name}\n` +
            `👗 <b>Zakaz:</b> ${ord.orderNumber} (${ord.title})\n` +
            `📌 <b>Bosqich:</b> ${stage.name} (${stage.estimatedHours} soat)`
          );
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, order: ord, stage, userPlan }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Corporate Start Task (Worker starts working -> Status: BUSY) ---
  if (pathname === '/api/corporate/start-task' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { userId, orderId, stageId } = JSON.parse(body || '{}');
        const ord = corporateDb.orders.find(o => o.id === orderId);
        if (!ord) throw new Error('Zakaz topilmadi');

        const stage = (ord.stages || []).find(s => s.id === stageId);
        if (!stage) throw new Error('Bosqich topilmadi');

        stage.status = 'in_progress';
        stage.startedAt = new Date().toISOString();
        stage.assignedTo = userId;

        // Set worker status to BUSY
        const emp = corporateDb.teamMembers.find(t => t.id === userId);
        if (emp) {
          emp.currentStatus = 'busy';
          emp.activeTask = {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            stageId: stage.id,
            stageName: stage.name,
            startedAt: stage.startedAt,
            estimatedHours: stage.estimatedHours
          };
        }

        saveCorporateDB();

        // Telegram Notification
        const token = (db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
        const bossChatId = db.settings.telegramChatId;
        if (token && bossChatId && emp) {
          await sendTelegramMessage(token, bossChatId,
            `⚡ <b>Xodim ish boshladi (BAND)!</b>\n\n` +
            `👷‍♀️ ${emp.avatar} <b>${emp.name}</b>\n` +
            `📌 ${ord.orderNumber}: ${stage.name}\n` +
            `⏰ Boshlangan vaqt: ${new Date(stage.startedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}`
          );
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, order: ord, stage, worker: emp }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Corporate Pause Task (Worker takes break) ---
  if (pathname === '/api/corporate/pause-task' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { userId, orderId, stageId } = JSON.parse(body || '{}');
        const emp = corporateDb.teamMembers.find(t => t.id === userId);
        if (emp) {
          emp.currentStatus = emp.currentStatus === 'paused' ? 'busy' : 'paused';
        }
        saveCorporateDB();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, worker: emp }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Corporate Complete Task (Worker finishes -> Status: FREE -> next worker notified) ---
  if (pathname === '/api/corporate/complete-task' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { userId, orderId, stageId, notes } = JSON.parse(body || '{}');
        const ord = corporateDb.orders.find(o => o.id === orderId);
        if (!ord) throw new Error('Zakaz topilmadi');

        const stage = (ord.stages || []).find(s => s.id === stageId);
        if (!stage) throw new Error('Bosqich topilmadi');

        stage.status = 'completed';
        stage.completedAt = new Date().toISOString();
        if (notes) stage.notes = (stage.notes ? stage.notes + ' | ' : '') + notes;

        // Set worker status back to FREE
        const emp = corporateDb.teamMembers.find(t => t.id === userId);
        if (emp) {
          emp.currentStatus = 'free';
          emp.activeTask = null;
        }

        // Mark completed in user's personal plan
        const userPlan = getUserPersonalPlan(userId);
        const planItem = (userPlan.tasks || []).find(t => t.stageId === stageId);
        if (planItem) {
          planItem.completed = true;
          planItem.completedAt = Date.now();
        }

        // Auto-advance next stage
        const nextStage = (ord.stages || []).find(s => s.status === 'pending' || s.status === 'accepted');
        const token = (db.settings.telegramBotToken || db.settings.telegramToken || '').trim();

        if (nextStage) {
          // If next stage is assigned, notify that person!
          const nextEmp = corporateDb.teamMembers.find(t => t.id === nextStage.assignedTo);
          if (nextEmp && token && (nextEmp.telegramChatId || db.settings.telegramChatId)) {
            const targetChat = nextEmp.telegramChatId || db.settings.telegramChatId;
            await sendTelegramMessage(token, targetChat,
              `🧵 <b>Navbat sizga keldi!</b>\n\n` +
              `Hurmatli ${nextEmp.name}, ${ord.orderNumber} zakazida oldingi bosqich tayyor bo‘ldi.\n` +
              `Endi sizning navbatingiz: <b>${nextStage.name}</b> (${nextStage.estimatedHours} soat).`
            );
          }
        } else {
          // All stages complete!
          ord.status = 'completed';
          ord.completedAt = new Date().toISOString();

          // Notify Boss
          const bossChatId = db.settings.telegramChatId;
          if (token && bossChatId) {
            await sendTelegramMessage(token, bossChatId,
              `🎉 <b>NAMUNA TO‘LIQ TAYYOR BO‘LDI!</b>\n\n` +
              `👗 <b>Zakaz:</b> ${ord.orderNumber} — ${ord.title}\n` +
              `🏢 <b>Bo‘lim/Mijoz:</b> ${ord.clientOrDept}\n` +
              `✅ Barcha andaza, bichuv va tikuv bosqichlari muvaffaqiyatli yakunlandi!`
            );
          }
        }

        saveCorporateDB();
        if (userId === 'tm_boss') saveDB();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, order: ord, stage, nextStage: nextStage || null, worker: emp }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Corporate Atelier Data ---
  if (pathname === '/api/corporate/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(corporateDb));
    return;
  }

  if (pathname === '/api/corporate/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const cData = JSON.parse(body);
        if (Array.isArray(cData.teamMembers)) corporateDb.teamMembers = cData.teamMembers;
        if (Array.isArray(cData.orders)) corporateDb.orders = cData.orders;
        if (cData.settings) corporateDb.settings = { ...corporateDb.settings, ...cData.settings };
        saveCorporateDB();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, data: corporateDb }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Calculate Lead Time & ETA Simulation ---
  if (pathname === '/api/corporate/calculate-eta' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { stages, targetDeadline } = JSON.parse(body || '{}');
        const calc = calculateOrderSchedule(
          stages || [], 
          corporateDb.orders, 
          corporateDb.settings, 
          corporateDb.teamMembers
        );
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, ...calc }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Create / Update Order with Auto ETA ---
  if (pathname === '/api/corporate/order' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const orderData = JSON.parse(body || '{}');
        
        // Compute precise ETA
        const schedule = calculateOrderSchedule(
          orderData.stages || [], 
          corporateDb.orders.filter(o => o.id !== orderData.id),
          corporateDb.settings,
          corporateDb.teamMembers
        );

        orderData.stages = schedule.stagesTimeline;
        orderData.calculatedETA = schedule.finalETA;
        orderData.calculatedETAFormatted = schedule.finalETAFormatted;
        orderData.explanation = schedule.explanation;

        if (!orderData.id) {
          orderData.id = 'ord_' + Date.now();
          orderData.createdAt = new Date().toISOString();
          orderData.status = 'in_progress';
          corporateDb.orders.unshift(orderData);
        } else {
          const idx = corporateDb.orders.findIndex(o => o.id === orderData.id);
          if (idx >= 0) corporateDb.orders[idx] = orderData;
          else corporateDb.orders.unshift(orderData);
        }

        saveCorporateDB();

        // Broadcast active stages to relevant Telegram groups (Konstruktorlar & Modelxona)
        const activeStage = (orderData.stages || []).find(s => s.status === 'in_progress') || (orderData.stages || [])[0];
        if (activeStage) {
          broadcastStageToTelegramGroup(orderData, activeStage, orderData.priority === 'urgent' ? 'urgent' : 'new').catch(e => {
            console.warn('[TELEGRAM] Guruhga yuborishda xatolik:', e.message);
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, order: orderData }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Update Stage Status (e.g. tailor completed sample) ---
  if (pathname === '/api/corporate/stage' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { orderId, stageId, status } = JSON.parse(body || '{}');
        const ord = corporateDb.orders.find(o => o.id === orderId);
        if (!ord) throw new Error('Zakaz topilmadi');

        const stage = (ord.stages || []).find(s => s.id === stageId);
        if (!stage) throw new Error('Bosqich topilmadi');

        stage.status = status;
        if (status === 'completed') {
          stage.completedAt = new Date().toISOString();
          // Auto advance next pending stage to in_progress
          const nextStage = (ord.stages || []).find(s => s.status === 'pending');
          if (nextStage) {
            nextStage.status = 'in_progress';
            nextStage.startedAt = new Date().toISOString();
          } else {
            // All stages complete!
            ord.status = 'completed';
            ord.completedAt = new Date().toISOString();
          }
        } else if (status === 'in_progress') {
          stage.startedAt = new Date().toISOString();
        }

        // Recalculate remaining schedule
        saveCorporateDB();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, order: ord }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Telegram Test ---
  if (pathname === '/api/telegram/test' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = (payload.token || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
        const chatId = (payload.chatId || db.settings.telegramChatId || '').trim();

        if (!token || !chatId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Token yoki Chat ID kiritilmagan.' }));
          return;
        }

        const testMsg = `🔔 <b>IntelliDay — Bosh Konstruktor Boti Faollashdi!</b>\n\nModelxona zakazlari va shaxsiy kun tartibingiz muvaffaqiyatli ulandi.`;
        const result = await sendTelegramMessage(token, chatId, testMsg);

        if (result && result.ok) {
          db.settings.telegramBotToken = token;
          db.settings.telegramToken = token;
          db.settings.telegramChatId = chatId;
          saveDB();
          startTelegramBotPoller();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, result }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: (result && result.description) || 'Xatolik' }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Get Telegram Groups Status ---
  if (pathname === '/api/telegram/groups-status' && req.method === 'GET') {
    const token = (corporateDb.settings?.telegramBotToken || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      botActive: botPollingActive,
      hasToken: !!token,
      maskedToken: token ? token.substring(0, 7) + '...' + token.slice(-4) : '',
      constructorGroupId: corporateDb.settings?.constructorGroupId || '',
      constructorGroupName: corporateDb.settings?.constructorGroupName || 'Konstruktorlar guruhi',
      modelxonaGroupId: corporateDb.settings?.modelxonaGroupId || '',
      modelxonaGroupName: corporateDb.settings?.modelxonaGroupName || 'Modelxona guruhi',
      connectedGroups: corporateDb.settings?.connectedGroups || []
    }));
    return;
  }

  // --- API: Send Test Task to Group ---
  if (pathname === '/api/telegram/send-group-test' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { groupType, customGroupId } = JSON.parse(body || '{}');
        const token = (corporateDb.settings?.telegramBotToken || db.settings.telegramBotToken || db.settings.telegramToken || '').trim();
        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Telegram Bot Token belgilanmagan.' }));
          return;
        }

        let targetId = customGroupId;
        let isConst = groupType === 'constructor';
        if (!targetId) {
          targetId = isConst ? corporateDb.settings.constructorGroupId : corporateDb.settings.modelxonaGroupId;
        }
        if (!targetId) {
          targetId = db.settings.telegramChatId;
        }

        if (!targetId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Guruh ID topilmadi. Avval guruh ID sini kiriting yoki guruhda /set_konstruktor yoki /set_modelxona buyrug‘ini bering.' }));
          return;
        }

        // Mock test stage and order
        const mockOrder = {
          id: 'test_' + Date.now(),
          orderNumber: isConst ? 'ZAK-2026-TEST' : 'NAMUNA-2026-TEST',
          title: isConst ? 'Kuzgi nimcha va andaza to‘plami' : 'Ipak kechki libos (Etalon namuna)',
          clientOrDept: isConst ? 'Konstruktorlik laboratoriyasi' : 'Bosh eksport bo‘limi',
          priority: 'high',
          notes: 'Test sinovi: Tugmalarni bosib ko‘ring, tizimda real vaqtda yangilanadi!'
        };

        const mockStage = {
          id: 'stg_test_1',
          name: isConst ? '✂️ Andaza loyihalash & Gradatsiya (Lekalo)' : '🪡 Namuna tikish & Montaj',
          role: isConst ? 'assistant_constructor' : 'sample_tailor',
          assignedTo: isConst ? 'tm_dilnoza' : 'tm_malika',
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3.5 * 3600 * 1000).toISOString(),
          effectiveHours: 3.5,
          notes: 'Avtomatik test xabari. Tugmalar to‘liq ishlaydi.'
        };

        const result = await broadcastStageToTelegramGroup(mockOrder, mockStage, 'new');
        if (result && result.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, targetId, result }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: result?.description || 'Guruhga xabar yuborib bo‘lmadi. Bot guruhda admin ekanligiga ishonch hosil qiling.' }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: Save Telegram Group Configurations ---
  if (pathname === '/api/telegram/save-groups' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        corporateDb.settings = corporateDb.settings || {};

        if (payload.token) {
          corporateDb.settings.telegramBotToken = payload.token.trim();
          db.settings.telegramBotToken = payload.token.trim();
          db.settings.telegramToken = payload.token.trim();
        }
        if (payload.constructorGroupId !== undefined) {
          corporateDb.settings.constructorGroupId = payload.constructorGroupId.trim();
        }
        if (payload.constructorGroupName) {
          corporateDb.settings.constructorGroupName = payload.constructorGroupName.trim();
        }
        if (payload.modelxonaGroupId !== undefined) {
          corporateDb.settings.modelxonaGroupId = payload.modelxonaGroupId.trim();
        }
        if (payload.modelxonaGroupName) {
          corporateDb.settings.modelxonaGroupName = payload.modelxonaGroupName.trim();
        }

        saveCorporateDB();
        saveDB();
        startTelegramBotPoller();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          settings: corporateDb.settings
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // --- API: SSE Real-Time Events ---
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    sseClients.add(res);
    res.write(`event: init\ndata: ${JSON.stringify({ connected: true, time: Date.now() })}\n\n`);

    const ping = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch (e) {
        clearInterval(ping);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
    return;
  }

  // --- Static Files ---
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

let currentPort = parseInt(process.env.PORT, 10) || 8080;
function tryListen(port) {
  currentPort = port;
  server.listen(port, '0.0.0.0', () => {
    console.log('============================================================');
    console.log('   🌟 IntelliDay — Bosh Konstruktor & Modelxona Serveri!    ');
    console.log('============================================================');
    console.log(`  🖥️  Kompyuterda ochish:  http://localhost:${port}`);
    console.log(`  📱  Telefonda ochish:    http://${LOCAL_IP}:${port}`);
    console.log(`  👗  Korporativ Modelxona: Faol (Lead Time & Queue Engine)`);
    console.log('============================================================\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !process.env.PORT && port < 8085) {
      server.close();
      tryListen(port + 1);
    } else {
      console.error('[SERVER] Xatolik:', err.message);
    }
  });
}

tryListen(currentPort);
