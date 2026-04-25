/**
 * HEART AI - HEART FM NEWS Auto-Poster Bot
 * ----------------------------------------
 * - Single command: "autopost on" / "autopost off"
 * - Only the admin (UID 61588479630286) can toggle autopost
 * - When ON: posts the latest Philippines + worldwide news (Tagalog support)
 *   to every enabled thread every 8 minutes, 24/7, non-stop.
 * - News images and text are pulled from newsdata.io.
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
const POST_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes
const NEWS_API_URLS = [
  "https://newsdata.io/api/1/latest?apikey=pub_4b1ec47b99fd4f8a9be3475f69e0f979&q=Philippines",
  "https://newsdata.io/api/1/latest?apikey=pub_4b1ec47b99fd4f8a9be3475f69e0f979&country=ph&language=tl",
  "https://newsdata.io/api/1/latest?apikey=pub_4b1ec47b99fd4f8a9be3475f69e0f979&category=top,world",
];
const APPSTATE_PATH = path.join(__dirname, "appstate.json");
const TMP_DIR = path.join(__dirname, ".tmp");

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
};

// =====================================================================
// HEART FM NEWS DESIGN / FORMATTING
// =====================================================================

const BANNER_TOP =
  "❤️━━━━━━━━━━━━━━━━━━━━❤️\n" +
  "        💖 𝗛𝗘𝗔𝗥𝗧 𝗙𝗠 𝗡𝗘𝗪𝗦 💖\n" +
  "      📰 𝙐𝙥𝙙𝙖𝙩𝙚𝙙 𝙉𝙖 𝘽𝙖𝙡𝙞𝙩𝙖 📰\n" +
  "❤️━━━━━━━━━━━━━━━━━━━━❤️";

const BANNER_BOTTOM =
  "━━━━━━━━━━━━━━━━━━━━━━\n" +
  "💗 HEART FM NEWS • 24/7 LIVE 💗\n" +
  "🇵🇭 Philippines & Worldwide 🌏\n" +
  "━━━━━━━━━━━━━━━━━━━━━━";

function formatNewsMessage(article) {
  const title = (article.title || "Walang Pamagat").trim();
  const description = (article.description || article.content || "")
    .toString()
    .trim()
    .slice(0, 700);
  const source = article.source_name || article.source_id || "Unknown Source";
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
    `${BANNER_TOP}\n\n` +
    `${flag} 📌 𝗕𝗔𝗟𝗜𝗧𝗔:\n${title}\n\n` +
    (description ? `📝 ${description}\n\n` : "") +
    `🗞️ Source: ${source}\n` +
    (category ? `🏷️ Kategorya: ${category}\n` : "") +
    (country ? `📍 Bansa: ${country}\n` : "") +
    `🕐 Petsa: ${pubDate}\n` +
    (link ? `🔗 ${link}\n` : "") +
    `\n${BANNER_BOTTOM}`
  );
}

// =====================================================================
// FETCH (Node 18+ has global fetch; fallback to https)
// =====================================================================

function fetchJson(url) {
  if (typeof fetch === "function") {
    return fetch(url, {
      headers: { "User-Agent": "HEART-AI/1.0 (+https://heart-fm.news)" },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    });
  }
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, { headers: { "User-Agent": "HEART-AI/1.0" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; HEART-AI/1.0; +https://heart-fm.news)",
          Accept: "image/*,*/*;q=0.8",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // follow redirect
          downloadFile(res.headers.location, destPath).then(resolve, reject);
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
    req.setTimeout(20000, () => {
      req.destroy(new Error("Image download timeout"));
    });
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
      if (results.length === 0) {
        log.warn("News API returned no results, trying next source.");
        continue;
      }
      // Prefer articles with images and that we haven't posted yet
      const fresh = results
        .filter((a) => a && a.article_id && !Database.hasPosted(a.article_id))
        .sort((a, b) => {
          const ai = a.image_url ? 1 : 0;
          const bi = b.image_url ? 1 : 0;
          return bi - ai;
        });
      if (fresh.length === 0) {
        log.warn("All articles already posted, trying next source.");
        continue;
      }
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
  if (newsQueue.length === 0) {
    await refillNewsQueue();
  }
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

    login({ appState }, (err, api) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        api.setOptions({
          listenEvents: true,
          selfListen: false,
          autoMarkRead: true,
          autoMarkDelivery: true,
          updatePresence: false,
          forceLogin: true,
          online: true,
          userAgent:
            "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        });
      } catch {
        /* ignore */
      }
      resolve(api);
    });
  });
}

// =====================================================================
// COMMAND HANDLER
// =====================================================================

function handleCommand(api, event) {
  if (!event || event.type !== "message") return;
  const body = (event.body || "").trim();
  if (!body) return;

  const senderId = String(event.senderID || "");
  const threadId = String(event.threadID || "");
  const lower = body.toLowerCase();

  // The ONLY command: "autopost on" / "autopost off"
  if (!lower.startsWith("autopost")) return;

  if (senderId !== ADMIN_UID) {
    api.sendMessage(
      "🚫 𝗔𝗖𝗖𝗘𝗦𝗦 𝗗𝗘𝗡𝗜𝗘𝗗\n\nThe `autopost` command is restricted to the HEART AI admin only.",
      threadId,
      event.messageID,
    );
    log.warn(`Non-admin ${senderId} tried to use autopost in ${threadId}`);
    return;
  }

  const arg = lower.replace(/^autopost\s*/, "").trim();

  if (arg === "on") {
    Database.setAutopost(true);
    Database.enableThread(threadId);
    api.sendMessage(
      `✅ 𝗔𝗨𝗧𝗢𝗣𝗢𝗦𝗧 𝗢𝗡\n\n` +
        `💖 HEART FM NEWS is now LIVE in this thread.\n` +
        `📰 Awtomatikong magpopost ng updated na balita ng Pilipinas at buong mundo.\n` +
        `⏰ Ang interval: bawat 8 minuto, 24/7, walang tigil.\n\n` +
        `👑 Admin: ${ADMIN_UID}`,
      threadId,
      event.messageID,
    );
    log.ok(`Admin enabled autopost for thread ${threadId}`);
    runPostCycle(api).catch((e) => log.error("immediate post error:", e.message));
  } else if (arg === "off") {
    Database.disableThread(threadId);
    if (Database.getEnabledThreads().length === 0) {
      Database.setAutopost(false);
    }
    api.sendMessage(
      `🛑 𝗔𝗨𝗧𝗢𝗣𝗢𝗦𝗧 𝗢𝗙𝗙\n\n` +
        `💔 HEART FM NEWS autopost has been stopped in this thread.\n` +
        `Use "autopost on" to start again.`,
      threadId,
      event.messageID,
    );
    log.ok(`Admin disabled autopost for thread ${threadId}`);
  } else {
    api.sendMessage(
      `📘 𝗛𝗘𝗔𝗥𝗧 𝗔𝗜 𝗨𝗦𝗔𝗚𝗘\n\n` +
        `• autopost on — start auto-posting news every 8 minutes\n` +
        `• autopost off — stop auto-posting in this thread\n\n` +
        `(Admin-only command)`,
      threadId,
      event.messageID,
    );
  }
}

// =====================================================================
// AUTOPOST CYCLE
// =====================================================================

async function postArticleToThread(api, threadId, article) {
  const message = formatNewsMessage(article);

  let attachment = null;
  if (article.image_url) {
    try {
      const ext = (article.image_url.split("?")[0].split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 4) || "jpg";
      const fname = `news-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
      const fpath = path.join(TMP_DIR, fname);
      await downloadFile(article.image_url, fpath);
      attachment = fs.createReadStream(fpath);
      // Cleanup later
      setTimeout(() => fs.unlink(fpath, () => {}), 60_000);
    } catch (e) {
      log.warn(`Image download failed (${article.image_url}): ${e.message}`);
      attachment = null;
    }
  }

  return new Promise((resolve) => {
    const payload = attachment ? { body: message, attachment } : { body: message };
    api.sendMessage(payload, threadId, (err) => {
      if (err) {
        log.error(`Send failed to ${threadId}:`, err.error || err.message || err);
        resolve(false);
      } else {
        log.ok(`Posted to ${threadId}: "${(article.title || "").slice(0, 60)}"`);
        resolve(true);
      }
    });
  });
}

let cyclesRunning = false;

async function runPostCycle(api) {
  if (cyclesRunning) return;
  cyclesRunning = true;
  try {
    if (!Database.isAutopostOn()) return;
    const threads = Database.getEnabledThreads();
    if (threads.length === 0) return;

    const article = await getNextArticle();
    if (!article) {
      log.warn("No article available this cycle.");
      return;
    }

    let postedAtLeastOnce = false;
    for (const threadId of threads) {
      const ok = await postArticleToThread(api, threadId, article);
      if (ok) postedAtLeastOnce = true;
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (postedAtLeastOnce) {
      Database.markPosted(article.article_id);
    }
  } catch (e) {
    log.error("Cycle error:", e.message);
  } finally {
    cyclesRunning = false;
  }
}

function startAutopostScheduler(api) {
  log.info(
    `Autopost scheduler armed. Interval = ${POST_INTERVAL_MS / 1000}s (24/7).`,
  );
  // Don't fire immediately on boot — only when admin enables it via command,
  // but keep the interval alive forever so it never stops once enabled.
  setInterval(() => {
    if (Database.isAutopostOn() && Database.getEnabledThreads().length > 0) {
      runPostCycle(api).catch((e) =>
        log.error("Scheduled cycle error:", e.message),
      );
    }
  }, POST_INTERVAL_MS);
}

// =====================================================================
// LIFECYCLE / WATCHDOG
// =====================================================================

function attachListener(api) {
  const stop = api.listenMqtt
    ? api.listenMqtt((err, event) => {
        if (err) {
          log.error("Listener error:", err.error || err.message || err);
          return;
        }
        try {
          handleCommand(api, event);
        } catch (e) {
          log.error("handleCommand crashed:", e.stack || e.message);
        }
      })
    : api.listen((err, event) => {
        if (err) {
          log.error("Listener error:", err.error || err.message || err);
          return;
        }
        try {
          handleCommand(api, event);
        } catch (e) {
          log.error("handleCommand crashed:", e.stack || e.message);
        }
      });
  return stop;
}

async function bootBot() {
  log.info("=========================================");
  log.info("  💖 HEART AI — HEART FM NEWS BOT  💖");
  log.info("=========================================");
  log.info(`Admin UID: ${ADMIN_UID}`);
  log.info(`Post interval: ${POST_INTERVAL_MS / 60000} minutes (24/7)`);
  log.info(`DB stats: ${JSON.stringify(Database.stats())}`);

  let appState;
  try {
    appState = loadAppState();
  } catch (e) {
    log.error(e.message);
    log.warn(
      "The bot will idle and retry every 60s. Paste your appstate into appstate.json to start.",
    );
    setTimeout(bootBot, 60_000);
    return;
  }

  let api;
  try {
    api = await loginFB(appState);
    log.ok(`Logged into Facebook as UID: ${api.getCurrentUserID?.()}`);
  } catch (e) {
    log.error("Facebook login failed:", e?.error || e?.message || e);
    log.warn("Retrying login in 60 seconds...");
    setTimeout(bootBot, 60_000);
    return;
  }

  attachListener(api);
  startAutopostScheduler(api);

  log.ok("HEART AI is ONLINE and listening for the `autopost` command.");
}

// Global crash guards — the bot must NEVER stop posting once started.
process.on("uncaughtException", (err) => {
  log.error("uncaughtException:", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection:", reason?.stack || reason?.message || reason);
});

// Tiny health HTTP endpoint so Replit keeps the workflow alive cleanly.
const PORT = Number(process.env.PORT) || 5000;
http
  .createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const stats = Database.stats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "HEART AI",
          status: "alive",
          autopost: stats.autopost,
          enabledThreads: stats.threads,
          totalPosts: stats.totalPosts,
          lastPostAt: stats.lastPostAt,
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
