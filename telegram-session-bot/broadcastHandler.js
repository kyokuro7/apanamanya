const { Markup } = require("telegraf");
const sessionManager = require("./sessionManager");

// Global auto broadcast state (single toggle for all)
let autoBroadcastState = {
  active: false,
  phones: [],
  forwardInfo: null,
  grupDelay: 500,
  loopDelay: 300000,
  chatId: null,
  statusMsgId: null,
  round: 0,
  currentAccountIndex: 0,
  timeoutId: null,
};

/**
 * Register all broadcast handlers on bot instance
 */
function registerBroadcastHandlers(bot, userStates) {

  // ==================== BROADCAST MENU ====================
  bot.action("broadcast_menu", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    if (sessions.length === 0) {
      return ctx.editMessageText("📢 *Broadcast*\n\nBelum ada akun tersimpan.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Akun", "add_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      });
    }


    // Langsung ke panel multi-account selection
    userStates.set(ctx.from.id, { step: "bc_multi_selecting", selectedPhones: [] });
    return renderMultiSelect(ctx, { selectedPhones: [] });
  });

  // ==================== MULTI ACCOUNT SELECTION (with checkboxes) ====================
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
    state.selectedPhones = state.selectedPhones.length === sessions.length
      ? [] : sessions.map((s) => s.phone);
    userStates.set(ctx.from.id, state);
    return renderMultiSelect(ctx, state);
  });


  function renderMultiSelect(ctx, state) {
    const sessions = sessionManager.getAllSessions();
    const buttons = sessions.map((s) => {
      const name = s.info.firstName
        ? `${s.info.firstName} ${s.info.lastName || ""}`.trim() : s.phone;
      const sel = state.selectedPhones.includes(s.phone) ? "✅" : "⬜";
      return [Markup.button.callback(`${sel} ${name} (${s.phone})`, `bc_mtoggle_${s.phone}`)];
    });
    buttons.push([Markup.button.callback("✅ Pilih Semua", "bc_mselect_all")]);
    buttons.push([Markup.button.callback("➡️ Lanjut", "bc_mselect_done")]);
    buttons.push([Markup.button.callback("◀️ Kembali", "main_menu")]);
    return ctx.editMessageText(
      `📢 *Broadcast - Pilih Akun*\n\n` +
      `_Centang akun yang ingin digunakan:_\n` +
      `Dipilih: *${state.selectedPhones.length}* akun`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
    );
  }

  bot.action("bc_mselect_done", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || state.step !== "bc_multi_selecting") return;
    if (state.selectedPhones.length === 0) {
      return ctx.answerCbQuery("⚠️ Pilih minimal 1 akun!", { show_alert: true });
    }
    userStates.set(ctx.from.id, { step: "bc_panel", phones: state.selectedPhones });
    return renderBroadcastPanel(ctx, state.selectedPhones);
  });


  // ==================== BROADCAST PANEL (single toggle) ====================
  function renderBroadcastPanel(ctx, phones) {
    const sessions = sessionManager.getAllSessions();
    const state = userStates.get(ctx.from?.id || ctx.callbackQuery?.from?.id);
    const loopDelay = (state && state.loopDelay) || autoBroadcastState.loopDelay || 300000;
    const grupDelay = (state && state.grupDelay) || autoBroadcastState.grupDelay || 500;
    const hasForward = !!(state && state.forwardInfo) || !!autoBroadcastState.forwardInfo;
    const isActive = autoBroadcastState.active;

    let text = "📢 *Panel Broadcast Auto*\n\n";
    text += "📋 *Akun yang dipilih:*\n";

    phones.forEach((phone, idx) => {
      const acc = sessions.find((s) => s.phone === phone);
      const name = acc && acc.info.firstName ? acc.info.firstName.trim() : phone;
      const arrow = (isActive && autoBroadcastState.currentAccountIndex === idx) ? "➤ " : "  ";
      text += `${arrow}${idx + 1}. ${name} (\`${phone}\`)\n`;
    });

    const toggleLabel = isActive ? "🟢 AutoBC AKTIF - Matikan" : "🔴 AutoBC MATI - Nyalakan";
    const msgStatus = hasForward ? "✅ Sudah diatur" : "❌ Belum diatur";

    text += `\n⏱ Jeda Putaran: *${loopDelay / 60000} menit*\n`;
    text += `⏱ Jeda Grup: *${grupDelay / 1000} detik*\n`;
    text += `📨 Pesan Forward: ${msgStatus}\n`;
    text += `\n🔄 Rotasi: Akun 1 → selesai → Akun 2 → dst\n`;

    if (isActive) {
      text += `\n📊 Putaran ke: *${autoBroadcastState.round}*\n`;
      text += `👤 Akun aktif: *${autoBroadcastState.currentAccountIndex + 1}/${phones.length}*\n`;
    }

    const buttons = [
      [Markup.button.callback(toggleLabel, "bc_toggle_auto")],
      [Markup.button.callback("📨 Set Pesan (Forward)", "bc_set_forward")],
      [Markup.button.callback("⏱ Set Jeda", "bc_set_delay")],
      [Markup.button.callback("◀️ Kembali", "broadcast_menu")],
    ];

    return ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
  }


  bot.action("bc_panel_back", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) {
      return ctx.editMessageText("❌ Sesi berakhir.", {
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "broadcast_menu")]]),
      });
    }
    return renderBroadcastPanel(ctx, state.phones);
  });

  // ==================== SINGLE TOGGLE ON/OFF ====================
  bot.action("bc_toggle_auto", async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state || !state.phones) return;

    if (autoBroadcastState.active) {
      // MATIKAN AutoBC
      if (autoBroadcastState.timeoutId) {
        clearTimeout(autoBroadcastState.timeoutId);
      }
      autoBroadcastState.active = false;
      autoBroadcastState.timeoutId = null;
      return renderBroadcastPanel(ctx, state.phones);
    } else {
      // NYALAKAN AutoBC
      const forwardInfo = state.forwardInfo || autoBroadcastState.forwardInfo;
      if (!forwardInfo) {
        return ctx.answerCbQuery("⚠️ Set pesan forward dulu!", { show_alert: true });
      }

      const phones = state.phones;
      const grupDelay = state.grupDelay || autoBroadcastState.grupDelay || 500;
      const loopDelay = state.loopDelay || autoBroadcastState.loopDelay || 300000;
      const chatId = ctx.chat.id;

      // Simpan state
      autoBroadcastState = {
        active: true,
        phones: [...phones],
        forwardInfo,
        grupDelay,
        loopDelay,
        chatId,
        statusMsgId: null,
        round: 0,
        currentAccountIndex: 0,
        timeoutId: null,
      };

      // Kirim status message
      const statusMsg = await ctx.reply(
        `🟢 *AutoBC Dimulai!*\n\n` +
        `📋 ${phones.length} akun | Rotasi berurutan\n` +
        `⏳ Memulai putaran pertama...`,
        { parse_mode: "Markdown" }
      );
      autoBroadcastState.statusMsgId = statusMsg.message_id;

      // Mulai putaran
      runAutoBroadcastLoop(bot);

      return renderBroadcastPanel(ctx, state.phones);
    }
  });


  // ==================== AUTO BROADCAST LOOP (rotation) ====================
  async function runAutoBroadcastLoop(bot) {
    if (!autoBroadcastState.active) return;

    autoBroadcastState.round++;
    const { phones, forwardInfo, grupDelay, loopDelay, chatId, statusMsgId } = autoBroadcastState;

    let roundText = `🔄 *AutoBC - Putaran ${autoBroadcastState.round}*\n\n`;
    let totalSent = 0, totalFailed = 0;

    // Rotasi: akun pertama → selesai semua grup → akun kedua → dst
    for (let i = 0; i < phones.length; i++) {
      if (!autoBroadcastState.active) return; // cek apakah masih aktif

      autoBroadcastState.currentAccountIndex = i;
      const phone = phones[i];
      const sessions = sessionManager.getAllSessions();
      const acc = sessions.find((s) => s.phone === phone);
      const name = acc && acc.info.firstName ? acc.info.firstName.trim() : phone;

      // Update status: sedang proses akun ini
      try {
        await bot.telegram.editMessageText(
          chatId, statusMsgId, null,
          roundText + `⏳ Memproses akun ${i + 1}/${phones.length}: *${name}*...`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {}

      // Forward broadcast untuk akun ini - coba forward dulu, fallback ke sendMessage
      const result = await sessionManager.forwardBroadcast(phone, forwardInfo, grupDelay);

      if (result.success) {
        roundText += `✅ ${name}: ${result.sent}/${result.total} grup\n`;
        totalSent += result.sent;
        totalFailed += result.failed;
      } else {
        roundText += `❌ ${name}: ${result.error}\n`;
      }
    }

    roundText += `\n📊 Total: ${totalSent} terkirim, ${totalFailed} gagal\n`;
    roundText += `⏱ Putaran berikutnya: ${loopDelay / 60000} menit`;

    // Update status message
    try {
      await bot.telegram.editMessageText(chatId, statusMsgId, null, roundText, {
        parse_mode: "Markdown",
      });
    } catch (e) {}

    // Schedule putaran berikutnya
    if (autoBroadcastState.active) {
      autoBroadcastState.timeoutId = setTimeout(() => {
        runAutoBroadcastLoop(bot);
      }, loopDelay);
    }
  }


  // ==================== SET PESAN FORWARD ====================
  bot.action("bc_set_forward", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_waiting_forward" });
    return ctx.editMessageText(
      "📨 *Set Pesan Broadcast*\n\n" +
      "Kirim atau forward pesan yang ingin di-broadcast ke sini.\n\n" +
      "✅ Bisa forward dari channel/grup\n" +
      "✅ Bisa kirim pesan langsung (teks)\n\n" +
      "_Pesan akan dikirim ke semua grup dari setiap akun secara bergiliran._",
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
      "🔁 *Jeda Putaran*\n\nMasukkan jeda antar putaran (menit):\n_Default: 5_",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_set_delay")]]),
      }
    );
  });

  bot.action("bc_set_grup_delay", (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return;
    userStates.set(ctx.from.id, { ...state, step: "bc_input_grup_delay" });
    return ctx.editMessageText(
      "📨 *Jeda Grup*\n\nMasukkan jeda antar grup (detik):\n_Default: 0.5 | Contoh: 05 = 0.5s_",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "bc_set_delay")]]),
      }
    );
  });


  // ==================== TEXT HANDLERS ====================
  function handleBroadcastText(ctx, userId, state, text) {
    if (state.step === "bc_input_loop_delay") {
      const min = parseFloat(text);
      if (isNaN(min) || min < 1 || min > 1440) {
        return ctx.reply("❌ Harus angka 1-1440. Coba lagi:");
      }
      const newLoopDelay = Math.round(min * 60000);
      userStates.set(userId, { ...state, step: "bc_panel", loopDelay: newLoopDelay });
      if (autoBroadcastState.active) autoBroadcastState.loopDelay = newLoopDelay;
      return ctx.reply(`✅ Jeda putaran: *${min} menit*`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "bc_panel_back")]]),
      });
    }

    if (state.step === "bc_input_grup_delay") {
      let seconds;
      if (text === "05") seconds = 0.5;
      else seconds = parseFloat(text);
      if (isNaN(seconds) || seconds < 0.1 || seconds > 30) {
        return ctx.reply("❌ Harus angka 0.1-30. Coba lagi:");
      }
      const newGrupDelay = Math.round(seconds * 1000);
      userStates.set(userId, { ...state, step: "bc_panel", grupDelay: newGrupDelay });
      if (autoBroadcastState.active) autoBroadcastState.grupDelay = newGrupDelay;
      return ctx.reply(`✅ Jeda grup: *${seconds} detik*`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "bc_panel_back")]]),
      });
    }

    return null;
  }


  // ==================== FORWARD MESSAGE HANDLER ====================
  function handleBroadcastMedia(ctx, userId, state) {
    if (state.step !== "bc_waiting_forward") return null;

    const msg = ctx.message;

    // Ambil konten pesan (baik forward maupun pesan biasa)
    // Kita simpan text/caption apa adanya untuk dikirim ulang via sendMessage
    const text = msg.text || msg.caption || "";

    if (!text) {
      return ctx.reply(
        "⚠️ Pesan harus mengandung teks!\n\nForward pesan yang memiliki teks/caption.",
        { parse_mode: "Markdown" }
      );
    }

    // Simpan info pesan
    const forwardInfo = {
      // fromPeer & msgIds untuk forward via GramJS (jika akun punya akses ke chat sumber)
      fromPeer: msg.forward_from_chat ? msg.forward_from_chat.id : (msg.forward_from ? msg.forward_from.id : null),
      msgIds: [msg.forward_from_message_id || msg.message_id],
      // Text yang akan dikirim ulang via sendMessage sebagai fallback/utama
      text: text,
      fromChatId: msg.forward_from_chat ? msg.forward_from_chat.id : null,
      fromChatTitle: msg.forward_from_chat ? msg.forward_from_chat.title : null,
      fromUser: msg.forward_from ? msg.forward_from.first_name : (msg.forward_sender_name || null),
    };

    userStates.set(userId, { ...state, step: "bc_panel", forwardInfo });
    autoBroadcastState.forwardInfo = forwardInfo;

    const source = forwardInfo.fromChatTitle || forwardInfo.fromUser || "Langsung";
    return ctx.reply(
      `✅ Pesan broadcast berhasil disimpan!\n\n` +
      `📨 Sumber: *${source}*\n` +
      `📝 Preview: _${text.substring(0, 100)}${text.length > 100 ? "..." : ""}_\n\n` +
      `Pesan ini akan dikirim ke semua grup.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali ke Panel", "bc_panel_back")]]),
      }
    );
  }


  // ==================== JOIN GRUP ====================
  bot.action("join_menu", (ctx) => {
    const sessions = sessionManager.getAllSessions();
    if (sessions.length === 0) {
      return ctx.editMessageText("🔗 *Join Grup*\n\nBelum ada akun tersimpan.", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Tambah Akun", "add_account")],
          [Markup.button.callback("◀️ Kembali", "main_menu")],
        ]),
      });
    }

    const buttons = sessions.map((s) => {
      const name = s.info.firstName
        ? `${s.info.firstName} ${s.info.lastName || ""}`.trim() : s.phone;
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
      `🔗 *Join Grup*\n\n📞 Akun: \`${phone}\`\n\n` +
      `Kirim link grup yang ingin di-join:\n_(Contoh: t.me/namagrup atau t.me/+AbCdEf123)_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "join_menu")]]),
      }
    );
  });


  // Handle text join link
  function handleJoinText(ctx, userId, state, text) {
    if (state.step !== "join_waiting_link") return null;

    const link = text.trim();
    if (!link.includes("t.me/")) {
      return ctx.reply(
        "❌ Format link tidak valid.\nKirim link seperti: `t.me/namagrup` atau `t.me/+AbCdEf123`",
        { parse_mode: "Markdown" }
      );
    }

    return (async () => {
      await ctx.reply(`⏳ Joining \`${link}\`...`, { parse_mode: "Markdown" });

      const result = await sessionManager.joinGroup(state.joinPhone, link);
      const count = (state.joinCount || 0) + (result.success ? 1 : 0);
      userStates.set(userId, { ...state, joinCount: count });

      if (result.success) {
        return ctx.reply(
          `✅ Berhasil join: *${result.title}*\n\n📊 Total join: ${count}\n\nKirim link grup lagi atau tekan Selesai.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[Markup.button.callback("✅ Selesai", "join_done")]]),
          }
        );
      } else {
        return ctx.reply(
          `❌ Gagal join: \`${result.error}\`\n\nKirim link lain atau tekan Selesai.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[Markup.button.callback("✅ Selesai", "join_done")]]),
          }
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

  return { handleBroadcastText, handleBroadcastMedia, handleJoinText, autoBroadcastState };
}

module.exports = { registerBroadcastHandlers };
