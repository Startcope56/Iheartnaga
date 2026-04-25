import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { KeyboardControls, useKeyboardControls } from "@react-three/drei";
import * as THREE from "three";

import { TrackMesh } from "./Track";
import { Car, CarHandle } from "./Car";
import { BoostPad, BoostPadInstance, buildBoostPads } from "./BoostPad";
import { Environment } from "./Environment";
import { HUD } from "./HUD";
import { FinishScreen, MainMenu } from "./Menu";
import {
  TOTAL_LAPS,
  TRACK_WIDTH,
  findClosestTrackPoint,
  getStartPositionAndHeading,
  sampledTrackPoints,
  trackTangents,
} from "./trackData";
import {
  LeaderboardEntry,
  getRankFor,
  loadLeaderboard,
  saveScore,
} from "./leaderboard";

enum Controls {
  forward = "forward",
  back = "back",
  left = "left",
  right = "right",
  brake = "brake",
  reset = "reset",
}

type GameState = "menu" | "countdown" | "racing" | "finished";

interface FinishedRecord {
  totalMs: number;
  bestLapMs: number;
  topSpeed: number;
  board: LeaderboardEntry[];
  rank: number;
}

const KEY_MAP = [
  { name: Controls.forward, keys: ["ArrowUp", "KeyW"] },
  { name: Controls.back, keys: ["ArrowDown", "KeyS"] },
  { name: Controls.left, keys: ["ArrowLeft", "KeyA"] },
  { name: Controls.right, keys: ["ArrowRight", "KeyD"] },
  { name: Controls.brake, keys: ["Space"] },
  { name: Controls.reset, keys: ["KeyR"] },
];

export function Game() {
  return (
    <KeyboardControls map={KEY_MAP}>
      <GameInner />
    </KeyboardControls>
  );
}

function GameInner() {
  const [gameState, setGameState] = useState<GameState>("menu");
  const [playerName, setPlayerName] = useState("PILOT");
  const [finishedRecord, setFinishedRecord] = useState<FinishedRecord | null>(
    null,
  );
  const [raceKey, setRaceKey] = useState(0);

  const startRace = useCallback((name: string) => {
    setPlayerName(name);
    setRaceKey((k) => k + 1);
    setGameState("countdown");
  }, []);

  const handleFinished = useCallback(
    (
      totalMs: number,
      bestLapMs: number,
      topSpeed: number,
      pName: string,
    ) => {
      const newBoard = saveScore({
        name: pName,
        timeMs: totalMs,
        date: Date.now(),
        topSpeed,
      });
      const rank = getRankFor(totalMs, newBoard) + 0; // placement rank
      setFinishedRecord({
        totalMs,
        bestLapMs,
        topSpeed,
        board: newBoard,
        rank: clampRank(newBoard, totalMs, pName),
      });
      setGameState("finished");
    },
    [],
  );

  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        shadows
        camera={{ position: [0, 12, -22], fov: 65, near: 0.1, far: 800 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Environment />
        <TrackMesh />
        {gameState === "racing" || gameState === "countdown" ? (
          <RaceScene
            key={raceKey}
            playerName={playerName}
            isCountdown={gameState === "countdown"}
            onCountdownDone={() => setGameState("racing")}
            onFinished={handleFinished}
          />
        ) : (
          <PreviewScene />
        )}
      </Canvas>

      {gameState === "menu" && <MainMenu onStart={startRace} />}
      {gameState === "finished" && finishedRecord && (
        <FinishScreen
          totalTimeMs={finishedRecord.totalMs}
          bestLapMs={finishedRecord.bestLapMs}
          topSpeed={finishedRecord.topSpeed}
          playerName={playerName}
          rank={finishedRecord.rank}
          board={finishedRecord.board}
          onRestart={() => {
            setRaceKey((k) => k + 1);
            setGameState("countdown");
          }}
          onMenu={() => setGameState("menu")}
        />
      )}
    </div>
  );
}

function clampRank(
  board: LeaderboardEntry[],
  timeMs: number,
  name: string,
): number {
  for (let i = 0; i < board.length; i++) {
    if (board[i].timeMs === timeMs && board[i].name === name) {
      return i + 1;
    }
  }
  return board.length + 1;
}

function PreviewScene() {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.08;
    const radius = 90;
    camera.position.set(
      Math.cos(t) * radius,
      30 + Math.sin(t * 0.7) * 8,
      Math.sin(t) * radius + 50,
    );
    camera.lookAt(0, 5, 50);
  });

  const pads = useMemo(() => buildBoostPads(), []);
  return (
    <group ref={groupRef}>
      {pads.map((pad) => (
        <BoostPad key={pad.id} pad={pad} isCooldown={false} />
      ))}
    </group>
  );
}

interface RaceSceneProps {
  playerName: string;
  isCountdown: boolean;
  onCountdownDone: () => void;
  onFinished: (
    totalMs: number,
    bestLapMs: number,
    topSpeed: number,
    name: string,
  ) => void;
}

function RaceScene({
  playerName,
  isCountdown,
  onCountdownDone,
  onFinished,
}: RaceSceneProps) {
  const carRef = useRef<CarHandle>(null);
  const { camera } = useThree();
  const [, getKeys] = useKeyboardControls<Controls>();

  const padsList = useMemo(() => buildBoostPads(), []);
  const padCooldownsRef = useRef<number[]>(padsList.map(() => 0));
  const [_padCooldownsState, setPadCooldownsState] = useState<number[]>(
    padsList.map(() => 0),
  );

  // Game state in refs (avoids re-renders)
  const stateRef = useRef({
    position: new THREE.Vector3(),
    heading: 0,
    speed: 0,
    boostTimer: 0,
    boostMeter: 0,
    raceStartedAt: 0,
    lapStartedAt: 0,
    raceTimeMs: 0,
    lapTimeMs: 0,
    bestLapMs: 0,
    currentLap: 1,
    topSpeed: 0,
    lastAlong: 0,
    crossedHalf: false,
    finished: false,
    raceStarted: false,
  });

  const [hudData, setHudData] = useState({
    speed: 0,
    currentLap: 1,
    raceTimeMs: 0,
    lapTimeMs: 0,
    bestLapMs: 0,
    boostMeter: 0,
    isBoosting: false,
  });
  const [countdown, setCountdown] = useState<number | null>(3);
  const [lapBanner, setLapBanner] = useState<{
    lap: number;
    lapTimeMs: number;
  } | null>(null);
  const lapBannerTimerRef = useRef<number | null>(null);

  // Initialize position
  useEffect(() => {
    const { position, heading } = getStartPositionAndHeading();
    stateRef.current.position.copy(position);
    stateRef.current.heading = heading;
  }, []);

  // Countdown
  useEffect(() => {
    if (!isCountdown) return;
    setCountdown(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n < 0) {
        window.clearInterval(id);
        setCountdown(null);
        stateRef.current.raceStartedAt = performance.now();
        stateRef.current.lapStartedAt = stateRef.current.raceStartedAt;
        stateRef.current.raceStarted = true;
        onCountdownDone();
      } else {
        setCountdown(n);
      }
    }, 800);
    return () => window.clearInterval(id);
  }, [isCountdown, onCountdownDone]);

  const showLapBanner = useCallback((lap: number, lapTimeMs: number) => {
    if (lapBannerTimerRef.current) {
      window.clearTimeout(lapBannerTimerRef.current);
    }
    setLapBanner({ lap, lapTimeMs });
    lapBannerTimerRef.current = window.setTimeout(() => {
      setLapBanner(null);
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (lapBannerTimerRef.current)
        window.clearTimeout(lapBannerTimerRef.current);
    };
  }, []);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const camDesired = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const s = stateRef.current;
    const carGroup = carRef.current?.group;
    if (!carGroup) return;

    const keys = getKeys();
    const accel = 38; // units per s^2
    const reverseAccel = 22;
    const brakeForce = 60;
    const baseFriction = 6;
    const maxForward = 42;
    const maxBoost = 78;
    const maxReverse = -14;

    const isRacing = !isCountdown && s.raceStarted && !s.finished;

    if (isRacing) {
      // Throttle / brake
      if (keys.forward) {
        s.speed += accel * dt;
      }
      if (keys.back) {
        if (s.speed > 0) {
          s.speed -= brakeForce * dt;
        } else {
          s.speed -= reverseAccel * dt;
        }
      }
      if (keys.brake) {
        const dec = brakeForce * 1.2 * dt;
        if (s.speed > 0) s.speed = Math.max(0, s.speed - dec);
        else if (s.speed < 0) s.speed = Math.min(0, s.speed + dec);
      }

      // Friction when no input
      if (!keys.forward && !keys.back && !keys.brake) {
        const friction = baseFriction * dt;
        if (s.speed > 0) s.speed = Math.max(0, s.speed - friction);
        else if (s.speed < 0) s.speed = Math.min(0, s.speed + friction);
      }

      // Boost timer
      const isBoosting = s.boostTimer > 0;
      if (isBoosting) {
        s.boostTimer = Math.max(0, s.boostTimer - dt);
        s.boostMeter = s.boostTimer / 2.0;
      } else {
        s.boostMeter = Math.max(0, s.boostMeter - dt * 0.4);
      }

      // Cap speed
      const cap = isBoosting ? maxBoost : maxForward;
      if (s.speed > cap) s.speed -= (s.speed - cap) * Math.min(1, dt * 4);
      if (s.speed < maxReverse) s.speed = maxReverse;

      // Steering — only effective with some velocity
      const steerStrength = 1.8;
      const speedFactor = Math.min(1, Math.abs(s.speed) / 18);
      let steer = 0;
      if (keys.left) steer += 1;
      if (keys.right) steer -= 1;
      const dir = s.speed >= 0 ? 1 : -1;
      s.heading += steer * steerStrength * speedFactor * dir * dt;

      // Reset position
      if (keys.reset) {
        const { position, heading } = getStartPositionAndHeading();
        s.position.copy(position);
        s.heading = heading;
        s.speed = 0;
        s.boostTimer = 0;
      }

      // Apply velocity
      const vx = Math.sin(s.heading) * s.speed * dt;
      const vz = Math.cos(s.heading) * s.speed * dt;
      s.position.x += vx;
      s.position.z += vz;
      s.position.y = 0.6;

      // Off-track check
      const closest = findClosestTrackPoint(s.position);
      const halfRoad = TRACK_WIDTH / 2;
      if (closest.distance > halfRoad) {
        const offset = closest.distance - halfRoad;
        // slow down and pull back toward edge
        const slow = Math.min(1, offset * 0.4) * 22 * dt;
        if (s.speed > 0) s.speed = Math.max(8, s.speed - slow);
        if (s.speed < 0) s.speed = Math.min(-3, s.speed + slow);
        // soft push back
        const pullDir = tmpVec
          .copy(closest.point)
          .sub(s.position)
          .setY(0)
          .normalize();
        s.position.x += pullDir.x * offset * 2 * dt;
        s.position.z += pullDir.z * offset * 2 * dt;
      }

      // Boost pad detection
      for (let i = 0; i < padsList.length; i++) {
        const pad = padsList[i];
        if (padCooldownsRef.current[i] > 0) {
          padCooldownsRef.current[i] = Math.max(
            0,
            padCooldownsRef.current[i] - dt,
          );
          continue;
        }
        const dx = pad.position.x - s.position.x;
        const dz = pad.position.z - s.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 9) {
          // hit
          s.boostTimer = Math.max(s.boostTimer, 2.0);
          s.boostMeter = 1;
          s.speed = Math.min(maxBoost, Math.max(s.speed, 50));
          padCooldownsRef.current[i] = 3.0;
        }
      }

      // Track top speed (in km/h units used by HUD)
      const speedKmh = Math.abs(s.speed) * 18;
      if (speedKmh > s.topSpeed) s.topSpeed = speedKmh;

      // Lap detection — using along-track parameter
      const along = closest.along;
      const prevAlong = s.lastAlong;
      // crossed start line: prev > 0.85 and now < 0.15 (forward)
      if (prevAlong > 0.85 && along < 0.15 && s.crossedHalf) {
        const now = performance.now();
        const lapMs = now - s.lapStartedAt;
        if (lapMs > 5000) {
          // valid lap
          if (s.bestLapMs === 0 || lapMs < s.bestLapMs) {
            s.bestLapMs = lapMs;
          }
          s.crossedHalf = false;
          if (s.currentLap >= TOTAL_LAPS) {
            // finished
            s.finished = true;
            s.raceTimeMs = now - s.raceStartedAt;
            showLapBanner(s.currentLap, lapMs);
            window.setTimeout(() => {
              onFinished(
                s.raceTimeMs,
                s.bestLapMs,
                s.topSpeed,
                playerName,
              );
            }, 800);
          } else {
            showLapBanner(s.currentLap, lapMs);
            s.currentLap += 1;
            s.lapStartedAt = now;
          }
        }
      }
      // require half lap before next crossing
      if (along > 0.4 && along < 0.6) {
        s.crossedHalf = true;
      }
      s.lastAlong = along;

      // Update timers
      const now = performance.now();
      s.raceTimeMs = now - s.raceStartedAt;
      s.lapTimeMs = now - s.lapStartedAt;

      // Update HUD ~30fps
      if (Math.floor(now / 33) % 1 === 0) {
        setHudData({
          speed: s.speed,
          currentLap: s.currentLap,
          raceTimeMs: s.raceTimeMs,
          lapTimeMs: s.lapTimeMs,
          bestLapMs: s.bestLapMs,
          boostMeter: s.boostMeter,
          isBoosting,
        });
        // also occasionally update pad cooldowns visual
        if (Math.floor(now / 200) !== Math.floor((now - 33) / 200)) {
          setPadCooldownsState([...padCooldownsRef.current]);
        }
      }

      carRef.current?.setBoosting(isBoosting);
    } else if (isCountdown) {
      // gentle idle while waiting
      s.speed = 0;
      // initialize at start each frame (in case position drifts)
      // ensure car is rendered at start
      const { position, heading } = getStartPositionAndHeading();
      s.position.copy(position);
      s.heading = heading;
    }

    // Apply transform to car
    carGroup.position.copy(s.position);
    carGroup.rotation.set(0, s.heading + Math.PI, 0);

    // Camera follow — third person
    const heading = s.heading;
    const camDistance = 14;
    const camHeight = 6 + Math.min(4, Math.abs(s.speed) / 12);
    camDesired.set(
      s.position.x - Math.sin(heading) * camDistance,
      s.position.y + camHeight,
      s.position.z - Math.cos(heading) * camDistance,
    );
    const lerpSpeed = isCountdown ? 0.05 : 0.12;
    camera.position.lerp(camDesired, lerpSpeed);
    camTarget.set(
      s.position.x + Math.sin(heading) * 8,
      s.position.y + 1.5,
      s.position.z + Math.cos(heading) * 8,
    );
    camera.lookAt(camTarget);
  });

  // Make sure something visible exists during countdown too
  return (
    <>
      <Car ref={carRef} bodyColor="#00f0ff" accentColor="#ff00d4" />
      <RivalCars />
      {padsList.map((pad, i) => (
        <BoostPad
          key={pad.id}
          pad={pad}
          isCooldown={(_padCooldownsState[i] ?? 0) > 0}
        />
      ))}
      <HUDPortal
        speed={hudData.speed}
        currentLap={hudData.currentLap}
        raceTimeMs={hudData.raceTimeMs}
        lapTimeMs={hudData.lapTimeMs}
        bestLapMs={hudData.bestLapMs}
        boostMeter={hudData.boostMeter}
        isBoosting={hudData.isBoosting}
        countdown={countdown}
        lapBanner={lapBanner}
      />
    </>
  );
}

// HUD lives outside the canvas — render via portal-like sibling
// We just render it as React DOM by returning null in canvas and
// drawing via a separate component above the canvas would be ideal,
// but React Three Fiber doesn't allow DOM children inside <Canvas>.
// We use the document body via a lightweight effect:
function HUDPortal(props: {
  speed: number;
  currentLap: number;
  raceTimeMs: number;
  lapTimeMs: number;
  bestLapMs: number;
  boostMeter: number;
  isBoosting: boolean;
  countdown: number | null;
  lapBanner: { lap: number; lapTimeMs: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    div.id = "hud-portal-root";
    document.body.appendChild(div);
    containerRef.current = div;
    setContainer(div);
    return () => {
      div.remove();
    };
  }, []);

  if (!container) return null;
  return (
    <PortalRender container={container}>
      <HUD
        speed={props.speed}
        maxSpeed={78}
        currentLap={props.currentLap}
        raceTimeMs={props.raceTimeMs}
        lapTimeMs={props.lapTimeMs}
        bestLapMs={props.bestLapMs}
        boostMeter={props.boostMeter}
        isBoosting={props.isBoosting}
        countdown={props.countdown}
        showLapBanner={props.lapBanner}
      />
    </PortalRender>
  );
}

import { createPortal } from "react-dom";
function PortalRender({
  children,
  container,
}: {
  children: React.ReactNode;
  container: HTMLElement;
}) {
  return createPortal(children, container);
}

function RivalCars() {
  // Decorative cars sitting near the start as scenery
  const positions = useMemo(() => {
    const arr: { p: THREE.Vector3; rotY: number; color: string }[] = [];
    const idx = Math.floor(sampledTrackPoints.length * 0.05);
    const p = sampledTrackPoints[idx];
    const t = trackTangents[idx];
    const rotY = Math.atan2(t.x, t.z);
    const normal = new THREE.Vector3(-t.z, 0, t.x);
    arr.push({
      p: p
        .clone()
        .add(normal.clone().multiplyScalar(4))
        .setY(0.6),
      rotY: rotY + Math.PI,
      color: "#ff00d4",
    });
    arr.push({
      p: p
        .clone()
        .add(normal.clone().multiplyScalar(-4))
        .setY(0.6),
      rotY: rotY + Math.PI,
      color: "#fff200",
    });
    return arr;
  }, []);

  return (
    <group>
      {positions.map((c, i) => (
        <group
          key={i}
          position={c.p.toArray()}
          rotation={[0, c.rotY, 0]}
        >
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[2.0, 0.45, 3.6]} />
            <meshStandardMaterial
              color={c.color}
              emissive={c.color}
              emissiveIntensity={0.5}
              metalness={0.7}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, 1.0, -0.1]}>
            <boxGeometry args={[1.4, 0.4, 1.4]} />
            <meshStandardMaterial color="#0a0420" metalness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// re-export for menu to know
export { loadLeaderboard };
