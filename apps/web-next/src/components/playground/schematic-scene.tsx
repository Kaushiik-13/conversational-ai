"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { SchematicShape } from "./schematic-parts";
import {
  FlightControls,
  PinBadge,
  SceneCanvas,
  Studio,
  wasDrag,
  type Vec3,
  type View,
} from "./stage";
import type { ListSlot } from "./systems";

export interface SchematicSceneProps {
  /** Every part the user may see in this system. */
  slots: ListSlot[];
  selected: string | null;
  /** Show only the parts of this group. */
  group: string | null;
  onSelect: (id: string | null) => void;
}

const CELL = 3.1;
const FLOOR_Y = -0.4;

/** Lays the parts out on a tidy grid, centred on the origin. */
function layout(count: number): { positions: Vec3[]; extent: number } {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.4)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const positions = Array.from({ length: count }, (_, order): Vec3 => {
    const column = order % columns;
    const row = Math.floor(order / columns);
    return [
      (column - (columns - 1) / 2) * CELL,
      FLOOR_Y,
      (row - (rows - 1) / 2) * CELL,
    ];
  });
  const halfWidth = ((columns - 1) * CELL) / 2;
  const halfDepth = ((rows - 1) * CELL) / 2;
  return { positions, extent: Math.max(halfWidth, halfDepth) + 2 };
}

function Station({
  slot,
  home,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  slot: ListSlot;
  home: Vec3;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const outer = useRef<Group>(null);
  const spin = useRef<Group>(null);

  useFrame((_, delta) => {
    const node = outer.current;
    if (node) {
      const ease = 1 - Math.exp(-delta * 6);
      node.position.x += (home[0] - node.position.x) * ease;
      node.position.y += (home[1] - node.position.y) * ease;
      node.position.z += (home[2] - node.position.z) * ease;
    }
    if (spin.current && (selected || hovered)) {
      spin.current.rotation.y += delta * 0.9;
    }
  });

  return (
    <group
      ref={outer}
      position={home}
      onClick={(event) => {
        event.stopPropagation();
        if (wasDrag(event)) return;
        onSelect(slot.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(slot.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.95, 1.0, 0.06, 48]} />
        <meshStandardMaterial
          color={selected ? slot.color : "#d9dce1"}
          emissive={slot.color}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.15 : 0}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>
      <group ref={spin} position={[0, 0.06, 0]} scale={1.25}>
        <SchematicShape
          kind={slot.kind}
          tint={{
            color: slot.color,
            glow: selected ? 0.5 : hovered ? 0.22 : 0,
          }}
        />
      </group>
      <PinBadge
        position={[0, 2.1, 0]}
        number={slot.number}
        label={slot.label}
        color={slot.color}
        active={selected || hovered}
        alwaysShowLabel
        onClick={() => onSelect(slot.id)}
      />
    </group>
  );
}

function World({ slots, selected, group, onSelect }: SchematicSceneProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const shown = useMemo(
    () => slots.filter((slot) => group === null || slot.group === group),
    [slots, group],
  );
  const { positions, extent } = useMemo(
    () => layout(shown.length),
    [shown.length],
  );

  const chosen = shown.findIndex((slot) => slot.id === selected);
  const view: View =
    chosen >= 0
      ? [
          [positions[chosen][0] + 1.4, 2.0, positions[chosen][2] + 3.4],
          [positions[chosen][0], 0.5, positions[chosen][2]],
        ]
      : [
          [0, extent * 1.1 + 2.5, extent * 1.75 + 3.5],
          [0, 0, 0],
        ];

  return (
    <>
      <Studio floorRadius={extent + 2} onFloorClick={() => onSelect(null)} />
      {shown.map((slot, order) => (
        <Station
          key={slot.id}
          slot={slot}
          home={positions[order]}
          selected={selected === slot.id}
          hovered={hovered === slot.id}
          onSelect={onSelect}
          onHover={setHovered}
        />
      ))}
      <FlightControls view={view} maxDistance={extent * 3 + 8} />
    </>
  );
}

export default function SchematicScene(props: SchematicSceneProps) {
  return (
    <SceneCanvas
      cameraPosition={[0, 8, 11]}
      onMiss={() => props.onSelect(null)}
    >
      <World {...props} />
    </SceneCanvas>
  );
}
