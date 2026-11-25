"use client";

import { useMemo, useState } from "react";
import { RoundedBox } from "@react-three/drei";
import { Part, type Tint } from "./assembly";
import { Accent, Surface } from "./brake-parts";
import { Tube } from "./schematic-parts";
import type { Vec3, View } from "./stage";
import type { ListSlot } from "./systems";

/** Where the engine sits in the car (its centre). The front of the car is -z. */
export const ENGINE_HOME: Vec3 = [0, 0.75, -3.4];

const PI = Math.PI;
/** The four cylinders, front to back. */
const ZS = [-0.75, -0.25, 0.25, 0.75];

type Key =
  "air_intake" | "exhaust" | "fuel" | "ignition" | "lubrication" | "timing";

const world = (x: number, y: number, z: number): Vec3 => [
  ENGINE_HOME[0] + x,
  ENGINE_HOME[1] + y,
  ENGINE_HOME[2] + z,
];

/** Camera views for each engine part, in world coordinates. */
export const ENGINE_VIEWS: Record<Key | "system", View> = {
  system: [[4.6, 3.9, -10.6], world(0, 0.2, 0.3)],
  air_intake: [[-4.6, 3.4, -6.6], world(-1.1, 0.9, 0)],
  exhaust: [[5.0, 2.2, -5.2], world(1.0, -0.4, 1.0)],
  fuel: [[-2.4, 3.8, -6.2], world(-0.25, 1.0, 0.1)],
  ignition: [[2.4, 3.6, -6.4], world(0, 1.0, 0.1)],
  lubrication: [[3.6, 0.8, -6.6], world(0, -0.6, 0.2)],
  timing: [[2.0, 1.8, -7.8], world(0, 0.2, -1.2)],
};

function Block() {
  return (
    <group>
      <RoundedBox args={[1.3, 0.7, 2.2]} radius={0.05} smoothness={3}>
        <Surface look="alu" />
      </RoundedBox>
      <RoundedBox
        args={[1.3, 0.38, 2.2]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.52, 0]}
      >
        <Surface look="steel" />
      </RoundedBox>
      <RoundedBox
        args={[1.1, 0.14, 2.0]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.78, 0]}
      >
        <Surface look="dark" />
      </RoundedBox>
      <mesh position={[0, -0.05, 1.25]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 36]} />
        <Surface look="dark" />
      </mesh>
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, -0.15, 0]}>
          <boxGeometry args={[0.18, 0.14, 1.2]} />
          <Surface look="dark" />
        </mesh>
      ))}
    </group>
  );
}

function Intake({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox
        args={[0.42, 0.3, 1.55]}
        radius={0.06}
        smoothness={3}
        position={[-1.15, 0.85, 0]}
      >
        <Surface look="alu" tint={tint} />
      </RoundedBox>
      <Accent
        tint={tint}
        args={[0.44, 0.03, 0.9]}
        position={[-1.15, 1.01, 0]}
      />
      {ZS.map((z) => (
        <Tube
          key={z}
          points={[
            [-0.6, 0.5, z],
            [-0.82, 0.55, z],
            [-0.98, 0.78, z],
          ]}
          radius={0.07}
          look="steel"
          tint={tint}
        />
      ))}
      <mesh position={[-1.15, 0.85, -0.86]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.3, 24]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <Tube
        points={[
          [-1.15, 0.85, -1.0],
          [-1.3, 0.85, -0.75],
          [-1.45, 0.85, -0.45],
        ]}
        radius={0.09}
        look="rubber"
        tint={tint}
      />
      <RoundedBox
        args={[0.5, 0.36, 0.6]}
        radius={0.05}
        smoothness={3}
        position={[-1.5, 0.85, -0.15]}
      >
        <Surface look="plastic" tint={tint} />
      </RoundedBox>
      <Accent
        tint={tint}
        args={[0.52, 0.025, 0.3]}
        position={[-1.5, 1.04, -0.15]}
      />
    </group>
  );
}

function Exhaust({ tint }: { tint: Tint }) {
  return (
    <group>
      {ZS.map((z) => (
        <Tube
          key={z}
          points={[
            [0.6, 0.5, z],
            [0.85, 0.46, z],
            [1.0, 0.15, z * 0.35],
            [1.05, -0.15, 0],
          ]}
          radius={0.06}
          look="steel"
          tint={tint}
        />
      ))}
      <mesh position={[1.05, -0.2, 0]}>
        <sphereGeometry args={[0.14, 20, 20]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <Tube
        points={[
          [1.05, -0.2, 0],
          [1.0, -0.55, 0.3],
          [0.9, -0.9, 1.0],
          [0.8, -1.0, 2.4],
          [0.8, -1.0, 5.5],
          [0.8, -1.0, 8.0],
        ]}
        radius={0.11}
        look="steel"
        tint={tint}
      />
      <mesh position={[0.82, -1.0, 2.2]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.8, 28]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0.82, -1.0, 7.0]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 1.5, 32]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0.82, -1.0, 6.3]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.345, 0.345, 0.05, 32]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.3 + tint.glow}
        />
      </mesh>
    </group>
  );
}

function Fuel({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[-0.25, 1.0, 0]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.9, 14]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      {ZS.map((z) => (
        <group key={z} position={[-0.25, 0.9, z]}>
          <mesh>
            <cylinderGeometry args={[0.05, 0.05, 0.16, 12]} />
            <Surface look="brass" />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.06, 12]} />
            <Surface look="dark" tint={tint} />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.25, 1.0, -0.96]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.05, 14]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.3 + tint.glow}
        />
      </mesh>
      <Tube
        points={[
          [-0.25, 1.0, 0.95],
          [-0.5, 0.95, 1.3],
          [-0.95, 0.7, 1.5],
        ]}
        radius={0.035}
        tint={tint}
      />
      <mesh position={[-0.95, 0.55, 1.5]}>
        <cylinderGeometry args={[0.13, 0.13, 0.4, 20]} />
        <Surface look="alu" tint={tint} />
      </mesh>
    </group>
  );
}

function Ignition({ tint }: { tint: Tint }) {
  return (
    <group>
      {ZS.map((z) => (
        <group key={z} position={[0, 0.95, z]}>
          <mesh position={[0, 0.0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.18, 12]} />
            <Surface look="steel" tint={tint} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.18, 0.3, 0.16]} />
            <Surface look="plastic" tint={tint} />
          </mesh>
          <Accent tint={tint} args={[0.2, 0.04, 0.18]} position={[0, 0.3, 0]} />
        </group>
      ))}
      {ZS.map((z) => (
        <Tube
          key={`wire-${z}`}
          points={[
            [0.1, 1.2, z],
            [0.4, 1.05, z + 0.08],
            [0.64, 0.7, z + 0.08],
          ]}
          radius={0.02}
          tint={tint}
        />
      ))}
    </group>
  );
}

function Lubrication({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox
        args={[1.05, 0.3, 1.7]}
        radius={0.05}
        smoothness={3}
        position={[0, -0.72, 0.1]}
      >
        <Surface look="alu" tint={tint} />
      </RoundedBox>
      <Accent tint={tint} args={[1.0, 0.03, 0.12]} position={[0, -0.56, 0.9]} />
      <mesh position={[0, -0.89, 0.45]}>
        <cylinderGeometry args={[0.06, 0.06, 0.05, 6]} />
        <Surface look="brass" />
      </mesh>
      <mesh position={[-0.78, -0.35, 0.55]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.14, 0.14, 0.4, 24]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[-0.78, -0.35, 0.55]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.145, 0.145, 0.06, 24]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.3 + tint.glow}
        />
      </mesh>
      <Tube
        points={[
          [-0.5, 0.2, -0.55],
          [-0.62, 0.6, -0.55],
          [-0.6, 1.0, -0.55],
        ]}
        radius={0.018}
        look="steel"
        tint={tint}
      />
      <mesh position={[-0.6, 1.04, -0.55]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#f5a524" />
      </mesh>
    </group>
  );
}

const BELT_LOOP: Array<[number, number, number]> = [
  [-0.5, 0.52, -1.42],
  [-0.35, 0.68, -1.42],
  [0.35, 0.68, -1.42],
  [0.5, 0.52, -1.42],
  [0.35, 0.34, -1.42],
  [0.2, -0.2, -1.42],
  [0.0, -0.57, -1.42],
  [-0.22, -0.4, -1.42],
  [-0.2, -0.1, -1.42],
  [-0.35, 0.34, -1.42],
];

function Timing({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox
        args={[1.28, 1.5, 0.24]}
        radius={0.05}
        smoothness={3}
        position={[0, 0.15, -1.22]}
      >
        <Surface look="alu" tint={tint} />
      </RoundedBox>
      <Accent tint={tint} args={[1.0, 0.04, 0.26]} position={[0, 0.9, -1.22]} />
      {(
        [
          [0, -0.35, 0.22],
          [-0.35, 0.5, 0.16],
          [0.35, 0.5, 0.16],
        ] as const
      ).map(([x, y, r]) => (
        <mesh
          key={`${x}${y}`}
          position={[x, y, -1.42]}
          rotation={[PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[r, r, 0.1, 28]} />
          <Surface look="steel" tint={tint} />
        </mesh>
      ))}
      <Tube points={BELT_LOOP} radius={0.03} look="rubber" tint={tint} closed />
    </group>
  );
}

const PARTS: Array<{
  key: Key;
  pin: Vec3;
  offset: Vec3;
  render: (tint: Tint) => React.ReactNode;
}> = [
  {
    key: "air_intake",
    pin: [-1.15, 1.35, 0],
    offset: [-1.1, 0.9, 0],
    render: (t) => <Intake tint={t} />,
  },
  {
    key: "exhaust",
    pin: [1.05, 0.45, 0],
    offset: [1.2, 0.2, 0],
    render: (t) => <Exhaust tint={t} />,
  },
  {
    key: "fuel",
    pin: [-0.25, 1.3, 0.2],
    offset: [0, 1.0, 0],
    render: (t) => <Fuel tint={t} />,
  },
  {
    key: "ignition",
    pin: [0.3, 1.55, 0.8],
    offset: [0, 1.1, 0],
    render: (t) => <Ignition tint={t} />,
  },
  {
    key: "lubrication",
    pin: [0, -1.1, 0.4],
    offset: [0, -0.8, 0],
    render: (t) => <Lubrication tint={t} />,
  },
  {
    key: "timing",
    pin: [0, 1.2, -1.3],
    offset: [0, 0, -1.1],
    render: (t) => <Timing tint={t} />,
  },
];

export interface EngineModelProps {
  slots: ListSlot[];
  selected: string | null;
  exploded: boolean;
  group: string | null;
  /** Show the numbered pins. */
  pins?: boolean;
  onSelect: (id: string | null) => void;
}

/** The engine, put together from the six catalog parts around a block. */
export function EngineModel({
  slots,
  selected,
  exploded,
  group,
  pins = true,
  onSelect,
}: EngineModelProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const byKey = useMemo(
    () =>
      Object.fromEntries(
        slots.map((slot) => [slot.id.split(".").pop() ?? slot.id, slot]),
      ) as Partial<Record<Key, ListSlot>>,
    [slots],
  );

  return (
    <group position={ENGINE_HOME}>
      <Block />
      {PARTS.map((part) => {
        const slot = byKey[part.key];
        if (!slot) return null;
        return (
          <Part
            key={part.key}
            id={slot.id}
            meta={slot}
            home={[0, 0, 0]}
            offset={part.offset}
            exploded={exploded}
            visible={group === null || slot.group === group}
            selected={selected === slot.id}
            hovered={hovered === slot.id}
            pin={part.pin}
            pinVisible={pins}
            onSelect={onSelect}
            onHover={setHovered}
          >
            {part.render}
          </Part>
        );
      })}
    </group>
  );
}
