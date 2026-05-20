require("dotenv").config();

module.exports = {
  // Bot Token dari @BotFather
  BOT_TOKEN: process.env.BOT_TOKEN,

  // Telegram API credentials dari https://my.telegram.org
  API_ID: parseInt(process.env.API_ID),
  API_HASH: process.env.API_HASH,

  // Owner ID - hanya user ini yang bisa menggunakan bot
  OWNER_ID: parseInt(process.env.OWNER_ID),

  // Direktori untuk menyimpan file sesi
  SESSIONS_DIR: "./sessions",
};
