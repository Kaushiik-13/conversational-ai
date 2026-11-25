/** The 3D shape used for a part in the schematic scenes. */
export type Kind =
  | "box"
  | "sensor"
  | "canister"
  | "motor"
  | "pump"
  | "tube"
  | "ring"
  | "tyre"
  | "panel"
  | "glass"
  | "spring"
  | "damper"
  | "arm"
  | "harness"
  | "pack"
  | "radiator"
  | "gear"
  | "seat"
  | "lens"
  | "dome"
  | "radar"
  | "bolt"
  | "rod";

export interface PartInfo {
  kind: Kind;
  /** One plain sentence: what the part does. */
  summary: string;
}

/**
 * Shape and plain-language summary for each catalog level, keyed by the level's
 * path without the leading "automotive.". Braking has its own detailed model,
 * so it is not listed here.
 */
export const PART_INFO: Record<string, PartInfo> = {
  "adas.cameras": {
    kind: "lens",
    summary: "Sees lane lines, signs and vehicles ahead.",
  },
  "adas.controllers": {
    kind: "box",
    summary:
      "The computer that combines all driver-assist sensors and decides.",
  },
  "adas.driver_monitoring": {
    kind: "lens",
    summary: "Watches the driver's eyes and head to spot drowsiness.",
  },
  "adas.lidar": {
    kind: "dome",
    summary: "Sends laser pulses to build a 3D map of the surroundings.",
  },
  "adas.radar": {
    kind: "radar",
    summary: "Measures distance and speed of objects with radio waves.",
  },

  "battery.bms": {
    kind: "box",
    summary:
      "Battery management: balances the cells and guards against faults.",
  },
  "battery.charging": {
    kind: "harness",
    summary: "Charge port, cable and on-board charger for the pack.",
  },
  "battery.high_voltage": {
    kind: "harness",
    summary: "Heavy cables and fuses between the pack and the motor.",
  },
  "battery.low_voltage": {
    kind: "pack",
    summary: "The 12 V battery that runs lights and electronics.",
  },
  "battery.modules": {
    kind: "pack",
    summary: "Groups of cells stacked inside the main battery pack.",
  },

  "body.closures": {
    kind: "panel",
    summary: "Doors, hood and tailgate that open and close.",
  },
  "body.glass": {
    kind: "glass",
    summary: "Windscreen, side windows and rear glass.",
  },
  "body.panels": {
    kind: "panel",
    summary: "Outer skin panels: fenders, roof and quarter panels.",
  },
  "body.sealing": {
    kind: "tube",
    summary: "Rubber seals that keep out water, dust and noise.",
  },
  "body.structure": {
    kind: "arm",
    summary: "The frame and pillars that carry the whole car.",
  },

  "electrical.connectors": {
    kind: "harness",
    summary: "Plugs that join wires and modules safely.",
  },
  "electrical.power_distribution": {
    kind: "box",
    summary: "Fuse and relay box that shares power between circuits.",
  },
  "electrical.relays": {
    kind: "box",
    summary: "Electric switches: a small signal controls a big load.",
  },
  "electrical.sensors": {
    kind: "sensor",
    summary: "Measure temperature, pressure, position and more.",
  },
  "electrical.wiring": {
    kind: "harness",
    summary: "Wiring harnesses that carry power and signals.",
  },

  "engine.air_intake": {
    kind: "tube",
    summary: "Filters and guides fresh air into the engine.",
  },
  "engine.exhaust": {
    kind: "tube",
    summary: "Carries burnt gases away and quietens the noise.",
  },
  "engine.fuel": {
    kind: "canister",
    summary: "Tank, pump and injectors that deliver fuel.",
  },
  "engine.ignition": {
    kind: "sensor",
    summary: "Coils and spark plugs that light the fuel mixture.",
  },
  "engine.lubrication": {
    kind: "pump",
    summary: "Oil pump and filter that keep moving parts slippery.",
  },
  "engine.timing": {
    kind: "gear",
    summary: "Belt or chain and gears that keep valves and pistons in step.",
  },

  "interior.cockpit": {
    kind: "panel",
    summary: "The dashboard and display the driver looks at.",
  },
  "interior.controls": {
    kind: "box",
    summary: "Buttons, stalks and switches for the driver.",
  },
  "interior.restraint_interfaces": {
    kind: "bolt",
    summary: "Belt anchors and buckles that tie the seat belts to the car.",
  },
  "interior.seats": {
    kind: "seat",
    summary: "Seats with their frames, foam and covers.",
  },
  "interior.trim": {
    kind: "panel",
    summary: "Soft covers and panels that finish the cabin.",
  },

  "safety.active_safety": {
    kind: "box",
    summary:
      "Systems that help avoid a crash, such as automatic emergency braking.",
  },
  "safety.crash_structures": {
    kind: "arm",
    summary: "Crumple zones that soak up impact energy.",
  },
  "safety.passive_safety": {
    kind: "canister",
    summary: "Airbags and devices that protect people during a crash.",
  },
  "safety.restraints": {
    kind: "harness",
    summary: "Seat belts and pretensioners that hold occupants in place.",
  },

  "steering.power_assist.eps_motors": {
    kind: "motor",
    summary: "Electric motor that makes turning the wheel easier.",
  },
  "steering.power_assist.hydraulic_pumps": {
    kind: "pump",
    summary: "Pump that gives hydraulic steering assist.",
  },
  "steering.power_assist.reservoirs": {
    kind: "canister",
    summary: "Holds the fluid for hydraulic steering.",
  },
  "steering.steering_columns": {
    kind: "damper",
    summary: "The shaft from the steering wheel down to the steering gear.",
  },
  "steering.steering_controls.angle_sensors": {
    kind: "sensor",
    summary: "Measures how far the steering wheel is turned.",
  },
  "steering.steering_controls.control_modules": {
    kind: "box",
    summary: "The computer that controls steering assist.",
  },
  "steering.steering_gears.steering_boxes": {
    kind: "gear",
    summary: "Gearbox that turns wheel rotation into sideways motion.",
  },
  "steering.steering_gears.steering_racks": {
    kind: "rod",
    summary: "A toothed bar that pushes the wheels left and right.",
  },
  "steering.steering_linkage.ball_joints": {
    kind: "ring",
    summary: "Pivots that let the wheels turn and move with the road.",
  },
  "steering.steering_linkage.drag_links": {
    kind: "rod",
    summary: "Rods that pass steering motion along the linkage.",
  },
  "steering.steering_linkage.tie_rods": {
    kind: "rod",
    summary: "Rods that connect the steering gear to each wheel.",
  },
  "steering.steering_wheels": {
    kind: "ring",
    summary: "The wheel the driver holds.",
  },

  "suspension.control_arms": {
    kind: "arm",
    summary: "Arms that hold the wheel and let it move up and down.",
  },
  "suspension.dampers": {
    kind: "damper",
    summary: "Shock absorbers that calm the bouncing.",
  },
  "suspension.mounts": {
    kind: "ring",
    summary: "Rubber mounts that keep vibration out of the body.",
  },
  "suspension.springs": {
    kind: "spring",
    summary: "Coil springs that carry the weight of the car.",
  },
  "suspension.stabilizers": {
    kind: "rod",
    summary: "Anti-roll bars that limit body lean in corners.",
  },

  "thermal.battery_thermal_management": {
    kind: "radiator",
    summary: "Cooling plates that keep the battery at a safe temperature.",
  },
  "thermal.cooling": {
    kind: "pump",
    summary: "Water pump and coolant loop for the engine or motor.",
  },
  "thermal.heat_exchangers": {
    kind: "radiator",
    summary: "Radiators and condensers that swap heat with the air.",
  },
  "thermal.hvac": {
    kind: "box",
    summary: "Heating and cooling unit that conditions the cabin.",
  },

  "transmission.automatic": {
    kind: "gear",
    summary: "Automatic gearbox that changes gear for you.",
  },
  "transmission.clutch": {
    kind: "ring",
    summary: "Connects and disconnects the engine from the gearbox.",
  },
  "transmission.differential": {
    kind: "gear",
    summary: "Lets the left and right wheels turn at different speeds.",
  },
  "transmission.manual": {
    kind: "gear",
    summary: "Manual gearbox shifted by the driver.",
  },
  "transmission.torque_converter": {
    kind: "ring",
    summary: "Fluid coupling that replaces the clutch in an automatic.",
  },

  "tyres_wheels.hubs_bearings.wheel_bearings": {
    kind: "ring",
    summary: "Let the wheel spin with almost no friction.",
  },
  "tyres_wheels.hubs_bearings.wheel_hubs": {
    kind: "ring",
    summary: "The centre that the wheel bolts onto.",
  },
  "tyres_wheels.tpms.tpms_sensors": {
    kind: "sensor",
    summary: "Tyre pressure sensors inside each wheel.",
  },
  "tyres_wheels.tpms.tpms_service_kits": {
    kind: "bolt",
    summary: "Small parts for servicing tyre pressure sensors.",
  },
  "tyres_wheels.tyres.all_season_tyres": {
    kind: "tyre",
    summary: "A balanced tyre for dry, wet and light snow.",
  },
  "tyres_wheels.tyres.commercial_tyres": {
    kind: "tyre",
    summary: "Tough tyres built for heavy loads and long distances.",
  },
  "tyres_wheels.tyres.performance_tyres": {
    kind: "tyre",
    summary: "High-grip tyres for sporty driving.",
  },
  "tyres_wheels.tyres.summer_tyres": {
    kind: "tyre",
    summary: "Tyres tuned for warm, dry and wet roads.",
  },
  "tyres_wheels.tyres.winter_tyres": {
    kind: "tyre",
    summary: "Soft tyres that keep their grip in cold, snow and ice.",
  },
  "tyres_wheels.valves": {
    kind: "sensor",
    summary: "Valve stems used to inflate the tyres.",
  },
  "tyres_wheels.wheel_fasteners": {
    kind: "bolt",
    summary: "Nuts and bolts that hold the wheel on.",
  },
  "tyres_wheels.wheels_rims.alloy_wheels": {
    kind: "ring",
    summary: "Light alloy rims.",
  },
  "tyres_wheels.wheels_rims.steel_wheels": {
    kind: "ring",
    summary: "Strong, low-cost steel rims.",
  },
};

export const FALLBACK_INFO: PartInfo = {
  kind: "box",
  summary: "A group of parts in the catalog.",
};
