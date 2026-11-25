/**
 * The braking system as the catalog sees it. Groups and parts follow the
 * catalog levels exactly (Braking > ABS, Brake Controls, Calipers, Friction,
 * Hydraulics, Parking Brake, Rotors and Drums), so every 3D part is tied to a
 * real level and, later, to its real catalog parts.
 */

export type GroupId =
  | "abs"
  | "controls"
  | "calipers"
  | "friction"
  | "hydraulics"
  | "parking"
  | "rotors";

export interface BrakeGroup {
  id: GroupId;
  label: string;
}

/** Same order as the level dropdown in the catalog. */
export const GROUPS: BrakeGroup[] = [
  { id: "abs", label: "ABS" },
  { id: "controls", label: "Brake controls" },
  { id: "calipers", label: "Calipers" },
  { id: "friction", label: "Friction" },
  { id: "hydraulics", label: "Hydraulics" },
  { id: "parking", label: "Parking brake" },
  { id: "rotors", label: "Rotors and drums" },
];

export type SlotId =
  | "module"
  | "sensors"
  | "rings"
  | "controls"
  | "calipers"
  | "pads"
  | "shoes"
  | "fluid"
  | "lines"
  | "hoses"
  | "master"
  | "parking"
  | "drums"
  | "rotors";

/** A clickable kind of part in the scene. */
export interface BrakeSlot {
  id: SlotId;
  group: GroupId;
  label: string;
  /** The catalog level (ltree path) this part is filled from. */
  categoryPath: string;
  /** How many of this part one braking set needs. */
  quantity: number;
  /** Short, plain explanation shown when selected. */
  summary: string;
  /** What it works with, in plain words. */
  connects: string;
  /** Highlight colour (CSS). */
  color: string;
}

const B = "automotive.braking";

export const SLOTS: BrakeSlot[] = [
  {
    id: "module",
    group: "abs",
    label: "ABS module",
    categoryPath: `${B}.abs.abs_modules`,
    quantity: 1,
    summary:
      "The brain. It reads the wheel sensors and eases brake pressure when a wheel starts to lock.",
    connects: "Receives from the sensors, controls the brake pressure.",
    color: "#2563eb",
  },
  {
    id: "sensors",
    group: "abs",
    label: "Wheel speed sensor",
    categoryPath: `${B}.abs.wheel_speed_sensors`,
    quantity: 4,
    summary:
      "One per wheel. It counts the teeth passing by to know how fast that wheel turns.",
    connects: "Reads the tone ring and reports to the ABS module.",
    color: "#0d9488",
  },
  {
    id: "rings",
    group: "abs",
    label: "Tone ring",
    categoryPath: `${B}.abs.tone_rings`,
    quantity: 4,
    summary:
      "A toothed ring that spins with the wheel. The sensor reads its teeth.",
    connects: "Turns with the wheel, read by its sensor.",
    color: "#d97706",
  },
  {
    id: "controls",
    group: "controls",
    label: "Brake controls",
    categoryPath: `${B}.brake_controls`,
    quantity: 1,
    summary: "The pedal and switch the driver uses to start braking.",
    connects: "Pushes the master cylinder and tells the ABS module.",
    color: "#e11d48",
  },
  {
    id: "calipers",
    group: "calipers",
    label: "Brake caliper",
    categoryPath: `${B}.calipers`,
    quantity: 2,
    summary:
      "Clamps the brake pads onto the spinning rotor when fluid pressure arrives.",
    connects: "Holds the pads, fed by a brake hose.",
    color: "#4f46e5",
  },
  {
    id: "pads",
    group: "friction",
    label: "Brake pad",
    categoryPath: `${B}.friction.brake_pads`,
    quantity: 4,
    summary:
      "Friction material that squeezes the rotor to slow the wheel. It wears out over time.",
    connects: "Sits inside the caliper, on both sides of the rotor.",
    color: "#059669",
  },
  {
    id: "shoes",
    group: "friction",
    label: "Brake shoe",
    categoryPath: `${B}.friction.brake_shoes`,
    quantity: 4,
    summary:
      "Curved friction pieces inside a drum. They press outward to slow the wheel.",
    connects:
      "Sits inside the brake drum, moved by the parking cable and fluid.",
    color: "#ca8a04",
  },
  {
    id: "master",
    group: "hydraulics",
    label: "Master cylinder",
    categoryPath: `${B}.hydraulics.master_cylinders`,
    quantity: 1,
    summary:
      "Turns the pedal push into fluid pressure that travels to every wheel.",
    connects: "Pushed by the pedal, feeds the ABS module.",
    color: "#475569",
  },
  {
    id: "fluid",
    group: "hydraulics",
    label: "Brake fluid",
    categoryPath: `${B}.hydraulics.brake_fluid`,
    quantity: 1,
    summary:
      "The liquid that carries pressure. It is kept topped up in the reservoir.",
    connects: "Stored on top of the master cylinder.",
    color: "#ea580c",
  },
  {
    id: "lines",
    group: "hydraulics",
    label: "Brake line",
    categoryPath: `${B}.hydraulics.brake_lines`,
    quantity: 4,
    summary:
      "Rigid steel pipes that carry the pressure from the ABS module toward each wheel.",
    connects: "ABS module to a hose at each wheel.",
    color: "#0891b2",
  },
  {
    id: "hoses",
    group: "hydraulics",
    label: "Brake hose",
    categoryPath: `${B}.hydraulics.hoses`,
    quantity: 4,
    summary:
      "Flexible rubber hose for the last stretch, so the wheel can move up, down and steer.",
    connects: "Brake line to the caliper or drum at the wheel.",
    color: "#65a30d",
  },
  {
    id: "parking",
    group: "parking",
    label: "Parking brake",
    categoryPath: `${B}.parking_brake`,
    quantity: 1,
    summary:
      "A hand lever and cables that lock the rear brakes mechanically when parked.",
    connects: "Cables pull the rear brake shoes.",
    color: "#7c3aed",
  },
  {
    id: "rotors",
    group: "rotors",
    label: "Brake rotor",
    categoryPath: `${B}.rotors_drums.brake_rotors`,
    quantity: 2,
    summary:
      "The steel disc that spins with the wheel. The pads squeeze it to slow down.",
    connects: "Between the pads, bolted to the wheel hub.",
    color: "#0284c7",
  },
  {
    id: "drums",
    group: "rotors",
    label: "Brake drum",
    categoryPath: `${B}.rotors_drums.brake_drums`,
    quantity: 2,
    summary:
      "A cup that spins with the wheel. The shoes press outward against its inside.",
    connects: "Covers the brake shoes on the rear wheels.",
    color: "#db2777",
  },
];

export const SLOT_BY_ID = Object.fromEntries(
  SLOTS.map((slot, order) => [slot.id, { ...slot, number: order + 1 }]),
) as Record<SlotId, BrakeSlot & { number: number }>;

/** Wheel positions (x: left/right, z: front/back). Front wheels get disc brakes, rear wheels drums. */
export const WHEELS: Array<{
  id: string;
  x: number;
  z: number;
  front: boolean;
}> = [
  { id: "front-left", x: -2.3, z: -3.5, front: true },
  { id: "front-right", x: 2.3, z: -3.5, front: true },
  { id: "rear-left", x: -2.3, z: 3.5, front: false },
  { id: "rear-right", x: 2.3, z: 3.5, front: false },
];

type Vec3 = [number, number, number];

/** Where the camera goes for each view: [camera position, look-at point]. */
export const VIEWS: Record<SlotId | "overview", [Vec3, Vec3]> = {
  overview: [
    [0.8, 9.5, 15.5],
    [0, 0.3, 0],
  ],
  module: [
    [2.6, 2.6, 1.6],
    [0, 0.7, -1.2],
  ],
  sensors: [
    [-0.2, 2.6, -6.9],
    [-1.6, 0.9, -3.5],
  ],
  rings: [
    [-0.5, 1.9, -6.8],
    [-1.6, 0.55, -3.5],
  ],
  controls: [
    [2.6, 2.2, 3.4],
    [0, 0.6, 0.9],
  ],
  calipers: [
    [-1.0, 2.0, -1.4],
    [-1.9, 0.55, -2.9],
  ],
  pads: [
    [-1.2, 1.4, -1.9],
    [-1.9, 0.5, -2.9],
  ],
  rotors: [
    [-0.4, 1.6, -6.9],
    [-1.9, 0.55, -3.5],
  ],
  drums: [
    [-0.6, 1.9, 7.1],
    [-1.9, 0.55, 3.5],
  ],
  shoes: [
    [-0.8, 2.2, 6.3],
    [-1.9, 0.6, 3.5],
  ],
  master: [
    [2.8, 2.2, 2.6],
    [0, 0.6, 0.1],
  ],
  fluid: [
    [1.8, 2.2, 1.6],
    [0, 0.9, -0.2],
  ],
  lines: [
    [0, 6.2, 3.4],
    [0, 0.3, -0.4],
  ],
  hoses: [
    [-0.2, 2.2, -5.9],
    [-1.7, 0.6, -3.3],
  ],
  parking: [
    [-0.5, 2.3, 4.0],
    [-1.0, 0.3, 2.2],
  ],
};
