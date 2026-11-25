"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import type { Group } from "three";
import type { Tint } from "./assembly";
import { BrakeModel } from "./brake-model";
import { VIEWS as BRAKE_VIEWS, WHEELS, type SlotId } from "./brake-slots";
import { CarBody } from "./car-body";
import { COMPACT } from "./compact-models";
import { ENGINE_HOME, ENGINE_VIEWS, EngineModel } from "./engine-model";
import { WheelCorner } from "./brake-parts";
import {
  FlightControls,
  PinBadge,
  SceneCanvas,
  Studio,
  wasDrag,
  type Vec3,
  type View,
} from "./stage";
import { SYSTEM_HOTSPOTS, type SystemDef } from "./systems";

export interface CarSceneProps {
  /** The systems this user may see. Others are not drawn at all. */
  systems: SystemDef[];
  /** The system the user has flown into, or null for the whole car. */
  focus: string | null;
  /** The selected part inside the focused system. */
  selected: string | null;
  exploded: boolean;
  /** Show only this group of parts inside the focused system. */
  group: string | null;
  onFocus: (system: string | null) => void;
  onSelect: (slot: string | null) => void;
}

/** Camera view for each system: [camera position, look-at point]. */
const SYSTEM_VIEWS: Record<string, View> = {
  overview: [
    [12, 7.5, 17],
    [0, 1.1, 0],
  ],
  body: [
    [9, 5.5, 13],
    [0, 1.9, 0],
  ],
  braking: BRAKE_VIEWS.overview,
  engine: ENGINE_VIEWS.system,
  thermal: [
    [2.4, 1.6, -9.0],
    [0, 0.8, -5.2],
  ],
  adas: [
    [10, 4.5, -2.5],
    [0, 2.2, 0.5],
  ],
  battery: [
    [6.5, 2.2, 7.5],
    [0, 0, 3.1],
  ],
  transmission: [
    [3.8, 1.4, -5.2],
    [0, 0.1, -1.45],
  ],
  suspension: [
    [10, 5, -2.0],
    [0, 1.4, 0],
  ],
  steering: [
    [-12, 5.5, -1.5],
    [-0.4, 1.3, -1.4],
  ],
  interior: [
    [6.5, 5.0, 6.8],
    [0, 1.3, 2.8],
  ],
  safety: [
    [8.5, 4.0, -1.0],
    [0, 1.4, 0.2],
  ],
  electrical: [
    [6.5, 3.2, -6.5],
    [1.3, 1.0, -3.4],
  ],
  tyres_wheels: [
    [11, 5, -6],
    [0, 0.6, 0],
  ],
};

/** The point each system shrinks toward when it dissolves. */
const ANCHORS: Record<string, Vec3> = {
  engine: ENGINE_HOME,
  braking: [0, 0.5, 0],
  thermal: [0, 0.8, -5.2],
  adas: [0, 2.2, 0.5],
  battery: [0, 0, 3.1],
  transmission: [0, 0, -1.45],
  suspension: [0, 1.6, 0],
  steering: [-0.8, 1.4, -1.4],
  interior: [0, 0.8, 2.6],
  safety: [0, 1.2, 0],
  electrical: [1.3, 1.0, -3.4],
};

/** Systems that keep the wheels in view when they are focused. */
const KEEP_WHEELS = new Set([
  "braking",
  "suspension",
  "tyres_wheels",
  "steering",
]);

/** Fades its children away by shrinking them toward an anchor, and back. */
function Dissolve({
  present,
  anchor,
  rate = 4,
  children,
}: {
  present: boolean;
  anchor: Vec3;
  rate?: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const level = useRef(1);

  useFrame((_, delta) => {
    const node = ref.current;
    if (!node) return;
    level.current +=
      ((present ? 1 : 0) - level.current) * (1 - Math.exp(-delta * rate));
    const v = level.current;
    node.visible = v > 0.015;
    const eased = v * v * (3 - 2 * v);
    node.scale.setScalar(Math.max(eased, 0.0001));
  });

  return (
    <group ref={ref} position={anchor}>
      <group position={[-anchor[0], -anchor[1], -anchor[2]]}>{children}</group>
    </group>
  );
}

/** Glowing rings on the floor and a slow scan plane, for the hologram feel. */
function HoloFloor({ active }: { active: boolean }) {
  const plane = useRef<Group>(null);
  const level = useRef(1);

  useFrame(({ clock }, delta) => {
    level.current +=
      ((active ? 1 : 0) - level.current) * (1 - Math.exp(-delta * 3));
    const node = plane.current;
    if (!node) return;
    node.visible = level.current > 0.05;
    node.position.z = Math.sin(clock.elapsedTime * 0.45) * 6.2;
    node.scale.setScalar(Math.max(level.current, 0.001));
  });

  return (
    <>
      {[7.6, 9.2, 10.8].map((radius, order) => (
        <mesh
          key={radius}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.42, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[radius - 0.03, radius, 128]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.34 - order * 0.1}
          />
        </mesh>
      ))}
      <group ref={plane} position={[0, 2.1, 0]}>
        <mesh raycast={() => null}>
          <planeGeometry args={[5.6, 4.6]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.05}
            depthWrite={false}
            side={2}
          />
          <Edges color="#7dd3fc" />
        </mesh>
      </group>
    </>
  );
}

function World(props: CarSceneProps) {
  const { systems, focus, selected, exploded, group, onFocus, onSelect } =
    props;
  const [hovered, setHovered] = useState<string | null>(null);
  const visibleIds = new Set(systems.map((system) => system.id));
  const overview = focus === null;

  const view: View = (() => {
    if (focus === null) return SYSTEM_VIEWS.overview;
    if (selected) {
      if (focus === "braking") {
        const view = BRAKE_VIEWS[selected as SlotId];
        if (view) return view;
      }
      if (focus === "engine") {
        const key = selected.split(".").pop() as keyof typeof ENGINE_VIEWS;
        if (ENGINE_VIEWS[key]) return ENGINE_VIEWS[key];
      }
    }
    return SYSTEM_VIEWS[focus] ?? SYSTEM_VIEWS.overview;
  })();

  /** From the whole car, clicking a part opens its system first. */
  const pick = (system: string) => (slot: string | null) => {
    if (focus === null && slot !== null) onFocus(system);
    onSelect(slot);
  };

  const bodyLit = hovered === "body" || focus === "body";

  return (
    <>
      <Studio
        floorRadius={11}
        onFloorClick={() => (selected ? onSelect(null) : undefined)}
      />
      <HoloFloor active={overview} />
      <CarBody dimmed={focus !== null && focus !== "body"} lit={bodyLit} />

      {/* The wheels stay for the systems that live on them. */}
      <Dissolve
        present={overview || (focus !== null && KEEP_WHEELS.has(focus))}
        anchor={[0, 0.55, 0]}
        rate={3}
      >
        {WHEELS.map((wheel) => (
          <group
            key={wheel.id}
            onClick={(event) => {
              if (!overview || !visibleIds.has("tyres_wheels")) return;
              event.stopPropagation();
              if (wasDrag(event)) return;
              onFocus("tyres_wheels");
            }}
            onPointerOver={(event) => {
              if (!overview || !visibleIds.has("tyres_wheels")) return;
              event.stopPropagation();
              setHovered("tyres_wheels");
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered(null);
              document.body.style.cursor = "";
            }}
          >
            <WheelCorner x={wheel.x} z={wheel.z} front={wheel.front} />
          </group>
        ))}
      </Dissolve>

      {systems.map((system, order) => {
        const present = focus === null || focus === system.id;
        const anchor = ANCHORS[system.id];
        if (!anchor) return null;
        const own = focus === system.id;
        const glow = own ? 0.3 : hovered === system.id ? 0.25 : 0;
        const tint: Tint = { color: system.color, glow };

        let model: ReactNode = null;
        if (system.id === "braking") {
          model = (
            <BrakeModel
              selected={own ? (selected as SlotId | null) : null}
              exploded={own && exploded}
              group={own ? (group as never) : null}
              allowed={new Set(system.slots.map((slot) => slot.id as SlotId))}
              pins={own}
              onSelect={pick("braking") as (slot: SlotId | null) => void}
            />
          );
        } else if (system.id === "engine") {
          model = (
            <EngineModel
              slots={system.slots}
              selected={own ? selected : null}
              exploded={own && exploded}
              group={own ? group : null}
              pins={own}
              onSelect={pick("engine")}
            />
          );
        } else if (COMPACT[system.id]) {
          const Compact = COMPACT[system.id];
          model = (
            <group
              onClick={(event) => {
                if (!overview) return;
                event.stopPropagation();
                if (wasDrag(event)) return;
                onFocus(system.id);
              }}
              onPointerOver={(event) => {
                if (!overview) return;
                event.stopPropagation();
                setHovered(system.id);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHovered(null);
                document.body.style.cursor = "";
              }}
            >
              <Compact tint={tint} />
            </group>
          );
        }
        if (!model) return null;
        return (
          <Dissolve
            key={system.id}
            present={present}
            anchor={anchor}
            rate={3.2 + (order % 3) * 0.6}
          >
            {model}
          </Dissolve>
        );
      })}

      {/* One pin per system, only while the whole car is showing. */}
      {overview
        ? systems.map((system, order) => {
            const position = SYSTEM_HOTSPOTS[system.id];
            if (!position) return null;
            return (
              <PinBadge
                key={system.id}
                position={position}
                number={order + 1}
                label={system.label}
                color={system.color}
                active={hovered === system.id}
                onClick={() => onFocus(system.id)}
              />
            );
          })
        : null}

      <FlightControls view={view} minDistance={2.2} maxDistance={30} />
    </>
  );
}

export default function CarScene(props: CarSceneProps) {
  return (
    <SceneCanvas
      cameraPosition={SYSTEM_VIEWS.overview[0]}
      onMiss={() => (props.selected ? props.onSelect(null) : undefined)}
    >
      <World {...props} />
    </SceneCanvas>
  );
}
