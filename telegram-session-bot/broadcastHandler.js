const { Markup } = require("telegraf");
const sessionManager = require("./sessionManager");

// Per-account auto broadcast: Map<phone, { intervalId, message, grupDelay, loopDelay, round, chatId, statusMsgId }>
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
    userStates.set(ctx.from.id, { step: "bc_panel", phones: [phone] });
    return renderAccountPanel(ctx, [phone]);
  });

  // ==================== BANYAK AKUN ====================
  bot.action("bc_multi_account", (ctx) => {
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

  // ==================== PANEL AKUN ====================
  function renderAccountPanel(ctx, phones) {
    const sessions = sessionManager.getAllSessions();
    let text = "📢 *Panel Broadcast*\n\n";

    const buttons = [];

    phones.forEach((phone) => {
      const acc = sessions.find((s) => s.phone === phone);
      const name = acc && acc.info.firstName ? `${acc.info.firstName}`.trim() : phone;
      const isOn = autoBroadcasts.has(phone);
      const status = isOn ? "🟢" : "🔴";
      text += `${status} \`${phone}\` - ${name}\n`;
      buttons.push([Markup.button.callback(`${status} ${name}`, `bc_toggle_${phone}`)]);
    });

    const state = userStates.get(ctx.from?.id || ctx.callbackQuery?.from?.id);
    const loopDelay = (state && state.loopDelay) || 300000;
    const grupDelay = (state && state.grupDelay) || 500;
    const msgStatus = (state && state.bcMessage) ? "✅ Sudah diatur" : "❌ Belum diatur";

    text += `\n⏱ Jeda Putaran: *${loopDelay / 60000} menit*\n`;
    text += `⏱ Jeda Grup: *${grupDelay / 1000} detik*\n`;
    text += `📝 Pesan AutoBC: ${msgStatus}\n`;

    buttons.push([Markup.button.callback("📝 Set Pesan AutoBC", "bc_set_message")]);
    buttons.push([Markup.button.callback("⏱ Set Jeda", "bc_set_delay")]);
    buttons.push([Markup.button.callback("📨 Broadcast Sekali", "bc_once_ask")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "broadcast_menu")]);

    return ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
  }

  bot.action("bc_panel_back", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return ctx.editMessageText("❌ Sesi berakhir.", { ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]) });
    return renderAccountPanel(ctx, state.phones);
  });

  // ==================== TOGGLE ON/OFF PER AKUN (AutoBC) ====================
  bot.action(/^bc_toggle_(.+)$/, async (ctx) => {
    const phone = ctx.match[1];
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return;

    if (autoBroadcasts.has(phone)) {
      // Matikan
      const abc = autoBroadcasts.get(phone);
      clearInterval(abc.intervalId);
      autoBroadcasts.delete(phone);
      return renderAccountPanel(ctx, state.phones);
    } else {
      // Nyalakan
      if (!state.bcMessage) return ctx.answerCbQuery("⚠️ Set pesan AutoBC dulu!", { show_alert: true });

      const loopDelay = state.loopDelay || 300000;
      const grupDelay = state.grupDelay || 500;
      const bcMsg = { ...state.bcMessage };
      const chatId = ctx.chat.id;

      // Kirim pesan status awal
      const statusMsg = await ctx.reply(`🔄 *AutoBC Aktif* - \`${phone}\`\n\n⏳ Putaran 1 dimulai...`, { parse_mode: "Markdown" });
      const statusMsgId = statusMsg.message_id;

      // Fungsi satu putaran
      async function runRound(round) {
        const result = await sessionManager.broadcastMessage(phone, bcMsg, grupDelay);
        const text = `🔄 *AutoBC* - \`${phone}\`\n\n` +
          `📊 Putaran ke-${round}:\n` +
          `✅ Terkirim: ${result.sent || 0}\n` +
          `❌ Gagal: ${result.failed || 0}\n` +
          `📂 Total grup: ${result.total || 0}\n\n` +
          `⏱ Putaran berikutnya: ${loopDelay / 60000} menit`;
        try {
          await bot.telegram.editMessageText(chatId, statusMsgId, null, text, { parse_mode: "Markdown" });
        } catch (e) {}
      }

      // Putaran pertama
      let round = 1;
      await runRound(round);

      // Set interval untuk putaran berikutnya
      const intervalId = setInterval(async () => {
        if (!autoBroadcasts.has(phone)) return;
        round++;
        await runRound(round);
      }, loopDelay);

      autoBroadcasts.set(phone, { intervalId, message: bcMsg, grupDelay, loopDelay, round, chatId, statusMsgId });

      return renderAccountPanel(ctx, state.phones);
    }
  });

  // ==================== SET PESAN (untuk AutoBC) ====================
  bot.action("bc_set_message", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_waiting_autobc_message" });
    return ctx.editMessageText(
      "📝 *Set Pesan AutoBC*\n\nKirim pesan yang akan dipakai untuk AutoBC:",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_panel_back")]]) }
    );
  });

  // ==================== BROADCAST SEKALI (minta pesan langsung) ====================
  bot.action("bc_once_ask", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_waiting_once_message" });
    return ctx.editMessageText(
      "📨 *Broadcast Sekali*\n\nKirim pesan yang ingin di-broadcast sekarang:",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_panel_back")]]) }
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
    return ctx.editMessageText("🔁 *Jeda Putaran*\n\nMasukkan jeda antar putaran (menit):\n_Default: 5_", {
      parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_set_delay")]]),
    });
  });

  bot.action("bc_set_grup_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_input_grup_delay" });
    return ctx.editMessageText("📨 *Jeda Grup*\n\nMasukkan jeda antar grup (detik):\n_Default: 0.5 | Contoh: 05 = 0.5s_", {
      parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_set_delay")]]),
    });
  });

  // ==================== TEXT HANDLERS ====================
  function handleBroadcastText(ctx, userId, state, text) {
    if (state.step === "bc_input_loop_delay") {
      const min = parseFloat(text);
      if (isNaN(min) || min < 1 || min > 1440) return ctx.reply("❌ Harus angka 1-1440. Coba lagi:");
      userStates.set(userId, { ...state, step: "bc_panel", loopDelay: Math.round(min * 60000) });
      return ctx.reply(`✅ Jeda putaran: *${min} menit*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "bc_panel_back")]]) });
    }

    if (state.step === "bc_input_grup_delay") {
      let seconds;
      if (text === "05") seconds = 0.5;
      else seconds = parseFloat(text);
      if (isNaN(seconds) || seconds < 0.1 || seconds > 30) return ctx.reply("❌ Harus angka 0.1-30. Coba lagi:");
      userStates.set(userId, { ...state, step: "bc_panel", grupDelay: Math.round(seconds * 1000) });
      return ctx.reply(`✅ Jeda grup: *${seconds} detik*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "bc_panel_back")]]) });
    }

    return null;
  }

  // ==================== MESSAGE HANDLER (for set pesan & broadcast sekali) ====================
  function handleBroadcastMedia(ctx, userId, state) {
    if (state.step !== "bc_waiting_autobc_message" && state.step !== "bc_waiting_once_message") return null;

    const msg = ctx.message;
    // Simpan teks apa adanya (GramJS akan kirim sebagai plain text)
    const bcMessage = {
      text: msg.text || msg.caption || "",
      type: msg.text ? "text" : msg.photo ? "photo" : msg.video ? "video" : msg.document ? "document" : msg.sticker ? "sticker" : "other",
    };

    if (!bcMessage.text && bcMessage.type === "text") return null;

    if (state.step === "bc_waiting_autobc_message") {
      // Set pesan untuk AutoBC
      userStates.set(userId, { ...state, step: "bc_panel", bcMessage });
      return ctx.reply("Pesan telah di-setting ✅", {
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali ke Panel", "bc_panel_back")]]),
      });
    }

    if (state.step === "bc_waiting_once_message") {
      // Broadcast sekali langsung
      userStates.set(userId, { ...state, step: "bc_panel" });
      return doBroadcastOnce(ctx, state.phones, bcMessage, state.grupDelay || 500);
    }

    return null;
  }

  // Eksekusi broadcast sekali
  async function doBroadcastOnce(ctx, phones, bcMessage, grupDelay) {
    const statusMsg = await ctx.reply(`⏳ *Broadcasting...*\n📨 ${phones.length} akun`, { parse_mode: "Markdown" });

    let text = "📢 *Hasil Broadcast*\n\n";
    let totalSent = 0, totalFailed = 0;

    for (const phone of phones) {
      const result = await sessionManager.broadcastMessage(phone, bcMessage, grupDelay);
      if (result.success) {
        text += `✅ \`${phone}\`: ${result.sent}/${result.total} grup\n`;
        totalSent += result.sent;
        totalFailed += result.failed;
      } else {
        text += `❌ \`${phone}\`: ${result.error}\n`;
      }
    }

    text += `\n📊 Total: ${totalSent} terkirim, ${totalFailed} gagal`;

    try {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, text, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali ke Panel", "bc_panel_back")]]),
      });
    } catch (e) {
      await ctx.reply(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali ke Panel", "bc_panel_back")]]) });
    }
  }

  // ==================== JOIN GRUP ====================
  bot.action("join_menu", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    if (sessions.length === 0) {
      return ctx.editMessageText("🔗 *Join Grup*\n\nBelum ada akun tersimpan.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("➕ Tambah Akun", "add_account")], [Markup.button.callback("◀️ Kembali", "main_menu")]]),
      });
    }

    const buttons = sessions.map((s) => {
      const name = s.info.firstName ? `${s.info.firstName} ${s.info.lastName || ""}`.trim() : s.phone;
      return [Markup.button.callback(`📞 ${name} (${s.phone})`, `join_pick_${s.phone}`)];
    });
    buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);

    return ctx.editMessageText("🔗 *Join Grup*\n\nPilih akun yang ingin join grup:", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  });

  bot.action(/^join_pick_(.+)$/, (ctx) => {
    const phone = ctx.match[1];
    userStates.set(ctx.from.id, { step: "join_waiting_link", joinPhone: phone, joinCount: 0 });
    return ctx.editMessageText(
      `🔗 *Join Grup*\n\n📞 Akun: \`${phone}\`\n\nKirim link grup yang ingin di-join:\n_(Contoh: t.me/namagrup atau t.me/+AbCdEf123)_`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "join_menu")]]) }
    );
  });

  // Handle text join link (inside handleBroadcastText)
  function handleJoinText(ctx, userId, state, text) {
    if (state.step !== "join_waiting_link") return null;

    const link = text.trim();
    // Validasi format link
    if (!link.includes("t.me/")) {
      return ctx.reply("❌ Format link tidak valid.\nKirim link seperti: `t.me/namagrup` atau `t.me/+AbCdEf123`", { parse_mode: "Markdown" });
    }

    // Proses join
    return (async () => {
      await ctx.reply(`⏳ Joining \`${link}\`...`, { parse_mode: "Markdown" });

      const result = await sessionManager.joinGroup(state.joinPhone, link);
      const count = (state.joinCount || 0) + (result.success ? 1 : 0);
      userStates.set(userId, { ...state, joinCount: count });

      if (result.success) {
        return ctx.reply(
          `✅ Berhasil join: *${result.title}*\n\n📊 Total join: ${count}\n\nKirim link grup lagi atau tekan Selesai.`,
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("✅ Selesai", "join_done")]]) }
        );
      } else {
        return ctx.reply(
          `❌ Gagal join: \`${result.error}\`\n\nKirim link lain atau tekan Selesai.`,
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("✅ Selesai", "join_done")]]) }
        );
      }
    })();
  }

  bot.action("join_done", (ctx) => {
    const state = userStates.get(ctx.from.id);
    const count = state ? state.joinCount || 0 : 0;
    userStates.delete(ctx.from.id);
    return ctx.editMessageText(`✅ *Selesai!*\n\nTotal grup berhasil di-join: *${count}*`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Menu Utama", "main_menu")]]),
    });
  });

  return { handleBroadcastText, handleBroadcastMedia, handleJoinText, autoBroadcasts };
}

module.exports = { registerBroadcastHandlers };
