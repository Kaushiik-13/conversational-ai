"use client";

import { RoundedBox } from "@react-three/drei";
import { Vector2 } from "three";

/** Shared material looks. */
export const LOOK = {
  steel: { color: "#b4bac1", metalness: 0.95, roughness: 0.3 },
  alu: { color: "#c4c8ce", metalness: 1, roughness: 0.4 },
  dark: { color: "#3a3e44", metalness: 0.6, roughness: 0.45 },
  plastic: { color: "#2c2f34", metalness: 0.1, roughness: 0.5 },
  rubber: { color: "#1c1d20", metalness: 0, roughness: 0.9 },
  brass: { color: "#b8924f", metalness: 1, roughness: 0.35 },
} as const;

export type LookName = keyof typeof LOOK;

export interface Tint {
  color: string;
  glow: number;
}

/** A material that picks up the part's colour glow when hovered or selected. */
export function Surface({ look, tint }: { look: LookName; tint?: Tint }) {
  const base = LOOK[look];
  return (
    <meshStandardMaterial
      {...base}
      emissive={tint?.color ?? "#000000"}
      emissiveIntensity={tint ? tint.glow : 0}
    />
  );
}

/** A small strip in the part's colour, so each kind is easy to tell apart. */
export function Accent({
  tint,
  args,
  position,
}: {
  tint: Tint;
  args: [number, number, number];
  position: [number, number, number];
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={tint.color}
        emissive={tint.color}
        emissiveIntensity={0.25 + tint.glow}
        roughness={0.5}
      />
    </mesh>
  );
}

/* ----------------------------------------------------------- the wheel */

const TYRE_PROFILE = [
  [0.6, -0.27],
  [0.78, -0.3],
  [0.92, -0.23],
  [0.97, -0.1],
  [0.97, 0.1],
  [0.92, 0.23],
  [0.78, 0.3],
  [0.6, 0.27],
].map(([radius, height]) => new Vector2(radius, height));

/** Tyre, rim and hub at one wheel (plus the fixed backing plate on drum wheels). */
export function WheelCorner({
  x,
  z,
  front,
}: {
  x: number;
  z: number;
  front: boolean;
}) {
  const side = Math.sign(x);
  return (
    <group position={[x, 0.55, z]}>
      <group rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <latheGeometry args={[TYRE_PROFILE, 56]} />
          <meshStandardMaterial {...LOOK.rubber} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.62, 0.62, 0.56, 48, 1, true]} />
          <meshStandardMaterial {...LOOK.alu} side={2} />
        </mesh>
        <mesh position={[0, side * 0.22, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.06, 40]} />
          <Surface look="alu" />
        </mesh>
      </group>

      {/* Hub that carries the tone ring. */}
      <mesh position={[-side * 0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.17, 0.17, 0.9, 28]} />
        <Surface look="dark" />
      </mesh>

      {front ? null : <BackingPlate side={side} />}
    </group>
  );
}

/* ----------------------------------------------------------- ABS parts */

const TEETH = 24;

export function ToneRing({ tint }: { tint: Tint }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.31, 0.31, 0.09, 44, 1, true]} />
        <meshStandardMaterial {...LOOK.steel} side={2} />
      </mesh>
      {Array.from({ length: TEETH }, (_, tooth) => {
        const angle = (tooth / TEETH) * Math.PI * 2;
        return (
          <mesh
            key={tooth}
            position={[Math.cos(angle) * 0.335, 0, Math.sin(angle) * 0.335]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[0.045, 0.09, 0.05]} />
            <Surface look="steel" tint={tint} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.315, 0.315, 0.018, 44, 1, true]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.3 + tint.glow}
          side={2}
        />
      </mesh>
    </group>
  );
}

export function Sensor({ side, tint }: { side: number; tint: Tint }) {
  return (
    <group>
      {/* Sensing tip that sits just above the teeth. */}
      <mesh>
        <cylinderGeometry args={[0.055, 0.055, 0.12, 20]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.48, 24]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      <Accent tint={tint} args={[0.19, 0.05, 0.19]} position={[0, 0.42, 0]} />
      <mesh position={[0, 0.58, 0]}>
        <boxGeometry args={[0.16, 0.14, 0.16]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      {/* Mounting bracket toward the chassis. */}
      <mesh position={[-side * 0.17, 0.2, 0]}>
        <boxGeometry args={[0.3, 0.05, 0.16]} />
        <Surface look="alu" />
      </mesh>
    </group>
  );
}

export function AbsModule({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox args={[1.5, 0.62, 1.05]} radius={0.06} smoothness={4}>
        <Surface look="alu" tint={tint} />
      </RoundedBox>
      {/* Cooling ribs. */}
      {[-0.55, -0.33, -0.11, 0.11, 0.33, 0.55].map((spot) => (
        <mesh key={spot} position={[spot, 0.33, 0.2]}>
          <boxGeometry args={[0.07, 0.05, 0.55]} />
          <Surface look="alu" tint={tint} />
        </mesh>
      ))}
      {/* Pump motor. */}
      <mesh position={[0.4, 0.48, -0.25]}>
        <cylinderGeometry args={[0.24, 0.24, 0.42, 32]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <Accent
        tint={tint}
        args={[0.7, 0.025, 0.3]}
        position={[-0.3, 0.325, -0.25]}
      />
      {/* Electrical connector. */}
      <mesh position={[0, -0.02, -0.64]}>
        <boxGeometry args={[0.7, 0.34, 0.24]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      {/* Brake line ports. */}
      {[-0.5, -0.17, 0.17, 0.5].map((spot) => (
        <mesh
          key={spot}
          position={[spot, 0.05, 0.6]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.055, 0.055, 0.16, 16]} />
          <Surface look="brass" />
        </mesh>
      ))}
    </group>
  );
}

export function BrakeControls({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0.05, -0.1]}>
        <boxGeometry args={[0.9, 0.1, 0.5]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0.55, 0.12]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.16, 1, 0.1]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <RoundedBox
        args={[0.62, 0.12, 0.34]}
        radius={0.04}
        position={[0, 1.04, 0.3]}
        rotation={[0.3, 0, 0]}
      >
        <Surface look="steel" tint={tint} />
      </RoundedBox>
      {[-0.2, -0.1, 0, 0.1, 0.2].map((spot) => (
        <mesh key={spot} position={[spot, 1.1, 0.3]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.04, 0.03, 0.3]} />
          <Surface look="rubber" tint={tint} />
        </mesh>
      ))}
      <mesh position={[0.45, 0.25, -0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.3, 18]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      <Accent
        tint={tint}
        args={[0.5, 0.03, 0.18]}
        position={[0, 0.115, -0.1]}
      />
    </group>
  );
}

/** Fixed plate behind a drum, with the wheel cylinder on top. */
function BackingPlate({ side }: { side: number }) {
  return (
    <group>
      <mesh position={[-side * 0.55, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.56, 0.56, 0.03, 44]} />
        <Surface look="dark" />
      </mesh>
      <mesh position={[-side * 0.46, 0.42, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.2]} />
        <Surface look="steel" />
      </mesh>
    </group>
  );
}
