"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EdgesGeometry,
  ExtrudeGeometry,
  Shape,
  type LineBasicMaterial,
  type Mesh,
  type MeshPhysicalMaterial,
} from "three";

/** Overall size, in scene units. Front is -z, the roof is up. */
export const CAR = {
  halfWidth: 2.6,
  frontZ: -5.85,
  rearZ: 5.85,
  roofY: 4.1,
};

const BODY_DEPTH = 4.4;
const BEVEL = 0.4;

/** The side profile of the car: x runs front (-) to back (+), y is height. */
function bodyProfile(): Shape {
  const s = new Shape();
  s.moveTo(-5.0, 0.2);
  s.quadraticCurveTo(-5.5, 0.25, -5.5, 0.95);
  s.quadraticCurveTo(-5.45, 1.55, -5.0, 1.75);
  s.bezierCurveTo(-3.9, 2.05, -2.2, 2.15, -0.9, 2.2);
  s.bezierCurveTo(0.1, 2.3, 0.7, 3.0, 1.3, 3.5);
  s.bezierCurveTo(1.7, 3.75, 2.2, 3.8, 3.2, 3.76);
  s.bezierCurveTo(4.3, 3.7, 4.85, 2.95, 5.15, 2.6);
  s.bezierCurveTo(5.4, 2.55, 5.5, 2.3, 5.5, 1.7);
  s.quadraticCurveTo(5.52, 0.6, 5.25, 0.3);
  s.quadraticCurveTo(5.1, 0.2, 4.8, 0.2);
  s.lineTo(-5.0, 0.2);
  return s;
}

/** The glass area (windscreen, side windows, rear window). */
function glassProfile(): Shape {
  const s = new Shape();
  s.moveTo(-0.55, 2.28);
  s.bezierCurveTo(0.2, 2.4, 0.8, 3.0, 1.3, 3.45);
  s.bezierCurveTo(1.7, 3.68, 2.2, 3.72, 3.2, 3.68);
  s.bezierCurveTo(4.2, 3.62, 4.75, 2.95, 5.0, 2.65);
  s.lineTo(4.4, 2.35);
  s.lineTo(-0.55, 2.28);
  return s;
}

function extrude(shape: Shape, depth: number, bevel: number) {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 6,
    curveSegments: 28,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/**
 * The holographic body. `dimmed` fades it out smoothly (used when the user
 * flies into a system); `lit` brightens the outline.
 */
export function CarBody({ dimmed, lit }: { dimmed: boolean; lit: boolean }) {
  const shell = useMemo(() => extrude(bodyProfile(), BODY_DEPTH, BEVEL), []);
  const glass = useMemo(
    () => extrude(glassProfile(), BODY_DEPTH + 0.5, 0.05),
    [],
  );
  const edges = useMemo(() => new EdgesGeometry(shell, 32), [shell]);

  const shellMaterial = useRef<MeshPhysicalMaterial>(null);
  const glassMaterial = useRef<MeshPhysicalMaterial>(null);
  const edgeMaterial = useRef<LineBasicMaterial>(null);
  const lights = useRef<Array<Mesh | null>>([]);
  const level = useRef(1);

  useFrame((_, delta) => {
    const target = dimmed ? 0 : 1;
    level.current += (target - level.current) * (1 - Math.exp(-delta * 4));
    const v = level.current;
    if (shellMaterial.current) shellMaterial.current.opacity = 0.03 + v * 0.1;
    if (glassMaterial.current) glassMaterial.current.opacity = 0.03 + v * 0.2;
    if (edgeMaterial.current) {
      edgeMaterial.current.opacity = 0.06 + v * (lit ? 1 : 0.7);
    }
    for (const light of lights.current) {
      if (light) light.visible = v > 0.35;
    }
  });

  const none = () => null; // the body never blocks clicks on the parts inside

  return (
    <group>
      <mesh geometry={shell} raycast={none} renderOrder={1}>
        <meshPhysicalMaterial
          ref={shellMaterial}
          color="#8fd3ff"
          emissive="#38bdf8"
          emissiveIntensity={0.18}
          transparent
          opacity={0.13}
          roughness={0.08}
          metalness={0.3}
          clearcoat={1}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={glass} raycast={none} renderOrder={2}>
        <meshPhysicalMaterial
          ref={glassMaterial}
          color="#06121d"
          transparent
          opacity={0.38}
          roughness={0.05}
          metalness={0.6}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges} raycast={none} renderOrder={3}>
        <lineBasicMaterial
          ref={edgeMaterial}
          color="#38bdf8"
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </lineSegments>

      {/* Headlights, grille and tail lights */}
      {[-1.65, 1.65].map((x, order) => (
        <mesh
          key={`head-${x}`}
          ref={(node) => {
            lights.current[order] = node;
          }}
          position={[x, 1.5, CAR.frontZ + 0.04]}
          raycast={none}
        >
          <boxGeometry args={[1.0, 0.18, 0.1]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#e0f2fe"
            emissiveIntensity={1.6}
          />
        </mesh>
      ))}
      <mesh
        ref={(node) => {
          lights.current[2] = node;
        }}
        position={[0, 0.85, CAR.frontZ + 0.02]}
        raycast={none}
      >
        <boxGeometry args={[2.2, 0.5, 0.08]} />
        <meshStandardMaterial color="#0b1118" metalness={0.8} roughness={0.3} />
      </mesh>
      {[-1.75, 1.75].map((x, order) => (
        <mesh
          key={`tail-${x}`}
          ref={(node) => {
            lights.current[3 + order] = node;
          }}
          position={[x, 1.95, CAR.rearZ - 0.04]}
          raycast={none}
        >
          <boxGeometry args={[0.9, 0.16, 0.1]} />
          <meshStandardMaterial
            color="#b91c1c"
            emissive="#ef4444"
            emissiveIntensity={1.2}
          />
        </mesh>
      ))}
    </group>
  );
}
