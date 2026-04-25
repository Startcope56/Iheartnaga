import { TOTAL_LAPS } from "./trackData";
import { formatTime } from "./leaderboard";

interface HUDProps {
  speed: number;
  maxSpeed: number;
  currentLap: number;
  raceTimeMs: number;
  lapTimeMs: number;
  bestLapMs: number;
  boostMeter: number;
  isBoosting: boolean;
  countdown: number | null;
  showLapBanner: { lap: number; lapTimeMs: number } | null;
}

export function HUD({
  speed,
  maxSpeed,
  currentLap,
  raceTimeMs,
  lapTimeMs,
  bestLapMs,
  boostMeter,
  isBoosting,
  countdown,
  showLapBanner,
}: HUDProps) {
  const speedPct = Math.min(1, Math.abs(speed) / maxSpeed);
  const speedKmh = Math.round(Math.abs(speed) * 18);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute top-4 left-4 glass neon-border rounded-md p-3 text-xs uppercase tracking-widest">
        <div className="flex items-center gap-3">
          <span className="text-[var(--neon-cyan)]">Lap</span>
          <span
            className="text-2xl font-black neon-text text-white"
            style={{ color: "#ffffff" }}
          >
            {Math.min(currentLap, TOTAL_LAPS)}
            <span className="text-[var(--neon-magenta)]">/{TOTAL_LAPS}</span>
          </span>
        </div>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 glass neon-border-magenta rounded-md px-5 py-2 text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--neon-magenta)]">
          Race Time
        </div>
        <div
          className="text-2xl font-black neon-text"
          style={{ color: "#ffffff" }}
        >
          {formatTime(raceTimeMs)}
        </div>
      </div>

      <div className="absolute top-4 right-4 glass neon-border rounded-md p-3 text-xs uppercase tracking-widest min-w-[180px]">
        <div className="flex justify-between text-[10px] tracking-[0.25em] text-[var(--neon-cyan)]">
          <span>Lap</span>
          <span>{formatTime(lapTimeMs)}</span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] tracking-[0.25em] text-[var(--neon-yellow)]">
          <span>Best</span>
          <span>{bestLapMs > 0 ? formatTime(bestLapMs) : "--:--.---"}</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-6">
        <SpeedGauge speed={speedKmh} pct={speedPct} isBoosting={isBoosting} />
      </div>

      <div className="absolute bottom-6 right-6 w-64">
        <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--neon-yellow)] mb-1">
          Boost
        </div>
        <div className="relative h-4 glass neon-border rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-75"
            style={{
              width: `${Math.max(0, Math.min(1, boostMeter)) * 100}%`,
              background: isBoosting
                ? "linear-gradient(90deg, #fff200, #ff00d4, #00f0ff)"
                : "linear-gradient(90deg, #00f0ff, #8a2be2, #ff00d4)",
              boxShadow: isBoosting
                ? "0 0 20px #fff200, inset 0 0 10px #fff"
                : "0 0 10px #00f0ff",
            }}
          />
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-[var(--neon-cyan)] opacity-70">
          {isBoosting ? "BOOSTING" : "Hit yellow pads to boost"}
        </div>
      </div>

      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="text-[200px] font-black neon-text pulse-glow"
            style={{
              color:
                countdown === 0
                  ? "#fff200"
                  : countdown === 1
                    ? "#ff00d4"
                    : countdown === 2
                      ? "#00f0ff"
                      : "#8a2be2",
            }}
          >
            {countdown === 0 ? "GO!" : countdown}
          </div>
        </div>
      )}

      {showLapBanner && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2">
          <div className="glass neon-border-magenta rounded-md px-8 py-4 text-center pulse-glow">
            <div className="text-xs uppercase tracking-[0.4em] text-[var(--neon-magenta)]">
              Lap {showLapBanner.lap} Complete
            </div>
            <div
              className="text-3xl font-black neon-text mt-1"
              style={{ color: "#ffffff" }}
            >
              {formatTime(showLapBanner.lapTimeMs)}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.4em] text-[var(--neon-cyan)] opacity-60">
        WASD / Arrows · Space = Brake
      </div>
    </div>
  );
}

function SpeedGauge({
  speed,
  pct,
  isBoosting,
}: {
  speed: number;
  pct: number;
  isBoosting: boolean;
}) {
  const segments = 20;
  const lit = Math.round(pct * segments);
  return (
    <div className="glass neon-border rounded-md p-4 w-56">
      <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--neon-cyan)]">
        Velocity
      </div>
      <div
        className="text-5xl font-black neon-text mt-1"
        style={{
          color: isBoosting ? "#fff200" : "#00f0ff",
        }}
      >
        {speed}
      </div>
      <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--neon-magenta)]">
        km/h
      </div>
      <div className="mt-3 flex gap-[2px]">
        {Array.from({ length: segments }).map((_, i) => {
          const active = i < lit;
          const color =
            i >= segments * 0.85
              ? "#ff00d4"
              : i >= segments * 0.6
                ? "#fff200"
                : "#00f0ff";
          return (
            <div
              key={i}
              className="flex-1 h-3 rounded-sm transition-all"
              style={{
                background: active ? color : "rgba(255,255,255,0.07)",
                boxShadow: active ? `0 0 6px ${color}` : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
