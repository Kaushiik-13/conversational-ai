"use client";

import { RoundedBox } from "@react-three/drei";
import { CatmullRomCurve3, Vector3 } from "three";
import { Accent, LOOK, Surface, type Tint } from "./brake-parts";
import { WHEELS } from "./brake-slots";

/* ------------------------------------------------- rotors, calipers, pads */

const VANES = 18;

/** Ventilated brake rotor. Its axis runs left-right, like the wheel's. */
export function Rotor({ tint }: { tint: Tint }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {[-0.045, 0.045].map((spot) => (
        <mesh key={spot} position={[0, spot, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.025, 56]} />
          <Surface look="steel" tint={tint} />
        </mesh>
      ))}
      {Array.from({ length: VANES }, (_, vane) => {
        const angle = (vane / VANES) * Math.PI * 2;
        return (
          <mesh
            key={vane}
            position={[Math.cos(angle) * 0.44, 0, Math.sin(angle) * 0.44]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[0.2, 0.07, 0.02]} />
            <Surface look="steel" tint={tint} />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[0.3, 0.3, 0.12, 40]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      {Array.from({ length: 5 }, (_, bolt) => {
        const angle = (bolt / 5) * Math.PI * 2;
        return (
          <mesh
            key={bolt}
            position={[Math.cos(angle) * 0.2, 0.07, Math.sin(angle) * 0.2]}
          >
            <cylinderGeometry args={[0.025, 0.025, 0.04, 10]} />
            <Surface look="steel" />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[0.59, 0.59, 0.016, 56, 1, true]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.25 + tint.glow}
          side={2}
        />
      </mesh>
    </group>
  );
}

/** Painted caliper. The group origin is the point on the rotor's edge it straddles. */
export function Caliper({ tint }: { tint: Tint }) {
  const paint = (
    <meshStandardMaterial
      color={tint.color}
      emissive={tint.color}
      emissiveIntensity={tint.glow * 0.8}
      metalness={0.35}
      roughness={0.35}
    />
  );
  return (
    <group>
      <mesh position={[0.15, 0, 0]}>
        <boxGeometry args={[0.15, 0.5, 0.4]} />
        {paint}
      </mesh>
      <mesh position={[-0.15, 0, 0]}>
        <boxGeometry args={[0.15, 0.5, 0.4]} />
        {paint}
      </mesh>
      <mesh position={[0, 0, 0.23]}>
        <boxGeometry args={[0.45, 0.5, 0.1]} />
        {paint}
      </mesh>
      <mesh position={[0.2, 0.3, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.1, 10]} />
        <Surface look="brass" />
      </mesh>
      <mesh position={[0, -0.27, -0.12]}>
        <boxGeometry args={[0.3, 0.06, 0.12]} />
        <Surface look="dark" />
      </mesh>
    </group>
  );
}

/** One brake pad: friction material on a steel backing plate. */
export function Pad({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.05, 0.3, 0.32]} />
        <meshStandardMaterial
          color="#3a312d"
          emissive={tint.color}
          emissiveIntensity={tint.glow}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0.035, 0, 0]}>
        <boxGeometry args={[0.015, 0.32, 0.34]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <Accent tint={tint} args={[0.02, 0.06, 0.2]} position={[0.05, 0, 0]} />
    </group>
  );
}

/* -------------------------------------------------------- drums and shoes */

/** A cup open toward the chassis. Its closed end faces the wheel. */
export function Drum({ side, tint }: { side: number; tint: Tint }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.6, 0.6, 0.34, 56, 1, true]} />
        <meshStandardMaterial {...LOOK.steel} side={2} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.56, 0.56, 0.34, 56, 1, true]} />
        <meshStandardMaterial
          color="#4b5056"
          metalness={0.8}
          roughness={0.6}
          side={2}
        />
      </mesh>
      <mesh position={[0, -side * 0.15, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.04, 56]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, -side * 0.19, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 32]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, side * 0.16, 0]}>
        <cylinderGeometry args={[0.61, 0.61, 0.014, 56, 1, true]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.25 + tint.glow}
          side={2}
        />
      </mesh>
    </group>
  );
}

/** One brake shoe: a curved friction lining. `flip` makes the lower one. */
export function Shoe({ tint, flip }: { tint: Tint; flip?: boolean }) {
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group rotation={[0, 0, Math.PI * (flip ? 1.075 : 0.075)]}>
        <mesh>
          <torusGeometry args={[0.47, 0.05, 8, 28, Math.PI * 0.85]} />
          <meshStandardMaterial
            color="#3a312d"
            emissive={tint.color}
            emissiveIntensity={tint.glow}
            roughness={0.9}
          />
        </mesh>
        <mesh>
          <torusGeometry args={[0.42, 0.018, 6, 28, Math.PI * 0.85]} />
          <Surface look="steel" tint={tint} />
        </mesh>
        <mesh position={[0, 0, 0.055]}>
          <torusGeometry args={[0.47, 0.012, 6, 28, Math.PI * 0.85]} />
          <meshStandardMaterial
            color={tint.color}
            emissive={tint.color}
            emissiveIntensity={0.3 + tint.glow}
          />
        </mesh>
      </group>
    </group>
  );
}

/* ----------------------------------------------------------- hydraulics */

/** Booster plus master cylinder. It lies along the front-back axis. */
export function MasterCylinder({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.3, 36]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.025, 36]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.25 + tint.glow}
        />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.46, 0.46, 0.04]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0, -0.27]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.5, 28]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      {[-0.07, 0.07].map((spot) => (
        <mesh key={spot} position={[spot, 0.15, -0.42]}>
          <cylinderGeometry args={[0.035, 0.035, 0.14, 12]} />
          <Surface look="brass" />
        </mesh>
      ))}
    </group>
  );
}

/** The see-through fluid reservoir that sits on the master cylinder. */
export function FluidReservoir({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.34, 0.2, 0.42]} />
        <meshStandardMaterial
          color="#f5a524"
          transparent
          opacity={0.72}
          roughness={0.2}
          emissive={tint.color}
          emissiveIntensity={tint.glow * 0.8}
        />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[0.3, 0.12, 0.38]} />
        <meshStandardMaterial color="#d97706" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.13, 0.1]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 20]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      <Accent
        tint={tint}
        args={[0.36, 0.025, 0.1]}
        position={[0, 0.105, -0.12]}
      />
    </group>
  );
}

const point = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Ports on the ABS module, in the same order as WHEELS. */
const PORT_X = [-0.5, 0.5, -0.17, 0.17];

/** A rigid line from the ABS module toward one wheel. */
function lineCurve(index: number) {
  const wheel = WHEELS[index];
  const side = Math.sign(wheel.x);
  const start = point(PORT_X[index], 0.7, -0.55);
  const end = point(wheel.x - side * 1.25, 0.3, wheel.z);
  const via = wheel.front
    ? [
        point((PORT_X[index] + end.x) / 2, 0.25, -1.3),
        point(end.x, 0.22, wheel.z + 0.55),
      ]
    : [
        point(side * 0.6, 0.25, -0.3),
        point(side * 1.55, 0.2, 0.8),
        point(side * 1.55, 0.2, 1.9),
      ];
  return new CatmullRomCurve3([start, ...via, end]);
}

/** A flexible hose for the last stretch to the caliper or drum. */
function hoseCurve(index: number) {
  const wheel = WHEELS[index];
  const side = Math.sign(wheel.x);
  const start = point(wheel.x - side * 1.25, 0.3, wheel.z);
  const end = wheel.front
    ? point(wheel.x - side * 0.4, 0.84, wheel.z + 0.62)
    : point(wheel.x - side * 0.46, 0.97, wheel.z);
  return new CatmullRomCurve3([
    start,
    point(wheel.x - side * 1.05, 0.7, wheel.z + (wheel.front ? 0.25 : 0)),
    end,
  ]);
}

const LINE_CURVES = WHEELS.map((_, index) => lineCurve(index));
const HOSE_CURVES = WHEELS.map((_, index) => hoseCurve(index));

export function BrakeLines({ tint }: { tint: Tint }) {
  return (
    <group>
      {LINE_CURVES.map((curve, index) => (
        <mesh key={WHEELS[index].id}>
          <tubeGeometry args={[curve, 56, 0.028, 8, false]} />
          <Surface look="steel" tint={tint} />
        </mesh>
      ))}
      {LINE_CURVES.map((curve, index) => (
        <mesh key={`fit-${WHEELS[index].id}`} position={curve.getPoint(0.5)}>
          <sphereGeometry args={[0.055, 14, 14]} />
          <meshStandardMaterial
            color={tint.color}
            emissive={tint.color}
            emissiveIntensity={0.25 + tint.glow}
          />
        </mesh>
      ))}
    </group>
  );
}

export function BrakeHoses({ tint }: { tint: Tint }) {
  return (
    <group>
      {HOSE_CURVES.map((curve, index) => (
        <mesh key={WHEELS[index].id}>
          <tubeGeometry args={[curve, 32, 0.04, 10, false]} />
          <Surface look="rubber" tint={tint} />
        </mesh>
      ))}
      {HOSE_CURVES.map((curve, index) => (
        <mesh key={`end-${WHEELS[index].id}`} position={curve.getPoint(0.04)}>
          <cylinderGeometry args={[0.06, 0.06, 0.09, 14]} />
          <meshStandardMaterial
            color={tint.color}
            emissive={tint.color}
            emissiveIntensity={0.25 + tint.glow}
            metalness={0.4}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------- parking brake */

/** World position of the parking brake lever (the group's home). */
export const PARKING_HOME: [number, number, number] = [-0.95, -0.38, 1.7];

function parkingCurves() {
  const origin = point(...PARKING_HOME);
  const start = point(0, 0.17, 0.05);
  const rel = (x: number, y: number, z: number) => point(x, y, z).sub(origin);
  return [-1, 1].map(
    (side) =>
      new CatmullRomCurve3([
        start,
        rel(side === -1 ? -1.3 : 0.3, -0.25, 2.6),
        rel(side * 1.9, 0, 3.3),
        rel(side * 1.75, 0.3, 3.5),
      ]),
  );
}

const PARKING_CURVES = parkingCurves();

/** Hand lever with a cable to each rear wheel. */
export function ParkingBrake({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.32, 0.14, 0.5]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0.36, -0.08]} rotation={[-0.45, 0, 0]}>
        <boxGeometry args={[0.07, 0.62, 0.1]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <RoundedBox
        args={[0.12, 0.1, 0.24]}
        radius={0.04}
        position={[0, 0.68, -0.22]}
        rotation={[-0.45, 0, 0]}
      >
        <Surface look="rubber" tint={tint} />
      </RoundedBox>
      <Accent
        tint={tint}
        args={[0.34, 0.03, 0.14]}
        position={[0, 0.085, 0.1]}
      />
      {PARKING_CURVES.map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 40, 0.022, 8, false]} />
          <meshStandardMaterial {...LOOK.dark} />
        </mesh>
      ))}
    </group>
  );
}
