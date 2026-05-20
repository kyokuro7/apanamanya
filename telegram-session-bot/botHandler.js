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
        [Markup.button.callback("📢 Broadcast", "broadcast_menu")],
        [Markup.button.callback("🔍 Cek Session", "check_session")],
        [Markup.button.callback("🗑 Hapus Session", "manage_session")],
        [Markup.button.callback("💾 Backup & Pulihkan", "backup_restore")],
        [Markup.button.callback("❌ Hapus Akun", "delete_account")],
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
        [Markup.button.callback("📢 Broadcast", "broadcast_menu")],
        [Markup.button.callback("🔍 Cek Session", "check_session")],
        [Markup.button.callback("🗑 Hapus Session", "manage_session")],
        [Markup.button.callback("💾 Backup & Pulihkan", "backup_restore")],
        [Markup.button.callback("❌ Hapus Akun", "delete_account")],
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
  const buttons = [];

  sessions.forEach((s, i) => {
    const name = s.info.firstName
      ? `${s.info.firstName} ${s.info.lastName || ""}`.trim()
      : "Unknown";
    const id = s.info.id || "-";
    const username = s.info.username ? `@${s.info.username}` : "-";
    text += `${i + 1}. *${name}* | ID: \`${id}\`\n`;
    text += `   📞 \`${s.phone}\` | 👤 ${username}\n\n`;

    // Button per akun dengan ID
    const btnLabel = `🆔 ${id} - ${name}`;
    buttons.push([Markup.button.callback(btnLabel, `acc_manage_${s.phone}`)]);
  });

  buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

  return ctx.editMessageText(text + "\n_Tekan akun untuk mengelola:_", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// ==================== KELOLA AKUN (per akun) ====================
bot.action(/^acc_manage_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];
  const sessions = sessionManager.getAllSessions();
  const account = sessions.find((s) => s.phone === phone);

  if (!account) {
    return ctx.editMessageText("❌ Akun tidak ditemukan.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "list_accounts")]]),
    });
  }

  const name = account.info.firstName
    ? `${account.info.firstName} ${account.info.lastName || ""}`.trim()
    : "Unknown";
  const id = account.info.id || "-";
  const username = account.info.username ? `@${account.info.username}` : "-";

  // Ambil info password & email dari data tersimpan
  const savedPassword = account.info.password || "-";
  const savedEmail = account.info.email || "-";
  const limitStatus = account.info.isLimited === true
    ? "Limit ❗️"
    : account.info.isLimited === false
    ? "Aman ✅"
    : "Belum dicek";

  return ctx.editMessageText(
    `⚙️ *Kelola Akun*\n\n` +
      `🆔 ID: \`${id}\`\n` +
      `👤 Nama: *${name}*\n` +
      `📞 Nomor: \`${phone}\`\n` +
      `🔗 Username: ${username}\n` +
      `🔑 Password: \`${savedPassword}\`\n` +
      `📨 Surel: \`${savedEmail}\`\n` +
      `⚠️ Limit: ${limitStatus}\n\n` +
      `Pilih aksi:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔐 Kelola Password 2FA", `acc_2fa_${phone}`)],
        [Markup.button.callback("📧 Kelola Email Recovery", `acc_email_${phone}`)],
        [Markup.button.callback("🔄 Cek Limit", `acc_checklimit_${phone}`)],
        [Markup.button.callback("◀️ Kembali", "list_accounts")],
      ]),
    }
  );
});

// ==================== KELOLA PASSWORD 2FA ====================
bot.action(/^acc_2fa_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText("⏳ Mengecek status 2FA...", { parse_mode: "Markdown" });

  const status = await sessionManager.check2FAStatus(phone);

  if (!status.success) {
    return ctx.editMessageText(
      `❌ Gagal cek status 2FA:\n\`${status.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)]]),
      }
    );
  }

  let text = `🔐 *Password 2FA*\n\n📞 Akun: \`${phone}\`\n\n`;
  text += `Status: ${status.hasPassword ? "✅ Aktif" : "❌ Tidak Aktif"}\n`;
  if (status.hasPassword && status.hint) {
    text += `Hint: \`${status.hint}\`\n`;
  }
  if (status.hasRecoveryEmail) {
    text += `Email: ✅ Tersedia\n`;
  }
  text += `\nPilih aksi:`;

  const buttons = [];
  if (status.hasPassword) {
    buttons.push([Markup.button.callback("🔄 Ganti Password", `acc_pw_change_${phone}`)]);
    buttons.push([Markup.button.callback("🗑 Hapus Password", `acc_pw_remove_${phone}`)]);
  } else {
    buttons.push([Markup.button.callback("➕ Tambah Password", `acc_pw_add_${phone}`)]);
  }
  buttons.push([Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)]);

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// --- Ganti Password ---
bot.action(/^acc_pw_change_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  userStates.set(ctx.from.id, { step: "pw_change_old", phone });

  return ctx.editMessageText(
    `🔄 *Ganti Password 2FA*\n\n📞 Akun: \`${phone}\`\n\nMasukkan password *lama*:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", `acc_2fa_${phone}`)]]),
    }
  );
});

// --- Hapus Password ---
bot.action(/^acc_pw_remove_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  userStates.set(ctx.from.id, { step: "pw_remove", phone });

  return ctx.editMessageText(
    `🗑 *Hapus Password 2FA*\n\n📞 Akun: \`${phone}\`\n\n⚠️ Masukkan password saat ini untuk konfirmasi:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", `acc_2fa_${phone}`)]]),
    }
  );
});

// --- Tambah Password ---
bot.action(/^acc_pw_add_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  userStates.set(ctx.from.id, { step: "pw_add_new", phone });

  return ctx.editMessageText(
    `➕ *Tambah Password 2FA*\n\n📞 Akun: \`${phone}\`\n\nMasukkan password baru:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", `acc_2fa_${phone}`)]]),
    }
  );
});

// ==================== KELOLA EMAIL ====================
bot.action(/^acc_email_(?!set_)(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText("⏳ Mengecek status email...", { parse_mode: "Markdown" });

  const status = await sessionManager.check2FAStatus(phone);

  if (!status.success) {
    return ctx.editMessageText(
      `❌ Gagal cek status:\n\`${status.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)]]),
      }
    );
  }

  if (!status.hasPassword) {
    return ctx.editMessageText(
      `📧 *Email Recovery*\n\n📞 Akun: \`${phone}\`\n\n` +
        `⚠️ Akun ini belum punya password 2FA.\n` +
        `Tambahkan password 2FA terlebih dahulu sebelum bisa mengatur email.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Password", `acc_pw_add_${phone}`)],
          [Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)],
        ]),
      }
    );
  }

  let text = `📧 *Email Recovery*\n\n📞 Akun: \`${phone}\`\n\n`;
  text += `Status: ${status.hasRecoveryEmail ? "✅ Sudah diatur" : "❌ Belum diatur"}\n`;
  text += `\nTekan tombol di bawah untuk mengatur email recovery.\n`;
  text += `_Kamu perlu memasukkan password 2FA untuk mengubah email._`;

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("📧 Tambah/Ubah Email", `acc_email_set_${phone}`)],
      [Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)],
    ]),
  });
});

// --- Set Email ---
bot.action(/^acc_email_set_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  userStates.set(ctx.from.id, { step: "email_pw", phone });

  return ctx.editMessageText(
    `📧 *Ubah Email Recovery*\n\n📞 Akun: \`${phone}\`\n\nMasukkan password 2FA kamu:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", `acc_email_${phone}`)]]),
    }
  );
});

// ==================== CEK LIMIT ====================
bot.action(/^acc_checklimit_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText(`⏳ Mengirim /start ke @SpamBot untuk \`${phone}\`...`, {
    parse_mode: "Markdown",
  });

  const result = await sessionManager.checkSpamLimit(phone);

  if (!result.success) {
    return ctx.editMessageText(
      `❌ Gagal cek limit:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)]]),
      }
    );
  }

  // Tampilkan pesan dari SpamBot dan button konfirmasi manual
  const autoStatus = result.isLimited ? "Limit ❗️" : "Aman ✅";

  return ctx.editMessageText(
    `🤖 *Balasan dari @SpamBot:*\n\n` +
      `\`\`\`\n${result.message}\n\`\`\`\n\n` +
      `📊 Auto-detect: *${autoStatus}*\n\n` +
      `_Konfirmasi status limit:_`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("Aman ✅", `set_limit_safe_${phone}`)],
        [Markup.button.callback("Limit ❗️", `set_limit_yes_${phone}`)],
        [Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)],
      ]),
    }
  );
});

// Set limit status: Aman
bot.action(/^set_limit_safe_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  sessionManager.updateSessionInfo(phone, { isLimited: false });

  return ctx.editMessageText("✅ Status limit diatur: *Aman ✅*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)]]),
  });
});

// Set limit status: Limit
bot.action(/^set_limit_yes_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  sessionManager.updateSessionInfo(phone, { isLimited: true });

  return ctx.editMessageText("❗️ Status limit diatur: *Limit ❗️*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_manage_${phone}`)]]),
  });
});

// ==================== BROADCAST ====================
bot.action("broadcast_menu", (ctx) => {
  const sessions = sessionManager.getAllSessions();

  if (sessions.length === 0) {
    return ctx.editMessageText(
      "📢 *Broadcast*\n\nBelum ada akun yang tersimpan.\nTambahkan akun terlebih dahulu.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Akun", "add_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      }
    );
  }

  return ctx.editMessageText(
    "📢 *Broadcast Menu*\n\n" +
      `📊 Total akun tersedia: *${sessions.length}*\n\n` +
      "Pilih mode broadcast:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📨 Kirim Pesan (Semua Akun)", "bc_all_text")],
        [Markup.button.callback("☝️ Kirim Pesan (Pilih Akun)", "bc_select_text")],
        [Markup.button.callback("🔀 Forward Pesan (Semua Akun)", "bc_all_forward")],
        [Markup.button.callback("⚙️ Pengaturan Delay", "bc_settings")],
        [Markup.button.callback("◀️ Kembali", "main_menu")],
      ]),
    }
  );
});

// --- Broadcast Settings (Delay) ---
bot.action("bc_settings", (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);
  const currentDelay = (state && state.broadcastDelay) || 3000;

  return ctx.editMessageText(
    `⚙️ *Pengaturan Broadcast*\n\n` +
      `⏱ Delay saat ini: *${currentDelay / 1000} detik*\n\n` +
      `Delay adalah jeda antar pengiriman pesan untuk menghindari flood limit.\n\n` +
      `Pilih delay:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("1 dtk", "bc_delay_1000"),
          Markup.button.callback("2 dtk", "bc_delay_2000"),
          Markup.button.callback("3 dtk", "bc_delay_3000"),
        ],
        [
          Markup.button.callback("5 dtk", "bc_delay_5000"),
          Markup.button.callback("7 dtk", "bc_delay_7000"),
          Markup.button.callback("10 dtk", "bc_delay_10000"),
        ],
        [Markup.button.callback("✏️ Custom (ketik sendiri)", "bc_delay_custom")],
        [Markup.button.callback("◀️ Kembali", "broadcast_menu")],
      ]),
    }
  );
});

// Set delay dari button
bot.action(/^bc_delay_(\d+)$/, (ctx) => {
  const delay = parseInt(ctx.match[1]);
  const userId = ctx.from.id;
  const state = userStates.get(userId) || {};
  userStates.set(userId, { ...state, broadcastDelay: delay });

  return ctx.editMessageText(
    `✅ Delay broadcast diatur ke *${delay / 1000} detik*`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Kembali", "bc_settings")],
        [Markup.button.callback("◀️ Broadcast Menu", "broadcast_menu")],
      ]),
    }
  );
});

// Custom delay
bot.action("bc_delay_custom", (ctx) => {
  userStates.set(ctx.from.id, { step: "bc_custom_delay" });
  return ctx.editMessageText(
    "⏱ *Custom Delay*\n\nMasukkan delay dalam *detik* (angka):\n\n_Contoh: `5` untuk 5 detik_",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "bc_settings")],
      ]),
    }
  );
});

// --- BROADCAST: Kirim Pesan ke Semua Akun ---
bot.action("bc_all_text", (ctx) => {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    return ctx.editMessageText("❌ Tidak ada akun tersimpan.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  userStates.set(ctx.from.id, {
    step: "bc_target",
    mode: "all_text",
    phones: sessions.map((s) => s.phone),
  });

  return ctx.editMessageText(
    "📨 *Broadcast ke Semua Akun*\n\n" +
      `📊 Akun yang akan digunakan: *${sessions.length}*\n\n` +
      "Masukkan *target* tujuan pesan:\n" +
      "- Username: `@username`\n" +
      "- Group/Channel: `@groupname`\n" +
      "- User ID: `123456789`\n" +
      "- Invite Link: `https://t.me/+xxxxx`",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "broadcast_menu")],
      ]),
    }
  );
});

// --- BROADCAST: Pilih Akun ---
bot.action("bc_select_text", (ctx) => {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    return ctx.editMessageText("❌ Tidak ada akun tersimpan.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  // Inisialisasi state pemilihan akun
  const userId = ctx.from.id;
  const prevState = userStates.get(userId) || {};
  userStates.set(userId, {
    ...prevState,
    step: "bc_selecting_accounts",
    mode: "select_text",
    selectedPhones: [],
    availablePhones: sessions.map((s) => ({ phone: s.phone, name: s.info.firstName || s.phone })),
  });

  const buttons = sessions.map((s) => {
    const name = s.info.firstName
      ? `${s.info.firstName} ${s.info.lastName || ""}`.trim()
      : s.phone;
    return [Markup.button.callback(`⬜ ${name} (${s.phone})`, `bc_toggle_${s.phone}`)];
  });

  buttons.push([Markup.button.callback("✅ Pilih Semua", "bc_select_all")]);
  buttons.push([Markup.button.callback("📨 Lanjut Kirim", "bc_select_done")]);
  buttons.push([Markup.button.callback("❌ Batal", "broadcast_menu")]);

  return ctx.editMessageText(
    "☝️ *Pilih Akun untuk Broadcast*\n\n" +
      "Tap akun untuk memilih/batal pilih.\n" +
      "Tekan *Lanjut Kirim* setelah selesai memilih.\n\n" +
      `_Dipilih: 0 dari ${sessions.length}_`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

// Toggle pilih akun
bot.action(/^bc_toggle_(.+)$/, (ctx) => {
  const phone = ctx.match[1];
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state || state.step !== "bc_selecting_accounts") {
    return ctx.editMessageText("❌ Sesi berakhir. Silakan mulai ulang.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  // Toggle phone dalam selectedPhones
  const idx = state.selectedPhones.indexOf(phone);
  if (idx > -1) {
    state.selectedPhones.splice(idx, 1);
  } else {
    state.selectedPhones.push(phone);
  }
  userStates.set(userId, state);

  // Re-render buttons
  const sessions = sessionManager.getAllSessions();
  const buttons = sessions.map((s) => {
    const name = s.info.firstName
      ? `${s.info.firstName} ${s.info.lastName || ""}`.trim()
      : s.phone;
    const selected = state.selectedPhones.includes(s.phone) ? "✅" : "⬜";
    return [Markup.button.callback(`${selected} ${name} (${s.phone})`, `bc_toggle_${s.phone}`)];
  });

  buttons.push([Markup.button.callback("✅ Pilih Semua", "bc_select_all")]);
  buttons.push([Markup.button.callback("📨 Lanjut Kirim", "bc_select_done")]);
  buttons.push([Markup.button.callback("❌ Batal", "broadcast_menu")]);

  return ctx.editMessageText(
    "☝️ *Pilih Akun untuk Broadcast*\n\n" +
      "Tap akun untuk memilih/batal pilih.\n" +
      "Tekan *Lanjut Kirim* setelah selesai memilih.\n\n" +
      `_Dipilih: ${state.selectedPhones.length} dari ${sessions.length}_`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

// Pilih semua akun
bot.action("bc_select_all", (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state || state.step !== "bc_selecting_accounts") {
    return ctx.editMessageText("❌ Sesi berakhir.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  const sessions = sessionManager.getAllSessions();

  // Jika sudah semua terpilih, deselect semua. Jika belum, pilih semua.
  if (state.selectedPhones.length === sessions.length) {
    state.selectedPhones = [];
  } else {
    state.selectedPhones = sessions.map((s) => s.phone);
  }
  userStates.set(userId, state);

  const buttons = sessions.map((s) => {
    const name = s.info.firstName
      ? `${s.info.firstName} ${s.info.lastName || ""}`.trim()
      : s.phone;
    const selected = state.selectedPhones.includes(s.phone) ? "✅" : "⬜";
    return [Markup.button.callback(`${selected} ${name} (${s.phone})`, `bc_toggle_${s.phone}`)];
  });

  buttons.push([Markup.button.callback("✅ Pilih Semua", "bc_select_all")]);
  buttons.push([Markup.button.callback("📨 Lanjut Kirim", "bc_select_done")]);
  buttons.push([Markup.button.callback("❌ Batal", "broadcast_menu")]);

  return ctx.editMessageText(
    "☝️ *Pilih Akun untuk Broadcast*\n\n" +
      "Tap akun untuk memilih/batal pilih.\n" +
      "Tekan *Lanjut Kirim* setelah selesai memilih.\n\n" +
      `_Dipilih: ${state.selectedPhones.length} dari ${sessions.length}_`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

// Selesai pilih akun, lanjut masukkan target
bot.action("bc_select_done", (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state || state.step !== "bc_selecting_accounts") {
    return ctx.editMessageText("❌ Sesi berakhir.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  if (state.selectedPhones.length === 0) {
    return ctx.answerCbQuery("⚠️ Pilih minimal 1 akun!", { show_alert: true });
  }

  // Lanjut ke input target
  userStates.set(userId, {
    ...state,
    step: "bc_target",
    phones: state.selectedPhones,
  });

  return ctx.editMessageText(
    "📨 *Broadcast (Akun Terpilih)*\n\n" +
      `📊 Akun yang akan digunakan: *${state.selectedPhones.length}*\n\n` +
      "Masukkan *target* tujuan pesan:\n" +
      "- Username: `@username`\n" +
      "- Group/Channel: `@groupname`\n" +
      "- User ID: `123456789`\n" +
      "- Invite Link: `https://t.me/+xxxxx`",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "broadcast_menu")],
      ]),
    }
  );
});

// --- BROADCAST: Forward Pesan ke Semua Akun ---
bot.action("bc_all_forward", (ctx) => {
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 0) {
    return ctx.editMessageText("❌ Tidak ada akun tersimpan.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  userStates.set(ctx.from.id, {
    step: "bc_forward_target",
    mode: "all_forward",
    phones: sessions.map((s) => s.phone),
  });

  return ctx.editMessageText(
    "🔀 *Forward Broadcast (Semua Akun)*\n\n" +
      `📊 Akun yang akan digunakan: *${sessions.length}*\n\n` +
      "Masukkan *target* tujuan forward:\n" +
      "- Username: `@username`\n" +
      "- Group/Channel: `@groupname`\n" +
      "- User ID: `123456789`",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "broadcast_menu")],
      ]),
    }
  );
});

// --- Broadcast Confirm & Execute ---
bot.action("bc_confirm_send", async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state || !state.phones || !state.target || !state.message) {
    return ctx.editMessageText("❌ Data broadcast tidak lengkap.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  const delay = state.broadcastDelay || 3000;
  const totalAccounts = state.phones.length;

  await ctx.editMessageText(
    `⏳ *Broadcast dimulai...*\n\n` +
      `📊 Target: \`${state.target}\`\n` +
      `📨 Akun: ${totalAccounts}\n` +
      `⏱ Delay: ${delay / 1000} detik\n\n` +
      `_Mengirim pesan..._`,
    { parse_mode: "Markdown" }
  );

  const result = await sessionManager.broadcastToTarget(
    state.phones,
    state.target,
    state.message,
    delay
  );

  // Format hasil
  const successCount = result.results.filter((r) => r.success).length;
  const failCount = result.results.filter((r) => !r.success).length;

  let text = `📢 *Hasil Broadcast*\n\n`;
  text += `🎯 Target: \`${state.target}\`\n`;
  text += `✅ Berhasil: *${successCount}*\n`;
  text += `❌ Gagal: *${failCount}*\n\n`;

  if (failCount > 0) {
    text += `*Detail gagal:*\n`;
    result.results
      .filter((r) => !r.success)
      .forEach((r) => {
        text += `- \`${r.phone}\`: ${r.error}\n`;
      });
  }

  userStates.delete(userId);

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("📢 Broadcast Lagi", "broadcast_menu")],
      [Markup.button.callback("◀️ Menu Utama", "main_menu")],
    ]),
  });
});

// --- Broadcast Forward Confirm & Execute ---
bot.action("bc_confirm_forward", async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state || !state.phones || !state.target || !state.forwardFrom || !state.forwardMsgIds) {
    return ctx.editMessageText("❌ Data forward tidak lengkap.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  const delay = state.broadcastDelay || 3000;
  const totalAccounts = state.phones.length;

  await ctx.editMessageText(
    `⏳ *Forward broadcast dimulai...*\n\n` +
      `📊 Target: \`${state.target}\`\n` +
      `📨 Akun: ${totalAccounts}\n` +
      `⏱ Delay: ${delay / 1000} detik\n\n` +
      `_Mem-forward pesan..._`,
    { parse_mode: "Markdown" }
  );

  const result = await sessionManager.broadcastForwardToTarget(
    state.phones,
    state.target,
    state.forwardFrom,
    state.forwardMsgIds,
    delay
  );

  const successCount = result.results.filter((r) => r.success).length;
  const failCount = result.results.filter((r) => !r.success).length;

  let text = `📢 *Hasil Forward Broadcast*\n\n`;
  text += `🎯 Target: \`${state.target}\`\n`;
  text += `✅ Berhasil: *${successCount}*\n`;
  text += `❌ Gagal: *${failCount}*\n\n`;

  if (failCount > 0) {
    text += `*Detail gagal:*\n`;
    result.results
      .filter((r) => !r.success)
      .forEach((r) => {
        text += `- \`${r.phone}\`: ${r.error}\n`;
      });
  }

  userStates.delete(userId);

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("📢 Broadcast Lagi", "broadcast_menu")],
      [Markup.button.callback("◀️ Menu Utama", "main_menu")],
    ]),
  });
});

// Batal broadcast
bot.action("bc_cancel", (ctx) => {
  userStates.delete(ctx.from.id);
  return ctx.editMessageText("❌ Broadcast dibatalkan.", {
    ...Markup.inlineKeyboard([
      [Markup.button.callback("◀️ Broadcast Menu", "broadcast_menu")],
      [Markup.button.callback("◀️ Menu Utama", "main_menu")],
    ]),
  });
});

// Edit pesan broadcast
bot.action("bc_edit_message", (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (!state) {
    return ctx.editMessageText("❌ Sesi berakhir.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
    });
  }

  userStates.set(userId, { ...state, step: "bc_edit_message" });

  return ctx.editMessageText(
    "✏️ *Ubah Pesan Broadcast*\n\nMasukkan pesan baru:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "bc_cancel")],
      ]),
    }
  );
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

// ==================== CEK SESSION ====================
// Pilih akun untuk cek session
bot.action("check_session", (ctx) => {
  const sessions = sessionManager.getAllSessions();

  if (sessions.length === 0) {
    return ctx.editMessageText(
      "🔍 *Cek Session*\n\nBelum ada akun yang tersimpan.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Akun", "add_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      }
    );
  }

  const buttons = sessions.map((s) => {
    const name = s.info.firstName || s.phone;
    return [Markup.button.callback(`🔍 ${name} (${s.phone})`, `do_check_session_${s.phone}`)];
  });
  buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

  return ctx.editMessageText(
    "🔍 *Cek Session*\n\nPilih akun untuk melihat sesi aktifnya:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

// Tampilkan daftar sesi aktif dari akun
bot.action(/^do_check_session_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText(`⏳ Mengambil daftar sesi aktif untuk \`${phone}\`...`, {
    parse_mode: "Markdown",
  });

  const result = await sessionManager.getActiveSessions(phone);

  if (!result.success) {
    return ctx.editMessageText(
      `❌ Gagal mengambil sesi:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "check_session")],
        ]),
      }
    );
  }

  if (result.sessions.length === 0) {
    return ctx.editMessageText("🔍 Tidak ada sesi aktif ditemukan.", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Kembali", "check_session")],
      ]),
    });
  }

  let text = `🔍 *Sesi Aktif untuk* \`${phone}\`\n`;
  text += `📊 Total: ${result.sessions.length} sesi\n\n`;

  result.sessions.forEach((s, i) => {
    const current = s.isCurrent ? " ⭐ (Bot)" : "";
    const activeDate = new Date(s.dateActive * 1000).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    text += `${i + 1}. *${s.appName} ${s.appVersion}*${current}\n`;
    text += `   📱 ${s.deviceModel} (${s.platform})\n`;
    text += `   🌐 ${s.ip} - ${s.country}\n`;
    text += `   🕐 Aktif: ${activeDate}\n\n`;
  });

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("◀️ Kembali", "check_session")],
      [Markup.button.callback("◀️ Menu Utama", "main_menu")],
    ]),
  });
});

// ==================== MANAGE SESSION (HAPUS SESSION) ====================
// Pilih akun untuk manage session
bot.action("manage_session", (ctx) => {
  const sessions = sessionManager.getAllSessions();

  if (sessions.length === 0) {
    return ctx.editMessageText(
      "🗑 *Hapus Session*\n\nBelum ada akun yang tersimpan.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Akun", "add_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      }
    );
  }

  const buttons = sessions.map((s) => {
    const name = s.info.firstName || s.phone;
    return [Markup.button.callback(`⚙️ ${name} (${s.phone})`, `sess_menu_${s.phone}`)];
  });
  buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

  return ctx.editMessageText(
    "🗑 *Hapus Session*\n\nPilih akun yang ingin dikelola sesinya:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    }
  );
});

// Menu opsi hapus session per akun
bot.action(/^sess_menu_(.+)$/, (ctx) => {
  const phone = ctx.match[1];

  return ctx.editMessageText(
    `⚙️ *Kelola Session*\n\n📞 Akun: \`${phone}\`\n\nPilih aksi:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💥 All Session (Hapus Semua Kecuali Bot)", `sess_all_${phone}`)],
        [Markup.button.callback("☝️ One Session (Hapus Satu Sesi)", `sess_one_${phone}`)],
        [Markup.button.callback("🚪 Out Session (Keluarkan Bot)", `sess_out_${phone}`)],
        [Markup.button.callback("◀️ Kembali", "manage_session")],
      ]),
    }
  );
});

// ---------- ALL SESSION: Hapus semua sesi kecuali bot ----------
bot.action(/^sess_all_(.+)$/, (ctx) => {
  const phone = ctx.match[1];

  return ctx.editMessageText(
    `⚠️ *Hapus Semua Session*\n\n` +
      `Akun: \`${phone}\`\n\n` +
      `Ini akan menghapus *SEMUA sesi* akun ini kecuali sesi bot.\n` +
      `Semua device lain akan ter-logout.\n\n` +
      `Yakin?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Ya, Hapus Semua", `do_sess_all_${phone}`)],
        [Markup.button.callback("❌ Batal", `sess_menu_${phone}`)],
      ]),
    }
  );
});

bot.action(/^do_sess_all_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText(`⏳ Menghapus semua sesi lain untuk \`${phone}\`...`, {
    parse_mode: "Markdown",
  });

  const result = await sessionManager.terminateAllOtherSessions(phone);

  if (result.success) {
    return ctx.editMessageText(
      `✅ *Berhasil!*\n\nSemua sesi lain untuk \`${phone}\` telah dihapus.\nHanya sesi bot yang tersisa.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
          [Markup.button.callback("◀️ Menu Utama", "main_menu")],
        ]),
      }
    );
  } else {
    return ctx.editMessageText(
      `❌ Gagal menghapus sesi:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
        ]),
      }
    );
  }
});

// ---------- ONE SESSION: Pilih sesi tertentu untuk dihapus ----------
bot.action(/^sess_one_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText(`⏳ Mengambil daftar sesi untuk \`${phone}\`...`, {
    parse_mode: "Markdown",
  });

  const result = await sessionManager.getActiveSessions(phone);

  if (!result.success) {
    return ctx.editMessageText(
      `❌ Gagal mengambil sesi:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
        ]),
      }
    );
  }

  // Filter: hanya tampilkan sesi yang bukan current (bukan sesi bot)
  const otherSessions = result.sessions.filter((s) => !s.isCurrent);

  if (otherSessions.length === 0) {
    return ctx.editMessageText(
      "☝️ *Hapus Satu Sesi*\n\nTidak ada sesi lain selain sesi bot.",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
        ]),
      }
    );
  }

  const buttons = otherSessions.map((s) => {
    const label = `${s.appName} - ${s.deviceModel} (${s.ip})`;
    return [Markup.button.callback(`🗑 ${label}`, `do_sess_one_${phone}_${s.hash}`)];
  });
  buttons.push([Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)]);

  let text = `☝️ *Pilih sesi yang ingin dihapus:*\n\nAkun: \`${phone}\`\n\n`;
  otherSessions.forEach((s, i) => {
    const activeDate = new Date(s.dateActive * 1000).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    text += `${i + 1}. ${s.appName} - ${s.deviceModel}\n   🌐 ${s.ip} | 🕐 ${activeDate}\n\n`;
  });

  return ctx.editMessageText(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// Eksekusi hapus satu sesi
bot.action(/^do_sess_one_(.+)_(\d+)$/, async (ctx) => {
  const phone = ctx.match[1];
  const hash = ctx.match[2];

  await ctx.editMessageText(`⏳ Menghapus sesi...`, { parse_mode: "Markdown" });

  const result = await sessionManager.terminateSession(phone, hash);

  if (result.success) {
    return ctx.editMessageText(
      `✅ Sesi berhasil dihapus!`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("☝️ Hapus Sesi Lain", `sess_one_${phone}`)],
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
        ]),
      }
    );
  } else {
    return ctx.editMessageText(
      `❌ Gagal menghapus sesi:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
        ]),
      }
    );
  }
});

// ---------- OUT SESSION: Keluarkan bot dari sesi (logout) ----------
bot.action(/^sess_out_(.+)$/, (ctx) => {
  const phone = ctx.match[1];

  return ctx.editMessageText(
    `🚪 *Out Session (Logout Bot)*\n\n` +
      `Akun: \`${phone}\`\n\n` +
      `⚠️ Ini akan *mengeluarkan bot* dari akun ini.\n` +
      `Sesi akan dihapus dari Telegram dan dari bot.\n` +
      `Kamu perlu login ulang jika ingin menambahkan kembali.\n\n` +
      `Yakin?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Ya, Logout", `do_sess_out_${phone}`)],
        [Markup.button.callback("❌ Batal", `sess_menu_${phone}`)],
      ]),
    }
  );
});

bot.action(/^do_sess_out_(.+)$/, async (ctx) => {
  const phone = ctx.match[1];

  await ctx.editMessageText(`⏳ Logout dari \`${phone}\`...`, {
    parse_mode: "Markdown",
  });

  const result = await sessionManager.logoutSession(phone);

  if (result.success) {
    return ctx.editMessageText(
      `✅ *Berhasil logout!*\n\n` +
        `Akun \`${phone}\` telah dikeluarkan dari bot.\n` +
        `File sesi telah dihapus.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Menu Utama", "main_menu")],
        ]),
      }
    );
  } else {
    return ctx.editMessageText(
      `❌ Gagal logout:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", `sess_menu_${phone}`)],
        ]),
      }
    );
  }
});

// ==================== BACKUP & PULIHKAN ====================
bot.action("backup_restore", (ctx) => {
  return ctx.editMessageText(
    "💾 *Backup & Pulihkan*\n\nPilih aksi:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📦 Backup Session", "do_backup")],
        [Markup.button.callback("📥 Pulihkan Session", "do_restore")],
        [Markup.button.callback("◀️ Kembali", "main_menu")],
      ]),
    }
  );
});

// ---------- BACKUP: Kirim file backup ke owner ----------
bot.action("do_backup", async (ctx) => {
  await ctx.editMessageText("⏳ Membuat backup semua session...", {
    parse_mode: "Markdown",
  });

  const result = sessionManager.createBackup();

  if (!result.success) {
    return ctx.editMessageText(
      `❌ Gagal backup:\n\`${result.error}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "backup_restore")],
        ]),
      }
    );
  }

  // Kirim file backup ke owner
  try {
    const fs = require("fs");
    await ctx.replyWithDocument(
      { source: result.filePath, filename: require("path").basename(result.filePath) },
      {
        caption:
          `📦 *Backup Session Berhasil!*\n\n` +
          `📊 Total akun: ${result.data.totalAccounts}\n` +
          `📅 Waktu: ${new Date().toLocaleString("id-ID")}\n\n` +
          `_Simpan file ini dengan aman. Gunakan "Pulihkan" untuk memulihkan session._`,
        parse_mode: "Markdown",
      }
    );

    // Hapus file backup temporary
    fs.unlinkSync(result.filePath);

    return ctx.editMessageText("✅ File backup telah dikirim di atas.", {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Menu Utama", "main_menu")],
      ]),
    });
  } catch (err) {
    return ctx.editMessageText(
      `❌ Gagal mengirim file backup:\n\`${err.message}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("◀️ Kembali", "backup_restore")],
        ]),
      }
    );
  }
});

// ---------- PULIHKAN: Minta owner kirim file backup ----------
bot.action("do_restore", (ctx) => {
  userStates.set(ctx.from.id, { step: "waiting_backup_file" });

  return ctx.editMessageText(
    "📥 *Pulihkan Session*\n\n" +
      "Kirimkan file backup `.json` yang ingin dipulihkan.\n\n" +
      "_Bot akan membaca file, mengecek setiap session apakah masih aktif, " +
      "dan memulihkan yang valid ke daftar akun._",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Batal", "main_menu")],
      ]),
    }
  );
});

// Handle file document (untuk restore backup)
bot.on("document", async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  // Pastikan sedang dalam state waiting_backup_file
  if (!state || state.step !== "waiting_backup_file") {
    return ctx.reply("Ketik /start untuk memulai.");
  }

  const doc = ctx.message.document;

  // Validasi file
  if (!doc.file_name.endsWith(".json")) {
    return ctx.reply(
      "❌ File harus berformat `.json`\n\nKirim file backup yang benar.",
      { parse_mode: "Markdown" }
    );
  }

  await ctx.reply("⏳ Membaca file backup dan memverifikasi session...\n_Ini mungkin memakan waktu._", {
    parse_mode: "Markdown",
  });

  try {
    // Download file
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const fetch = require("node-fetch");
    const response = await fetch(fileLink.href);
    const fileContent = await response.text();

    // Parse JSON
    let backupData;
    try {
      backupData = JSON.parse(fileContent);
    } catch (e) {
      userStates.delete(userId);
      return ctx.reply(
        "❌ File JSON tidak valid atau rusak.\n\nCoba kirim ulang file yang benar.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Coba Lagi", "do_restore")],
            [Markup.button.callback("◀️ Menu Utama", "main_menu")],
          ]),
        }
      );
    }

    // Restore
    const result = await sessionManager.restoreBackup(backupData);
    userStates.delete(userId);

    if (!result.success) {
      return ctx.reply(
        `❌ Gagal pulihkan:\n\`${result.error}\``,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("◀️ Menu Utama", "main_menu")],
          ]),
        }
      );
    }

    // Format hasil
    let text = "📥 *Hasil Pemulihan Session:*\n\n";

    if (result.restored.length > 0) {
      text += `✅ *Berhasil dipulihkan (${result.restored.length}):*\n`;
      result.restored.forEach((r, i) => {
        const name = r.name || "Unknown";
        const username = r.username ? `@${r.username}` : "";
        text += `  ${i + 1}. ${name} ${username}\n     📞 \`${r.phone}\`\n`;
      });
      text += "\n";
    }

    if (result.failed.length > 0) {
      text += `❌ *Gagal/Expired (${result.failed.length}):*\n`;
      result.failed.forEach((f, i) => {
        const name = f.name || "Unknown";
        text += `  ${i + 1}. ${name} - \`${f.phone}\`\n     ⚠️ ${f.reason}\n`;
      });
      text += "\n";
    }

    text += `\n📊 Total: ${result.restored.length} berhasil, ${result.failed.length} gagal`;

    return ctx.reply(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📋 Lihat Daftar Akun", "list_accounts")],
        [Markup.button.callback("◀️ Menu Utama", "main_menu")],
      ]),
    });
  } catch (err) {
    userStates.delete(userId);
    return ctx.reply(
      `❌ Error saat memproses file:\n\`${err.message}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Coba Lagi", "do_restore")],
          [Markup.button.callback("◀️ Menu Utama", "main_menu")],
        ]),
      }
    );
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

  // ---------- BROADCAST: Custom Delay ----------
  if (state.step === "bc_custom_delay") {
    const delaySeconds = parseFloat(text);
    if (isNaN(delaySeconds) || delaySeconds < 0.5 || delaySeconds > 60) {
      return ctx.reply(
        "❌ Delay harus angka antara 0.5 - 60 detik.\nCoba lagi:",
        { parse_mode: "Markdown" }
      );
    }

    const delayMs = Math.round(delaySeconds * 1000);
    userStates.set(userId, { broadcastDelay: delayMs });

    return ctx.reply(`✅ Delay broadcast diatur ke *${delaySeconds} detik*`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("◀️ Broadcast Menu", "broadcast_menu")],
      ]),
    });
  }

  // ---------- BROADCAST: Input Target ----------
  if (state.step === "bc_target") {
    // Simpan target, lalu minta pesan
    userStates.set(userId, { ...state, step: "bc_message", target: text });

    return ctx.reply(
      "✅ Target: `" + text + "`\n\n" +
        "Sekarang masukkan *pesan* yang akan dikirim:\n\n" +
        "_Ketik pesan teks yang ingin di-broadcast._",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", "bc_cancel")],
        ]),
      }
    );
  }

  // ---------- BROADCAST: Input Message ----------
  if (state.step === "bc_message") {
    const delay = state.broadcastDelay || 3000;

    userStates.set(userId, { ...state, step: "bc_confirm", message: text });

    // Tampilkan konfirmasi
    return ctx.reply(
      "📢 *Konfirmasi Broadcast*\n\n" +
        `🎯 Target: \`${state.target}\`\n` +
        `📨 Akun: *${state.phones.length}*\n` +
        `⏱ Delay: *${delay / 1000} detik*\n\n` +
        `📝 Pesan:\n\`\`\`\n${text}\n\`\`\`\n\n` +
        "Kirim sekarang?",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Kirim Sekarang", "bc_confirm_send")],
          [Markup.button.callback("✏️ Ubah Pesan", "bc_edit_message")],
          [Markup.button.callback("❌ Batal", "bc_cancel")],
        ]),
      }
    );
  }

  // ---------- BROADCAST: Edit Message ----------
  if (state.step === "bc_edit_message") {
    const delay = state.broadcastDelay || 3000;

    userStates.set(userId, { ...state, step: "bc_confirm", message: text });

    return ctx.reply(
      "📢 *Konfirmasi Broadcast (Pesan Diubah)*\n\n" +
        `🎯 Target: \`${state.target}\`\n` +
        `📨 Akun: *${state.phones.length}*\n` +
        `⏱ Delay: *${delay / 1000} detik*\n\n` +
        `📝 Pesan:\n\`\`\`\n${text}\n\`\`\`\n\n` +
        "Kirim sekarang?",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Kirim Sekarang", "bc_confirm_send")],
          [Markup.button.callback("✏️ Ubah Pesan", "bc_edit_message")],
          [Markup.button.callback("❌ Batal", "bc_cancel")],
        ]),
      }
    );
  }

  // ---------- BROADCAST: Forward Target ----------
  if (state.step === "bc_forward_target") {
    userStates.set(userId, { ...state, step: "bc_forward_from", target: text });

    return ctx.reply(
      "✅ Target forward: `" + text + "`\n\n" +
        "Sekarang masukkan *sumber pesan* (dari mana pesan akan di-forward):\n" +
        "- Username chat: `@username`\n" +
        "- Chat ID: `-1001234567890`\n" +
        "- Username pribadi: `@user`",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", "bc_cancel")],
        ]),
      }
    );
  }

  // ---------- BROADCAST: Forward From Peer ----------
  if (state.step === "bc_forward_from") {
    userStates.set(userId, { ...state, step: "bc_forward_msgid", forwardFrom: text });

    return ctx.reply(
      "✅ Sumber: `" + text + "`\n\n" +
        "Masukkan *ID pesan* yang akan di-forward:\n\n" +
        "_Contoh: `12345` (satu pesan) atau `12345,12346,12347` (beberapa pesan)_\n\n" +
        "Tip: Forward pesan ke @userinfobot atau cek di link pesan (t.me/channel/123)",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Batal", "bc_cancel")],
        ]),
      }
    );
  }

  // ---------- BROADCAST: Forward Message IDs ----------
  if (state.step === "bc_forward_msgid") {
    // Parse message IDs
    const msgIds = text
      .split(/[,\s]+/)
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id) && id > 0);

    if (msgIds.length === 0) {
      return ctx.reply(
        "❌ ID pesan tidak valid.\n\nMasukkan angka, pisahkan dengan koma jika lebih dari satu.\n_Contoh: `12345` atau `12345,12346`_",
        { parse_mode: "Markdown" }
      );
    }

    const delay = state.broadcastDelay || 3000;

    userStates.set(userId, { ...state, step: "bc_confirm_forward_ready", forwardMsgIds: msgIds });

    return ctx.reply(
      "📢 *Konfirmasi Forward Broadcast*\n\n" +
        `🎯 Target: \`${state.target}\`\n` +
        `📂 Sumber: \`${state.forwardFrom}\`\n` +
        `📋 Pesan ID: \`${msgIds.join(", ")}\`\n` +
        `📨 Akun: *${state.phones.length}*\n` +
        `⏱ Delay: *${delay / 1000} detik*\n\n` +
        "Forward sekarang?",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Forward Sekarang", "bc_confirm_forward")],
          [Markup.button.callback("❌ Batal", "bc_cancel")],
        ]),
      }
    );
  }

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

        // Auto-cek limit
        await ctx.reply("⏳ Mengecek status limit akun...");
        const limitResult = await sessionManager.checkSpamLimit(state.phone);
        if (limitResult.success) {
          sessionManager.updateSessionInfo(state.phone, { isLimited: limitResult.isLimited });
        }
        const limitText = limitResult.success
          ? (limitResult.isLimited ? "Limit ❗️" : "Aman ✅")
          : "Gagal cek";

        userStates.delete(userId);

        return ctx.reply(
          "✅ *Akun berhasil ditambahkan!*\n\n" +
            `🆔 ID: \`${info.id || "-"}\`\n` +
            `📞 Nomor: \`${state.phone}\`\n` +
            `👤 Nama: ${info.firstName || "-"} ${info.lastName || ""}\n` +
            `🔗 Username: ${info.username ? "@" + info.username : "-"}\n` +
            `⚠️ Limit: ${limitText}`,
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
    } catch (e) {}

    try {
      const result = await sessionManager.verifyPassword(state, text);

      if (result.success) {
        const info = await getAccountInfoFromClient(state.client);
        sessionManager.saveSession(state.phone, result.session, info);

        // Simpan password ke session info
        sessionManager.updateSessionInfo(state.phone, { password: text });

        await state.client.disconnect();

        // Auto-cek limit
        await ctx.reply("⏳ Mengecek status limit akun...");
        const limitResult = await sessionManager.checkSpamLimit(state.phone);
        if (limitResult.success) {
          sessionManager.updateSessionInfo(state.phone, { isLimited: limitResult.isLimited });
        }
        const limitText = limitResult.success
          ? (limitResult.isLimited ? "Limit ❗️" : "Aman ✅")
          : "Gagal cek";

        userStates.delete(userId);

        return ctx.reply(
          "✅ *Akun berhasil ditambahkan!*\n\n" +
            `🆔 ID: \`${info.id || "-"}\`\n` +
            `📞 Nomor: \`${state.phone}\`\n` +
            `👤 Nama: ${info.firstName || "-"} ${info.lastName || ""}\n` +
            `🔗 Username: ${info.username ? "@" + info.username : "-"}\n` +
            `🔑 Password: \`${text}\`\n` +
            `⚠️ Limit: ${limitText}`,
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

  // ---------- PASSWORD MANAGEMENT FLOWS ----------

  // Ganti password: step 1 - masukkan password lama
  if (state.step === "pw_change_old") {
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
    userStates.set(userId, { ...state, step: "pw_change_new", oldPassword: text });
    return ctx.reply("Masukkan password *baru*:", { parse_mode: "Markdown" });
  }

  // Ganti password: step 2 - masukkan password baru
  if (state.step === "pw_change_new") {
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
    userStates.set(userId, { ...state, step: "pw_change_hint", newPassword: text });
    return ctx.reply(
      "Masukkan *hint* password (atau ketik `-` untuk skip):",
      { parse_mode: "Markdown" }
    );
  }

  // Ganti password: step 3 - hint
  if (state.step === "pw_change_hint") {
    const hint = text === "-" ? "" : text;
    await ctx.reply("⏳ Mengubah password 2FA...");

    const result = await sessionManager.changePassword(state.phone, state.oldPassword, state.newPassword, hint);
    userStates.delete(userId);

    if (result.success) {
      // Simpan password baru ke session info
      sessionManager.updateSessionInfo(state.phone, { password: state.newPassword });
      return ctx.reply("✅ *Password 2FA berhasil diubah!*", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_2fa_${state.phone}`)]]),
      });
    } else {
      return ctx.reply(`❌ Gagal ubah password:\n\`${result.error}\``, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_2fa_${state.phone}`)]]),
      });
    }
  }

  // Hapus password: masukkan password untuk konfirmasi
  if (state.step === "pw_remove") {
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
    await ctx.reply("⏳ Menghapus password 2FA...");

    const result = await sessionManager.removePassword(state.phone, text);
    userStates.delete(userId);

    if (result.success) {
      // Hapus password dari session info
      sessionManager.updateSessionInfo(state.phone, { password: "" });
      return ctx.reply("✅ *Password 2FA berhasil dihapus!*", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_2fa_${state.phone}`)]]),
      });
    } else {
      return ctx.reply(`❌ Gagal hapus password:\n\`${result.error}\``, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_2fa_${state.phone}`)]]),
      });
    }
  }

  // Tambah password: step 1 - password baru
  if (state.step === "pw_add_new") {
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
    userStates.set(userId, { ...state, step: "pw_add_hint", newPassword: text });
    return ctx.reply(
      "Masukkan *hint* password (atau ketik `-` untuk skip):",
      { parse_mode: "Markdown" }
    );
  }

  // Tambah password: step 2 - hint
  if (state.step === "pw_add_hint") {
    const hint = text === "-" ? "" : text;
    await ctx.reply("⏳ Menambahkan password 2FA...");

    const result = await sessionManager.addPassword(state.phone, state.newPassword, hint);
    userStates.delete(userId);

    if (result.success) {
      // Simpan password ke session info
      sessionManager.updateSessionInfo(state.phone, { password: state.newPassword });
      return ctx.reply("✅ *Password 2FA berhasil ditambahkan!*", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_2fa_${state.phone}`)]]),
      });
    } else {
      return ctx.reply(`❌ Gagal tambah password:\n\`${result.error}\``, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_2fa_${state.phone}`)]]),
      });
    }
  }

  // ---------- EMAIL MANAGEMENT FLOWS ----------

  // Email: step 1 - masukkan password 2FA
  if (state.step === "email_pw") {
    try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
    userStates.set(userId, { ...state, step: "email_new", currentPassword: text });
    return ctx.reply("Masukkan *email baru* untuk recovery:", { parse_mode: "Markdown" });
  }

  // Email: step 2 - masukkan email baru, trigger kirim kode ke email
  if (state.step === "email_new") {
    // Validasi format email sederhana
    if (!text.includes("@") || !text.includes(".")) {
      return ctx.reply("❌ Format email tidak valid. Coba lagi:", { parse_mode: "Markdown" });
    }

    await ctx.reply(`⏳ Mengirim kode verifikasi ke \`${text}\`...`, { parse_mode: "Markdown" });

    // Trigger pengiriman kode ke email
    const sendResult = await sessionManager.updateEmailSendCode(state.phone, state.currentPassword, text);

    if (!sendResult.success) {
      userStates.delete(userId);
      return ctx.reply(`❌ Gagal kirim kode:\n\`${sendResult.error}\``, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_email_${state.phone}`)]]),
      });
    }

    // Simpan email ke state, lanjut minta kode verifikasi
    userStates.set(userId, { ...state, step: "email_code", newEmail: text });

    return ctx.reply(
      `✅ Kode verifikasi telah dikirim ke \`${text}\`\n\n` +
        `Cek inbox email kamu, lalu masukkan *kode verifikasi*:`,
      { parse_mode: "Markdown" }
    );
  }

  // Email: step 3 - masukkan kode verifikasi email
  if (state.step === "email_code") {
    const code = text.replace(/\s/g, "");

    await ctx.reply("⏳ Memverifikasi kode email...");

    const result = await sessionManager.updateEmailConfirmCode(state.phone, code);

    if (result.success) {
      // Simpan email ke session info
      sessionManager.updateSessionInfo(state.phone, { email: state.newEmail });
      userStates.delete(userId);
      return ctx.reply(
        `✅ *Email recovery berhasil diatur!*\n\n📧 Email: \`${state.newEmail}\``,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", `acc_email_${state.phone}`)]]),
        }
      );
    } else {
      // Kode salah — JANGAN hapus state, biar bisa coba lagi
      return ctx.reply(
        `❌ Kode salah: \`${result.error}\`\n\nCoba masukkan ulang kode verifikasi:`,
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
