/**
 * HEART AI - HEART FM NEWS Auto-Poster Bot (Hardened / Stealth Edition)
 * --------------------------------------------------------------------
 * - Single command: "autopost on" / "autopost off"
 * - Only the admin (UID 61588479630286) can toggle autopost
 * - When ON: posts the latest Philippines + worldwide news (Tagalog support)
 *   to every enabled thread, ~every 8 minutes (with humanized jitter), 24/7.
 * - News images and text are pulled from newsdata.io.
 *
 * Anti-Detection / Anti-Suspension Protections (STEALTH MODE):
 *   1.  Realistic mobile User-Agent rotation per request
 *   2.  Humanized random jitter (±90s) on the 8-minute scheduler so the
 *       posting interval is NEVER perfectly periodic
 *   3.  Typing indicator + 2-7s read-time delay before every reply
 *   4.  Random per-thread send delay (4-13s) so multi-thread posts don't burst
 *   5.  Token-bucket global rate limiter (max 8 sends per minute)
 *   6.  Exponential back-off on send failures (doubles up to 30min)
 *   7.  Auto-pause on Meta challenge / checkpoint / login_required signals
 *   8.  Periodic appstate auto-refresh to disk every 15-25 min (random)
 *   9.  Random presence flips (online/offline) every 4-9 minutes
 *   10. 4 banner variations chosen randomly so messages aren't byte-identical
 *   11. Auto-clears the "we suspect automated behaviour" challenge banner
 *       by NEVER rapid-firing — every action is humanized
 *   12. Crash guards + auto-relogin loop so the bot self-heals
 *   13. Skip self-messages, skip non-admin, never reply to commands twice
 *   14. Cleans message body of zero-width chars before sending (no fingerprints)
 *   15. Drops to safe mode (idle, no posting) if Meta blocks > 3x in 15 min
 *
 * Files:
 *   - main.js          (this file)
 *   - Database.js      (file-based JSON DB)
 *   - appstate.json    (Facebook session cookies)
 *   - package.json
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const Database = require("./Database");

// =====================================================================
// CONFIG
// =====================================================================

const ADMIN_UID = "61588479630286";
const POST_INTERVAL_MS = 8 * 60 * 1000;        // 8 minutes (base)
const POST_JITTER_MS = 90 * 1000;              // ±90s jitter
const APPSTATE_PATH = path.join(__dirname, "appstate.json");
const TMP_DIR = path.join(__dirname, ".tmp");

const NEWS_API_URLS = [
  "https://newsdata.io/api/1/latest?apikey=pub_4b1ec47b99fd4f8a9be3475f69e0f979&q=Philippines",
  "https://newsdata.io/api/1/latest?apikey=pub_4b1ec47b99fd4f8a9be3475f69e0f979&country=ph&language=tl",
  "https://newsdata.io/api/1/latest?apikey=pub_4b1ec47b99fd4f8a9be3475f69e0f979&category=top,world",
];

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// =====================================================================
// LOGGER
// =====================================================================

function ts() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}
const log = {
  info: (...a) => console.log(`[${ts()}] [INFO]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] [WARN]`, ...a),
  error: (...a) => console.error(`[${ts()}] [ERR ]`, ...a),
  ok: (...a) => console.log(`[${ts()}] [ OK ]`, ...a),
  stealth: (...a) => console.log(`[${ts()}] [STLTH]`, ...a),
};

// =====================================================================
// STEALTH UTILITIES
// =====================================================================

const REAL_USER_AGENTS = [
  // Real Android Messenger / Chrome mobile
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  // iPhone Safari + Messenger
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
];

function pickUA() {
  return REAL_USER_AGENTS[Math.floor(Math.random() * REAL_USER_AGENTS.length)];
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// "Human" delay — random 2-7s, used to simulate reading time
function humanDelay(min = 2000, max = 7000) {
  return sleep(rand(min, max));
}

// Strip zero-width / invisible characters that some bot detectors fingerprint
function sanitize(text) {
  return String(text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n");
}

// =====================================================================
// SAFETY STATE — circuit breaker
// =====================================================================

const safety = {
  consecFails: 0,
  blockedUntil: 0,         // backoff timestamp
  challengeMode: false,    // true if Meta returned checkpoint/challenge
  recentFailWindow: [],    // timestamps of recent failures
  postCountThisMinute: 0,
  minuteWindowStart: Date.now(),
  MAX_PER_MINUTE: 8,
};

function noteSendOk() {
  safety.consecFails = 0;
  safety.blockedUntil = 0;
}

function noteSendFail(err) {
  safety.consecFails += 1;
  safety.recentFailWindow.push(Date.now());
  // keep only last 15 min
  safety.recentFailWindow = safety.recentFailWindow.filter(
    (t) => Date.now() - t < 15 * 60 * 1000,
  );

  // exponential backoff: 30s, 60s, 2m, 4m, ... cap 30 min
  const backoffSec = Math.min(30 * 2 ** (safety.consecFails - 1), 1800);
  safety.blockedUntil = Date.now() + backoffSec * 1000;
  log.warn(
    `[stealth] Send failure. Backing off ${backoffSec}s. consecFails=${safety.consecFails}`,
  );

  const msg = String(err?.error || err?.message || err || "").toLowerCase();
  if (
    msg.includes("checkpoint") ||
    msg.includes("login_required") ||
    msg.includes("not logged in") ||
    msg.includes("suspect") ||
    msg.includes("automated") ||
    msg.includes("temporarily restricted") ||
    msg.includes("disabled")
  ) {
    safety.challengeMode = true;
    log.error(
      "[stealth] CHALLENGE / CHECKPOINT detected by Meta. Pausing all sends. Refresh appstate.json with a fresh session.",
    );
  }

  // Too many failures in 15 minutes → safe mode (long pause)
  if (safety.recentFailWindow.length >= 3) {
    safety.blockedUntil = Math.max(
      safety.blockedUntil,
      Date.now() + 30 * 60 * 1000,
    );
    log.error(
      "[stealth] >=3 failures in 15 min — entering 30-minute safe mode.",
    );
  }
}

function canSendNow() {
  if (safety.challengeMode) return false;
  if (Date.now() < safety.blockedUntil) return false;

  // token-bucket per minute
  if (Date.now() - safety.minuteWindowStart > 60 * 1000) {
    safety.minuteWindowStart = Date.now();
    safety.postCountThisMinute = 0;
  }
  if (safety.postCountThisMinute >= safety.MAX_PER_MINUTE) return false;
  return true;
}

function noteSendAttempt() {
  safety.postCountThisMinute += 1;
}

// =====================================================================
// HEART FM NEWS DESIGN / FORMATTING (4 randomized banners)
// =====================================================================

const BANNERS = [
  {
    top:
      "❤️━━━━━━━━━━━━━━━━━━━━❤️\n" +
      "        💖 𝗛𝗘𝗔𝗥𝗧 𝗙𝗠 𝗡𝗘𝗪𝗦 💖\n" +
      "      📰 𝙐𝙥𝙙𝙖𝙩𝙚𝙙 𝙉𝙖 𝘽𝙖𝙡𝙞𝙩𝙖 📰\n" +
      "❤️━━━━━━━━━━━━━━━━━━━━❤️",
    bot:
      "━━━━━━━━━━━━━━━━━━━━━━\n" +
      "💗 HEART FM NEWS • 24/7 LIVE 💗\n" +
      "🇵🇭 Philippines & Worldwide 🌏\n" +
      "━━━━━━━━━━━━━━━━━━━━━━",
  },
  {
    top:
      "💖═══════════════════💖\n" +
      "    🌹 𝗛𝗘𝗔𝗥𝗧 𝗙𝗠 𝗡𝗘𝗪𝗦 🌹\n" +
      "      🔴 𝗟𝗜𝗩𝗘 𝗨𝗣𝗗𝗔𝗧𝗘 🔴\n" +
      "💖═══════════════════💖",
    bot:
      "──────────────────────\n" +
      "💝 𝗛𝗘𝗔𝗥𝗧 𝗙𝗠 𝗡𝗘𝗪𝗦 ─ 𝟮𝟰/𝟳 💝\n" +
      "📡 Pilipinas at Buong Mundo 🌎\n" +
      "──────────────────────",
  },
  {
    top:
      "❣️•─────────────•❣️\n" +
      "    💟 HEART FM NEWS 💟\n" +
      "  📺 BREAKING NEWS UPDATE 📺\n" +
      "❣️•─────────────•❣️",
    bot:
      "•─────────────────────•\n" +
      "💖 𝗛𝗘𝗔𝗥𝗧 𝗙𝗠 ─ 𝙉𝙀𝙒𝙎𝙍𝙊𝙊𝙈 💖\n" +
      "🇵🇭 𝟮𝟰/𝟳 𝙐𝙥𝙙𝙖𝙩𝙚𝙨 🌍\n" +
      "•─────────────────────•",
  },
  {
    top:
      "♥️▬▬▬▬▬▬▬▬▬▬▬▬♥️\n" +
      "    🎙️ HEART FM NEWS 🎙️\n" +
      "    🆕 Pinaka-Bagong Balita 🆕\n" +
      "♥️▬▬▬▬▬▬▬▬▬▬▬▬♥️",
    bot:
      "▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n" +
      "💞 HEART FM NEWS • LIVE 💞\n" +
      "🇵🇭 Philippines + 🌏 World\n" +
      "▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
  },
];

function pickBanner() {
  return BANNERS[Math.floor(Math.random() * BANNERS.length)];
}

function formatNewsMessage(article) {
  const banner = pickBanner();
  const title = sanitize(article.title || "Walang Pamagat").trim();
  const description = sanitize(article.description || article.content || "")
    .trim()
    .slice(0, 700);
  const source = sanitize(article.source_name || article.source_id || "Unknown Source");
  const country = Array.isArray(article.country)
    ? article.country.map((c) => c.toUpperCase()).join(", ")
    : (article.country || "").toString().toUpperCase();
  const category = Array.isArray(article.category)
    ? article.category.join(", ")
    : (article.category || "").toString();
  const pubDate = article.pubDate || new Date().toISOString();
  const link = article.link || "";

  const flag =
    country.includes("PH") || /philippines|pilipinas/i.test(title + description)
      ? "🇵🇭"
      : "🌏";

  return (
    `${banner.top}\n\n` +
    `${flag} 📌 𝗕𝗔𝗟𝗜𝗧𝗔:\n${title}\n\n` +
    (description ? `📝 ${description}\n\n` : "") +
    `🗞️ Source: ${source}\n` +
    (category ? `🏷️ Kategorya: ${category}\n` : "") +
    (country ? `📍 Bansa: ${country}\n` : "") +
    `🕐 Petsa: ${pubDate}\n` +
    (link ? `🔗 ${link}\n` : "") +
    `\n${banner.bot}`
  );
}

// =====================================================================
// HTTP HELPERS (with rotating UA)
// =====================================================================

function fetchJson(url) {
  if (typeof fetch === "function") {
    return fetch(url, {
      headers: {
        "User-Agent": pickUA(),
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-PH,fil;q=0.9,en;q=0.8",
      },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    });
  }
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(
        url,
        {
          headers: {
            "User-Agent": pickUA(),
            Accept: "application/json,text/plain,*/*",
            "Accept-Language": "en-PH,fil;q=0.9,en;q=0.8",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        },
      )
      .on("error", reject);
  });
}

function downloadFile(url, destPath, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error("Too many redirects"));
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": pickUA(),
          Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
          "Accept-Language": "en-PH,fil;q=0.9,en;q=0.8",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, destPath, hops + 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading image`));
          return;
        }
        const ws = fs.createWriteStream(destPath);
        res.pipe(ws);
        ws.on("finish", () => ws.close(() => resolve(destPath)));
        ws.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Image timeout")));
  });
}

// =====================================================================
// NEWS FETCHING (rotate sources, dedupe, prefer items with images)
// =====================================================================

let newsQueue = [];
let urlIdx = 0;

async function refillNewsQueue() {
  for (let attempt = 0; attempt < NEWS_API_URLS.length; attempt++) {
    const url = NEWS_API_URLS[urlIdx % NEWS_API_URLS.length];
    urlIdx++;
    try {
      log.info(`Fetching news from: ${url.split("?")[0]} ...`);
      const data = await fetchJson(url);
      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) continue;
      const fresh = results
        .filter((a) => a && a.article_id && !Database.hasPosted(a.article_id))
        .sort((a, b) => (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0));
      if (fresh.length === 0) continue;
      newsQueue.push(...fresh);
      log.ok(`Loaded ${fresh.length} fresh articles into queue.`);
      return;
    } catch (e) {
      log.error("News fetch failed:", e.message);
    }
  }
  log.warn("No news could be fetched right now.");
}

async function getNextArticle() {
  if (newsQueue.length === 0) await refillNewsQueue();
  return newsQueue.shift() || null;
}

// =====================================================================
// FACEBOOK LOGIN (ws3-fca preferred, stfca fallback)
// =====================================================================

function loadAppState() {
  if (!fs.existsSync(APPSTATE_PATH)) {
    throw new Error(
      "appstate.json not found. Please paste your Facebook appstate cookies.",
    );
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8"));
  } catch (e) {
    throw new Error(
      "appstate.json is not valid JSON. Replace its contents with your appstate.",
    );
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "appstate.json is empty. Paste a valid Facebook appstate (array of cookies) into appstate.json.",
    );
  }
  return raw;
}

function saveAppState(api) {
  try {
    if (typeof api.getAppState !== "function") return;
    const state = api.getAppState();
    if (Array.isArray(state) && state.length) {
      fs.writeFileSync(APPSTATE_PATH, JSON.stringify(state, null, 2), "utf8");
      log.stealth("Refreshed & saved appstate.json (cookies kept fresh).");
    }
  } catch (e) {
    log.warn("Could not save appstate:", e.message);
  }
}

function loginFB(appState) {
  return new Promise((resolve, reject) => {
    const tryModule = (name) => {
      try {
        return require(name);
      } catch (e) {
        log.warn(`Could not load module "${name}": ${e.message}`);
        return null;
      }
    };

    const candidates = ["ws3-fca", "stfca"];
    let mod = null;
    let chosen = null;
    for (const c of candidates) {
      mod = tryModule(c);
      if (mod) {
        chosen = c;
        break;
      }
    }
    if (!mod) {
      reject(
        new Error(
          "Neither ws3-fca nor stfca is installed. Run: npm install ws3-fca stfca",
        ),
      );
      return;
    }
    log.info(`Using Facebook login module: ${chosen}`);

    const login = typeof mod === "function" ? mod : mod.default || mod.login;
    if (typeof login !== "function") {
      reject(new Error(`Module "${chosen}" does not expose a login function.`));
      return;
    }

    const userAgent = pickUA();
    log.stealth(`Login UA = ${userAgent.slice(0, 60)}...`);

    login({ appState }, (err, api) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        api.setOptions({
          listenEvents: true,
          selfListen: false,
          autoMarkRead: false,        // we'll mark read MANUALLY with delay
          autoMarkDelivery: false,    // same — humanize it
          updatePresence: false,
          forceLogin: true,
          online: false,              // start offline; we flip presence ourselves
          userAgent,
        });
      } catch {
        /* ignore */
      }
      resolve(api);
    });
  });
}

// =====================================================================
// COMMAND HANDLER (humanized response delay + typing indicator)
// =====================================================================

const repliedTo = new Set(); // dedupe by messageID

async function safeSendMessage(api, payload, threadId, replyTo) {
  if (!canSendNow()) {
    log.warn(
      `[stealth] Send blocked (challenge=${safety.challengeMode}, untilSec=${
        Math.max(0, Math.ceil((safety.blockedUntil - Date.now()) / 1000))
      }, perMin=${safety.postCountThisMinute}/${safety.MAX_PER_MINUTE}).`,
    );
    return false;
  }

  // Typing indicator (mimic real human typing)
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(threadId, true);
    }
  } catch {
    /* ignore */
  }

  // realistic typing pause: depends on body length, with floor
  const bodyLen =
    typeof payload === "string"
      ? payload.length
      : (payload?.body?.length || 50);
  const typingMs = Math.min(8000, Math.max(1500, bodyLen * 18 + rand(0, 1500)));
  await sleep(typingMs);

  noteSendAttempt();

  return new Promise((resolve) => {
    api.sendMessage(payload, threadId, (err) => {
      try {
        if (typeof api.sendTypingIndicator === "function") {
          api.sendTypingIndicator(threadId, false);
        }
      } catch {
        /* ignore */
      }
      if (err) {
        noteSendFail(err);
        log.error(
          `Send failed to ${threadId}:`,
          err?.error || err?.message || err,
        );
        resolve(false);
      } else {
        noteSendOk();
        resolve(true);
      }
    }, replyTo);
  });
}

async function handleCommand(api, event) {
  if (!event || event.type !== "message") return;
  const body = (event.body || "").trim();
  if (!body) return;

  const senderId = String(event.senderID || "");
  const threadId = String(event.threadID || "");
  const messageId = String(event.messageID || "");
  const lower = body.toLowerCase();

  // The ONLY command: "autopost on" / "autopost off"
  if (!lower.startsWith("autopost")) return;
  if (repliedTo.has(messageId)) return;
  repliedTo.add(messageId);
  if (repliedTo.size > 500) {
    // keep set bounded
    const arr = Array.from(repliedTo).slice(-300);
    repliedTo.clear();
    arr.forEach((x) => repliedTo.add(x));
  }

  // STEALTH: pretend we read the message like a human (2-7s)
  await humanDelay(2000, 7000);

  // STEALTH: mark as read manually with a small extra delay
  try {
    if (typeof api.markAsRead === "function") {
      setTimeout(
        () => api.markAsRead(threadId, () => {}),
        rand(800, 2500),
      );
    }
  } catch {
    /* ignore */
  }

  if (senderId !== ADMIN_UID) {
    await safeSendMessage(
      api,
      "🚫 𝗔𝗖𝗖𝗘𝗦𝗦 𝗗𝗘𝗡𝗜𝗘𝗗\n\nThe `autopost` command is restricted to the HEART AI admin only.",
      threadId,
      messageId,
    );
    log.warn(`Non-admin ${senderId} tried to use autopost in ${threadId}`);
    return;
  }

  const arg = lower.replace(/^autopost\s*/, "").trim();

  if (arg === "on") {
    Database.setAutopost(true);
    Database.enableThread(threadId);
    await safeSendMessage(
      api,
      `✅ 𝗔𝗨𝗧𝗢𝗣𝗢𝗦𝗧 𝗢𝗡\n\n` +
        `💖 HEART FM NEWS is now LIVE in this thread.\n` +
        `📰 Awtomatikong magpopost ng updated na balita ng Pilipinas at buong mundo.\n` +
        `⏰ Ang interval: humigit-kumulang 8 minuto, 24/7, walang tigil.\n` +
        `🛡️ Stealth Mode: ACTIVE (anti-detection enabled).\n\n` +
        `👑 Admin: ${ADMIN_UID}`,
      threadId,
      messageId,
    );
    log.ok(`Admin enabled autopost for thread ${threadId}`);

    // Don't fire immediately — wait a humanized random delay (60-180s)
    const initialDelay = rand(60, 180) * 1000;
    log.stealth(
      `First post for thread ${threadId} scheduled in ${Math.round(
        initialDelay / 1000,
      )}s (humanized).`,
    );
    setTimeout(
      () => runPostCycle(api).catch((e) => log.error(e.message)),
      initialDelay,
    );
  } else if (arg === "off") {
    Database.disableThread(threadId);
    if (Database.getEnabledThreads().length === 0) {
      Database.setAutopost(false);
    }
    await safeSendMessage(
      api,
      `🛑 𝗔𝗨𝗧𝗢𝗣𝗢𝗦𝗧 𝗢𝗙𝗙\n\n` +
        `💔 HEART FM NEWS autopost has been stopped in this thread.\n` +
        `Use "autopost on" to start again.`,
      threadId,
      messageId,
    );
    log.ok(`Admin disabled autopost for thread ${threadId}`);
  } else {
    await safeSendMessage(
      api,
      `📘 𝗛𝗘𝗔𝗥𝗧 𝗔𝗜 𝗨𝗦𝗔𝗚𝗘\n\n` +
        `• autopost on — start auto-posting news every ~8 minutes\n` +
        `• autopost off — stop auto-posting in this thread\n\n` +
        `(Admin-only command • Stealth Mode active)`,
      threadId,
      messageId,
    );
  }
}

// =====================================================================
// AUTOPOST CYCLE (humanized, rate-limited, jittered)
// =====================================================================

async function postArticleToThread(api, threadId, article) {
  const message = formatNewsMessage(article);

  let attachment = null;
  let cleanupPath = null;
  if (article.image_url) {
    try {
      const ext =
        (article.image_url.split("?")[0].split(".").pop() || "jpg")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 4) || "jpg";
      const fname = `news-${Date.now()}-${rand(1, 1e6)}.${ext}`;
      const fpath = path.join(TMP_DIR, fname);
      await downloadFile(article.image_url, fpath);
      attachment = fs.createReadStream(fpath);
      cleanupPath = fpath;
    } catch (e) {
      log.warn(`Image download failed (${article.image_url}): ${e.message}`);
    }
  }

  const payload = attachment
    ? { body: message, attachment }
    : { body: message };

  const ok = await safeSendMessage(api, payload, threadId, null);
  if (cleanupPath) setTimeout(() => fs.unlink(cleanupPath, () => {}), 60_000);

  if (ok) log.ok(`Posted to ${threadId}: "${(article.title || "").slice(0, 60)}"`);
  return ok;
}

let cyclesRunning = false;

async function runPostCycle(api) {
  if (cyclesRunning) return;
  cyclesRunning = true;
  try {
    if (safety.challengeMode) {
      log.warn("[stealth] Challenge mode — skipping post cycle.");
      return;
    }
    if (Date.now() < safety.blockedUntil) {
      log.warn("[stealth] In backoff window — skipping post cycle.");
      return;
    }
    if (!Database.isAutopostOn()) return;
    const threads = Database.getEnabledThreads();
    if (threads.length === 0) return;

    const article = await getNextArticle();
    if (!article) {
      log.warn("No article available this cycle.");
      return;
    }

    let postedAtLeastOnce = false;
    // Shuffle thread order so it's not deterministic
    const shuffled = [...threads].sort(() => Math.random() - 0.5);
    for (const threadId of shuffled) {
      if (safety.challengeMode) break;
      const ok = await postArticleToThread(api, threadId, article);
      if (ok) postedAtLeastOnce = true;
      // Random per-thread cool-down (4-13s) — humanized
      await sleep(rand(4000, 13000));
    }

    if (postedAtLeastOnce) Database.markPosted(article.article_id);
  } catch (e) {
    log.error("Cycle error:", e.message);
  } finally {
    cyclesRunning = false;
  }
}

function scheduleNextCycle(api) {
  // ±90s humanized jitter around 8 minutes
  const jitter = rand(-POST_JITTER_MS, POST_JITTER_MS);
  const next = POST_INTERVAL_MS + jitter;
  log.stealth(
    `Next cycle in ${Math.round(next / 1000)}s (jitter ${Math.round(
      jitter / 1000,
    )}s).`,
  );
  setTimeout(async () => {
    if (Database.isAutopostOn() && Database.getEnabledThreads().length > 0) {
      await runPostCycle(api);
    }
    scheduleNextCycle(api); // re-arm forever
  }, next);
}

// =====================================================================
// PRESENCE FLIPPER + APPSTATE REFRESH (background stealth tasks)
// =====================================================================

function startPresenceFlipper(api) {
  const flip = () => {
    try {
      const wantOnline = Math.random() > 0.55; // mostly offline
      if (typeof api.setOptions === "function") {
        api.setOptions({ online: wantOnline });
      }
      log.stealth(`Presence flipped to ${wantOnline ? "ONLINE" : "OFFLINE"}.`);
    } catch (e) {
      log.warn("presence flip failed:", e.message);
    }
    setTimeout(flip, rand(4 * 60_000, 9 * 60_000));
  };
  setTimeout(flip, rand(30_000, 90_000));
}

function startAppStateRefresher(api) {
  const refresh = () => {
    saveAppState(api);
    setTimeout(refresh, rand(15 * 60_000, 25 * 60_000));
  };
  setTimeout(refresh, rand(5 * 60_000, 10 * 60_000));
}

// =====================================================================
// LIFECYCLE / WATCHDOG
// =====================================================================

function attachListener(api) {
  const handler = (err, event) => {
    if (err) {
      const m = String(err?.error || err?.message || err).toLowerCase();
      log.error("Listener error:", err?.error || err?.message || err);
      if (
        m.includes("not logged in") ||
        m.includes("login_required") ||
        m.includes("checkpoint")
      ) {
        safety.challengeMode = true;
        log.error(
          "[stealth] Listener detected logout/challenge — will attempt relogin in 5 minutes.",
        );
        setTimeout(bootBot, 5 * 60_000);
      }
      return;
    }
    try {
      handleCommand(api, event);
    } catch (e) {
      log.error("handleCommand crashed:", e.stack || e.message);
    }
  };
  return api.listenMqtt ? api.listenMqtt(handler) : api.listen(handler);
}

let bootInProgress = false;
async function bootBot() {
  if (bootInProgress) return;
  bootInProgress = true;
  try {
    log.info("=========================================");
    log.info("  💖 HEART AI — HEART FM NEWS BOT  💖");
    log.info("       🛡️  STEALTH MODE ACTIVE  🛡️");
    log.info("=========================================");
    log.info(`Admin UID: ${ADMIN_UID}`);
    log.info(`Post interval: ~8 min (±90s jitter), 24/7`);
    log.info(`DB stats: ${JSON.stringify(Database.stats())}`);

    let appState;
    try {
      appState = loadAppState();
    } catch (e) {
      log.error(e.message);
      log.warn("Idle. Will retry in 60s after appstate is provided.");
      setTimeout(() => {
        bootInProgress = false;
        bootBot();
      }, 60_000);
      return;
    }

    let api;
    try {
      api = await loginFB(appState);
      log.ok(`Logged into Facebook as UID: ${api.getCurrentUserID?.()}`);
      safety.challengeMode = false;
      safety.consecFails = 0;
      safety.blockedUntil = 0;
      saveAppState(api);
    } catch (e) {
      log.error("Facebook login failed:", e?.error || e?.message || e);
      log.warn("Retrying login in 90 seconds (humanized backoff)...");
      setTimeout(() => {
        bootInProgress = false;
        bootBot();
      }, 90_000);
      return;
    }

    attachListener(api);
    scheduleNextCycle(api);
    startPresenceFlipper(api);
    startAppStateRefresher(api);

    log.ok("HEART AI is ONLINE. Listening for `autopost` from admin.");
  } finally {
    bootInProgress = false;
  }
}

// Global crash guards — bot must NEVER crash silently.
process.on("uncaughtException", (err) => {
  log.error("uncaughtException:", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection:", reason?.stack || reason?.message || reason);
});

// Tiny health endpoint
const PORT = Number(process.env.PORT) || 5000;
http
  .createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const stats = Database.stats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "HEART AI",
          status: safety.challengeMode ? "challenge_paused" : "alive",
          stealthMode: true,
          autopost: stats.autopost,
          enabledThreads: stats.threads,
          totalPosts: stats.totalPosts,
          lastPostAt: stats.lastPostAt,
          consecFails: safety.consecFails,
          backoffSecLeft: Math.max(
            0,
            Math.ceil((safety.blockedUntil - Date.now()) / 1000),
          ),
          uptimeSec: Math.floor(process.uptime()),
        }),
      );
    } else {
      res.writeHead(404).end("Not Found");
    }
  })
  .listen(PORT, "0.0.0.0", () => {
    log.info(`Health server listening on port ${PORT}`);
  });

bootBot();
