const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const { computeCheck } = require("telegram/Password");
const fs = require("fs");
const path = require("path");
const config = require("./config");

// Simpan state login yang sedang berjalan (per user chat)
const loginStates = new Map();

/**
 * Mulai proses login akun baru
 * @param {string} phone - Nomor telepon
 * @returns {object} - { client, phoneCodeHash }
 */
async function startLogin(phone) {
  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, config.API_ID, config.API_HASH, {
    connectionRetries: 5,
    timeout: 30,
    requestRetries: 3,
    useWSS: false,
  });

  await client.connect();

  const result = await client.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: config.API_ID,
      apiHash: config.API_HASH,
      settings: new Api.CodeSettings({}),
    })
  );

  return {
    client,
    phoneCodeHash: result.phoneCodeHash,
    phone,
  };
}

/**
 * Verifikasi OTP code
 * @param {object} state - Login state { client, phoneCodeHash, phone }
 * @param {string} code - OTP code
 * @returns {object} - { success, needPassword, session, error }
 */
async function verifyCode(state, code) {
  try {
    const result = await state.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: state.phone,
        phoneCodeHash: state.phoneCodeHash,
        phoneCode: code,
      })
    );

    // Login berhasil, simpan session
    const sessionString = state.client.session.save();
    return { success: true, needPassword: false, session: sessionString };
  } catch (err) {
    if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      // Akun punya 2FA
      return { success: false, needPassword: true };
    }
    return { success: false, needPassword: false, error: err.errorMessage || err.message };
  }
}

/**
 * Verifikasi password 2FA
 * @param {object} state - Login state { client }
 * @param {string} password - 2FA password
 * @returns {object} - { success, session, error }
 */
async function verifyPassword(state, password) {
  try {
    const passwordInfo = await state.client.invoke(new Api.account.GetPassword());

    const result = await state.client.invoke(
      new Api.auth.CheckPassword({
        password: await computeCheck(passwordInfo, password),
      })
    );

    const sessionString = state.client.session.save();
    return { success: true, session: sessionString };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Simpan session string ke file
 * @param {string} phone - Nomor telepon (digunakan sebagai nama file)
 * @param {string} sessionString - String session dari Telethon/GramJS
 * @param {object} info - Info tambahan tentang akun
 */
function saveSession(phone, sessionString, info = {}) {
  const sessionsDir = config.SESSIONS_DIR;
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const sanitizedPhone = phone.replace(/[^0-9]/g, "");
  const sessionData = {
    phone: phone,
    session: sessionString,
    info: info,
    createdAt: new Date().toISOString(),
  };

  const filePath = path.join(sessionsDir, `${sanitizedPhone}.json`);
  fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

  return filePath;
}

/**
 * Ambil semua sesi yang tersimpan
 * @returns {Array} - Daftar sesi
 */
function getAllSessions() {
  const sessionsDir = config.SESSIONS_DIR;
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
  const sessions = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), "utf8"));
      sessions.push({
        phone: data.phone,
        info: data.info || {},
        createdAt: data.createdAt,
        fileName: file,
      });
    } catch (err) {
      // skip file yang rusak
    }
  }

  return sessions;
}

/**
 * Hapus sesi berdasarkan nomor telepon
 * @param {string} phone - Nomor telepon
 * @returns {boolean}
 */
function deleteSession(phone) {
  const sanitizedPhone = phone.replace(/[^0-9]/g, "");
  const filePath = path.join(config.SESSIONS_DIR, `${sanitizedPhone}.json`);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Load session string dari file
 * @param {string} phone - Nomor telepon
 * @returns {string|null} - Session string atau null
 */
function loadSession(phone) {
  const sanitizedPhone = phone.replace(/[^0-9]/g, "");
  const filePath = path.join(config.SESSIONS_DIR, `${sanitizedPhone}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return data.session;
  } catch (err) {
    return null;
  }
}

/**
 * Dapatkan info akun dari sesi yang tersimpan
 * @param {string} phone - Nomor telepon
 * @returns {object|null}
 */
async function getAccountInfo(phone) {
  const sessionString = loadSession(phone);
  if (!sessionString) return null;

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    const me = await client.getMe();
    await client.disconnect();

    return {
      id: me.id.toString(),
      firstName: me.firstName || "",
      lastName: me.lastName || "",
      username: me.username || "",
      phone: me.phone || phone,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Ambil daftar semua sesi aktif dari akun Telegram
 * @param {string} phone - Nomor telepon
 * @returns {object} - { success, sessions: [...], currentHash, error }
 */
async function getActiveSessions(phone) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    const result = await client.invoke(new Api.account.GetAuthorizations());
    await client.disconnect();

    const sessions = result.authorizations.map((auth) => ({
      hash: auth.hash.toString(),
      isCurrent: auth.flags & 1 ? true : false, // bit 0 = current session
      deviceModel: auth.deviceModel || "Unknown",
      platform: auth.platform || "Unknown",
      systemVersion: auth.systemVersion || "",
      apiId: auth.apiId,
      appName: auth.appName || "Unknown",
      appVersion: auth.appVersion || "",
      dateCreated: auth.dateCreated,
      dateActive: auth.dateActive,
      ip: auth.ip || "Unknown",
      country: auth.country || "Unknown",
      region: auth.region || "",
    }));

    return { success: true, sessions };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Terminate sesi tertentu dari akun Telegram
 * @param {string} phone - Nomor telepon
 * @param {string} sessionHash - Hash sesi yang ingin dihapus
 * @returns {object} - { success, error }
 */
async function terminateSession(phone, sessionHash) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    await client.invoke(
      new Api.account.ResetAuthorization({
        hash: BigInt(sessionHash),
      })
    );

    await client.disconnect();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Terminate semua sesi lain (kecuali sesi bot saat ini)
 * @param {string} phone - Nomor telepon
 * @returns {object} - { success, error }
 */
async function terminateAllOtherSessions(phone) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    await client.invoke(new Api.auth.ResetAuthorizations());

    await client.disconnect();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Logout sesi bot (keluarkan bot dari akun) dan hapus file session
 * @param {string} phone - Nomor telepon
 * @returns {object} - { success, error }
 */
async function logoutSession(phone) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    await client.invoke(new Api.auth.LogOut());
    await client.disconnect();

    // Hapus file session lokal
    deleteSession(phone);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Export semua session sebagai satu file backup JSON
 * @returns {object} - { success, filePath, data, error }
 */
function createBackup() {
  const sessionsDir = config.SESSIONS_DIR;
  if (!fs.existsSync(sessionsDir)) {
    return { success: false, error: "Tidak ada folder sessions" };
  }

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    return { success: false, error: "Tidak ada session yang tersimpan" };
  }

  const allSessions = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), "utf8"));
      allSessions.push(data);
    } catch (err) {
      // skip file rusak
    }
  }

  if (allSessions.length === 0) {
    return { success: false, error: "Tidak ada session valid" };
  }

  const backupData = {
    version: "1.0",
    createdAt: new Date().toISOString(),
    totalAccounts: allSessions.length,
    sessions: allSessions,
  };

  // Simpan ke file temporary
  const backupDir = path.join(path.dirname(sessionsDir), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `backup_sessions_${timestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

  return { success: true, filePath: backupFilePath, data: backupData };
}

/**
 * Restore session dari data backup - cek validitas masing-masing session
 * @param {object} backupData - Data backup JSON yang sudah di-parse
 * @returns {object} - { success, restored: [...], failed: [...], error }
 */
async function restoreBackup(backupData) {
  if (!backupData || !backupData.sessions || !Array.isArray(backupData.sessions)) {
    return { success: false, error: "Format backup tidak valid" };
  }

  const restored = [];
  const failed = [];

  for (const sessionData of backupData.sessions) {
    if (!sessionData.phone || !sessionData.session) {
      failed.push({
        phone: sessionData.phone || "Unknown",
        reason: "Data tidak lengkap (phone/session missing)",
      });
      continue;
    }

    // Cek apakah session masih valid dengan mencoba connect
    try {
      const client = new TelegramClient(
        new StringSession(sessionData.session),
        config.API_ID,
        config.API_HASH,
        { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
      );
      await client.connect();

      // Cek apakah masih bisa getMe (session masih aktif)
      const me = await client.getMe();
      await client.disconnect();

      // Session valid! Simpan ke folder sessions
      const info = {
        id: me.id ? me.id.toString() : sessionData.info?.id || "",
        firstName: me.firstName || sessionData.info?.firstName || "",
        lastName: me.lastName || sessionData.info?.lastName || "",
        username: me.username || sessionData.info?.username || "",
        phone: me.phone || sessionData.phone,
      };

      saveSession(sessionData.phone, sessionData.session, info);

      restored.push({
        phone: sessionData.phone,
        name: `${info.firstName} ${info.lastName}`.trim(),
        username: info.username,
      });
    } catch (err) {
      failed.push({
        phone: sessionData.phone,
        name: sessionData.info
          ? `${sessionData.info.firstName || ""} ${sessionData.info.lastName || ""}`.trim()
          : "Unknown",
        reason: err.errorMessage || err.message || "Session expired/invalid",
      });
    }
  }

  return { success: true, restored, failed };
}

/**
 * Ubah password 2FA akun
 * @param {string} phone - Nomor telepon
 * @param {string} currentPassword - Password lama
 * @param {string} newPassword - Password baru
 * @param {string} hint - Hint password (opsional)
 * @returns {object} - { success, error }
 */
async function changePassword(phone, currentPassword, newPassword, hint = "") {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    // Update password menggunakan client helper
    await client.updateTwoFaSettings({
      currentPassword: currentPassword,
      newPassword: newPassword,
      hint: hint || "",
    });

    await client.disconnect();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Hapus password 2FA akun
 * @param {string} phone - Nomor telepon
 * @param {string} currentPassword - Password saat ini
 * @returns {object} - { success, error }
 */
async function removePassword(phone, currentPassword) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    await client.updateTwoFaSettings({
      currentPassword: currentPassword,
      newPassword: null,
    });

    await client.disconnect();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Tambah password 2FA baru (akun yang belum punya 2FA)
 * @param {string} phone - Nomor telepon
 * @param {string} newPassword - Password baru
 * @param {string} hint - Hint password
 * @param {string} email - Recovery email (opsional)
 * @returns {object} - { success, error }
 */
async function addPassword(phone, newPassword, hint = "", email = "") {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    const params = {
      newPassword: newPassword,
      hint: hint || "",
    };
    if (email) {
      params.email = email;
      params.emailCodeCallback = async () => "";
      params.onEmailCodeError = () => "";
    }

    await client.updateTwoFaSettings(params);

    await client.disconnect();
    return { success: true };
  } catch (err) {
    if (err.errorMessage && err.errorMessage.includes("EMAIL_UNCONFIRMED")) {
      return { success: true };
    }
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Update/Set recovery email 2FA - Step 1: Trigger kirim kode ke email
 * @param {string} phone - Nomor telepon
 * @param {string} currentPassword - Password 2FA saat ini
 * @param {string} newEmail - Email baru
 * @returns {object} - { success, error }
 */
async function updateEmailSendCode(phone, currentPassword, newEmail) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  let client;
  try {
    client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    // Ini akan trigger Telegram kirim kode ke email
    // Akan throw EMAIL_UNCONFIRMED — itu normal (artinya kode sudah dikirim)
    await client.updateTwoFaSettings({
      currentPassword: currentPassword,
      newPassword: currentPassword,
      email: newEmail,
      emailCodeCallback: async () => { throw new Error("NEED_CODE"); },
      onEmailCodeError: () => { throw new Error("NEED_CODE"); },
    });

    await client.disconnect();
    return { success: true };
  } catch (err) {
    try { if (client) await client.disconnect(); } catch (e) {}
    // EMAIL_UNCONFIRMED artinya kode sudah dikirim ke email — ini sukses
    if (err.errorMessage && err.errorMessage.includes("EMAIL_UNCONFIRMED")) {
      return { success: true };
    }
    if (err.message === "NEED_CODE") {
      return { success: true };
    }
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Update/Set recovery email 2FA - Step 2: Konfirmasi kode email
 * @param {string} phone - Nomor telepon
 * @param {string} code - Kode verifikasi dari email
 * @returns {object} - { success, error }
 */
async function updateEmailConfirmCode(phone, code) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  let client;
  try {
    client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    await client.invoke(new Api.account.ConfirmPasswordEmail({ code: code }));

    await client.disconnect();
    return { success: true };
  } catch (err) {
    try { if (client) await client.disconnect(); } catch (e) {}
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Cek status 2FA akun (ada password atau tidak, ada email atau tidak)
 * @param {string} phone - Nomor telepon
 * @returns {object} - { success, hasPassword, hint, hasRecoveryEmail, emailPattern, error }
 */
async function check2FAStatus(phone) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    await client.disconnect();

    return {
      success: true,
      hasPassword: passwordInfo.hasPassword || false,
      hint: passwordInfo.hint || "",
      hasRecoveryEmail: passwordInfo.hasRecovery || false,
      emailPattern: passwordInfo.emailUnconfirmedPattern || "",
    };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

/**
 * Update info di session file tanpa mengubah session string
 * @param {string} phone - Nomor telepon
 * @param {object} updates - Object berisi field yang ingin di-update (misal: { password, email })
 * @returns {boolean}
 */
function updateSessionInfo(phone, updates) {
  const sanitizedPhone = phone.replace(/[^0-9]/g, "");
  const filePath = path.join(config.SESSIONS_DIR, `${sanitizedPhone}.json`);

  if (!fs.existsSync(filePath)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    data.info = { ...data.info, ...updates };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Cek limit akun via @SpamBot
 * @param {string} phone - Nomor telepon
 * @returns {object} - { success, isLimited, message, error }
 */
async function checkSpamLimit(phone) {
  const sessionString = loadSession(phone);
  if (!sessionString) return { success: false, error: "Session not found" };

  try {
    const client = new TelegramClient(
      new StringSession(sessionString),
      config.API_ID,
      config.API_HASH,
      { connectionRetries: 3, timeout: 30, requestRetries: 3, useWSS: false }
    );
    await client.connect();

    // Kirim /start ke @SpamBot
    const spamBot = await client.getEntity("SpamBot");
    await client.sendMessage(spamBot, { message: "/start" });

    // Tunggu balasan (max 10 detik)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Ambil pesan terakhir dari SpamBot
    const messages = await client.getMessages(spamBot, { limit: 1 });
    await client.disconnect();

    if (messages.length === 0) {
      return { success: false, error: "Tidak ada balasan dari SpamBot" };
    }

    const reply = messages[0].message || "";

    // Cek apakah aman
    const safeKeywords = [
      "no limits",
      "tidak dibatasi",
      "free as a bird",
      "sebebas burung",
      "no restrictions",
    ];

    const isLimited = !safeKeywords.some((kw) => reply.toLowerCase().includes(kw));

    return {
      success: true,
      isLimited: isLimited,
      message: reply,
    };
  } catch (err) {
    return { success: false, error: err.errorMessage || err.message };
  }
}

module.exports = {
  loginStates,
  startLogin,
  verifyCode,
  verifyPassword,
  saveSession,
  getAllSessions,
  deleteSession,
  loadSession,
  getAccountInfo,
  getActiveSessions,
  terminateSession,
  terminateAllOtherSessions,
  logoutSession,
  createBackup,
  restoreBackup,
  changePassword,
  removePassword,
  addPassword,
  updateEmailSendCode,
  updateEmailConfirmCode,
  check2FAStatus,
  updateSessionInfo,
  checkSpamLimit,
};
