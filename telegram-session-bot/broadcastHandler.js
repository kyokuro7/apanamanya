const { Markup } = require("telegraf");
const sessionManager = require("./sessionManager");

// Auto broadcast storage: Map<id, { intervalId, phones, message, mediaMsg, delay, loopDelay, startedAt }>
const autoBroadcasts = new Map();

/**
 * Register all broadcast handlers on bot instance
 * @param {object} bot - Telegraf bot instance
 * @param {Map} userStates - Shared userStates map
 */
function registerBroadcastHandlers(bot, userStates) {

  // ==================== BROADCAST MENU ====================
  bot.action("broadcast_menu", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    if (sessions.length === 0) {
      return ctx.editMessageText("📢 *Broadcast*\n\nBelum ada akun tersimpan.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("➕ Tambah Akun", "add_account")], [Markup.button.callback("◀️ Kembali", "main_menu")]]),
      });
    }
    return ctx.editMessageText(
      "📢 *Broadcast*\n\nKirim pesan ke semua grup di akun.\n\nPilih mode:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("👤 Satu Akun", "bc_one_account")],
          [Markup.button.callback("👥 Banyak Akun", "bc_multi_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      }
    );
  });

  // ==================== SATU AKUN ====================
  bot.action("bc_one_account", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    const buttons = sessions.map((s) => {
      const name = s.info.firstName ? `${s.info.firstName} ${s.info.lastName || ""}`.trim() : s.phone;
      return [Markup.button.callback(`📞 ${name} (${s.phone})`, `bc_pick_one_${s.phone}`)];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "broadcast_menu")]);
    return ctx.editMessageText("👤 *Pilih Akun:*", { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^bc_pick_one_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    userStates.set(ctx.from.id, { step: "bc_mode_select", phones: [phone] });
    return ctx.editMessageText(
      `👤 Akun: \`${phone}\`\n\nPilih aksi:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📨 Broadcast", "bc_start_broadcast")],
          [Markup.button.callback("🔄 AutoBC", "autobc_panel")],
          [Markup.button.callback("◀️ Kembali", "bc_one_account")],
        ]),
      }
    );
  });

  // ==================== BANYAK AKUN ====================
  bot.action("bc_multi_account", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    userStates.set(ctx.from.id, { step: "bc_multi_selecting", selectedPhones: [] });
    const buttons = sessions.map((s) => {
      const name = s.info.firstName ? `${s.info.firstName} ${s.info.lastName || ""}`.trim() : s.phone;
      return [Markup.button.callback(`⬜ ${name} (${s.phone})`, `bc_mtoggle_${s.phone}`)];
    });
    buttons.push([Markup.button.callback("✅ Pilih Semua", "bc_mselect_all")]);
    buttons.push([Markup.button.callback("➡️ Lanjut", "bc_mselect_done")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "broadcast_menu")]);
    return ctx.editMessageText("👥 *Pilih Akun (tap untuk pilih):*\n\n_Dipilih: 0_", { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^bc_mtoggle_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    const state = userStates.get(ctx.from.id);
    if (!state || state.step !== "bc_multi_selecting") return;
    const idx = state.selectedPhones.indexOf(phone);
    if (idx > -1) state.selectedPhones.splice(idx, 1);
    else state.selectedPhones.push(phone);
    userStates.set(ctx.from.id, state);
    return renderMultiSelect(ctx, state);
  });

  bot.action("bc_mselect_all", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || state.step !== "bc_multi_selecting") return;
    const sessions = sessionManager.getAllSessions();
    state.selectedPhones = state.selectedPhones.length === sessions.length ? [] : sessions.map((s) => s.phone);
    userStates.set(ctx.from.id, state);
    return renderMultiSelect(ctx, state);
  });

  function renderMultiSelect(ctx, state) {
    const sessions = sessionManager.getAllSessions();
    const buttons = sessions.map((s) => {
      const name = s.info.firstName ? `${s.info.firstName} ${s.info.lastName || ""}`.trim() : s.phone;
      const sel = state.selectedPhones.includes(s.phone) ? "✅" : "⬜";
      return [Markup.button.callback(`${sel} ${name} (${s.phone})`, `bc_mtoggle_${s.phone}`)];
    });
    buttons.push([Markup.button.callback("✅ Pilih Semua", "bc_mselect_all")]);
    buttons.push([Markup.button.callback("➡️ Lanjut", "bc_mselect_done")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "broadcast_menu")]);
    return ctx.editMessageText(`👥 *Pilih Akun:*\n\n_Dipilih: ${state.selectedPhones.length}_`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
  }

  bot.action("bc_mselect_done", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || state.step !== "bc_multi_selecting") return;
    if (state.selectedPhones.length === 0) return ctx.answerCbQuery("⚠️ Pilih minimal 1 akun!", { show_alert: true });
    userStates.set(ctx.from.id, { step: "bc_mode_select", phones: state.selectedPhones });
    return ctx.editMessageText(
      `👥 Akun terpilih: *${state.selectedPhones.length}*\n\nPilih aksi:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📨 Broadcast", "bc_start_broadcast")],
          [Markup.button.callback("🔄 AutoBC", "autobc_panel")],
          [Markup.button.callback("◀️ Kembali", "bc_multi_account")],
        ]),
      }
    );
  });

  // ==================== BROADCAST (Sekali Kirim) ====================
  bot.action("bc_start_broadcast", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return ctx.editMessageText("❌ Pilih akun dulu.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]) });
    userStates.set(ctx.from.id, { ...state, step: "bc_waiting_message" });
    return ctx.editMessageText(
      "📨 *Broadcast*\n\n" +
        `📊 Akun: *${state.phones.length}*\n\n` +
        "Kirim pesan yang ingin di-broadcast.\n_(Bisa teks, foto, video, dokumen, stiker)_",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "broadcast_menu")]]) }
    );
  });

  bot.action("bc_confirm_send", async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones || !state.bcMessage) return ctx.editMessageText("❌ Data tidak lengkap.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]) });
    const delay = 500; // 0.5 detik default
    await ctx.editMessageText(`⏳ *Broadcasting...*\n\n📨 ${state.phones.length} akun | ⏱ ${delay}ms/grup`, { parse_mode: "Markdown" });
    const result = await sessionManager.broadcastToAllGroups(state.phones, state.bcMessage, delay);
    let text = "📢 *Hasil Broadcast*\n\n";
    let totalSent = 0, totalFailed = 0;
    result.results.forEach((r) => {
      if (r.success) { text += `✅ \`${r.phone}\`: ${r.sent}/${r.total} grup\n`; totalSent += r.sent; totalFailed += r.failed; }
      else { text += `❌ \`${r.phone}\`: ${r.error}\n`; }
    });
    text += `\n📊 Total: ${totalSent} terkirim, ${totalFailed} gagal`;
    userStates.delete(ctx.from.id);
    return ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("📢 Broadcast Lagi", "broadcast_menu")], [Markup.button.callback("◀️ Menu Utama", "main_menu")]]) });
  });

  bot.action("bc_cancel", (ctx) => {
    userStates.delete(ctx.from.id);
    return ctx.editMessageText("❌ Dibatalkan.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")], [Markup.button.callback("◀️ Menu Utama", "main_menu")]]) });
  });

  // ==================== AUTO BC PANEL ====================
  bot.action("autobc_panel", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return ctx.editMessageText("❌ Pilih akun dulu.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]) });

    // Cek apakah sudah ada autoBC aktif untuk phones ini
    const key = state.phones.sort().join(",");
    const existing = findAutoBCByKey(key);
    const isOn = !!existing;
    const msgPreview = state.autobcMessage ? `\`${state.autobcMessage.text ? state.autobcMessage.text.substring(0, 40) : "[media]"}...\`` : "_Belum diatur_";
    const loopDelay = state.autobcLoopDelay || 300000; // 5 menit default
    const grupDelay = state.autobcGrupDelay || 500; // 0.5 detik default

    return ctx.editMessageText(
      "🔄 *AutoBC Panel*\n\n" +
        `📊 Akun: *${state.phones.length}*\n` +
        `📝 Pesan: ${msgPreview}\n` +
        `⏱ Jeda Putaran: *${loopDelay / 60000} menit*\n` +
        `⏱ Jeda Grup: *${grupDelay / 1000} detik*\n` +
        `Status: ${isOn ? "🟢 ON" : "🔴 OFF"}\n`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📝 SetPesan", "autobc_set_message")],
          [Markup.button.callback("⏱ SetJeda", "autobc_set_delay")],
          [Markup.button.callback(isOn ? "⏹ Off" : "▶️ On", isOn ? "autobc_off" : "autobc_on")],
          [Markup.button.callback("◀️ Kembali", "broadcast_menu")],
        ]),
      }
    );
  });

  // SetPesan
  bot.action("autobc_set_message", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "autobc_waiting_message" });
    return ctx.editMessageText("📝 *SetPesan AutoBC*\n\nKirim pesan yang akan di-broadcast.\n_(Teks, foto, video, dokumen, stiker)_", {
      parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "autobc_panel")]]),
    });
  });

  // SetJeda
  bot.action("autobc_set_delay", (ctx) => {
    return ctx.editMessageText("⏱ *SetJeda AutoBC*\n\nPilih jeda yang ingin diatur:", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔁 Putaran (antar loop)", "autobc_set_loop_delay")],
        [Markup.button.callback("📨 Grup (antar grup)", "autobc_set_grup_delay")],
        [Markup.button.callback("◀️ Kembali", "autobc_panel")],
      ]),
    });
  });

  bot.action("autobc_set_loop_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "autobc_input_loop_delay" });
    return ctx.editMessageText("🔁 *Jeda Putaran*\n\nMasukkan jeda antar putaran (dalam menit):\n\n_Default: 5 menit_\n_Contoh: `5` = 5 menit, `30` = 30 menit_", {
      parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "autobc_set_delay")]]),
    });
  });

  bot.action("autobc_set_grup_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "autobc_input_grup_delay" });
    return ctx.editMessageText("📨 *Jeda Grup*\n\nMasukkan jeda antar grup:\n\n_Default: 0.5 detik_\n_Contoh: `05` = 0.5 detik, `1` = 1 detik, `2` = 2 detik_", {
      parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "autobc_set_delay")]]),
    });
  });

  // On
  bot.action("autobc_on", async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return;
    if (!state.autobcMessage) return ctx.answerCbQuery("⚠️ Set pesan dulu!", { show_alert: true });

    const loopDelay = state.autobcLoopDelay || 300000;
    const grupDelay = state.autobcGrupDelay || 500;
    const key = state.phones.sort().join(",");
    const id = `abc_${Date.now()}`;
    const phones = [...state.phones];
    const bcMsg = { ...state.autobcMessage };

    await ctx.editMessageText(`⏳ *Memulai AutoBC...*\n\nBroadcast pertama dimulai...`, { parse_mode: "Markdown" });

    // Jalankan pertama
    const firstResult = await sessionManager.broadcastToAllGroups(phones, bcMsg, grupDelay);

    // Set interval
    const intervalId = setInterval(async () => {
      try { await sessionManager.broadcastToAllGroups(phones, bcMsg, grupDelay); } catch (e) {}
    }, loopDelay);

    autoBroadcasts.set(id, { intervalId, phones, message: bcMsg, grupDelay, loopDelay, startedAt: new Date().toISOString(), key });

    let totalSent = 0, totalFailed = 0;
    firstResult.results.forEach((r) => { if (r.success) { totalSent += r.sent; totalFailed += r.failed; } });

    return ctx.editMessageText(
      `🟢 *AutoBC Aktif!*\n\n🆔 \`${id}\`\n📨 ${phones.length} akun\n🔁 Setiap ${loopDelay / 60000} menit\n\n*Pertama:* ✅${totalSent} ❌${totalFailed}`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Panel", "autobc_panel")], [Markup.button.callback("◀️ Menu Utama", "main_menu")]]) }
    );
  });

  // Off
  bot.action("autobc_off", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return;
    const key = state.phones.sort().join(",");
    const existing = findAutoBCByKey(key);
    if (existing) {
      clearInterval(existing.val.intervalId);
      autoBroadcasts.delete(existing.id);
    }
    return ctx.editMessageText("⏹ *AutoBC dihentikan.*", {
      parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Panel", "autobc_panel")], [Markup.button.callback("◀️ Menu Utama", "main_menu")]]),
    });
  });

  // Helper: find autoBC by key
  function findAutoBCByKey(key) {
    for (const [id, val] of autoBroadcasts) {
      if (val.key === key) return { id, val };
    }
    return null;
  }

  // ==================== TEXT/MESSAGE HANDLERS ====================
  function handleBroadcastText(ctx, userId, state, text) {
    if (state.step === "autobc_input_loop_delay") {
      const min = parseFloat(text);
      if (isNaN(min) || min < 1 || min > 1440) return ctx.reply("❌ Harus angka 1-1440. Coba lagi:");
      userStates.set(userId, { ...state, step: "bc_mode_select", autobcLoopDelay: Math.round(min * 60000) });
      return ctx.reply(`✅ Jeda putaran: *${min} menit*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Panel", "autobc_panel")]]) });
    }

    if (state.step === "autobc_input_grup_delay") {
      let seconds;
      if (text === "05") seconds = 0.5;
      else seconds = parseFloat(text);
      if (isNaN(seconds) || seconds < 0.1 || seconds > 30) return ctx.reply("❌ Harus angka 0.1-30. (05=0.5s) Coba lagi:");
      userStates.set(userId, { ...state, step: "bc_mode_select", autobcGrupDelay: Math.round(seconds * 1000) });
      return ctx.reply(`✅ Jeda grup: *${seconds} detik*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Panel", "autobc_panel")]]) });
    }

    return null; // not handled
  }

  // Handle media messages for broadcast
  function handleBroadcastMedia(ctx, userId, state) {
    // Extract message info for copy-sending
    const msg = ctx.message;
    let bcMessage = null;

    if (msg.text) {
      bcMessage = { type: "text", text: msg.text, entities: msg.entities || [] };
    } else if (msg.photo) {
      bcMessage = { type: "photo", fileId: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption || "", captionEntities: msg.caption_entities || [] };
    } else if (msg.video) {
      bcMessage = { type: "video", fileId: msg.video.file_id, caption: msg.caption || "", captionEntities: msg.caption_entities || [] };
    } else if (msg.document) {
      bcMessage = { type: "document", fileId: msg.document.file_id, caption: msg.caption || "", captionEntities: msg.caption_entities || [] };
    } else if (msg.sticker) {
      bcMessage = { type: "sticker", fileId: msg.sticker.file_id };
    } else if (msg.animation) {
      bcMessage = { type: "animation", fileId: msg.animation.file_id, caption: msg.caption || "", captionEntities: msg.caption_entities || [] };
    } else if (msg.voice) {
      bcMessage = { type: "voice", fileId: msg.voice.file_id, caption: msg.caption || "", captionEntities: msg.caption_entities || [] };
    } else if (msg.video_note) {
      bcMessage = { type: "video_note", fileId: msg.video_note.file_id };
    } else {
      return null;
    }

    if (state.step === "bc_waiting_message") {
      userStates.set(userId, { ...state, step: "bc_confirm", bcMessage });
      const preview = bcMessage.text || bcMessage.caption || `[${bcMessage.type}]`;
      return ctx.reply(
        `📢 *Konfirmasi Broadcast*\n\n📨 Akun: *${state.phones.length}*\n⏱ Jeda: 0.5 dtk/grup\n\n📝 Pesan: \`${preview.substring(0, 60)}${preview.length > 60 ? "..." : ""}\`\n\nKirim ke semua grup?`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("✅ Kirim", "bc_confirm_send")], [Markup.button.callback("❌ Batal", "bc_cancel")]]) }
      );
    }

    if (state.step === "autobc_waiting_message") {
      userStates.set(userId, { ...state, step: "bc_mode_select", autobcMessage: bcMessage });
      const preview = bcMessage.text || bcMessage.caption || `[${bcMessage.type}]`;
      return ctx.reply(
        `✅ Pesan AutoBC disimpan!\n\n📝 \`${preview.substring(0, 60)}${preview.length > 60 ? "..." : ""}\``,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Panel", "autobc_panel")]]) }
      );
    }

    return null;
  }

  return { handleBroadcastText, handleBroadcastMedia, autoBroadcasts };
}

module.exports = { registerBroadcastHandlers };
