import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface CarHandle {
  group: THREE.Group | null;
  setBoosting: (v: boolean) => void;
}

interface CarProps {
  bodyColor?: string;
  accentColor?: string;
}

export const Car = forwardRef<CarHandle, CarProps>(function Car(
  { bodyColor = "#00f0ff", accentColor = "#ff00d4" },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const flameRef = useRef<THREE.Mesh>(null);
  const boostingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    setBoosting(v: boolean) {
      boostingRef.current = v;
    },
  }));

  const wheels = useMemo(
    () => [
      { x: -1.0, z: -1.4 },
      { x: 1.0, z: -1.4 },
      { x: -1.0, z: 1.4 },
      { x: 1.0, z: 1.4 },
    ],
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (trailRef.current) {
      const mat = trailRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = boostingRef.current
        ? 3 + Math.sin(t * 30) * 0.6
        : 1.2;
      const scale = boostingRef.current ? 1.6 + Math.sin(t * 25) * 0.2 : 1;
      trailRef.current.scale.set(scale, 1, scale);
    }
    if (flameRef.current) {
      const mat = flameRef.current.material as THREE.MeshStandardMaterial;
      const intensity = boostingRef.current
        ? 4 + Math.sin(t * 40) * 1.2
        : 1.5;
      mat.emissiveIntensity = intensity;
      const scaleZ = boostingRef.current
        ? 2.5 + Math.sin(t * 30) * 0.4
        : 1;
      flameRef.current.scale.set(1, 1, scaleZ);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[2.2, 0.5, 4]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={bodyColor}
          emissiveIntensity={0.4}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>

      <mesh position={[0, 1.05, -0.2]} castShadow>
        <boxGeometry args={[1.6, 0.45, 1.6]} />
        <meshStandardMaterial
          color="#0a0420"
          emissive={accentColor}
          emissiveIntensity={0.6}
          metalness={0.9}
          roughness={0.15}
        />
      </mesh>

      <mesh position={[-1.15, 0.6, 0]}>
        <boxGeometry args={[0.08, 0.3, 3.6]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={2.2}
        />
      </mesh>
      <mesh position={[1.15, 0.6, 0]}>
        <boxGeometry args={[0.08, 0.3, 3.6]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={2.2}
        />
      </mesh>

      <mesh position={[-0.55, 0.55, -2.0]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={2.5}
        />
      </mesh>
      <mesh position={[0.55, 0.55, -2.0]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={2.5}
        />
      </mesh>

      {wheels.map((w, i) => (
        <mesh
          key={i}
          position={[w.x, 0.35, w.z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
          <meshStandardMaterial color="#1a0a30" roughness={0.7} />
        </mesh>
      ))}

      <mesh ref={trailRef} position={[0, 0.4, 2.05]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={1.2}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh
        ref={flameRef}
        position={[0, 0.4, 3.0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[0.45, 1.4, 12]} />
        <meshStandardMaterial
          color="#fff200"
          emissive="#fff200"
          emissiveIntensity={1.5}
          transparent
          opacity={0.85}
        />
      </mesh>

      <pointLight
        position={[0, 1.2, -2]}
        color={bodyColor}
        intensity={1.5}
        distance={18}
      />
    </group>
  );
});
