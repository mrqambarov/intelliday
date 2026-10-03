/**
 * IntelliDay - Autonomous AI Smart Scheduler & Executive Assistant
 * Features:
 * - Autonomous Schedule Auto-Rebalancing (Self-repairing schedule on delays)
 * - Magic Day-Plan Generator (Pre-built circadian rhythm templates or custom goals)
 * - Dual Brain: Google Gemini LLM API + Offline Natural Language Heuristics
 * - Smart Gap Finder & Conflict Resolver
 * - Interactive AI Assistant Conversation with Action Cards
 * - Voice Synthesis & Recognition in Uzbek
 */

class SmartAssistant {
  constructor() {
    this.speechSynth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.recognition = null;
    this.chatHistory = [];
    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'uz-UZ';
    }
  }

  speak(text) {
    if (!this.speechSynth) return;
    try {
      this.speechSynth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      const voices = this.speechSynth.getVoices();
      const uzOrRu = voices.find(v => v.lang.startsWith('uz') || v.lang.startsWith('ru') || v.lang.startsWith('en'));
      if (uzOrRu) utterance.voice = uzOrRu;

      this.speechSynth.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // Autonomous Auto-Rebalance: Detects delays and shifts conflicting/overdue tasks to free slots
  autoRebalanceSchedule(targetDate) {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    const allTasks = window.Storage.getTasks();
    const dayTasks = allTasks.filter(t => t.date === dateStr);

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Find uncompleted tasks that are overdue or clashing with now
    const uncompleted = dayTasks.filter(t => !t.completed);
    if (uncompleted.length === 0) {
      return { success: false, message: 'Barcha vazifalar allaqachon bajarilgan yoki bugun reja yo‘q!' };
    }

    // Sort uncompleted by priority first (high, medium, low) and then by original time
    const priorityWeight = { high: 1, medium: 2, low: 3 };
    uncompleted.sort((a, b) => {
      const pDiff = (priorityWeight[a.priority] || 2) - (priorityWeight[b.priority] || 2);
      if (pDiff !== 0) return pDiff;
      return a.time.localeCompare(b.time);
    });

    // Start scheduling from now (rounded up to nearest 10 mins) or from 08:00 if date is tomorrow
    let nextAvailableMins = Math.max(currentMins + 5, 8 * 60);
    // Round to next 5 or 10 min
    nextAvailableMins = Math.ceil(nextAvailableMins / 10) * 10;

    let modifiedCount = 0;
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    uncompleted.forEach(task => {
      const [th, tm] = task.time.split(':').map(Number);
      const originalStartMins = th * 60 + tm;
      const originalEndMins = originalStartMins + task.duration;

      // Only reschedule if the task start time is already in the past or conflicts with nextAvailableMins
      if (originalStartMins < currentMins || originalStartMins < nextAvailableMins) {
        // If it's already late night (past 21:30), push low/medium priority tasks to tomorrow morning
        if (nextAvailableMins + task.duration > 22 * 60 && task.priority !== 'high') {
          task.date = tomorrowStr;
          task.time = '09:00';
          modifiedCount++;
        } else {
          const newH = String(Math.floor(nextAvailableMins / 60) % 24).padStart(2, '0');
          const newM = String(nextAvailableMins % 60).padStart(2, '0');
          task.time = `${newH}:${newM}`;
          nextAvailableMins += task.duration + 10; // 10 min break buffer between tasks
          modifiedCount++;
        }
        window.Storage.updateTask(task);
      } else {
        // Task is still in future; update nextAvailableMins to after this task
        nextAvailableMins = Math.max(nextAvailableMins, originalEndMins + 10);
      }
    });

    if (modifiedCount > 0) {
      if (window.Schedule) window.Schedule.render();
      if (window.Habits) window.Habits.updateProductivityScore();
      if (window.NotificationManager) window.NotificationManager.sound.playSuccess();
      return {
        success: true,
        modifiedCount,
        message: `🤖 AI Avtopilot: ${modifiedCount} ta vazifangiz bo‘sh vaqtlarga avtomatik surildi va kun tartibingiz muvozanatlandi!`
      };
    } else {
      return {
        success: true,
        modifiedCount: 0,
        message: '✅ Kun tartibingiz ayni damda to‘liq me’yorda, o‘zgartirish talab etilmadi.'
      };
    }
  }

  // Shift all remaining uncompleted tasks to tomorrow
  shiftRemainingToTomorrow() {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const tasks = window.Storage.getTasks().filter(t => t.date === todayStr && !t.completed);

    if (tasks.length === 0) {
      return { success: false, message: 'Bugungi barcha vazifalar allaqachon bajarilgan!' };
    }

    let startHour = 9;
    tasks.forEach((task, idx) => {
      task.date = tomorrowStr;
      task.time = `${String(startHour + Math.floor(idx * 1.5)).padStart(2, '0')}:00`;
      window.Storage.updateTask(task);
    });

    if (window.Schedule) window.Schedule.render();
    if (window.Habits) window.Habits.updateProductivityScore();
    return {
      success: true,
      count: tasks.length,
      message: `🌙 ${tasks.length} ta reja ertangi kunga qulay vaqtlarga ko‘chirildi. Endi xotirjam dam oling!`
    };
  }

  // Magic Day-Plan Generator (Pre-built Circadian Templates)
  generateMagicPlan(theme = 'balanced') {
    const todayStr = new Date().toISOString().split('T')[0];
    const templates = {
      balanced: [
        { title: 'Tetiklashish, badantarbiya va suv', time: '07:00', duration: 30, category: 'sport', priority: 'medium', notes: 'Ertalabki yengil cho‘zilish va 2 stakan suv' },
        { title: 'Asosiy vazifa: Chuqur diqqat (Deep Work #1)', time: '08:30', duration: 90, category: 'work', priority: 'high', notes: 'Eng qiyin va muhim ishni telefonni chetga surib bajarish' },
        { title: 'Qisqa tanaffus, meva yoki kofe', time: '10:15', duration: 20, category: 'health', priority: 'low', notes: 'Ko‘zlarga dam berish' },
        { title: 'Ikkinchi loyiha / Texnik ishlar (Deep Work #2)', time: '10:45', duration: 75, category: 'work', priority: 'high', notes: 'Hisobotlar, kod yoki hujjatlar' },
        { title: 'To‘yimli tushlik va toza havoda sayr', time: '13:00', duration: 50, category: 'health', priority: 'medium', notes: 'Ochiq havoda 15 daqiqa piyoda yurish' },
        { title: 'Yangi ko‘nikma / Ingliz tili / Mutolaa', time: '15:30', duration: 45, category: 'study', priority: 'medium', notes: '20 sahifa kitob yoki yangi mavzu' },
        { title: 'Sport mashg‘uloti yoki yugurish', time: '17:30', duration: 50, category: 'sport', priority: 'high', notes: 'Jismoniy faollik va charchoqni chiqarish' },
        { title: 'Kun sarhisobi & Ertangi kunni rejalashtirish', time: '21:00', duration: 25, category: 'personal', priority: 'medium', notes: 'Yutuqlar va keyingi qadamlar' }
      ],
      study: [
        { title: 'Miyani uyg‘otish va kunlik maqsadlar', time: '07:30', duration: 30, category: 'personal', priority: 'medium', notes: 'Bugungi dars mavzularini ko‘zdan kechirish' },
        { title: 'Eng qiyin fan / Nazariya ustida ishlash', time: '08:30', duration: 90, category: 'study', priority: 'high', notes: 'Konspekt qilish va asosiy qoidalar' },
        { title: 'Amaliy mashqlar va testlar yechish', time: '10:30', duration: 90, category: 'study', priority: 'high', notes: 'Xatolar ustida ishlash' },
        { title: 'Tushlik & Miya hordig‘i', time: '13:00', duration: 60, category: 'health', priority: 'low', notes: 'Ovqatlanish va dam olish' },
        { title: 'Chet tili / Listening & Speaking', time: '14:30', duration: 60, category: 'study', priority: 'high', notes: 'Lug‘at yodlash va podkast eshitish' },
        { title: 'Sport / Yengil sayr', time: '17:00', duration: 45, category: 'sport', priority: 'medium', notes: 'Tetiklashish' },
        { title: 'O‘tilganlarni takrorlash (Spaced Repetition)', time: '19:30', duration: 45, category: 'study', priority: 'medium', notes: 'Flashcardlar bilan takrorlash' }
      ],
      health: [
        { title: 'Tonggi yugurish va nafas mashqlari', time: '07:00', duration: 45, category: 'sport', priority: 'high', notes: 'Toza havoda jismoniy faollik' },
        { title: 'Sog‘lom nonushta va vitaminlar', time: '08:00', duration: 30, category: 'health', priority: 'medium', notes: 'Tabiiy mevalar va suv' },
        { title: 'Xotirjam ish bloki (Stressiz)', time: '09:30', duration: 90, category: 'work', priority: 'medium', notes: 'Shoshilmasdan rejalashtirish' },
        { title: 'Ko‘z mashqlari va cho‘zilish', time: '11:30', duration: 20, category: 'health', priority: 'low', notes: 'Umurtqa pog‘onasi mashqlari' },
        { title: 'Foydali tushlik va dam olish', time: '13:00', duration: 50, category: 'health', priority: 'high', notes: 'Sog‘lom taom' },
        { title: 'Yoga / Meditatsiya yoki Suzish', time: '17:00', duration: 60, category: 'sport', priority: 'high', notes: 'Tana va ong muvozanati' },
        { title: 'Raqamli detox (Ekranlarsiz kechqurun)', time: '21:00', duration: 60, category: 'personal', priority: 'high', notes: 'Telefonni chetga surib kitob o‘qish' }
      ]
    };

    const selected = templates[theme] || templates.balanced;
    const tasksToAdd = selected.map(item => ({
      ...item,
      id: 'magic-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      date: todayStr,
      completed: false,
      recurring: 'none'
    }));

    return tasksToAdd;
  }

  applyMagicPlan(theme = 'balanced') {
    const tasks = this.generateMagicPlan(theme);
    tasks.forEach(t => window.Storage.addTask(t));
    if (window.Schedule) window.Schedule.render();
    if (window.Habits) window.Habits.updateProductivityScore();
    if (window.NotificationManager) window.NotificationManager.sound.playSuccess();
    return {
      success: true,
      count: tasks.length,
      message: `✨ AI Sehrli Rejasi: ${tasks.length} ta optimal vazifa bugungi kuningizga qo‘shildi!`
    };
  }

  // Dual Brain AI: Real Gemini API + Built-in Offline Fallback
  async askAI(promptText) {
    const settings = window.Storage ? window.Storage.getSettings() : {};
    const apiKey = settings.apiKey ? settings.apiKey.trim() : '';

    if (apiKey) {
      try {
        return await this.callGeminiAPI(apiKey, promptText);
      } catch (err) {
        console.warn('Gemini API call failed, falling back to offline AI:', err);
      }
    }
    // Offline AI Engine
    return this.processOfflineAI(promptText);
  }

  async callGeminiAPI(apiKey, userPrompt) {
    const tasks = window.Storage.getTasks();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.date === todayStr);

    const context = `Hozirgi sana: ${todayStr}, vaqt: ${new Date().toLocaleTimeString('uz-UZ')}.
Foydalanuvchining bugungi vazifalari ro'yxati:
${todayTasks.map(t => `- [${t.time}] ${t.title} (${t.duration} daqiqa, ${t.category}, ${t.completed ? 'bajarilgan' : 'bajarilmagan'})`).join('\n') || 'Rejalar yo‘q'}

Sen IntelliDay ilovasining professional o‘zbek tilidagi aqlli shaxsiy yordamchisisan. Javoblaring aniq, rag‘batlantiruvchi, do‘stona va yuqori darajada samarador bo‘lsin.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${context}\n\nFoydalanuvchi murojaati: "${userPrompt}"\nJavob bering:` }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.7
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    throw new Error('Invalid Gemini API response');
  }

  processOfflineAI(rawText) {
    const text = rawText.trim().toLowerCase();
    const tasks = window.Storage.getTasks();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.date === todayStr);

    if (text.includes('avtopilot') || text.includes('muvozanat') || text.includes('surib ber')) {
      const res = this.autoRebalanceSchedule();
      return res.message;
    }

    if (text.includes('reja tuz') || text.includes('sehrli') || text.includes('avtomat tuz')) {
      const res = this.applyMagicPlan('balanced');
      return res.message;
    }

    if (text.includes('ertaga sur') || text.includes('charchadim') || text.includes('qolganini ertaga')) {
      const res = this.shiftRemainingToTomorrow();
      return res.message;
    }

    if (text.includes('bo‘sh vaqt') || text.includes('qachon bo‘shman')) {
      return this.findFreeSlotsText(todayTasks);
    }

    // Default coaching advice
    return this.generateCoachAdvice(tasks, window.Storage.getHabits());
  }

  findFreeSlotsText(tasks) {
    if (tasks.length === 0) {
      return 'Bugun kuningiz butunlay bo‘sh! Xohlagan vaqtingizga yangi reja qo‘shishingiz mumkin.';
    }
    const sorted = [...tasks].sort((a, b) => a.time.localeCompare(b.time));
    const lines = [];
    lines.push('Bugungi kuningiz tahlili:');
    sorted.forEach(t => {
      lines.push(`• ${t.time} — ${t.title} (${t.duration}m)`);
    });
    return lines.join('\n') + '\nVazifalar orasidagi bo‘shliqlardan unumli foydalanishingiz mumkin!';
  }

  // Parse natural language command
  parseInput(rawText) {
    const text = rawText.trim().toLowerCase();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Autopilot trigger
    if (text.includes('avtopilot') || text.includes('muvozanatlash') || text.includes('qayta taqsimla')) {
      return { type: 'TRIGGER_AUTOPILOT' };
    }

    // Magic day plan trigger
    if (text.includes('sehrli reja') || text.includes('kun tuz') || text.includes('rejalashtirib ber')) {
      return { type: 'TRIGGER_MAGIC_PLAN' };
    }

    // Shift to tomorrow
    if (text.includes('ertaga sur') || text.includes('charchadim') || text.includes('qoldir')) {
      return { type: 'TRIGGER_SHIFT_TOMORROW' };
    }

    // Check for habit addition
    if (text.startsWith('odat qo‘sh') || text.startsWith('yangi odat') || text.startsWith('odat:')) {
      const habitTitle = rawText.replace(/^(?:odat qo‘sh(?:ish)?|yangi odat|odat:)/gi, '').trim();
      if (habitTitle) {
        return { type: 'CREATE_HABIT', title: habitTitle };
      }
    }

    // Queries
    if (text.includes('kun tartibim') || text.includes('bugun nima') || text.includes('rejalarim') || text.includes('jadval')) {
      return { type: 'QUERY_AGENDA' };
    }
    if (text.includes('qolib ketgan') || text.includes('o‘tib ketgan')) {
      return { type: 'QUERY_OVERDUE' };
    }
    if (text.includes('tahlil') || text.includes('maslahat') || text.includes('baholash') || text.includes('qanday ketmoqda')) {
      return { type: 'QUERY_COACH' };
    }
    if (text.includes('fokus') || text.includes('pomodoro') || text.includes('ishga kirishdim')) {
      return { type: 'TRIGGER_FOCUS' };
    }

    // Task parsing
    let date = todayStr;
    if (text.includes('ertaga') || text.includes('завтра') || text.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = tomorrow.toISOString().split('T')[0];
    } else if (text.includes('indin') || text.includes('послезавтра')) {
      const dayAfter = new Date(today);
      dayAfter.setDate(dayAfter.getDate() + 2);
      date = dayAfter.toISOString().split('T')[0];
    }

    let time = '12:00';
    const isEvening = text.includes('kechki') || text.includes('kechqurun') || text.includes('kechasi') || text.includes('tushdan keyin') || text.includes('abeddan keyin') || text.includes('oqshom');

    const timeMatch = text.match(/(?:soat\s*)?(\d{1,2})[:.](\d{2})/);
    const hourOnlyMatch = text.match(/(?:soat\s*)(\d{1,2})(?:\s*da|\s*ga|\s*da\b)/);

    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = String(parseInt(timeMatch[2], 10)).padStart(2, '0');
      if (isEvening && h < 12) h += 12;
      time = `${String(h).padStart(2, '0')}:${m}`;
    } else if (hourOnlyMatch) {
      let h = parseInt(hourOnlyMatch[1], 10);
      if (isEvening && h < 12) h += 12;
      time = `${String(h).padStart(2, '0')}:00`;
    } else {
      const nextHour = (today.getHours() + 1) % 24;
      time = `${String(nextHour).padStart(2, '0')}:00`;
    }

    let duration = 30;
    const durationMinMatch = text.match(/(\d+)\s*(?:daqiqa|minut|min|m\b)/);
    const durationHourMatch = text.match(/(\d+)\s*(?:soat|chas|hour|h\b)/);

    if (durationMinMatch) {
      duration = parseInt(durationMinMatch[1], 10);
    } else if (durationHourMatch) {
      duration = parseInt(durationHourMatch[1], 10) * 60;
    }

    let priority = 'medium';
    if (text.includes('muhim') || text.includes('shoshilinch') || text.includes('zarur') || text.includes('urgent') || text.includes('срочно')) {
      priority = 'high';
    } else if (text.includes('yengil') || text.includes('oddiy') || text.includes('low')) {
      priority = 'low';
    }

    let category = 'personal';
    if (text.includes('ish') || text.includes('loyiha') || text.includes('mijoz') || text.includes('hisobot') || text.includes('work')) {
      category = 'work';
    } else if (text.includes('dars') || text.includes('o‘qish') || text.includes('kitob') || text.includes('ingliz') || text.includes('study')) {
      category = 'study';
    } else if (text.includes('sport') || text.includes('yugurish') || text.includes('mashq') || text.includes('zal') || text.includes('fitness')) {
      category = 'sport';
    } else if (text.includes('uchrashuv') || text.includes('qo‘ng‘iroq') || text.includes('meeting') || text.includes('suhbat')) {
      category = 'meeting';
    } else if (text.includes('suv') || text.includes('ovqat') || text.includes('dam') || text.includes('doktor') || text.includes('salomatlik')) {
      category = 'health';
    }

    let recurring = 'none';
    if (text.includes('har kuni') || text.includes('kunlik') || text.includes('doim') || text.includes('everyday')) {
      recurring = 'daily';
    }

    let cleanTitle = rawText
      .replace(/(?:ertaga|bugun|indin|har kuni|doim|muhim|shoshilinch|zarur|kechki|kechqurun|ertalab|tonggi|kechasi|tushdan keyin|abeddan keyin)/gi, '')
      .replace(/(?:soat\s*\d{1,2}[:.]\d{2}(?:\s*da)?)/gi, '')
      .replace(/(?:soat\s*\d{1,2}(?:\s*da|\s*ga)?)/gi, '')
      .replace(/(?:\d+\s*(?:daqiqa|minut|min|soat))/gi, '')
      .replace(/(?:eslatma|reja|qilay|qilish kerak|kerak|bor)/gi, '')
      .trim();

    if (!cleanTitle || cleanTitle.length < 3) {
      cleanTitle = rawText.trim();
    }
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    const newTask = {
      id: 'task-' + Date.now(),
      title: cleanTitle,
      time: time,
      duration: duration,
      category: category,
      priority: priority,
      date: date,
      completed: false,
      recurring: recurring,
      notes: 'Aqlli AI orqali kiritildi'
    };

    return {
      type: 'CREATE_TASK',
      task: newTask
    };
  }

  generateCoachAdvice(tasks, habits) {
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysTasks = tasks.filter(t => t.date === todayStr);
    const total = todaysTasks.length;
    const completed = todaysTasks.filter(t => t.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const hour = new Date().getHours();
    let greeting = 'Xayrli kun!';
    if (hour < 11) greeting = 'Xayrli tong!';
    else if (hour >= 18) greeting = 'Xayrli oqshom!';

    if (total === 0) {
      return `${greeting} Bugun uchun hali rejalar yo‘q. "✨ AI Reja Tuzsin" tugmasini bosing — optimal kun tartibini avtomatik tuzib beraman!`;
    }

    if (percent === 100) {
      return `🎉 Qoyilmaqom natija! Barcha ${total} ta vazifangizni 100% bajardingiz. Endi maroqli hordiq chiqaring!`;
    }

    const overdueCount = todaysTasks.filter(t => {
      if (t.completed) return false;
      const [th, tm] = t.time.split(':').map(Number);
      const nowH = new Date().getHours();
      const nowM = new Date().getMinutes();
      return th < nowH || (th === nowH && tm < nowM);
    }).length;

    if (overdueCount > 0) {
      return `⚠️ ${overdueCount} ta vazifangiz vaqti o‘tib ketdi. "🔄 AI Avtopilot" tugmasini bosing — ularni bo‘sh vaqtlarga avtomatik joylashtirib beraman!`;
    }

    if (percent >= 60) {
      return `${greeting} Ajoyib sur’atda ketmoqdasiz! Rejalarning ${percent}% qismi bajarildi. Yana ozgina diqqat jamlansa, kun g‘alaba bilan tugaydi.`;
    }

    return `${greeting} Bugun oldingizda ${total - completed} ta muhim vazifa turibdi. Eng yuqori muhimlikdagisidan boshlashni maslahat beraman!`;
  }
}

window.SmartAssistant = new SmartAssistant();
