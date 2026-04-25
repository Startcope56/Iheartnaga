import * as THREE from "three";

export const TRACK_WIDTH = 14;
export const TRACK_HEIGHT_OFFSET = 0.05;
export const TOTAL_LAPS = 3;

const RAW_POINTS: [number, number][] = [
  [0, 0],
  [40, -5],
  [75, 5],
  [100, 35],
  [105, 75],
  [85, 110],
  [50, 125],
  [10, 130],
  [-30, 120],
  [-65, 95],
  [-80, 55],
  [-75, 15],
  [-55, -15],
  [-25, -10],
];

export const trackPoints3D: THREE.Vector3[] = RAW_POINTS.map(
  ([x, z]) => new THREE.Vector3(x, 0, z),
);

export const trackCurve = new THREE.CatmullRomCurve3(
  trackPoints3D,
  true,
  "catmullrom",
  0.5,
);

export const TRACK_SEGMENTS = 400;

export const sampledTrackPoints: THREE.Vector3[] = trackCurve.getSpacedPoints(
  TRACK_SEGMENTS,
);

export const trackTangents: THREE.Vector3[] = sampledTrackPoints.map((_, i) => {
  const t = i / TRACK_SEGMENTS;
  return trackCurve.getTangent(t).normalize();
});

export const trackLength = trackCurve.getLength();

export interface ClosestPointInfo {
  index: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  distance: number;
  along: number;
}

export function findClosestTrackPoint(pos: THREE.Vector3): ClosestPointInfo {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < sampledTrackPoints.length; i++) {
    const p = sampledTrackPoints[i];
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return {
    index: bestIdx,
    point: sampledTrackPoints[bestIdx],
    tangent: trackTangents[bestIdx],
    distance: Math.sqrt(bestDist),
    along: bestIdx / sampledTrackPoints.length,
  };
}

export function getStartPositionAndHeading(): {
  position: THREE.Vector3;
  heading: number;
} {
  const start = sampledTrackPoints[0].clone();
  const tangent = trackTangents[0];
  const heading = Math.atan2(tangent.x, tangent.z);
  start.y = 0.6;
  return { position: start, heading };
}

export interface BoostPadDef {
  along: number;
  side: number;
}

export const BOOST_PADS: BoostPadDef[] = [
  { along: 0.08, side: 0 },
  { along: 0.18, side: -0.3 },
  { along: 0.28, side: 0.3 },
  { along: 0.42, side: 0 },
  { along: 0.55, side: -0.25 },
  { along: 0.66, side: 0.25 },
  { along: 0.78, side: 0 },
  { along: 0.9, side: -0.2 },
];

export function getBoostPadTransform(pad: BoostPadDef): {
  position: THREE.Vector3;
  rotationY: number;
} {
  const idx = Math.floor(pad.along * TRACK_SEGMENTS);
  const point = sampledTrackPoints[idx].clone();
  const tangent = trackTangents[idx];
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
  point.add(normal.multiplyScalar((TRACK_WIDTH / 2 - 2) * pad.side));
  point.y = TRACK_HEIGHT_OFFSET + 0.02;
  const rotationY = Math.atan2(tangent.x, tangent.z);
  return { position: point, rotationY };
}
