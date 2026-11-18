import { createHash } from "node:crypto";

export const GENERATOR_VERSION = "gen-v1";
export const SOURCE_SYSTEM = "phase7-generator";
export const SMOKE_SOURCE_SYSTEM = "phase7-smoke";
export const DEFAULT_SMOKE_COUNT = 10000;
export const FULL_ROW_COUNT = 5000000;
export const BATCH_SIZE = 2000;
export const CHECKPOINT_INTERVAL = 250000;
export const SECONDARY_TAG_PROBABILITY = 0.2;

export const COMPANIES = Array.from({ length: 120 }, (_, index) => 101 + index);

export const REGIONS = [
  "Europe",
  "North America",
  "Asia",
  "South America",
  "Middle East",
  "Africa",
  "Oceania",
];

export const COUNTRIES_BY_REGION = {
  Europe: [
    "Germany",
    "France",
    "Italy",
    "Spain",
    "United Kingdom",
    "Poland",
    "Czech Republic",
    "Sweden",
  ],
  "North America": ["United States", "Canada", "Mexico"],
  Asia: ["China", "Japan", "South Korea", "India", "Thailand"],
  "South America": ["Brazil", "Argentina", "Chile", "Colombia"],
  "Middle East": ["United Arab Emirates", "Saudi Arabia", "Turkey", "Israel"],
  Africa: ["South Africa", "Egypt", "Morocco", "Nigeria"],
  Oceania: ["Australia", "New Zealand"],
};

export const CITIES = [
  "Stuttgart",
  "Detroit",
  "Nagoya",
  "Shanghai",
  "Wolfsburg",
  "Seoul",
  "Milan",
  "Birmingham",
  "Barcelona",
  "Prague",
  "Gothenburg",
  "Toronto",
  "Sao Paulo",
  "Buenos Aires",
  "Chennai",
  "Bangkok",
  "Dubai",
  "Ankara",
  "Cape Town",
  "Casablanca",
  "Sydney",
  "Auckland",
  "Mexico City",
  "Monterrey",
  "Hannover",
  "Turin",
  "Coventry",
  "Lyon",
  "Katowice",
  "Bratislava",
];

export const MANUFACTURERS = [
  "Apex Mobility",
  "Vertex Components",
  "Meridian Auto Parts",
  "Zephyr Powertrain",
  "Titan Forge",
  "Vector Dynamics",
  "Solstice Industrial",
  "Nimbus Systems",
  "Crestline Automotive",
  "Harborline Components",
  "Ironclad Engineering",
  "Pinnacle Manufacturing",
  "Redwood Precision",
  "Silverline Parts",
  "Quartz Automotive",
  "Northwind Components",
  "Evergreen Industries",
  "Falcon Forge",
  "Grizzly Components",
  "Helix Engineering",
  "Aurora Automotive",
  "Bluestone Parts",
  "Cascade Manufacturing",
  "Dune Components",
  "Eclipse Forge",
  "Fjord Components",
  "Granite Precision",
  "Haven Automotive",
  "Inferno Forge",
  "Juniper Components",
  "Kestrel Engineering",
  "Lumen Parts",
  "Mosaic Manufacturing",
  "Nova Components",
  "Orion Forge",
  "Polaris Parts",
  "Quarry Components",
  "Regal Engineering",
  "Sierra Parts",
  "Tundra Components",
];

export const VEHICLE_PROGRAMS = [
  "Aurora Platform",
  "Vantage 2",
  "Stratos Sedan",
  "Horizon Crossover",
  "Pioneer Pickup",
  "Voyager MPV",
  "Atlas SUV",
  "Comet Coupe",
  "Nimbus GT",
  "Orbit Hatch",
  "Delta Compact",
  "Echo City Car",
  "Fjord Utility",
  "Granite Heavy",
  "Iris EV",
  "Juno Hybrid",
  "Kestrel Sport",
  "Lunar Van",
  "Meridian Sedan",
  "Northstar Pickup",
  "Onyx Luxury",
  "Prairie Compact",
  "Quartz Performance",
  "Ridge Runner",
  "Summit Crossover",
  "Titan Hauler",
  "Umbra Coupe",
  "Vista Family",
  "Willow EV",
  "Zephyr GT",
  "Alder Compact",
  "Birch SUV",
  "Cedar Van",
  "Dune 4x4",
  "Elm Sedan",
  "Falcon Performance",
  "Glacier Pickup",
  "Hemlock MPV",
  "Ivy City",
  "Juniper Utility",
  "Kauri Luxury",
  "Laurel Hybrid",
  "Maple EV",
  "Nettle Sport",
  "Oak Crossover",
  "Pine Hauler",
  "Quince GT",
  "Rose Compact",
  "Sage Pickup",
  "Thorne SUV",
  "Umbria Van",
  "Vine Sedan",
  "Walnut Performance",
  "Yarrow 4x4",
  "Zinnia City",
];

export const VEHICLES = [
  "sedan",
  "SUV",
  "pickup truck",
  "light van",
  "hatchback",
  "crossover",
  "sports car",
  "commercial truck",
  "MPV",
  "luxury sedan",
];

export const FEATURES = [
  "low-dust compound",
  "vented design",
  "corrosion-resistant coating",
  "precision-machined surface",
  "noise-optimised geometry",
  "thermal-stable construction",
  "lightweight design",
  "sealed-for-life design",
  "high-temperature tolerance",
  "anti-vibration design",
];

export const LIFECYCLE_STATUSES = [
  ["active", 80],
  ["prototype", 5],
  ["superseded", 8],
  ["obsolete", 4],
  ["end-of-life", 3],
];

export const SUPPLIER_STATUSES = [
  ["approved", 70],
  ["pending", 10],
  ["unapproved", 5],
  ["discontinued", 15],
];

const CATEGORY = (id, slug, name, weight) => ({ id, slug, name, weight });

const brakingCategories = [
  CATEGORY(101, "brake-pads", "Brake Pads", 200),
  CATEGORY(102, "brake-shoes", "Brake Shoes", 40),
  CATEGORY(104, "brake-rotors", "Brake Rotors", 180),
  CATEGORY(105, "brake-drums", "Brake Drums", 40),
  CATEGORY(106, "calipers", "Calipers", 120),
  CATEGORY(108, "master-cylinders", "Master Cylinders", 60),
  CATEGORY(109, "brake-lines", "Brake Lines", 55),
  CATEGORY(110, "hoses", "Hoses", 55),
  CATEGORY(111, "brake-fluid", "Brake Fluid", 60),
  CATEGORY(113, "abs-modules", "ABS Modules", 80),
  CATEGORY(114, "wheel-speed-sensors", "Wheel Speed Sensors", 70),
  CATEGORY(115, "tone-rings", "Tone Rings", 30),
  CATEGORY(116, "parking-brake", "Parking Brake", 45),
  CATEGORY(117, "brake-controls", "Brake Controls", 45),
];

const tyresCategories = [
  CATEGORY(201, "summer-tyres", "Summer Tyres", 140),
  CATEGORY(202, "winter-tyres", "Winter Tyres", 120),
  CATEGORY(203, "all-season-tyres", "All-season Tyres", 150),
  CATEGORY(204, "performance-tyres", "Performance Tyres", 110),
  CATEGORY(205, "commercial-tyres", "Commercial Tyres", 80),
  CATEGORY(207, "alloy-wheels", "Alloy Wheels", 130),
  CATEGORY(208, "steel-wheels", "Steel Wheels", 90),
  CATEGORY(210, "wheel-hubs", "Wheel Hubs", 70),
  CATEGORY(211, "wheel-bearings", "Wheel Bearings", 80),
  CATEGORY(213, "tpms-sensors", "TPMS Sensors", 90),
  CATEGORY(214, "tpms-service-kits", "TPMS Service Kits", 40),
  CATEGORY(215, "valves", "Valves", 40),
  CATEGORY(216, "wheel-fasteners", "Wheel Fasteners", 40),
];

const steeringCategories = [
  CATEGORY(301, "steering-racks", "Steering Racks", 150),
  CATEGORY(302, "steering-boxes", "Steering Boxes", 70),
  CATEGORY(303, "steering-columns", "Steering Columns", 130),
  CATEGORY(304, "steering-wheels", "Steering Wheels", 110),
  CATEGORY(306, "tie-rods", "Tie Rods", 120),
  CATEGORY(307, "drag-links", "Drag Links", 60),
  CATEGORY(308, "ball-joints", "Ball Joints", 100),
  CATEGORY(310, "hydraulic-pumps", "Hydraulic Pumps", 90),
  CATEGORY(311, "eps-motors", "EPS Motors", 100),
  CATEGORY(312, "reservoirs", "Reservoirs", 50),
  CATEGORY(314, "angle-sensors", "Angle Sensors", 70),
  CATEGORY(315, "control-modules", "Control Modules", 60),
];

const otherCategories = {
  engine: [
    CATEGORY(400, "air-intake", "Air Intake", 25),
    CATEGORY(401, "fuel", "Fuel", 25),
    CATEGORY(402, "ignition", "Ignition", 30),
    CATEGORY(403, "lubrication", "Lubrication", 20),
    CATEGORY(404, "timing", "Timing", 25),
    CATEGORY(405, "exhaust", "Exhaust", 20),
  ],
  transmission: [
    CATEGORY(410, "manual", "Manual", 25),
    CATEGORY(411, "automatic", "Automatic", 30),
    CATEGORY(412, "clutch", "Clutch", 25),
    CATEGORY(413, "torque-converter", "Torque Converter", 20),
    CATEGORY(414, "differential", "Differential", 25),
  ],
  suspension: [
    CATEGORY(420, "springs", "Springs", 30),
    CATEGORY(421, "dampers", "Dampers", 30),
    CATEGORY(422, "control-arms", "Control Arms", 25),
    CATEGORY(423, "stabilizers", "Stabilizers", 20),
    CATEGORY(424, "mounts", "Mounts", 20),
  ],
  electrical: [
    CATEGORY(430, "wiring", "Wiring", 30),
    CATEGORY(431, "connectors", "Connectors", 25),
    CATEGORY(432, "sensors", "Sensors", 30),
    CATEGORY(433, "relays", "Relays", 20),
    CATEGORY(434, "power-distribution", "Power Distribution", 20),
  ],
  battery: [
    CATEGORY(440, "low-voltage", "Low-voltage", 20),
    CATEGORY(441, "high-voltage", "High-voltage", 25),
    CATEGORY(442, "modules", "Modules", 25),
    CATEGORY(443, "bms", "Battery Management Systems", 20),
    CATEGORY(444, "charging", "Charging", 25),
  ],
  body: [
    CATEGORY(450, "panels", "Panels", 30),
    CATEGORY(451, "closures", "Closures", 25),
    CATEGORY(452, "structure", "Structure", 25),
    CATEGORY(453, "glass", "Glass", 20),
    CATEGORY(454, "sealing", "Sealing", 20),
  ],
  interior: [
    CATEGORY(460, "seats", "Seats", 30),
    CATEGORY(461, "trim", "Trim", 25),
    CATEGORY(462, "cockpit", "Cockpit", 25),
    CATEGORY(463, "controls", "Controls", 20),
    CATEGORY(464, "restraint-interfaces", "Restraint Interfaces", 20),
  ],
  safety: [
    CATEGORY(470, "passive-safety", "Passive Safety", 30),
    CATEGORY(471, "active-safety", "Active Safety", 30),
    CATEGORY(472, "restraints", "Restraints", 35),
    CATEGORY(473, "crash-structures", "Crash Structures", 25),
  ],
  adas: [
    CATEGORY(480, "cameras", "Cameras", 30),
    CATEGORY(481, "radar", "Radar", 25),
    CATEGORY(482, "lidar", "Lidar", 20),
    CATEGORY(483, "controllers", "Controllers", 25),
    CATEGORY(484, "driver-monitoring", "Driver Monitoring", 20),
  ],
  thermal: [
    CATEGORY(490, "cooling", "Cooling", 30),
    CATEGORY(491, "hvac", "HVAC", 30),
    CATEGORY(492, "heat-exchangers", "Heat Exchangers", 25),
    CATEGORY(
      493,
      "battery-thermal-management",
      "Battery Thermal Management",
      25,
    ),
  ],
};

export const SECONDARY_TAGS = {
  113: [432, 471],
  114: [432, 471],
  117: [432],
  213: [432],
  214: [432],
  314: [432],
  315: [432],
  311: [432],
  402: [432],
  401: [431],
  430: [433],
  433: [434],
  434: [433],
  443: [432],
  444: [433],
  460: [464],
  463: [431],
  471: [480],
  480: [432],
  481: [432],
  482: [432],
  484: [471],
  490: [492],
  492: [490],
};

const DOMAIN_MATERIALS = {
  engine: ["aluminium", "cast iron", "steel", "plastic composite"],
  transmission: ["steel", "forged steel", "aluminium", "carbon"],
  suspension: ["steel", "coil spring steel", "aluminium", "rubber"],
  electrical: ["copper", "PVC", "aluminium", "brass"],
  battery: ["lithium-ion", "lead-acid", "nickel", "aluminium"],
  body: ["steel", "aluminium", "polymer", "composite"],
  interior: ["leather", "fabric", "plastic", "foam"],
  safety: ["steel", "nylon", "airbag fabric", "composite"],
  adas: ["plastic", "glass", "silicon", "aluminium"],
  thermal: ["aluminium", "copper", "plastic", "steel"],
};

export const MATERIALS_BY_CATEGORY = {
  101: ["ceramic", "semi-metallic", "organic", "low-metallic"],
  102: ["organic", "asbestos-free", "semi-metallic"],
  104: ["cast iron", "coated cast iron", "carbon-ceramic"],
  105: ["cast iron", "coated cast iron"],
  106: ["cast iron", "aluminium", "composite"],
  108: ["cast iron", "aluminium"],
  109: ["steel", "coated steel"],
  110: ["reinforced rubber", "steel-braided"],
  111: ["DOT 4", "DOT 5.1", "high-boiling fluid"],
  113: ["ABS plastic", "aluminium"],
  114: ["steel", "plastic composite"],
  115: ["steel", "magnetised steel"],
  116: ["steel", "coated steel", "composite"],
  117: ["aluminium", "ABS plastic", "steel"],
  201: ["silica compound", "summer compound"],
  202: ["winter compound", "studded compound"],
  203: ["all-season compound"],
  204: ["high-performance compound", "track compound"],
  205: ["commercial compound", "heavy-duty compound"],
  207: ["cast aluminium", "forged aluminium"],
  208: ["steel"],
  210: ["steel", "bearing steel"],
  211: ["bearing steel"],
  213: ["ABS plastic", "brass", "rubber"],
  214: ["rubber", "brass", "steel"],
  215: ["brass", "steel", "rubber"],
  216: ["steel", "stainless steel", "alloy"],
  301: ["steel", "aluminium"],
  302: ["cast iron", "steel"],
  303: ["steel", "aluminium"],
  304: ["leather", "polyurethane", "wood", "plastic"],
  306: ["steel", "forged steel"],
  307: ["forged steel", "steel"],
  308: ["steel", "forged steel"],
  310: ["cast aluminium", "steel"],
  311: ["aluminium", "steel", "magnet"],
  312: ["plastic", "aluminium", "synthetic fluid"],
  314: ["plastic", "aluminium"],
  315: ["ABS plastic", "aluminium"],
};

const DOMAIN_ADJECTIVES = {
  braking: [
    "high-performance",
    "OE-grade",
    "premium",
    "durable",
    "precision",
    "long-life",
  ],
  "tyres-wheels": [
    "premium",
    "all-terrain",
    "quiet",
    "high-grip",
    "low-rolling-resistance",
    "heavy-duty",
  ],
  steering: [
    "precision",
    "responsive",
    "OE-grade",
    "heavy-duty",
    "silent",
    "durable",
  ],
  engine: ["high-flow", "OE-grade", "durable", "high-torque", "precision"],
  transmission: [
    "heavy-duty",
    "OE-grade",
    "precision",
    "smooth-shift",
    "durable",
  ],
  suspension: [
    "comfort",
    "sport",
    "heavy-duty",
    "OE-grade",
    "corrosion-resistant",
  ],
  electrical: [
    "waterproof",
    "OE-grade",
    "high-temperature",
    "precision",
    "shielded",
  ],
  battery: [
    "high-capacity",
    "long-cycle",
    "thermal-managed",
    "OE-grade",
    "safety-rated",
  ],
  body: [
    "corrosion-resistant",
    "OE-grade",
    "aerodynamic",
    "lightweight",
    "structural",
  ],
  interior: [
    "premium",
    "OE-grade",
    "wear-resistant",
    "comfort",
    "noise-dampened",
  ],
  safety: ["certified", "OE-grade", "high-impact", "reliable", "tested"],
  adas: [
    "high-resolution",
    "calibrated",
    "all-weather",
    "OE-grade",
    "low-latency",
  ],
  thermal: [
    "high-efficiency",
    "corrosion-resistant",
    "OE-grade",
    "lightweight",
    "durable",
  ],
};

export const ITEMS_BY_CATEGORY = {
  101: ["brake pad", "disc brake pad", "brake pad set", "friction pad"],
  102: ["brake shoe", "drum brake shoe", "brake shoe lining"],
  104: ["brake rotor", "disc rotor", "vented brake disc", "brake disc"],
  105: ["brake drum", "drum brake drum"],
  106: [
    "brake caliper",
    "caliper assembly",
    "sliding caliper",
    "fixed caliper",
  ],
  108: ["master cylinder", "brake master cylinder", "master cylinder assembly"],
  109: ["brake line", "brake pipe", "brake line kit"],
  110: ["brake hose", "flexible brake hose", "brake hose kit"],
  111: ["brake fluid", "DOT 4 brake fluid", "high-performance brake fluid"],
  113: ["ABS module", "ABS control unit", "ABS modulator"],
  114: ["wheel speed sensor", "ABS wheel speed sensor", "speed sensor"],
  115: ["tone ring", "ABS tone ring", "wheel tone ring"],
  116: [
    "parking brake cable",
    "parking brake lever",
    "electric parking brake actuator",
  ],
  117: [
    "brake control module",
    "brake booster",
    "brake pedal assembly",
    "brake switch",
  ],
  201: ["summer tyre", "performance summer tyre", "summer radial tyre"],
  202: ["winter tyre", "studded winter tyre", "winter radial tyre"],
  203: ["all-season tyre", "all-season radial tyre"],
  204: ["performance tyre", "ultra-high-performance tyre", "track tyre"],
  205: ["commercial tyre", "truck tyre", "van tyre", "light commercial tyre"],
  207: ["alloy wheel", "alloy rim", "forged alloy wheel", "cast alloy wheel"],
  208: ["steel wheel", "steel rim", "steel wheel assembly"],
  210: ["wheel hub", "hub assembly", "wheel hub unit"],
  211: ["wheel bearing", "hub bearing", "wheel bearing assembly"],
  213: ["TPMS sensor", "tyre pressure sensor", "TPMS transmitter"],
  214: ["TPMS service kit", "TPMS replacement kit", "valve service kit"],
  215: ["tyre valve", "valve stem", "snap-in valve", "metal valve"],
  216: ["wheel bolt", "lug nut", "wheel fastener", "wheel nut set"],
  301: [
    "steering rack",
    "electric power steering rack",
    "rack and pinion assembly",
  ],
  302: ["steering box", "recirculating ball steering box"],
  303: [
    "steering column",
    "electric steering column",
    "steering column assembly",
  ],
  304: ["steering wheel", "sport steering wheel", "leather steering wheel"],
  306: ["tie rod end", "tie rod assembly", "inner tie rod"],
  307: ["drag link", "drag link assembly"],
  308: ["ball joint", "suspension ball joint", "steering ball joint"],
  310: [
    "hydraulic steering pump",
    "power steering pump",
    "power steering pump assembly",
  ],
  311: ["EPS motor", "electric power steering motor", "EPS assist motor"],
  312: [
    "power steering reservoir",
    "reservoir cap",
    "power steering fluid tank",
  ],
  314: ["steering angle sensor", "steering position sensor", "angle sensor"],
  315: ["steering control module", "EPS control unit", "steering ECU"],
  400: [
    "air filter",
    "air intake duct",
    "intake manifold",
    "throttle body",
    "air intake hose",
  ],
  401: ["fuel pump", "fuel injector", "fuel rail", "fuel filter", "fuel line"],
  402: ["ignition coil", "spark plug", "ignition module", "ignition cable"],
  403: ["oil filter", "oil pump", "oil pan", "PCV valve"],
  404: ["timing belt", "timing chain", "timing kit", "crankshaft pulley"],
  405: [
    "exhaust manifold",
    "catalytic converter",
    "muffler",
    "exhaust pipe",
    "oxygen sensor",
  ],
  410: [
    "manual transmission gear",
    "gear synchronizer",
    "shift fork",
    "manual gearbox part",
  ],
  411: [
    "automatic transmission valve body",
    "torque converter housing",
    "transmission solenoid",
    "automatic gearbox part",
  ],
  412: [
    "clutch disc",
    "clutch kit",
    "pressure plate",
    "clutch release bearing",
  ],
  413: ["torque converter", "torque converter assembly", "flexplate"],
  414: [
    "differential assembly",
    "differential gear",
    "axle gear",
    "limited-slip differential",
  ],
  420: ["coil spring", "leaf spring", "air spring", "suspension spring"],
  421: [
    "shock absorber",
    "strut assembly",
    "damper insert",
    "suspension damper",
  ],
  422: ["control arm", "lower control arm", "upper control arm", "wishbone"],
  423: ["stabilizer bar", "anti-roll bar", "stabilizer link", "bushing kit"],
  424: ["engine mount", "transmission mount", "strut mount", "bushing"],
  430: [
    "wiring harness",
    "engine wiring harness",
    "body wiring loom",
    "battery cable",
  ],
  431: [
    "electrical connector",
    "connector housing",
    "terminal kit",
    "connector kit",
  ],
  432: ["temperature sensor", "pressure sensor", "hall sensor", "speed sensor"],
  433: ["relay", "relay module", "fuse relay", "flasher relay"],
  434: ["fuse box", "power distribution module", "junction box", "fuse block"],
  440: [
    "12V battery",
    "starter battery",
    "low-voltage battery",
    "battery terminal",
  ],
  441: [
    "high-voltage battery pack",
    "HV battery module",
    "high-voltage battery",
  ],
  442: ["battery cell", "battery module", "battery pack component"],
  443: [
    "battery management system",
    "BMS controller",
    "BMS board",
    "cell monitor",
  ],
  444: [
    "charger module",
    "onboard charger",
    "charging port",
    "DC-DC converter",
  ],
  450: ["front fender", "hood", "door panel", "quarter panel", "body panel"],
  451: ["door assembly", "tailgate", "hatchback door", "closure panel"],
  452: ["body frame rail", "subframe", "floor pan", "body structure part"],
  453: ["windshield", "side window glass", "rear glass", "quarter window"],
  454: ["weather seal", "door seal", "sunroof seal", "body sealing kit"],
  460: [
    "front seat",
    "seat assembly",
    "seat cushion",
    "seat rail",
    "seat frame",
  ],
  461: ["interior trim", "dashboard trim", "door trim panel", "trim clip"],
  462: [
    "instrument cluster",
    "center console",
    "dashboard assembly",
    "cockpit module",
  ],
  463: [
    "switch panel",
    "window switch",
    "steering column switch",
    "control switch",
  ],
  464: ["seat belt buckle", "seat belt anchor", "seat belt pretensioner mount"],
  470: [
    "airbag",
    "airbag module",
    "seat belt",
    "crash sensor",
    "seat belt assembly",
  ],
  471: [
    "lane departure camera",
    "collision sensor",
    "driver assist module",
    "active safety sensor",
  ],
  472: [
    "restraint control module",
    "seat belt assembly",
    "airbag module",
    "pretensioner",
  ],
  473: ["crash beam", "bumper reinforcement", "crush can", "impact bar"],
  480: [
    "front camera",
    "rearview camera",
    "surround view camera",
    "camera module",
  ],
  481: ["radar sensor", "long-range radar", "corner radar", "radar module"],
  482: ["lidar sensor", "lidar unit", "lidar scanner", "solid-state lidar"],
  483: ["ADAS controller", "domain controller", "fusion module", "ADAS ECU"],
  484: [
    "driver monitoring camera",
    "driver monitoring system",
    "attention sensor",
    "DMS module",
  ],
  490: [
    "radiator",
    "coolant pump",
    "cooling fan",
    "radiator hose",
    "thermostat",
  ],
  491: [
    "HVAC blower",
    "heater core",
    "AC compressor",
    "evaporator",
    "HVAC module",
  ],
  492: ["intercooler", "oil cooler", "heat exchanger", "condenser"],
  493: [
    "battery chiller",
    "battery coolant plate",
    "thermal management module",
    "BTMS pump",
  ],
};

const COST_RANGES = {
  Braking: [8, 220],
  "Tyres and Wheels": [25, 600],
  Steering: [30, 900],
  Engine: [15, 1200],
  Transmission: [50, 4000],
  Suspension: [15, 600],
  Electrical: [3, 300],
  Battery: [40, 2500],
  Body: [20, 800],
  Interior: [10, 500],
  Safety: [15, 900],
  ADAS: [30, 1500],
  Thermal: [20, 700],
};

const WEIGHT_RANGES = {
  Braking: [0.1, 18],
  "Tyres and Wheels": [1, 40],
  Steering: [0.5, 25],
  Engine: [0.2, 60],
  Transmission: [2, 120],
  Suspension: [0.5, 20],
  Electrical: [0.05, 8],
  Battery: [1, 120],
  Body: [1, 35],
  Interior: [0.5, 25],
  Safety: [0.2, 30],
  ADAS: [0.1, 5],
  Thermal: [0.3, 15],
};

const OTHER_GROUP_DEFS = [
  ["engine", "ENG", 13, "Engine"],
  ["transmission", "TRN", 14, "Transmission"],
  ["suspension", "SUS", 15, "Suspension"],
  ["electrical", "ELE", 16, "Electrical"],
  ["battery", "BAT", 17, "Battery"],
  ["body", "BDY", 18, "Body"],
  ["interior", "INT", 19, "Interior"],
  ["safety", "SFT", 20, "Safety"],
  ["adas", "ADS", 21, "ADAS"],
  ["thermal", "THM", 22, "Thermal"],
].map(([key, prefix, domainId, commodity]) => ({
  key,
  prefix,
  domainId,
  commodity,
  count: 125000,
  categories: otherCategories[key],
  adjectives: DOMAIN_ADJECTIVES[key],
  materials: DOMAIN_MATERIALS[key],
  costRange: COST_RANGES[commodity],
  weightRange: WEIGHT_RANGES[commodity],
}));

const GROUP_DEFS = [
  ["braking", "BRK", 10, "Braking", brakingCategories, "braking", 1250000],
  [
    "tyres-wheels",
    "TYR",
    11,
    "Tyres and Wheels",
    tyresCategories,
    "tyres-wheels",
    1250000,
  ],
  ["steering", "STR", 12, "Steering", steeringCategories, "steering", 1250000],
];

export const GROUPS = [
  ...GROUP_DEFS.map(
    ([key, prefix, domainId, commodity, categories, domainKey, count]) => ({
      key,
      prefix,
      domainId,
      commodity,
      categories,
      count,
      adjectives: DOMAIN_ADJECTIVES[domainKey],
      materials: MATERIALS_BY_CATEGORY,
      costRange: COST_RANGES[commodity],
      weightRange: WEIGHT_RANGES[commodity],
      materialLookup: domainKey,
    }),
  ),
  ...OTHER_GROUP_DEFS,
];

const MAJOR_GROUPS = GROUPS.slice(0, 3);

function materialFor(group, categoryId) {
  if (group.materialLookup) return MATERIALS_BY_CATEGORY[categoryId];
  return group.materials;
}

function hashToUint32(input) {
  return createHash("sha256").update(input).digest().readUInt32BE(0);
}

export function rowSeed(groupKey, index) {
  return hashToUint32(`${GENERATOR_VERSION}|${groupKey}|${index}`);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function weightedPick(rand, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = rand() * total;
  for (const [value, weight] of entries) {
    remaining -= weight;
    if (remaining <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function expectedCategoryCounts(group) {
  const totalWeight = group.categories.reduce(
    (sum, category) => sum + category.weight,
    0,
  );
  const counts = new Map(
    group.categories.map((category) => [
      category.id,
      Math.floor((group.count * category.weight) / totalWeight),
    ]),
  );
  let assigned = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const byRemainder = group.categories
    .map((category) => ({
      id: category.id,
      remainder:
        (group.count * category.weight) / totalWeight - counts.get(category.id),
    }))
    .sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (assigned < group.count) {
    const categoryId = byRemainder[cursor % byRemainder.length].id;
    counts.set(categoryId, counts.get(categoryId) + 1);
    assigned += 1;
    cursor += 1;
  }
  return counts;
}

function cumulativeBounds(group) {
  const counts = expectedCategoryCounts(group);
  const bounds = [];
  let acc = 0;
  for (const category of group.categories) {
    acc += counts.get(category.id);
    bounds.push({ id: category.id, end: acc });
  }
  return bounds;
}

export function categoryForIndex(group, index) {
  const bounds = cumulativeBounds(group);
  let low = 0;
  let high = bounds.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (index < bounds[mid].end) high = mid;
    else low = mid + 1;
  }
  return bounds[low].id;
}

export function generateRow(group, index, sourceSystem = SOURCE_SYSTEM) {
  const rand = mulberry32(rowSeed(group.key, index));
  const primaryCategoryId = categoryForIndex(group, index);
  const categoryMeta = group.categories.find(
    (category) => category.id === primaryCategoryId,
  );
  const materialPool = materialFor(group, primaryCategoryId);
  const material = pick(rand, materialPool);
  const item = pick(rand, ITEMS_BY_CATEGORY[primaryCategoryId]);
  const vehicle = pick(rand, VEHICLES);
  const manufacturer = pick(rand, MANUFACTURERS);
  const program = pick(rand, VEHICLE_PROGRAMS);
  const region = pick(rand, REGIONS);
  const country = pick(rand, COUNTRIES_BY_REGION[region]);
  const plantCity = pick(rand, CITIES);
  const modelYear = 2000 + Math.floor(rand() * 27);
  const companyId = pick(rand, COMPANIES);
  const [costMin, costMax] = group.costRange;
  const [weightMin, weightMax] = group.weightRange;
  const cost = costMin + (costMax - costMin) * rand();
  const weight = weightMin + (weightMax - weightMin) * rand();

  const nameStyle = Math.floor(rand() * 3);
  const adjective = pick(rand, group.adjectives);
  const name =
    nameStyle === 0
      ? `${capitalize(adjective)} ${item}`
      : nameStyle === 1
        ? `${capitalize(item)} for ${vehicle}`
        : `${capitalize(adjective)} ${item} for ${vehicle}`;

  const feature = pick(rand, FEATURES);
  const lifecycleStatus = weightedPick(rand, LIFECYCLE_STATUSES);
  const supplierStatus = weightedPick(rand, SUPPLIER_STATUSES);

  const description = `${name}. ${capitalize(material)} construction with ${feature}. Fits ${program} ${modelYear}MY; ${region} ${country} market. OEM-style replacement from ${manufacturer}.`;

  const tagOptions = SECONDARY_TAGS[primaryCategoryId];
  const secondaryTag =
    tagOptions && tagOptions.length > 0 && rand() < SECONDARY_TAG_PROBABILITY
      ? pick(rand, tagOptions)
      : null;

  const paddedIndex = String(index + 1).padStart(7, "0");
  return {
    companyId,
    tenantId: 1,
    partNumber: `${group.prefix}-${paddedIndex}`,
    partName: name,
    description,
    commodity: group.commodity,
    subCommodity: categoryMeta.name,
    manufacturer,
    vehicleProgram: program,
    region,
    country,
    plant: `${plantCity} Plant`,
    modelYear,
    material,
    lifecycleStatus,
    supplierStatus,
    costUsd: cost.toFixed(2),
    weightKg: weight.toFixed(3),
    active: true,
    securityDomainId: group.domainId,
    primaryCategoryId,
    visibilityStatus: "organization",
    sourceSystem,
    sourceRecordId: `gen-v1-${group.prefix}-${paddedIndex}`,
    documentVersion: 1,
    secondaryTag,
  };
}

export function buildGroups({
  smoke = false,
  count = DEFAULT_SMOKE_COUNT,
} = {}) {
  if (!smoke) {
    return GROUPS.map((group) => ({ ...group, categories: group.categories }));
  }
  const quarter = Math.floor(count / 4);
  const otherTotal = count - 3 * quarter;
  const base = Math.floor(otherTotal / OTHER_GROUP_DEFS.length);
  const remainder = otherTotal - base * OTHER_GROUP_DEFS.length;
  return [
    ...MAJOR_GROUPS.map((group) => ({ ...group, count: quarter })),
    ...OTHER_GROUP_DEFS.map((group, index) => ({
      ...group,
      count: base + (index < remainder ? 1 : 0),
    })),
  ];
}

export function majorDistribution(groups) {
  const result = {
    braking: 0,
    "tyres-wheels": 0,
    steering: 0,
    other: 0,
  };
  for (const group of groups) {
    if (group.domainId === 10) result.braking += group.count;
    else if (group.domainId === 11) result["tyres-wheels"] += group.count;
    else if (group.domainId === 12) result.steering += group.count;
    else result.other += group.count;
  }
  return result;
}
