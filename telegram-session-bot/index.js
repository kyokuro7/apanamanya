const bot = require("./botHandler");
const config = require("./config");

// Validasi konfigurasi
if (!config.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN belum diatur di file .env");
  process.exit(1);
}
if (!config.API_ID || !config.API_HASH) {
  console.error("❌ API_ID dan API_HASH belum diatur di file .env");
  process.exit(1);
}
if (!config.OWNER_ID) {
  console.error("❌ OWNER_ID belum diatur di file .env");
  process.exit(1);
}

// Launch bot
bot.launch().then(() => {
  console.log("✅ Bot berhasil dijalankan!");
  console.log(`📋 Owner ID: ${config.OWNER_ID}`);
  console.log(`📂 Sessions dir: ${config.SESSIONS_DIR}`);
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
