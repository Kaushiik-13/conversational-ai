"use client";

import { useMemo, type ReactNode } from "react";
import { RoundedBox } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import type { Tint } from "./assembly";
import { Accent, Surface } from "./brake-parts";
import { WHEELS } from "./brake-slots";
import { SchematicShape } from "./schematic-parts";
import type { Vec3 } from "./stage";

/**
 * Compact stand-ins for the systems that do not have a detailed assembly yet.
 * They sit where the real parts sit in the car, so the whole vehicle reads as
 * one machine. Each one is drawn in world coordinates (front is -z).
 */

const PI = Math.PI;

/** A straight rod between two points. */
function Bar({
  from,
  to,
  radius,
  look = "steel",
  tint,
}: {
  from: Vec3;
  to: Vec3;
  radius: number;
  look?: "steel" | "dark" | "rubber";
  tint?: Tint;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const direction = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 14]} />
      <Surface look={look} tint={tint} />
    </mesh>
  );
}

function Radiator({ tint }: { tint: Tint }) {
  return (
    <group position={[0, 0, -5.2]} rotation={[0, PI, 0]} scale={1.7}>
      <SchematicShape kind="radiator" tint={tint} />
    </group>
  );
}

function Adas({ tint }: { tint: Tint }) {
  return (
    <group>
      <group position={[0, 0.35, -5.55]} rotation={[0, PI, 0]} scale={0.95}>
        <SchematicShape kind="radar" tint={tint} />
      </group>
      <group position={[0, 2.55, 0.7]} rotation={[0, PI, 0]} scale={0.6}>
        <SchematicShape kind="lens" tint={tint} />
      </group>
      <group position={[0, 3.15, 2.3]} scale={0.6}>
        <SchematicShape kind="dome" tint={tint} />
      </group>
    </group>
  );
}

function Battery({ tint }: { tint: Tint }) {
  return (
    <group position={[0, -0.18, 3.1]} scale={[1.9, 1, 3.3]}>
      <SchematicShape kind="pack" tint={tint} />
    </group>
  );
}

function Transmission({ tint }: { tint: Tint }) {
  return (
    <group position={[0, -0.08, -1.45]}>
      <mesh rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 1.7, 32]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, 0, -0.95]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.5, 32]} />
        <Surface look="dark" tint={tint} />
      </mesh>
      <mesh position={[0, 0, 1.05]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.5, 20]} />
        <Surface look="steel" tint={tint} />
      </mesh>
      <mesh position={[0, 0, -0.5]} rotation={[PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.05, 32]} />
        <meshStandardMaterial
          color={tint.color}
          emissive={tint.color}
          emissiveIntensity={0.3 + tint.glow}
        />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.05, 0.2]}>
          <boxGeometry args={[0.14, 0.12, 0.7]} />
          <Surface look="dark" />
        </mesh>
      ))}
    </group>
  );
}

function Suspension({ tint }: { tint: Tint }) {
  return (
    <group>
      {WHEELS.map((wheel) => {
        const x = wheel.x * 0.87;
        return (
          <group key={wheel.id}>
            <group position={[x, 1.55, wheel.z]} scale={0.8}>
              <SchematicShape kind="spring" tint={tint} />
            </group>
            <group position={[x, 1.55, wheel.z + 0.5]} scale={0.8}>
              <SchematicShape kind="damper" tint={tint} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function Steering({ tint }: { tint: Tint }) {
  return (
    <group>
      <group position={[-1.0, 2.3, 1.6]} rotation={[-0.75, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.42, 0.07, 16, 40]} />
          <Surface look="dark" tint={tint} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.14, 0.14, 0.1, 20]} />
          <Surface look="steel" tint={tint} />
        </mesh>
        {[0, 1, 2].map((spoke) => (
          <mesh key={spoke} rotation={[0, 0, (spoke * 2 * PI) / 3 + PI / 2]}>
            <boxGeometry args={[0.82, 0.05, 0.05]} />
            <Surface look="dark" tint={tint} />
          </mesh>
        ))}
        <mesh position={[0, 0.0, 0.05]}>
          <torusGeometry args={[0.42, 0.012, 8, 40]} />
          <meshStandardMaterial
            color={tint.color}
            emissive={tint.color}
            emissiveIntensity={0.3 + tint.glow}
          />
        </mesh>
      </group>
      <Bar
        from={[-1.0, 2.2, 1.5]}
        to={[-1.0, 1.2, 0.35]}
        radius={0.06}
        tint={tint}
      />
      <Bar
        from={[-1.0, 1.2, 0.35]}
        to={[-1.0, 0.55, -4.2]}
        radius={0.045}
        look="dark"
        tint={tint}
      />
      <group position={[0, -0.62, -4.55]} scale={2.3}>
        <SchematicShape kind="rod" tint={tint} />
      </group>
    </group>
  );
}

function Interior({ tint }: { tint: Tint }) {
  return (
    <group>
      {[-0.95, 0.95].map((x) => (
        <group
          key={x}
          position={[x, 0.15, 2.1]}
          rotation={[0, PI, 0]}
          scale={1.35}
        >
          <SchematicShape kind="seat" tint={tint} />
        </group>
      ))}
      <group
        position={[0, 0.15, 4.2]}
        rotation={[0, PI, 0]}
        scale={[2.3, 1.3, 1.3]}
      >
        <SchematicShape kind="seat" tint={tint} />
      </group>
      <group position={[0, 1.0, 0.1]} scale={[2.0, 1.4, 1.6]}>
        <SchematicShape kind="panel" tint={tint} />
      </group>
    </group>
  );
}

function Safety({ tint }: { tint: Tint }) {
  return (
    <group>
      <group position={[-1.0, 2.05, 1.5]} scale={0.3}>
        <SchematicShape kind="canister" tint={tint} />
      </group>
      <group position={[1.0, 1.45, 0.4]} scale={0.45}>
        <SchematicShape kind="canister" tint={tint} />
      </group>
      {[-1.7, 1.7].map((x) => (
        <group key={x}>
          <RoundedBox
            args={[0.25, 0.25, 2.0]}
            radius={0.04}
            position={[x, 0.55, -4.5]}
          >
            <Surface look="dark" tint={tint} />
          </RoundedBox>
          <Accent
            tint={tint}
            args={[0.27, 0.04, 0.5]}
            position={[x, 0.7, -5.2]}
          />
          <RoundedBox
            args={[0.25, 0.25, 1.3]}
            radius={0.04}
            position={[x, 0.55, 4.9]}
          >
            <Surface look="dark" tint={tint} />
          </RoundedBox>
          <Bar
            from={[x * 1.38, 1.2, -0.4]}
            to={[x * 1.38, 1.2, 2.2]}
            radius={0.06}
            look="dark"
            tint={tint}
          />
        </group>
      ))}
    </group>
  );
}

function Electrical({ tint }: { tint: Tint }) {
  return (
    <group>
      <group position={[1.55, 0.25, -4.4]} scale={0.8}>
        <SchematicShape kind="box" tint={tint} />
      </group>
      <group position={[1.2, 1.3, -2.6]} rotation={[0, PI / 2, 0]} scale={1.8}>
        <SchematicShape kind="harness" tint={tint} />
      </group>
    </group>
  );
}

/** The compact model of each system, keyed by the system's id. */
export const COMPACT: Record<string, (props: { tint: Tint }) => ReactNode> = {
  thermal: Radiator,
  adas: Adas,
  battery: Battery,
  transmission: Transmission,
  suspension: Suspension,
  steering: Steering,
  interior: Interior,
  safety: Safety,
  electrical: Electrical,
};
