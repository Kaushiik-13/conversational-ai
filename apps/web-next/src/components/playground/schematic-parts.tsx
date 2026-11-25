"use client";

import { useMemo, type ReactNode } from "react";
import { RoundedBox } from "@react-three/drei";
import { CatmullRomCurve3, Vector2, Vector3 } from "three";
import { Accent, LOOK, Surface, type Tint } from "./brake-parts";
import type { Kind } from "./part-info";

/**
 * Stylised stand-in shapes for parts that do not have a detailed model yet.
 * Each one sits on the floor (y = 0) and fits in roughly a 1.3-unit box.
 */

const PI = Math.PI;
const TAU = Math.PI * 2;

function Glow({ tint }: { tint: Tint }) {
  return (
    <meshStandardMaterial
      color={tint.color}
      emissive={tint.color}
      emissiveIntensity={0.25 + tint.glow}
      roughness={0.5}
    />
  );
}

export function Tube({
  points,
  radius,
  look = "dark",
  tint,
  closed = false,
}: {
  points: Array<[number, number, number]>;
  radius: number;
  look?: "dark" | "steel" | "rubber";
  tint?: Tint;
  closed?: boolean;
}) {
  const curve = useMemo(
    () =>
      new CatmullRomCurve3(
        points.map((p) => new Vector3(...p)),
        closed,
      ),
    [points, closed],
  );
  return (
    <mesh>
      <tubeGeometry args={[curve, 48, radius, 10, closed]} />
      <Surface look={look} tint={tint} />
    </mesh>
  );
}

function Box({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox
        args={[1.1, 0.5, 0.8]}
        radius={0.06}
        smoothness={3}
        position={[0, 0.3, 0]}
      >
        <Surface look="alu" tint={tint} />
      </RoundedBox>
      <mesh position={[0, 0.27, -0.5]}>
        <boxGeometry args={[0.6, 0.3, 0.2]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      <Accent tint={tint} args={[0.6, 0.02, 0.3]} position={[0, 0.56, 0]} />
      {[-0.35, 0, 0.35].map((spot) => (
        <mesh key={spot} position={[spot, 0.3, 0.42]}>
          <boxGeometry args={[0.18, 0.06, 0.06]} />
          <Surface look="brass" />
        </mesh>
      ))}
    </group>
  );
}

function Sensor({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.14, 20]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.56, 24]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.06, 24]} />
        <Glow tint={tint} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[0.2, 0.16, 0.2]} />
        <Surface look="plastic" tint={tint} />
      </mesh>
      <Tube
        points={[
          [0, 0.85, 0],
          [0.2, 1.0, 0.1],
          [0.45, 0.7, 0.2],
          [0.6, 0.15, 0.1],
        ]}
        radius={0.025}
      />
    </group>
  );
}

function Canister({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.8, 36]} />
        <Surface look="alu" tint={tint} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.1, 24]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.385, 0.385, 0.12, 36]} />
        <Glow tint={tint} />
      </mesh>
      <mesh position={[0.35, 0.2, 0]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <Surface look="brass" />
      </mesh>
    </group>
  );
}

function Motor({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.4, 0]}>
      <mesh rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.7, 36]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0.37, 0, 0]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.31, 0.31, 0.04, 36]} />
        <Glow tint={tint} />
      </mesh>
      <mesh position={[-0.55, 0, 0]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.4, 14]} />
        <Surface look="steel" />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[0.7, 0.06, 0.6]} />
        <Surface look="alu" />
      </mesh>
    </group>
  );
}

function Pump({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 36]} />
        <Surface look="alu" tint={tint} />
      </mesh>
      <mesh position={[0, 0.35, 0.28]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.41, 0.41, 0.05, 36]} />
        <Glow tint={tint} />
      </mesh>
      <mesh position={[0.45, 0.35, -0.1]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.4, 16]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[-0.2, 0.6, -0.1]}>
        <boxGeometry args={[0.4, 0.3, 0.4]} />
        <Surface look="dark" tint={tint} />
      </mesh>
    </group>
  );
}

function BentTube({ tint }: { tint: Tint }) {
  return (
    <group>
      <Tube
        points={[
          [-0.55, 0.12, 0],
          [-0.25, 0.55, 0.2],
          [0.2, 0.2, -0.2],
          [0.55, 0.6, 0],
        ]}
        radius={0.09}
        look="steel"
        tint={tint}
      />
      {[-0.55, 0.55].map((spot) => (
        <mesh key={spot} position={[spot, spot > 0 ? 0.6 : 0.12, 0]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <Glow tint={tint} />
        </mesh>
      ))}
    </group>
  );
}

function RingPart({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.55, 0]}>
      <mesh>
        <torusGeometry args={[0.42, 0.13, 20, 48]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.16, 36]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.42, 0.02, 8, 48]} />
        <Glow tint={tint} />
      </mesh>
    </group>
  );
}

const TYRE = [
  [0.3, -0.24],
  [0.52, -0.27],
  [0.66, -0.2],
  [0.7, -0.08],
  [0.7, 0.08],
  [0.66, 0.2],
  [0.52, 0.27],
  [0.3, 0.24],
].map(([radius, height]) => new Vector2(radius, height));

function Tyre({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.7, 0]} rotation={[PI / 2, 0, 0]}>
      <mesh>
        <latheGeometry args={[TYRE, 48]} />
        <Surface look="rubber" tint={tint} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.31, 0.31, 0.46, 36, 1, true]} />
        <meshStandardMaterial {...LOOK.alu} side={2} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.012, 48, 1, true]} />
        <Glow tint={tint} />
      </mesh>
    </group>
  );
}

function Panel({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.5, 0]} rotation={[-0.5, 0, 0]}>
      <RoundedBox args={[1.2, 0.05, 0.85]} radius={0.02} smoothness={3}>
        <Surface look="alu" tint={tint} />
      </RoundedBox>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[1.2, 0.012, 0.06]} />
        <Glow tint={tint} />
      </mesh>
    </group>
  );
}

function Glass({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.55, 0]} rotation={[-0.35, 0, 0]}>
      <mesh>
        <boxGeometry args={[1.2, 0.03, 0.85]} />
        <meshStandardMaterial
          color="#9ecbe8"
          transparent
          opacity={0.4}
          roughness={0.05}
          metalness={0.1}
          emissive={tint.color}
          emissiveIntensity={tint.glow * 0.6}
        />
      </mesh>
      {[-0.43, 0.43].map((spot) => (
        <mesh key={spot} position={[0, 0, spot]}>
          <boxGeometry args={[1.22, 0.05, 0.04]} />
          <Surface look="dark" tint={tint} />
        </mesh>
      ))}
      <mesh position={[0.4, 0.02, 0]}>
        <boxGeometry args={[0.3, 0.012, 0.5]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Spring({ tint }: { tint: Tint }) {
  const points = useMemo(() => {
    const turns = 6;
    return Array.from({ length: turns * 14 + 1 }, (_, step) => {
      const t = step / (turns * 14);
      const angle = t * turns * TAU;
      return [
        Math.cos(angle) * 0.3,
        0.12 + t * 0.95,
        Math.sin(angle) * 0.3,
      ] as [number, number, number];
    });
  }, []);
  return (
    <group>
      <Tube points={points} radius={0.045} look="steel" tint={tint} />
      {[0.1, 1.08].map((spot) => (
        <mesh key={spot} position={[0, spot, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.05, 32]} />
          <Surface look="dark" tint={tint} />
        </mesh>
      ))}
    </group>
  );
}

function Damper({ tint }: { tint: Tint }) {
  return (
    <group rotation={[0, 0, 0]}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.7, 28]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 14]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.08, 28]} />
        <Glow tint={tint} />
      </mesh>
      {[0.05, 1.2].map((spot) => (
        <mesh key={spot} position={[0, spot, 0]} rotation={[0, PI / 2, 0]}>
          <torusGeometry args={[0.08, 0.035, 10, 24]} />
          <Surface look="steel" />
        </mesh>
      ))}
    </group>
  );
}

function Arm({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.25, 0]}>
      <mesh position={[-0.2, 0, 0.25]} rotation={[0, 0.7, 0]}>
        <boxGeometry args={[0.9, 0.12, 0.14]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[-0.2, 0, -0.25]} rotation={[0, -0.7, 0]}>
        <boxGeometry args={[0.9, 0.12, 0.14]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      {[
        [-0.55, 0.45],
        [-0.55, -0.45],
        [0.3, 0],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0, z]}>
          <cylinderGeometry args={[0.11, 0.11, 0.2, 20]} />
          <Glow tint={tint} />
        </mesh>
      ))}
    </group>
  );
}

function Harness({ tint }: { tint: Tint }) {
  const strands: Array<Array<[number, number, number]>> = [
    [
      [-0.6, 0.15, -0.1],
      [-0.2, 0.55, 0.1],
      [0.2, 0.25, -0.1],
      [0.6, 0.5, 0.1],
    ],
    [
      [-0.6, 0.15, 0],
      [-0.2, 0.5, 0.2],
      [0.2, 0.2, 0],
      [0.6, 0.45, 0.2],
    ],
    [
      [-0.6, 0.15, 0.1],
      [-0.2, 0.6, 0],
      [0.2, 0.3, 0.1],
      [0.6, 0.55, 0],
    ],
  ];
  return (
    <group>
      {strands.map((points, order) => (
        <Tube
          key={order}
          points={points}
          radius={0.035}
          tint={order === 0 ? tint : undefined}
        />
      ))}
      {[-0.6, 0.6].map((spot) => (
        <mesh key={spot} position={[spot, spot > 0 ? 0.5 : 0.15, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.3]} />
          <Surface look="plastic" tint={tint} />
        </mesh>
      ))}
      <mesh position={[0, 0.4, 0.0]}>
        <torusGeometry args={[0.1, 0.02, 8, 20]} />
        <Glow tint={tint} />
      </mesh>
    </group>
  );
}

function Pack({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox
        args={[1.25, 0.24, 0.9]}
        radius={0.05}
        smoothness={3}
        position={[0, 0.16, 0]}
      >
        <Surface look="dark" tint={tint} />
      </RoundedBox>
      {[-0.4, 0, 0.4].flatMap((x) =>
        [-0.2, 0.2].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.3, z]}>
            <boxGeometry args={[0.34, 0.04, 0.34]} />
            <Surface look="alu" tint={tint} />
          </mesh>
        )),
      )}
      <Accent tint={tint} args={[1.0, 0.025, 0.06]} position={[0, 0.3, 0]} />
    </group>
  );
}

function Radiator({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.1, 0.8, 0.1]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.6} metalness={0.6} />
      </mesh>
      {Array.from({ length: 16 }, (_, fin) => (
        <mesh key={fin} position={[-0.52 + fin * 0.069, 0.55, 0.07]}>
          <boxGeometry args={[0.025, 0.76, 0.05]} />
          <Surface look="alu" tint={tint} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((spot) => (
        <mesh key={spot} position={[spot, 0.55, 0]}>
          <boxGeometry args={[0.12, 0.86, 0.2]} />
          <Surface look="dark" tint={tint} />
        </mesh>
      ))}
      <mesh position={[-0.6, 1.0, 0]} rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.2, 14]} />
        <Glow tint={tint} />
      </mesh>
    </group>
  );
}

const TEETH = 18;

function Gear({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.5, 0]} rotation={[PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.36, 0.36, 0.2, 40]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      {Array.from({ length: TEETH }, (_, tooth) => {
        const angle = (tooth / TEETH) * TAU;
        return (
          <mesh
            key={tooth}
            position={[Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[0.1, 0.2, 0.09]} />
            <Surface look="steel" tint={tint} />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 0.3, 24]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.012, 40]} />
        <Glow tint={tint} />
      </mesh>
    </group>
  );
}

function Seat({ tint }: { tint: Tint }) {
  return (
    <group>
      <RoundedBox
        args={[0.8, 0.2, 0.7]}
        radius={0.07}
        smoothness={3}
        position={[0, 0.3, 0.1]}
      >
        <Surface look="plastic" tint={tint} />
      </RoundedBox>
      <RoundedBox
        args={[0.8, 0.8, 0.16]}
        radius={0.07}
        smoothness={3}
        position={[0, 0.72, -0.32]}
        rotation={[-0.15, 0, 0]}
      >
        <Surface look="plastic" tint={tint} />
      </RoundedBox>
      <RoundedBox
        args={[0.4, 0.22, 0.12]}
        radius={0.05}
        position={[0, 1.2, -0.36]}
      >
        <Surface look="plastic" tint={tint} />
      </RoundedBox>
      <Accent tint={tint} args={[0.5, 0.02, 0.5]} position={[0, 0.41, 0.1]} />
      <mesh position={[0, 0.1, 0.1]}>
        <boxGeometry args={[0.6, 0.12, 0.5]} />
        <Surface look="dark" />
      </mesh>
    </group>
  );
}

function Lens({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.35, 0]}>
      <RoundedBox args={[0.8, 0.5, 0.5]} radius={0.06} smoothness={3}>
        <Surface look="dark" tint={tint} />
      </RoundedBox>
      <mesh position={[0, 0, 0.3]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.18, 32]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, 0, 0.4]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.02, 32]} />
        <meshStandardMaterial
          color="#0b1b2a"
          roughness={0.05}
          metalness={0.8}
          emissive={tint.color}
          emissiveIntensity={tint.glow * 0.6}
        />
      </mesh>
      <Accent tint={tint} args={[0.5, 0.025, 0.2]} position={[0, 0.26, 0]} />
    </group>
  );
}

function Dome({ tint }: { tint: Tint }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.45, 0.5, 0.24, 36]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.52, 36]} />
        <meshStandardMaterial
          color="#16181b"
          roughness={0.15}
          metalness={0.5}
          emissive={tint.color}
          emissiveIntensity={tint.glow * 0.5}
        />
      </mesh>
      <mesh position={[0, 0.76, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.04, 36]} />
        <Glow tint={tint} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.2, 24, 12, 0, TAU, 0, PI / 2]} />
        <Surface look="alu" tint={tint} />
      </mesh>
    </group>
  );
}

function Radar({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.5, 0]}>
      <RoundedBox args={[0.9, 0.6, 0.16]} radius={0.05} smoothness={3}>
        <Surface look="dark" tint={tint} />
      </RoundedBox>
      <mesh position={[0, 0, 0.09]}>
        <boxGeometry args={[0.7, 0.4, 0.02]} />
        <meshStandardMaterial
          color="#1d2a33"
          roughness={0.2}
          metalness={0.6}
          emissive={tint.color}
          emissiveIntensity={tint.glow * 0.5}
        />
      </mesh>
      <Accent tint={tint} args={[0.5, 0.03, 0.18]} position={[0, -0.31, 0]} />
      <mesh position={[0, -0.45, -0.05]}>
        <boxGeometry args={[0.5, 0.3, 0.3]} />
        <Surface look="alu" />
      </mesh>
    </group>
  );
}

function BoltCluster({ tint }: { tint: Tint }) {
  return (
    <group>
      {[
        [-0.3, 0.1],
        [0.3, -0.1],
        [0, 0.3],
        [-0.25, -0.3],
        [0.25, 0.28],
      ].map(([x, z], order) => (
        <group key={order} position={[x, 0, z]}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.14, 6]} />
            <Surface look="steel" tint={tint} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.2, 12]} />
            <Surface look="steel" />
          </mesh>
          {order === 0 ? (
            <mesh position={[0, 0.275, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.012, 6]} />
              <Glow tint={tint} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}

function Rod({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0.4, 0]}>
      <mesh rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 1.3, 20]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.4, 24]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh rotation={[0, 0, PI / 2]}>
        <cylinderGeometry args={[0.135, 0.135, 0.05, 24]} />
        <Glow tint={tint} />
      </mesh>
      {[-0.7, 0.7].map((spot) => (
        <group key={spot} position={[spot, 0, 0]}>
          <mesh>
            <sphereGeometry args={[0.13, 20, 20]} />
            <Surface look="steel" tint={tint} />
          </mesh>
          <mesh rotation={[PI / 2, 0, 0]}>
            <torusGeometry args={[0.15, 0.035, 10, 24]} />
            <Surface look="dark" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const SHAPES: Record<Kind, (props: { tint: Tint }) => ReactNode> = {
  rod: Rod,
  box: Box,
  sensor: Sensor,
  canister: Canister,
  motor: Motor,
  pump: Pump,
  tube: BentTube,
  ring: RingPart,
  tyre: Tyre,
  panel: Panel,
  glass: Glass,
  spring: Spring,
  damper: Damper,
  arm: Arm,
  harness: Harness,
  pack: Pack,
  radiator: Radiator,
  gear: Gear,
  seat: Seat,
  lens: Lens,
  dome: Dome,
  radar: Radar,
  bolt: BoltCluster,
};

export function SchematicShape({ kind, tint }: { kind: Kind; tint: Tint }) {
  const Shape = SHAPES[kind];
  return <Shape tint={tint} />;
}
