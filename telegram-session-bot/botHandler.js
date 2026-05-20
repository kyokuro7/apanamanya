const { Telegraf, Markup } = require("telegraf");
const config = require("./config");
const sessionManager = require("./sessionManager");

const bot = new Telegraf(config.BOT_TOKEN);

// State conversation per user
const userStates = new Map();

// Middleware: hanya owner yang bisa pakai bot
bot.use((ctx, next) => {
  if (ctx.from && ctx.from.id !== config.OWNER_ID) {
    return ctx.reply("⛔ Akses ditolak. Bot ini hanya untuk owner.");
  }
  return next();
});

// ==================== COMMAND /start ====================
bot.start((ctx) => {
  userStates.delete(ctx.from.id);
  return ctx.reply(
    "🤖 *Selamat datang di Session Manager Bot!*\n\n" +
      "Bot ini membantu kamu mengelola sesi akun Telegram.\n\n" +
      "Pilih menu di bawah:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ Tambah Akun", "add_account")],
        [Markup.button.callback("📋 Daftar Akun", "list_accounts")],
        [Markup.button.callback("🗑 Hapus Akun", "delete_account")],
      ]),
    }
  );
});

// ==================== MENU UTAMA ====================
bot.action("main_menu", (ctx) => {
  userStates.delete(ctx.from.id);
  return ctx.editMessageText(
    "🤖 *Session Manager Bot*\n\nPilih menu di bawah:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ Tambah Akun", "add_account")],
        [Markup.button.callback("📋 Daftar Akun", "list_accounts")],
        [Markup.button.callback("🗑 Hapus Akun", "delete_account")],
      ]),
    }
  );
});

// ==================== TAMBAH AKUN ====================
bot.action("add_account", (ctx) => {
  userStates.set(ctx.from.id, { step: "waiting_phone" });
  return ctx.editMessageText(
    "📱 *Tambah Akun Baru*\n\n" +
      "Masukkan nomor telepon akun yang ingin ditambahkan.\n" +
      "Format: `+628xxxxxxxxxx`",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "main_menu")],
      ]),
    }
  );
});

// ==================== DAFTAR AKUN ====================
bot.action("list_accounts", async (ctx) => {
  const sessions = sessionManager.getAllSessions();

  if (sessions.length === 0) {
    return ctx.editMessageText(
      "📋 *Daftar Akun*\n\n" + "Belum ada akun yang tersimpan.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Akun", "add_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      }
    );
  }

  let text = "📋 *Daftar Akun Tersimpan:*\n\n";
  sessions.forEach((s, i) => {
    const name = s.info.firstName
      ? `${s.info.firstName} ${s.info.lastName || ""}`.trim()
      : "Unknown";
    const username = s.info.username ? `@${s.info.username}` : "-";
    text += `${i + 1}. *${name}*\n`;
    text += `   📞 \`${s.phone}\`\n`;
    text += `   👤 ${username}\n`;
    text += `   📅 ${new Date(s.createdAt).toLocaleDateString("id-ID")}\n\n`;
  });

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("◀️ Kembali", "main_menu")],
    ]),
  });
});

// ==================== HAPUS AKUN ====================
bot.action("delete_account", (ctx) => {
  const sessions = sessionManager.getAllSessions();

  if (sessions.length === 0) {
    return ctx.editMessageText(
      "🗑 *Hapus Akun*\n\nBelum ada akun yang tersimpan.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      }
    );
  }

  const buttons = sessions.map((s) => {
    const name = s.info.firstName || s.phone;
    return [Markup.button.callback(`🗑 ${name} (${s.phone})`, `confirm_delete_${s.phone}`)];
  });
  buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

  return ctx.editMessageText("🗑 *Pilih akun yang ingin dihapus:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// Konfirmasi hapus
bot.action(/^confirm_delete_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  return ctx.editMessageText(
    `⚠️ *Yakin ingin menghapus sesi untuk* \`${phone}\`?\n\nAksi ini tidak bisa dibatalkan.`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Ya, Hapus", `do_delete_${phone}`)],
        [Markup.button.callback("❌ Batal", "delete_account")],
      ]),
    }
  );
});

// Eksekusi hapus
bot.action(/^do_delete_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  const deleted = sessionManager.deleteSession(phone);

  if (deleted) {
    return ctx.editMessageText(`✅ Sesi untuk \`${phone}\` berhasil dihapus.`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Kembali", "main_menu")],
      ]),
    });
  } else {
    return ctx.editMessageText(`❌ Gagal menghapus sesi untuk \`${phone}\`.`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Kembali", "main_menu")],
      ]),
    });
  }
});

// ==================== HANDLE TEXT INPUT ====================
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state) {
    // Tidak ada state, tampilkan menu
    return ctx.reply("Ketik /start untuk memulai.");
  }

  const text = ctx.message.text.trim();

  // ---------- STEP: Waiting Phone ----------
  if (state.step === "waiting_phone") {
    // Validasi format nomor
    if (!/^\+?\d{10,15}$/.test(text.replace(/\s/g, ""))) {
      return ctx.reply(
        "❌ Format nomor tidak valid.\nGunakan format: `+628xxxxxxxxxx`",
        { parse_mode: "Markdown" }
      );
    }

    const phone = text.startsWith("+") ? text : `+${text}`;

    await ctx.reply(`📤 Mengirim kode OTP ke \`${phone}\`...`, {
      parse_mode: "Markdown",
    });

    try {
      const loginData = await sessionManager.startLogin(phone);
      userStates.set(userId, {
        step: "waiting_otp",
        ...loginData,
      });

      return ctx.reply(
        "✅ Kode OTP telah dikirim!\n\n" +
          "📩 Masukkan kode OTP yang kamu terima di Telegram akun tersebut.\n\n" +
          "_Contoh: `12345`_",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("❌ Batal", "cancel_login")],
          ]),
        }
      );
    } catch (err) {
      userStates.delete(userId);
      const errorMsg = err.errorMessage || err.message || "Unknown error";
      return ctx.reply(
        `❌ Gagal mengirim OTP:\n\`${errorMsg}\`\n\nSilakan coba lagi.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Coba Lagi", "add_account")],
            [Markup.button.callback("◀️ Kembali", "main_menu")],
          ]),
        }
      );
    }
  }

  // ---------- STEP: Waiting OTP ----------
  if (state.step === "waiting_otp") {
    const code = text.replace(/\s/g, "");

    await ctx.reply("🔐 Memverifikasi kode OTP...");

    try {
      const result = await sessionManager.verifyCode(state, code);

      if (result.success) {
        // Login berhasil tanpa 2FA
        const info = await getAccountInfoFromClient(state.client);
        sessionManager.saveSession(state.phone, result.session, info);

        // Disconnect client
        await state.client.disconnect();
        userStates.delete(userId);

        return ctx.reply(
          "✅ *Akun berhasil ditambahkan!*\n\n" +
            `📞 Nomor: \`${state.phone}\`\n` +
            `👤 Nama: ${info.firstName || "-"} ${info.lastName || ""}\n` +
            `🆔 Username: ${info.username ? "@" + info.username : "-"}`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("◀️ Menu Utama", "main_menu")],
            ]),
          }
        );
      } else if (result.needPassword) {
        // Perlu 2FA password
        userStates.set(userId, {
          ...state,
          step: "waiting_password",
        });

        return ctx.reply(
          "🔒 *Akun ini memiliki Two-Factor Authentication (2FA)*\n\n" +
            "Masukkan password 2FA kamu:",
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("❌ Batal", "cancel_login")],
            ]),
          }
        );
      } else {
        return ctx.reply(
          `❌ Kode OTP salah atau expired:\n\`${result.error}\`\n\nCoba masukkan ulang kode OTP:`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err) {
      return ctx.reply(
        `❌ Error: \`${err.message}\`\n\nCoba masukkan ulang kode OTP:`,
        { parse_mode: "Markdown" }
      );
    }
  }

  // ---------- STEP: Waiting Password (2FA) ----------
  if (state.step === "waiting_password") {
    await ctx.reply("🔐 Memverifikasi password 2FA...");

    // Hapus pesan password user untuk keamanan
    try {
      await ctx.deleteMessage(ctx.message.message_id);
    } catch (e) {
      // Mungkin bot tidak punya permission hapus pesan
    }

    try {
      const result = await sessionManager.verifyPassword(state, text);

      if (result.success) {
        const info = await getAccountInfoFromClient(state.client);
        sessionManager.saveSession(state.phone, result.session, info);

        await state.client.disconnect();
        userStates.delete(userId);

        return ctx.reply(
          "✅ *Akun berhasil ditambahkan!*\n\n" +
            `📞 Nomor: \`${state.phone}\`\n` +
            `👤 Nama: ${info.firstName || "-"} ${info.lastName || ""}\n` +
            `🆔 Username: ${info.username ? "@" + info.username : "-"}`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("◀️ Menu Utama", "main_menu")],
            ]),
          }
        );
      } else {
        return ctx.reply(
          `❌ Password salah:\n\`${result.error}\`\n\nCoba masukkan ulang password:`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err) {
      return ctx.reply(
        `❌ Error: \`${err.message}\`\n\nCoba masukkan ulang password:`,
        { parse_mode: "Markdown" }
      );
    }
  }
});

// ==================== CANCEL LOGIN ====================
bot.action("cancel_login", async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  // Disconnect client jika ada
  if (state && state.client) {
    try {
      await state.client.disconnect();
    } catch (e) {}
  }

  userStates.delete(userId);

  return ctx.editMessageText("❌ Proses login dibatalkan.", {
    ...Markup.inlineKeyboard([
      [Markup.button.callback("◀️ Menu Utama", "main_menu")],
    ]),
  });
});

// ==================== HELPER ====================
async function getAccountInfoFromClient(client) {
  try {
    const me = await client.getMe();
    return {
      id: me.id.toString(),
      firstName: me.firstName || "",
      lastName: me.lastName || "",
      username: me.username || "",
      phone: me.phone || "",
    };
  } catch (err) {
    return {};
  }
}

module.exports = bot;
