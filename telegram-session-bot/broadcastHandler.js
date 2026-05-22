const { Markup } = require("telegraf");
const sessionManager = require("./sessionManager");

// Per-account auto broadcast: Map<phone, { intervalId, message, msgId, fromChatId, grupDelay, loopDelay, startedAt }>
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
      "📢 *Broadcast*\n\nKirim/forward pesan ke semua grup di akun.\n\nPilih mode:",
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

  // Setelah pilih satu akun → langsung masuk panel per-akun
  bot.action(/^bc_pick_one_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    userStates.set(ctx.from.id, { step: "bc_panel", phones: [phone] });
    return renderAccountPanel(ctx, [phone]);
  });

  // ==================== BANYAK AKUN ====================
  bot.action("bc_multi_account", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    userStates.set(ctx.from.id, { step: "bc_multi_selecting", selectedPhones: [] });
    return renderMultiSelect(ctx, { selectedPhones: [] });
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
    return ctx.editMessageText(`👥 *Pilih Akun (tap untuk pilih):*\n\n_Dipilih: ${state.selectedPhones.length}_`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
  }

  bot.action("bc_mselect_done", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || state.step !== "bc_multi_selecting") return;
    if (state.selectedPhones.length === 0) return ctx.answerCbQuery("⚠️ Pilih minimal 1 akun!", { show_alert: true });
    userStates.set(ctx.from.id, { step: "bc_panel", phones: state.selectedPhones });
    return renderAccountPanel(ctx, state.selectedPhones);
  });

  // ==================== PANEL AKUN (Delay + Toggle per akun) ====================
  function renderAccountPanel(ctx, phones) {
    const sessions = sessionManager.getAllSessions();
    let text = "📢 *Panel Broadcast*\n\n";
    text += `📊 Akun terpilih: *${phones.length}*\n\n`;

    const buttons = [];

    // Per-akun: tampilkan status on/off
    phones.forEach((phone) => {
      const acc = sessions.find((s) => s.phone === phone);
      const name = acc && acc.info.firstName ? `${acc.info.firstName}`.trim() : phone;
      const isOn = autoBroadcasts.has(phone);
      const status = isOn ? "🟢" : "🔴";
      text += `${status} \`${phone}\` - ${name}\n`;
      buttons.push([
        Markup.button.callback(`${status} ${name}`, `bc_toggle_${phone}`),
      ]);
    });

    // Info delay global (dari state)
    const state = userStates.get(ctx.from?.id || ctx.callbackQuery?.from?.id);
    const loopDelay = (state && state.loopDelay) || 300000;
    const grupDelay = (state && state.grupDelay) || 500;

    text += `\n⏱ Jeda Putaran: *${loopDelay / 60000} menit*\n`;
    text += `⏱ Jeda Grup: *${grupDelay / 1000} detik*\n`;

    const msgPreview = (state && state.bcMessage)
      ? `\`${(state.bcMessage.text || state.bcMessage.caption || "[media]").substring(0, 30)}...\``
      : "_Belum diatur_";
    text += `📝 Pesan: ${msgPreview}\n`;

    buttons.push([Markup.button.callback("📝 Set Pesan", "bc_set_message")]);
    buttons.push([Markup.button.callback("⏱ Set Jeda", "bc_set_delay")]);
    buttons.push([Markup.button.callback("📨 Broadcast Sekali", "bc_start_broadcast")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "broadcast_menu")]);

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  }

  // Kembali ke panel
  bot.action("bc_panel_back", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return ctx.editMessageText("❌ Sesi berakhir.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]) });
    return renderAccountPanel(ctx, state.phones);
  });

  // ==================== TOGGLE ON/OFF PER AKUN ====================
  bot.action(/^bc_toggle_(.+)$/, async (ctx) => {
    const phone = ctx.match[1];
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return;

    if (autoBroadcasts.has(phone)) {
      // Matikan autoBC untuk akun ini
      const abc = autoBroadcasts.get(phone);
      clearInterval(abc.intervalId);
      autoBroadcasts.delete(phone);
      return renderAccountPanel(ctx, state.phones);
    } else {
      // Nyalakan autoBC untuk akun ini
      if (!state.bcMessage) {
        return ctx.answerCbQuery("⚠️ Set pesan dulu!", { show_alert: true });
      }

      const loopDelay = state.loopDelay || 300000;
      const grupDelay = state.grupDelay || 500;
      const bcMsg = { ...state.bcMessage };

      // Jalankan pertama kali
      await sessionManager.broadcastForward(phone, bcMsg, grupDelay);

      // Set interval
      const intervalId = setInterval(async () => {
        try {
          if (autoBroadcasts.has(phone)) {
            await sessionManager.broadcastForward(phone, bcMsg, grupDelay);
          }
        } catch (e) {}
      }, loopDelay);

      autoBroadcasts.set(phone, {
        intervalId,
        message: bcMsg,
        grupDelay,
        loopDelay,
        startedAt: new Date().toISOString(),
      });

      return renderAccountPanel(ctx, state.phones);
    }
  });

  // ==================== SET PESAN ====================
  bot.action("bc_set_message", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_waiting_message" });
    return ctx.editMessageText(
      "📝 *Set Pesan Broadcast*\n\n" +
        "Forward atau kirim pesan yang ingin di-broadcast.\n" +
        "_(Pesan akan di-forward apa adanya ke semua grup, tanpa diubah)_",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_panel_back")]]),
      }
    );
  });

  // ==================== SET JEDA ====================
  bot.action("bc_set_delay", (ctx) => {
    return ctx.editMessageText("⏱ *Set Jeda*\n\nPilih jeda yang ingin diatur:", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔁 Putaran (antar loop)", "bc_set_loop_delay")],
        [Markup.button.callback("📨 Grup (antar grup)", "bc_set_grup_delay")],
        [Markup.button.callback("◀️ Kembali", "bc_panel_back")],
      ]),
    });
  });

  bot.action("bc_set_loop_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_input_loop_delay" });
    return ctx.editMessageText(
      "🔁 *Jeda Putaran*\n\nMasukkan jeda antar putaran (dalam menit):\n\n_Default: 5 menit_\n_Contoh: `5` = 5 menit, `30` = 30 menit_",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_set_delay")]]) }
    );
  });

  bot.action("bc_set_grup_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_input_grup_delay" });
    return ctx.editMessageText(
      "📨 *Jeda Grup*\n\nMasukkan jeda antar grup:\n\n_Default: 0.5 detik_\n_Contoh: `05` = 0.5 detik, `1` = 1 detik, `2` = 2 detik_",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_set_delay")]]) }
    );
  });

  // ==================== BROADCAST SEKALI KIRIM ====================
  bot.action("bc_start_broadcast", async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return ctx.editMessageText("❌ Pilih akun dulu.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]) });
    if (!state.bcMessage) return ctx.answerCbQuery("⚠️ Set pesan dulu!", { show_alert: true });

    const grupDelay = state.grupDelay || 500;
    await ctx.editMessageText(`⏳ *Broadcasting...*\n\n📨 ${state.phones.length} akun | ⏱ ${grupDelay}ms/grup`, { parse_mode: "Markdown" });

    let text = "📢 *Hasil Broadcast*\n\n";
    let totalSent = 0, totalFailed = 0;

    for (const phone of state.phones) {
      const result = await sessionManager.broadcastForward(phone, state.bcMessage, grupDelay);
      if (result.success) {
        text += `✅ \`${phone}\`: ${result.sent}/${result.total} grup\n`;
        totalSent += result.sent;
        totalFailed += result.failed;
      } else {
        text += `❌ \`${phone}\`: ${result.error}\n`;
      }
    }

    text += `\n📊 Total: ${totalSent} terkirim, ${totalFailed} gagal`;

    return ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📢 Broadcast Lagi", "bc_panel_back")],
        [Markup.button.callback("◀️ Menu Utama", "main_menu")],
      ]),
    });
  });

  // ==================== TEXT/MESSAGE HANDLERS ====================
  function handleBroadcastText(ctx, userId, state, text) {
    // Input jeda putaran
    if (state.step === "bc_input_loop_delay") {
      const min = parseFloat(text);
      if (isNaN(min) || min < 1 || min > 1440) return ctx.reply("❌ Harus angka 1-1440. Coba lagi:");
      userStates.set(userId, { ...state, step: "bc_panel", loopDelay: Math.round(min * 60000) });
      return ctx.reply(`✅ Jeda putaran: *${min} menit*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "bc_panel_back")]]) });
    }

    // Input jeda grup
    if (state.step === "bc_input_grup_delay") {
      let seconds;
      if (text === "05") seconds = 0.5;
      else seconds = parseFloat(text);
      if (isNaN(seconds) || seconds < 0.1 || seconds > 30) return ctx.reply("❌ Harus angka 0.1-30. (05=0.5s) Coba lagi:");
      userStates.set(userId, { ...state, step: "bc_panel", grupDelay: Math.round(seconds * 1000) });
      return ctx.reply(`✅ Jeda grup: *${seconds} detik*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "bc_panel_back")]]) });
    }

    return null; // not handled
  }

  // Handle media/forward messages for broadcast
  function handleBroadcastMedia(ctx, userId, state) {
    if (state.step !== "bc_waiting_message") return null;

    const msg = ctx.message;

    // Simpan info pesan untuk forward
    // Kita simpan message_id dan chat_id agar bisa di-forward
    const bcMessage = {
      msgId: msg.message_id,
      fromChatId: msg.chat.id,
      // Juga simpan text/caption sebagai preview
      text: msg.text || null,
      caption: msg.caption || null,
      type: msg.text ? "text" : msg.photo ? "photo" : msg.video ? "video" : msg.document ? "document" : msg.sticker ? "sticker" : msg.animation ? "animation" : msg.voice ? "voice" : "other",
    };

    userStates.set(userId, { ...state, step: "bc_panel", bcMessage });
    const preview = bcMessage.text || bcMessage.caption || `[${bcMessage.type}]`;

    return ctx.reply(
      `✅ *Pesan disimpan!*\n\n📝 \`${preview.substring(0, 60)}${preview.length > 60 ? "..." : ""}\`\n\n_Pesan akan di-forward apa adanya._`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali ke Panel", "bc_panel_back")]]) }
    );
  }

  return { handleBroadcastText, handleBroadcastMedia, autoBroadcasts };
}

module.exports = { registerBroadcastHandlers };
