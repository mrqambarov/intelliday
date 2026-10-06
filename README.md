# 🌟 IntelliDay — Bosh Konstruktor, Modelxona Boshqaruv Markazi & Shaxsiy Kun Tartibi

**IntelliDay** — endi nafaqat shaxsiy unumdorlik tizimi, balki **Bosh Konstruktor, Yordamchi konstruktorlar (shogirdlar) va Namuna tikuvchi chevar qizlar** uchun maxsus ishlab chiqilgan **Korporativ Modelxona va Aqlli Muddat Hisoblagich (Lead Time Engine)** ekotizimidir.

Ilova bir vaqtning o‘zida ham **Shaxsiy rejimda (Individual kun tartibi)**, ham **Korporativ Modelxona rejimida** to‘laqonli ishlaydi.

---

## 🚀 Ilovani Ishga Tushirish va Tarmoqda Ulanish

### 1. Kompyuterda ishga tushirish:
* Papkadagi **`start.bat`** faylini bosing.
* U avtomatik ravishda Node.js serverini ishga tushirib, brauzerda **`http://localhost:8080`** manzilini ochadi.

### 2. Shogirdlar va Chevarlar telefonida ochish (Wi-Fi):
1. Telefonlar va kompyuter bitta Wi-Fi tarmog‘iga ulangan bo‘lsin.
2. Brauzerda quyidagi manzilni oching:
   * **`http://10.10.10.100:8080`** (yoki headerdagi **📱 Telefon** tugmasini bosib QR kodni kamerada skanerlang).
3. **PWA ilova sifatida o‘rnatish**:
   * Android (Chrome) va iPhone (Safari) da *"Bosh ekranga qo‘shish"* (Add to Home Screen) tugmasini bosing. Alohida tezkor dastur bo‘lib ochiladi!

---

## 🔐 Multi-User Avtorizatsiya, Telegram Login & Shaxsiy Rejalar

Tizim endi ko‘p foydalanuvchili to‘liq ekotizimga aylandi:

### 1. ✈️ Telegram orqali Kirish (1-klikda yoki Kod bilan):
* Xodimlar (Boshliq, Shogirdlar, Chevarlar) Telegram botga kirib **`/login`** buyrug‘ini yuboradi.
* Bot ularga 6 xonali bir martalik kod va **to‘g‘ridan-to‘g‘ri telefonida ochiladigan havola** (`http://10.10.10.100:8080/?auth=123456`) beradi.
* Havolani bitta bosish bilan tizimga o‘z profili bilan kiradi!

### 2. 👤 Xodimni Tanlash & Tezkor PIN Kod:
* Veb-ilovaning yuqori o‘ng burchagidagi profil tugmasini bosib, ro‘yxatdan o‘z ismini tanlaydi:
  * 👑 **Bosh Konstruktor (Siz)**
  * 📐 **Dilnoza Aliyeva** (Yordamchi Konstruktor - Shogird)
  * 📏 **Kamola Rustamova** (Yordamchi Konstruktor - Shogird)
  * 🪡 **Malika Usmonova** (Modelxona Usta Chevari)
  * 🧵 **Shahnoza Karimova** (Namuna Tikuvchi Chevar)
  * ✂️ **Nigora Fayzullayeva** (Namuna Tikuvchi Chevar)
* 4 xonali PIN kod (standart: `1234`) orqali xavfsiz kiradi.

### 3. 📅 Har bir Xodimning O‘z Shaxsiy Kun Rejasi (Plani):
* Har bir shogird va chevar o‘z hisobiga kirganda, uning **O‘Z SHAXSIY KUN TARTIBI** ochiladi!
* Boshliqning shaxsiy ishlari shogirdlarga aralashmaydi, har kim o‘zining bugungi rejasi va vazifalariga ega.

### 4. 📥 Vazifani Qabul Qilish va 🔴 BAND (Busy) Holati:
1. **Kelib tushgan vazifalar**: Boshliq yangi namuna biriktirganda, shogird yoki chevarning ekranida vazifa chiqadi.
2. **`[📥 Vazifani Qabul Qilish]`**: Tugma bosilganda, vazifa xodimning bugungi soatlar rejasiga (masalan: `09:30 - 13:00`) avtomatik joylashadi va Boshliqqa Telegram orqali bildirishnoma boradi.
3. **`[▶️ Hozir Boshlash]`**: Ish boshlanganda, xodimning holati butun korxona bo‘ylab **`🔴 BAND (Hozir ishlayapti)`** ga o‘tadi va real vaqtda jonli taymer hisoblashni boshlaydi.
4. **`[✅ Bajarildi & Topshirish]`**: Bosqich tugagach, xodim yana **`🟢 BO‘SH (Yangi vazifaga tayyor)`** bo‘ladi va navbatdagi chevar qizga Telegramdan: *"Navbat sizga keldi, tikishni boshlashingiz mumkin!"* deb xabar yuboriladi!

---

## 🏢 Korporativ Modelxona & Bosh Konstruktor Markazi

Yuqori headerdagi **`🏢 Modelxona Rejimi`** tugmasini bosish orqali korporativ boshqaruvga o‘tasiz:

### 1. 🧮 Aqlli Tayyor Bo‘lish Muddati Kalkulyatori (Lead Time & Queue Engine):
* Har qanday yangi buyurtma (zakaz) yoki namuna modeli tushganda:
  1. *1-bosqich: Andaza & Gradatsiya (Lekalo)* — biriktirilgan shogird / yordamchi konstruktor.
  2. *2-bosqich: Bichish & Tayyorlov* — yordamchi konstruktor.
  3. *3-bosqich: Namuna tikish* — modelxona usta chevari.
  4. *4-bosqich: Primera & Bosh tekshiruv* — Bosh konstruktor.
* **Algoritm qanday hisoblaydi?**
  * Tizim biriktirilayotgan xodimning qo‘lida ayni paytda qanday ishlar borligini tekshiradi!
  * Oldingi barcha navbatdagi ishlarning qolgan soatlarini yig‘adi.
  * Korxonaning asosiy ish vaqtini (08:00 dan 17:10 gacha), tushlik (abet) tanaffusini (11:00–12:00) va ish kunlarini (Dushanba–Shanba) hisobga oladi.
  * Shoshilinch zakazlar uchun **Yakshanba kunini ish kuni qilish** va **Qo‘shimcha smena (18:00–21:20)** parametrlarini qo‘llash imkoniyati mavjud.
  * **Mijoz tomonidan so‘ralgan muddat (Dedlayn)** bilan solishtirib, ulgurish yoki kechikish xavfini darhol tahlil qiladi.
  * Texnik tuzatishlar va kutilmagan holatlar uchun **+15% xavfsizlik buferini** qo‘shadi.
  * Natijada buyurtmachi va rahbariyatga aytishingiz mumkin bo‘lgan **ANIQ TAYYOR BO‘LISH SANASI VA SOATINI (ETA)** chiqarib beradi:
    > *«Dilnoza andazani 05-Oktabr 10:00 da boshlab, 15:30 da tayyorlaydi. Malika chevar oldingi kostyumni topshirgach, ushbu modelni 06-Oktabr 10:40 da boshlaydi va 07-Oktabr 09:56 da to‘liq tikib topshiradi. Buyurtmachiga aytish muddati: 07-Oktabr soat 10:00.»*

### 2. 👗 Namunaviy Zakazlar Doskasi (Pipeline / Kanban):
* Barcha buyurtmalarning real vaqtdagi holati, qaysi xodimning qo‘lida ekanligi va bosqichma-bosqich bajarilishi.
* **`[▶️ Boshlash]`** va **`[✅ Bajarildi]`** tugmalari orqali bosqich yakunlanganda, tizim avtomatik ravishda keyingi xodimga vazifani uzatadi va bosh konstruktorga xabar beradi!

### 3. 👥 Xodimlar Bandligi & Navbat Taxtasi (Capacity Tracker):
* Yordamchi konstruktorlar (Dilnoza, Kamola) va Modelxona chevarlari (Malika, Shahnoza, Nigora):
  * Ayni daqiqada qaysi namuna ustida ishlayotgani.
  * Navbatida nechta ish va necha soatlik yuklama borligi.
  * Qachon to‘liq bo‘shashi va yangi ish qabul qila olishi.
  * Rangli status: 🔴 Ish jarayonida | 🟡 Navbatda ish bor | 🟢 Bo‘sh (Tayyor).

### 4. 👷‍♀️ Xodim Portali (Shogirdlar va Chevarlar uchun):
* Xodim o‘z telefonida o‘z ismini tanlaganda (masalan, *Malika Usmonova — Chevar*):
  * Faqat o‘ziga tegishli faol va navbatdagi ishlar chiqadi.
  * Bitta tugma bilan: **`[▶️ Tikishni boshladim]`** yoki **`[✅ Tikib bo‘ldim (Topshirish)]`**.
  * Ortiqcha murakkabliksiz, qulay va sodda mobil interfeys!

---

## 🤖 Ikki Tomonlama Telegram Bot

Sozlamalar bo‘limida Telegram bot tokeningizni kiriting. Bot orqali quyidagi buyruqlar ishlaydi:
* **`/zakazlar`** — Modelxonadagi barcha faol namunalar, hozir kim tikayotgani va tayyor bo‘lish sanalari (ETA).
* **`/xodimlar`** — Xodimlarning ayni damdagi bandlik holati.
* **`/bugun`** — Shaxsiy kunlik vazifalar ro‘yxati va inline tugmalar bilan bajarish.
* **`/reja 16:30 Hisobot`** — To‘g‘ridan-to‘g‘ri Telegramdan yangi vazifa qo‘shish.
* **`/odatlar`** — Kunlik odatlarni tekshirish va belgilash.
* **`/statistika`** — Kunlik unumdorlik foizi.
* **`/avtopilot`** — Kechikkan ishlarni bo‘sh vaqtlarga avtomatik surish.

---

## 📊 Haftalik, Oylik Kalendar & Chuqur Statistika

* **📅 Kunlik**: Real-vaqt qizil nina (laser needle) va 24 soatlik timeline.
* **📆 Haftalik**: 7 kunlik interaktiv ustunlar (Dushanbadan Yakshanbagacha vazifalar taqsimoti va foizlar).
* **🗓️ Oylik**: 30-31 kunlik to‘liq kalendar to‘ri, har bir kunda qancha namuna/reja borligi rangli nuqtalar bilan.
* **📊 Tahlil & Statistika**:
  * 7 va 30 kunlik samaradorlik grafigi (SVG gradientli Area chart).
  * Kategoriya vaqtlari bo‘yicha Donut diagramma.
  * Sermahsul soatlar tahlili (Heatmap).
  * Odatlar streak rekordlari va AI xulosalari.

---

## 🧘 Shaxsiy Rejim Imkoniyatlari

* **Dual-Brain AI**: Offline o‘zbekcha qoidalar algoritmi + Google Gemini neyrotarmog‘i.
* **Pomodoro Fokus Taymeri**: 25m fokus, 5m/15m tanaffus, fon uchun sokin yomg‘ir (Rain) va shovqin (White Noise) ohanglari.
* **Professional Bildirishnomalar**: 5 daqiqa oldin, vaqtida va 15 daqiqa kechikkanida Web Audio va Push xabarnomalari.
* **Tezkor Tugmalar**: `Ctrl + K` (AI yordamchi), `N` (Yangi vazifa), `H` (Odat), `P` (Pomodoro), `Ctrl + P` (Chop etish/PDF).
