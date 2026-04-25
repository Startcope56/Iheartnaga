import { useMemo } from "react";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { sampledTrackPoints, TRACK_SEGMENTS } from "./trackData";

export function Environment() {
  return (
    <>
      <color attach="background" args={["#03000c"]} />
      <fog attach="fog" args={["#06002a", 60, 320]} />

      <ambientLight intensity={0.35} color="#5b3aff" />
      <directionalLight
        position={[40, 80, 30]}
        intensity={0.6}
        color="#a060ff"
        castShadow
      />
      <hemisphereLight
        args={["#ff00d4", "#00f0ff", 0.35]}
      />

      <Stars
        radius={300}
        depth={120}
        count={4000}
        factor={5}
        saturation={1}
        fade
        speed={0.4}
      />

      <Ground />
      <Skyscrapers />
      <FloatingRings />
    </>
  );
}

function Ground() {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        receiveShadow
      >
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial
          color="#02000a"
          metalness={0.6}
          roughness={0.4}
          emissive="#0a0030"
          emissiveIntensity={0.15}
        />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.49, 0]}
      >
        <planeGeometry args={[1200, 1200, 60, 60]} />
        <meshBasicMaterial
          color="#3a0080"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
    </group>
  );
}

function Skyscrapers() {
  const buildings = useMemo(() => {
    const arr: {
      pos: [number, number, number];
      size: [number, number, number];
      color: string;
      emissive: string;
      intensity: number;
    }[] = [];

    const palette = [
      { c: "#080040", e: "#00f0ff", i: 0.5 },
      { c: "#1a0040", e: "#ff00d4", i: 0.4 },
      { c: "#0a0030", e: "#8a2be2", i: 0.45 },
      { c: "#040020", e: "#fff200", i: 0.3 },
    ];

    let seed = 1234;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < 90; i++) {
      const angle = rnd() * Math.PI * 2;
      const radius = 160 + rnd() * 220;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius + 60;
      const w = 8 + rnd() * 18;
      const d = 8 + rnd() * 18;
      const h = 30 + rnd() * 110;
      const palette_choice = palette[Math.floor(rnd() * palette.length)];
      arr.push({
        pos: [x, h / 2 - 0.5, z],
        size: [w, h, d],
        color: palette_choice.c,
        emissive: palette_choice.e,
        intensity: palette_choice.i,
      });
    }
    return arr;
  }, []);

  return (
    <group>
      {buildings.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial
            color={b.color}
            emissive={b.emissive}
            emissiveIntensity={b.intensity}
            metalness={0.4}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

function FloatingRings() {
  const rings = useMemo(() => {
    const arr: {
      pos: [number, number, number];
      rotY: number;
      color: string;
      scale: number;
    }[] = [];
    const colors = ["#00f0ff", "#ff00d4", "#fff200", "#8a2be2"];
    const step = 40;
    for (let i = 0; i < TRACK_SEGMENTS; i += step) {
      const p = sampledTrackPoints[i];
      arr.push({
        pos: [p.x + 30, 18, p.z + 30],
        rotY: (i / TRACK_SEGMENTS) * Math.PI * 4,
        color: colors[(i / step) % colors.length],
        scale: 4 + (i % 3),
      });
    }
    return arr;
  }, []);

  return (
    <group>
      {rings.map((r, i) => (
        <mesh
          key={i}
          position={r.pos}
          rotation={[Math.PI / 2, r.rotY, 0]}
          scale={[r.scale, r.scale, r.scale]}
        >
          <torusGeometry args={[1, 0.05, 8, 32]} />
          <meshStandardMaterial
            color={r.color}
            emissive={r.color}
            emissiveIntensity={2}
          />
        </mesh>
      ))}
    </group>
  );
}

export function GridHelperFloor() {
  // helper for debugging
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(200, 40, "#ff00d4", "#00f0ff");
    return g;
  }, []);
  return <primitive object={grid} />;
}
