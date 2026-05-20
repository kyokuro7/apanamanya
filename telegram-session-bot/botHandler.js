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
