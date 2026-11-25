"use client";

import { useMemo, useState } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { Part } from "./assembly";
import { AbsModule, BrakeControls, Sensor, ToneRing } from "./brake-parts";
import {
  BrakeHoses,
  BrakeLines,
  Caliper,
  Drum,
  FluidReservoir,
  MasterCylinder,
  PARKING_HOME,
  Pad,
  ParkingBrake,
  Rotor,
  Shoe,
} from "./brake-parts-more";
import { SLOT_BY_ID, WHEELS, type GroupId, type SlotId } from "./brake-slots";

export interface BrakeModelProps {
  selected: SlotId | null;
  exploded: boolean;
  /** Show only this group of parts. */
  group: GroupId | null;
  /** The parts this user may see. Anything else is not drawn. */
  allowed: ReadonlySet<SlotId>;
  /** Show the numbered pins. */
  pins?: boolean;
  onSelect: (slot: SlotId | null) => void;
}

/** Thin cables from each sensor to the ABS module (hidden while exploded). */
function Cables({ visible }: { visible: boolean }) {
  const curves = useMemo(
    () =>
      WHEELS.map((wheel) => {
        const side = Math.sign(wheel.x);
        const start = new Vector3(wheel.x - side * 0.72, 1.6, wheel.z);
        const end = new Vector3(
          side * 0.6,
          0.62,
          -1.2 + (wheel.z > 0 ? 0.2 : 0),
        );
        return new CatmullRomCurve3([
          start,
          new Vector3(start.x - side * 0.2, 1.95, start.z * 0.7),
          new Vector3(end.x + side * 0.6, 1.5, (start.z + end.z) / 2),
          end,
        ]);
      }),
    [],
  );
  return (
    <>
      {curves.map((curve, order) => (
        <mesh key={WHEELS[order].id} visible={visible}>
          <tubeGeometry args={[curve, 32, 0.022, 8, false]} />
          <meshStandardMaterial color="#17181a" roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

/** The whole braking system, placed in car coordinates (no stage, no camera). */
export function BrakeModel({
  selected,
  exploded,
  group,
  allowed,
  pins = true,
  onSelect,
}: BrakeModelProps) {
  const [hovered, setHovered] = useState<SlotId | null>(null);

  const shown = (slot: SlotId) =>
    allowed.has(slot) && (group === null || SLOT_BY_ID[slot].group === group);
  /** Props every part shares. */
  const common = (slot: SlotId) => ({
    id: slot,
    meta: SLOT_BY_ID[slot],
    exploded,
    visible: shown(slot),
    pinVisible: pins,
    selected: selected === slot,
    hovered: hovered === slot,
    onSelect: (id: string) => onSelect(id as SlotId),
    onHover: (id: string | null) => setHovered(id as SlotId | null),
  });

  const front = WHEELS.filter((wheel) => wheel.front);
  const rear = WHEELS.filter((wheel) => !wheel.front);

  return (
    <>
      <Cables visible={!exploded && shown("sensors")} />

      {/* ABS */}
      <Part
        {...common("module")}
        home={[0, 0.65, -1.2]}
        offset={[0, 1.7, 0]}
        pin={[0, 0.95, 0]}
      >
        {(tint) => <AbsModule tint={tint} />}
      </Part>
      {WHEELS.map((wheel, order) => {
        const side = Math.sign(wheel.x);
        return (
          <Part
            key={`sensor-${wheel.id}`}
            {...common("sensors")}
            home={[wheel.x - side * 0.72, 0.98, wheel.z]}
            offset={[-side * 0.15, 1.1, 0]}
            pin={order === 0 ? [0, 1.0, 0] : undefined}
          >
            {(tint) => <Sensor side={side} tint={tint} />}
          </Part>
        );
      })}
      {WHEELS.map((wheel, order) => {
        const side = Math.sign(wheel.x);
        return (
          <Part
            key={`ring-${wheel.id}`}
            {...common("rings")}
            home={[wheel.x - side * 0.72, 0.55, wheel.z]}
            offset={[-side * 1.5, 0, 0]}
            pin={order === 0 ? [0, -0.1, 0.7] : undefined}
          >
            {(tint) => <ToneRing tint={tint} />}
          </Part>
        );
      })}

      {/* Brake controls */}
      <Part
        {...common("controls")}
        home={[0, -0.4, 0.9]}
        offset={[0, 1.2, 0.6]}
        pin={[0, 1.55, 0.3]}
      >
        {(tint) => <BrakeControls tint={tint} />}
      </Part>

      {/* Calipers, rotors and pads on the front (disc) wheels */}
      {front.map((wheel, order) => {
        const side = Math.sign(wheel.x);
        const discX = wheel.x - side * 0.4;
        return (
          <group key={`disc-${wheel.id}`}>
            <Part
              {...common("rotors")}
              home={[discX, 0.55, wheel.z]}
              offset={[-side * 0.9, 0, 0]}
              pin={order === 0 ? [0.0, -0.05, -0.75] : undefined}
            >
              {(tint) => <Rotor tint={tint} />}
            </Part>
            <Part
              {...common("calipers")}
              home={[discX, 0.55, wheel.z + 0.62]}
              offset={[0, 1.0, 0.5]}
              pin={order === 0 ? [0, 0.62, 0.35] : undefined}
            >
              {(tint) => <Caliper tint={tint} />}
            </Part>
            {[1, -1].map((face) => (
              <Part
                key={face}
                {...common("pads")}
                home={[discX + face * 0.075, 0.55, wheel.z + 0.62]}
                offset={[face * 0.5, 0.45, 0.95]}
                pin={order === 0 && face === 1 ? [0, -0.1, 0.5] : undefined}
              >
                {(tint) => (
                  <group rotation={[0, face === 1 ? 0 : Math.PI, 0]}>
                    <Pad tint={tint} />
                  </group>
                )}
              </Part>
            ))}
          </group>
        );
      })}

      {/* Drums and shoes on the rear wheels */}
      {rear.map((wheel, order) => {
        const side = Math.sign(wheel.x);
        const drumX = wheel.x - side * 0.4;
        return (
          <group key={`drum-${wheel.id}`}>
            <Part
              {...common("drums")}
              home={[drumX, 0.55, wheel.z]}
              offset={[-side * 1.0, 0, 0]}
              pin={order === 0 ? [0, 0.8, 0] : undefined}
            >
              {(tint) => <Drum side={side} tint={tint} />}
            </Part>
            {[false, true].map((lower) => (
              <Part
                key={String(lower)}
                {...common("shoes")}
                home={[drumX - side * 0.05, 0.55, wheel.z]}
                offset={[-side * 0.25, lower ? -0.45 : 0.95, 0]}
                pin={order === 0 && !lower ? [0, 0.62, 0] : undefined}
              >
                {(tint) => <Shoe tint={tint} flip={lower} />}
              </Part>
            ))}
          </group>
        );
      })}

      {/* Hydraulics */}
      <Part
        {...common("master")}
        home={[0, 0.55, 0.15]}
        offset={[0, 0.9, 0.5]}
        pin={[0, 0.55, 0]}
      >
        {(tint) => <MasterCylinder tint={tint} />}
      </Part>
      <Part
        {...common("fluid")}
        home={[0, 0.8, -0.12]}
        offset={[0, 1.15, -0.2]}
        pin={[0, 0.3, 0]}
      >
        {(tint) => <FluidReservoir tint={tint} />}
      </Part>
      <Part
        {...common("lines")}
        home={[0, 0, 0]}
        offset={[0, 0.55, 0]}
        pin={[-0.9, 0.55, -1.2]}
      >
        {(tint) => <BrakeLines tint={tint} />}
      </Part>
      <Part
        {...common("hoses")}
        home={[0, 0, 0]}
        offset={[0, 0.9, 0]}
        pin={[-1.25, 1.2, -3.1]}
      >
        {(tint) => <BrakeHoses tint={tint} />}
      </Part>

      {/* Parking brake */}
      <Part
        {...common("parking")}
        home={PARKING_HOME}
        offset={[0, 0.9, 0]}
        pin={[0, 1.0, -0.1]}
      >
        {(tint) => <ParkingBrake tint={tint} />}
      </Part>
    </>
  );
}
