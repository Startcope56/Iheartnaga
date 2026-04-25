/**
 * Database.js
 * Free, file-based JSON database with unlimited storage.
 * Used by HEART AI to persist autopost state, enabled threads,
 * and the IDs of news articles already posted (to avoid duplicates).
 */

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "database.json");

const DEFAULT_DATA = {
  autopost: false,             // global on/off switch
  enabledThreads: [],          // thread IDs that have autopost enabled
  postedArticleIds: [],        // de-dup memory for news article IDs
  lastPostAt: 0,               // timestamp ms of last successful post
  totalPosts: 0,               // running counter
  threadStats: {},             // per-thread counters: { [threadId]: { postsToday, postsThisHour, dayKey, hourKey, lastPostAt } }
  createdAt: Date.now(),
};

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function hourKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${dayKey(ts)}-${d.getUTCHours()}`;
}

let cache = null;
let writeQueued = false;

function ensureFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
  }
}

function load() {
  if (cache) return cache;
  ensureFile();
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    cache = { ...DEFAULT_DATA, ...parsed };
  } catch (err) {
    console.error("[DB] Failed to read database, resetting:", err.message);
    cache = { ...DEFAULT_DATA };
    persistNow();
  }
  return cache;
}

function persistNow() {
  if (!cache) return;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("[DB] Failed to write database:", err.message);
  }
}

function save() {
  if (writeQueued) return;
  writeQueued = true;
  setTimeout(() => {
    writeQueued = false;
    persistNow();
  }, 200);
}

const Database = {
  // -- generic getters/setters --
  get(key) {
    return load()[key];
  },
  set(key, value) {
    const data = load();
    data[key] = value;
    save();
    return value;
  },
  all() {
    return { ...load() };
  },

  // -- autopost state --
  isAutopostOn() {
    return load().autopost === true;
  },
  setAutopost(on) {
    const data = load();
    data.autopost = !!on;
    save();
    return data.autopost;
  },

  // -- thread management --
  getEnabledThreads() {
    return [...load().enabledThreads];
  },
  enableThread(threadId) {
    const data = load();
    if (!data.enabledThreads.includes(threadId)) {
      data.enabledThreads.push(threadId);
      save();
    }
    return data.enabledThreads;
  },
  disableThread(threadId) {
    const data = load();
    data.enabledThreads = data.enabledThreads.filter((t) => t !== threadId);
    save();
    return data.enabledThreads;
  },
  isThreadEnabled(threadId) {
    return load().enabledThreads.includes(threadId);
  },

  // -- posted articles dedup (cap to last 500) --
  hasPosted(articleId) {
    return load().postedArticleIds.includes(articleId);
  },
  markPosted(articleId) {
    const data = load();
    if (!data.postedArticleIds.includes(articleId)) {
      data.postedArticleIds.push(articleId);
      if (data.postedArticleIds.length > 500) {
        data.postedArticleIds = data.postedArticleIds.slice(-500);
      }
      data.totalPosts = (data.totalPosts || 0) + 1;
      data.lastPostAt = Date.now();
      save();
    }
  },

  // -- per-thread post-rate accounting (anti-spam protection) --
  recordThreadPost(threadId) {
    const data = load();
    if (!data.threadStats) data.threadStats = {};
    const today = dayKey();
    const hour = hourKey();
    const s = data.threadStats[threadId] || {
      postsToday: 0,
      postsThisHour: 0,
      dayKey: today,
      hourKey: hour,
      lastPostAt: 0,
    };
    if (s.dayKey !== today) {
      s.dayKey = today;
      s.postsToday = 0;
    }
    if (s.hourKey !== hour) {
      s.hourKey = hour;
      s.postsThisHour = 0;
    }
    s.postsToday += 1;
    s.postsThisHour += 1;
    s.lastPostAt = Date.now();
    data.threadStats[threadId] = s;
    save();
    return s;
  },
  getThreadPostCounts(threadId) {
    const data = load();
    const today = dayKey();
    const hour = hourKey();
    const s = (data.threadStats || {})[threadId] || {
      postsToday: 0,
      postsThisHour: 0,
      dayKey: today,
      hourKey: hour,
      lastPostAt: 0,
    };
    return {
      postsToday: s.dayKey === today ? s.postsToday : 0,
      postsThisHour: s.hourKey === hour ? s.postsThisHour : 0,
      lastPostAt: s.lastPostAt || 0,
    };
  },

  // -- stats --
  stats() {
    const d = load();
    return {
      autopost: d.autopost,
      threads: d.enabledThreads.length,
      totalPosts: d.totalPosts || 0,
      lastPostAt: d.lastPostAt || 0,
      remembered: d.postedArticleIds.length,
    };
  },
};

module.exports = Database;
