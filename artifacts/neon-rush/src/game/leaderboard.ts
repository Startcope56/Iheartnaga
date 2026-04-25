export interface LeaderboardEntry {
  name: string;
  timeMs: number;
  date: number;
  topSpeed: number;
}

const STORAGE_KEY = "neon-rush-leaderboard-v1";
const NAME_KEY = "neon-rush-player-name";
const MAX_ENTRIES = 10;

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          typeof e?.name === "string" &&
          typeof e?.timeMs === "number" &&
          typeof e?.date === "number",
      )
      .sort((a, b) => a.timeMs - b.timeMs)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveScore(entry: LeaderboardEntry): LeaderboardEntry[] {
  const existing = loadLeaderboard();
  const next = [...existing, entry]
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearLeaderboard(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "PILOT";
  } catch {
    return "PILOT";
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--.---";
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const mss = Math.floor(ms % 1000);
  return `${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}.${mss.toString().padStart(3, "0")}`;
}

export function getRankFor(timeMs: number, board: LeaderboardEntry[]): number {
  let rank = 1;
  for (const e of board) {
    if (e.timeMs < timeMs) rank++;
  }
  return rank;
}
