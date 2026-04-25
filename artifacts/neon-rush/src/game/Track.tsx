import { useMemo } from "react";
import * as THREE from "three";
import {
  TRACK_WIDTH,
  TRACK_HEIGHT_OFFSET,
  sampledTrackPoints,
  trackTangents,
  trackCurve,
  TRACK_SEGMENTS,
} from "./trackData";

export function TrackMesh() {
  const { roadGeometry, leftEdgeGeometry, rightEdgeGeometry, centerLineGeometry } =
    useMemo(() => {
      const halfWidth = TRACK_WIDTH / 2;

      const verts: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const leftEdge: number[] = [];
      const rightEdge: number[] = [];
      const centerLine: number[] = [];

      const points = sampledTrackPoints;
      const tangents = trackTangents;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const t = tangents[i];
        const normal = new THREE.Vector3(-t.z, 0, t.x);

        const left = p
          .clone()
          .add(normal.clone().multiplyScalar(halfWidth));
        const right = p
          .clone()
          .add(normal.clone().multiplyScalar(-halfWidth));

        verts.push(left.x, TRACK_HEIGHT_OFFSET, left.z);
        verts.push(right.x, TRACK_HEIGHT_OFFSET, right.z);

        const v = i / points.length;
        uvs.push(0, v);
        uvs.push(1, v);

        leftEdge.push(left.x, TRACK_HEIGHT_OFFSET + 0.05, left.z);
        rightEdge.push(right.x, TRACK_HEIGHT_OFFSET + 0.05, right.z);
        centerLine.push(p.x, TRACK_HEIGHT_OFFSET + 0.04, p.z);
      }

      const segs = points.length;
      for (let i = 0; i < segs; i++) {
        const next = (i + 1) % segs;
        const a = i * 2;
        const b = i * 2 + 1;
        const c = next * 2;
        const d = next * 2 + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }

      const close = (arr: number[]) => {
        arr.push(arr[0], arr[1], arr[2]);
        return arr;
      };

      const roadGeom = new THREE.BufferGeometry();
      roadGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(verts, 3),
      );
      roadGeom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      roadGeom.setIndex(indices);
      roadGeom.computeVertexNormals();

      const makeLineGeom = (arr: number[]) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
        return g;
      };

      return {
        roadGeometry: roadGeom,
        leftEdgeGeometry: makeLineGeom(close([...leftEdge])),
        rightEdgeGeometry: makeLineGeom(close([...rightEdge])),
        centerLineGeometry: makeLineGeom(close([...centerLine])),
      };
    }, []);

  const startLine = useMemo(() => {
    const idx = 0;
    const p = sampledTrackPoints[idx];
    const t = trackTangents[idx];
    const rotationY = Math.atan2(t.x, t.z);
    return {
      position: new THREE.Vector3(p.x, TRACK_HEIGHT_OFFSET + 0.06, p.z),
      rotationY,
    };
  }, []);

  return (
    <group>
      <mesh geometry={roadGeometry} receiveShadow>
        <meshStandardMaterial
          color="#0c0420"
          roughness={0.55}
          metalness={0.4}
          emissive="#15043a"
          emissiveIntensity={0.4}
        />
      </mesh>

      <line>
        <primitive object={leftEdgeGeometry} attach="geometry" />
        <lineBasicMaterial color="#00f0ff" linewidth={2} />
      </line>
      <line>
        <primitive object={rightEdgeGeometry} attach="geometry" />
        <lineBasicMaterial color="#ff00d4" linewidth={2} />
      </line>
      <line>
        <primitive object={centerLineGeometry} attach="geometry" />
        <lineBasicMaterial
          color="#8a2be2"
          transparent
          opacity={0.55}
        />
      </line>

      <TrackBorderPosts />
      <StartFinishLine
        position={startLine.position}
        rotationY={startLine.rotationY}
      />
    </group>
  );
}

function TrackBorderPosts() {
  const posts = useMemo(() => {
    const arr: { pos: THREE.Vector3; color: string }[] = [];
    const halfWidth = TRACK_WIDTH / 2 + 0.6;
    const step = 6;
    for (let i = 0; i < TRACK_SEGMENTS; i += step) {
      const p = sampledTrackPoints[i];
      const t = trackTangents[i];
      const normal = new THREE.Vector3(-t.z, 0, t.x);

      const left = p.clone().add(normal.clone().multiplyScalar(halfWidth));
      const right = p.clone().add(normal.clone().multiplyScalar(-halfWidth));
      left.y = 0.5;
      right.y = 0.5;
      arr.push({ pos: left, color: "#00f0ff" });
      arr.push({ pos: right, color: "#ff00d4" });
    }
    return arr;
  }, []);

  return (
    <group>
      {posts.map((p, i) => (
        <mesh key={i} position={p.pos.toArray()}>
          <boxGeometry args={[0.3, 1, 0.3]} />
          <meshStandardMaterial
            color={p.color}
            emissive={p.color}
            emissiveIntensity={1.6}
          />
        </mesh>
      ))}
    </group>
  );
}

function StartFinishLine({
  position,
  rotationY,
}: {
  position: THREE.Vector3;
  rotationY: number;
}) {
  const checkers = useMemo(() => {
    const arr: { x: number; z: number; color: string }[] = [];
    const cols = 14;
    const rows = 2;
    const cellW = TRACK_WIDTH / cols;
    const cellD = 0.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        arr.push({
          x: -TRACK_WIDTH / 2 + c * cellW + cellW / 2,
          z: r * cellD - cellD / 2,
          color: (r + c) % 2 === 0 ? "#ffffff" : "#0a0420",
        });
      }
    }
    return { cells: arr, cellW, cellD };
  }, []);

  return (
    <group position={position.toArray()} rotation={[0, rotationY, 0]}>
      {checkers.cells.map((cell, i) => (
        <mesh
          key={i}
          position={[cell.x, 0, cell.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[checkers.cellW, checkers.cellD]} />
          <meshStandardMaterial
            color={cell.color}
            emissive={cell.color}
            emissiveIntensity={cell.color === "#ffffff" ? 0.6 : 0}
          />
        </mesh>
      ))}
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[TRACK_WIDTH + 2, 0.3, 0.3]} />
        <meshStandardMaterial
          color="#fff200"
          emissive="#fff200"
          emissiveIntensity={2}
        />
      </mesh>
      <mesh position={[-TRACK_WIDTH / 2 - 1, 2, 0]}>
        <boxGeometry args={[0.4, 4, 0.4]} />
        <meshStandardMaterial
          color="#00f0ff"
          emissive="#00f0ff"
          emissiveIntensity={2}
        />
      </mesh>
      <mesh position={[TRACK_WIDTH / 2 + 1, 2, 0]}>
        <boxGeometry args={[0.4, 4, 0.4]} />
        <meshStandardMaterial
          color="#ff00d4"
          emissive="#ff00d4"
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
}

export { trackCurve };
