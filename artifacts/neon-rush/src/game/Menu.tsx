import { useEffect, useState } from "react";
import {
  LeaderboardEntry,
  formatTime,
  loadLeaderboard,
  loadPlayerName,
  savePlayerName,
  clearLeaderboard,
  getRankFor,
} from "./leaderboard";
import { TOTAL_LAPS } from "./trackData";

interface MainMenuProps {
  onStart: (name: string) => void;
}

export function MainMenu({ onStart }: MainMenuProps) {
  const [name, setName] = useState(loadPlayerName());
  const [board, setBoard] = useState<LeaderboardEntry[]>(() =>
    loadLeaderboard(),
  );

  useEffect(() => {
    setBoard(loadLeaderboard());
  }, []);

  const start = () => {
    const cleaned = (name || "PILOT").toUpperCase().slice(0, 10);
    savePlayerName(cleaned);
    onStart(cleaned);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#03000c]/80 backdrop-blur">
      <div className="absolute inset-0 scanlines pointer-events-none" />
      <div className="relative w-[min(900px,92vw)] grid md:grid-cols-2 gap-6 p-8 glass neon-border-magenta rounded-lg">
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[12px] tracking-[0.5em] text-[var(--neon-cyan)] uppercase">
              Velocity Protocol
            </div>
            <h1
              className="text-6xl font-black neon-text leading-none mt-1 flicker"
              style={{
                background:
                  "linear-gradient(135deg, #00f0ff 0%, #ff00d4 60%, #fff200 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                color: "transparent",
                textShadow: "0 0 24px rgba(255,0,212,0.6)",
              }}
            >
              NEON
              <br />
              RUSH
            </h1>
            <div className="text-xs tracking-[0.4em] text-[var(--neon-magenta)] uppercase mt-2">
              {TOTAL_LAPS} Laps · 1 Track · Infinite Glory
            </div>
          </div>

          <div className="text-sm text-white/80 leading-relaxed">
            <p>
              The Hypergrid awaits. Burn through neon canyons, slam into
              boost pads to break the sound barrier, and carve the perfect
              line. Three laps. One winner. Your time. Your legend.
            </p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.4em] text-[var(--neon-cyan)] mb-1">
              Pilot Callsign
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9 _-]/g, "")
                    .slice(0, 10),
                )
              }
              className="w-full bg-black/60 neon-border rounded px-3 py-2 text-2xl font-black tracking-[0.2em] text-[var(--neon-cyan)] outline-none focus:shadow-[0_0_20px_#00f0ff]"
              maxLength={10}
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <ControlHint k="W ↑" label="Accelerate" />
            <ControlHint k="S ↓" label="Reverse" />
            <ControlHint k="A ←" label="Steer Left" />
            <ControlHint k="D →" label="Steer Right" />
            <ControlHint k="Space" label="Brake" />
            <ControlHint k="R" label="Reset Position" />
          </div>

          <button
            onClick={start}
            className="btn-neon btn-neon-magenta text-lg pulse-glow"
          >
            ► Engage Race
          </button>
        </div>

        <div className="flex flex-col">
          <LeaderboardTable
            board={board}
            onClear={() => {
              clearLeaderboard();
              setBoard([]);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ControlHint({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="px-2 py-1 rounded glass neon-border text-[var(--neon-cyan)] font-mono">
        {k}
      </span>
      <span className="text-white/70 uppercase tracking-widest">{label}</span>
    </div>
  );
}

interface FinishScreenProps {
  totalTimeMs: number;
  bestLapMs: number;
  topSpeed: number;
  playerName: string;
  rank: number;
  board: LeaderboardEntry[];
  onRestart: () => void;
  onMenu: () => void;
}

export function FinishScreen({
  totalTimeMs,
  bestLapMs,
  topSpeed,
  playerName,
  rank,
  board,
  onRestart,
  onMenu,
}: FinishScreenProps) {
  const isPodium = rank <= 3;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#03000c]/85 backdrop-blur">
      <div className="absolute inset-0 scanlines pointer-events-none" />
      <div className="relative w-[min(820px,92vw)] grid md:grid-cols-2 gap-6 p-8 glass neon-border rounded-lg">
        <div className="flex flex-col gap-4">
          <div className="text-[12px] tracking-[0.5em] text-[var(--neon-magenta)] uppercase">
            Race Complete
          </div>
          <h2
            className="text-5xl font-black neon-text"
            style={{ color: isPodium ? "#fff200" : "#00f0ff" }}
          >
            {isPodium ? `RANK #${rank}` : "FINISHED"}
          </h2>
          <div className="text-sm text-white/80 uppercase tracking-[0.3em]">
            Pilot · <span className="text-[var(--neon-cyan)]">{playerName}</span>
          </div>

          <Stat
            label="Total Time"
            value={formatTime(totalTimeMs)}
            color="#ffffff"
          />
          <Stat
            label="Best Lap"
            value={formatTime(bestLapMs)}
            color="#fff200"
          />
          <Stat
            label="Top Speed"
            value={`${Math.round(topSpeed)} km/h`}
            color="#ff00d4"
          />
          <Stat
            label="Leaderboard Rank"
            value={`#${rank}`}
            color={isPodium ? "#fff200" : "#00f0ff"}
          />

          <div className="flex gap-3 mt-2">
            <button onClick={onRestart} className="btn-neon flex-1">
              ⟲ Race Again
            </button>
            <button
              onClick={onMenu}
              className="btn-neon btn-neon-magenta flex-1"
            >
              ◄ Menu
            </button>
          </div>
        </div>

        <div>
          <LeaderboardTable
            board={board}
            highlightTime={totalTimeMs}
            highlightName={playerName}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3 border-b border-white/10 pb-2">
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">
        {label}
      </span>
      <span
        className="text-2xl font-black neon-text"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

interface LeaderboardTableProps {
  board: LeaderboardEntry[];
  onClear?: () => void;
  highlightTime?: number;
  highlightName?: string;
}

function LeaderboardTable({
  board,
  onClear,
  highlightTime,
  highlightName,
}: LeaderboardTableProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] uppercase tracking-[0.4em] text-[var(--neon-yellow)]">
          ★ Hall of Velocity
        </h3>
        {onClear && board.length > 0 && (
          <button
            onClick={() => {
              if (confirm("Erase all leaderboard records?")) onClear();
            }}
            className="text-[10px] uppercase tracking-[0.3em] text-white/40 hover:text-[var(--neon-magenta)]"
          >
            Reset
          </button>
        )}
      </div>
      <div className="flex-1 glass rounded border border-[var(--neon-cyan)]/30 overflow-hidden">
        {board.length === 0 ? (
          <div className="p-6 text-center text-white/40 text-xs uppercase tracking-[0.3em]">
            No records yet.
            <br />
            Be the first to leave a mark.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {board.map((e, i) => {
              const isHighlight =
                highlightTime !== undefined &&
                highlightName !== undefined &&
                e.timeMs === highlightTime &&
                e.name === highlightName;
              const rankColor =
                i === 0
                  ? "#fff200"
                  : i === 1
                    ? "#00f0ff"
                    : i === 2
                      ? "#ff00d4"
                      : "#ffffff";
              return (
                <div
                  key={`${e.name}-${e.date}-${i}`}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    isHighlight
                      ? "bg-[var(--neon-magenta)]/15"
                      : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className="w-7 text-center font-black neon-text"
                    style={{ color: rankColor }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="flex-1 text-sm font-bold tracking-[0.2em]"
                    style={{ color: isHighlight ? "#fff200" : "#ffffff" }}
                  >
                    {e.name}
                  </span>
                  <span
                    className="font-mono text-sm"
                    style={{ color: rankColor }}
                  >
                    {formatTime(e.timeMs)}
                  </span>
                  <span className="text-[10px] text-white/40 w-14 text-right">
                    {Math.round(e.topSpeed)}km/h
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { getRankFor };
