#!/bin/bash
# IntelliDay - Google Compute Engine 1-Click Server Setup Script
set -e

echo "============================================================"
echo "   🌟 IntelliDay Serverini O'rnatish & Ishga Tushirish       "
echo "============================================================"

# 1. Update system packages
echo "📦 1. Tizim paketlari yangilanmoqda..."
sudo apt update -y
sudo apt install -y curl unzip git ufw

# 2. Install Node.js 20 LTS (if not installed)
if ! command -v node &> /dev/null; then
    echo "🟢 2. Node.js 20 LTS o'rnatilmoqda..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "✅ Node.js allaqachon o'rnatilgan: $(node -v)"
fi

# 3. Install PM2 process manager
if ! command -v pm2 &> /dev/null; then
    echo "⚡ 3. PM2 Process Manager o'rnatilmoqda..."
    sudo npm install -g pm2
fi

# 4. Configure Firewall to allow port 80, 443, 8080
echo "🛡️ 4. Xavfsizlik devori (Firewall) sozlanmoqda..."
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 8080/tcp || true
sudo ufw --force enable || true

# 5. Start IntelliDay server via PM2
echo "🚀 5. IntelliDay serveri 24/7 orqa fonda ishga tushirilmoqda..."
pm2 delete intelliday 2>/dev/null || true
pm2 start server.js --name "intelliday" --time

# 6. Save PM2 configuration for auto-restart on VM reboot
echo "💾 6. Server qayta yonganda avtomatik yonish sozlanmoqda..."
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

echo ""
echo "============================================================"
echo "   🎉 MUVAFFAQITYATLI O'RNATILDI VA ISHGA TUSHIRILDI!      "
echo "============================================================"
echo "  📌 Server holatini ko'rish: pm2 status"
echo "  📋 Jonli loglarni ko'rish:  pm2 logs intelliday"
echo "  🔄 Qayta ishga tushirish:   pm2 restart intelliday"
echo "============================================================"
