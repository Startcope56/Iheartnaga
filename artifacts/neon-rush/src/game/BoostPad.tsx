import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOOST_PADS, getBoostPadTransform, BoostPadDef } from "./trackData";

export interface BoostPadInstance {
  id: number;
  def: BoostPadDef;
  position: THREE.Vector3;
  rotationY: number;
}

export function buildBoostPads(): BoostPadInstance[] {
  return BOOST_PADS.map((def, i) => {
    const t = getBoostPadTransform(def);
    return {
      id: i,
      def,
      position: t.position,
      rotationY: t.rotationY,
    };
  });
}

interface BoostPadProps {
  pad: BoostPadInstance;
  isCooldown: boolean;
}

export function BoostPad({ pad, isCooldown }: BoostPadProps) {
  const arrowRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const phase = (t * 3 + pad.id) % 1;
    if (arrowRef.current) {
      arrowRef.current.position.y = 0.05 + Math.sin(t * 4 + pad.id) * 0.05;
    }
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      const target = isCooldown ? 0.3 : 1.5 + Math.sin(t * 6 + pad.id) * 0.6;
      mat.emissiveIntensity = target;
      mat.opacity = isCooldown ? 0.3 : 0.85 + 0.15 * Math.sin(t * 6 + pad.id);
    }
    void phase;
  });

  const color = isCooldown ? "#444466" : "#fff200";

  return (
    <group
      position={pad.position.toArray()}
      rotation={[0, pad.rotationY, 0]}
    >
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.6, 4.8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <group ref={arrowRef}>
        <ArrowMark color={color} offsetZ={-1.2} />
        <ArrowMark color={color} offsetZ={0} />
        <ArrowMark color={color} offsetZ={1.2} />
      </group>
    </group>
  );
}

function ArrowMark({
  color,
  offsetZ,
}: {
  color: string;
  offsetZ: number;
}) {
  const arrowGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.6);
    shape.lineTo(0.8, -0.2);
    shape.lineTo(0.3, -0.2);
    shape.lineTo(0.3, -0.6);
    shape.lineTo(-0.3, -0.6);
    shape.lineTo(-0.3, -0.2);
    shape.lineTo(-0.8, -0.2);
    shape.lineTo(0, 0.6);
    return new THREE.ShapeGeometry(shape);
  }, []);

  return (
    <mesh
      geometry={arrowGeom}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.01, offsetZ]}
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={2.2}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
