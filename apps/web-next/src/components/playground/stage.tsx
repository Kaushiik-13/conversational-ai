"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import {
  CameraControls,
  ContactShadows,
  Environment,
  Html,
  Lightformer,
} from "@react-three/drei";
import { Spherical, Vector3 } from "three";

export type Vec3 = [number, number, number];
/** A camera view: [where the camera is, what it looks at]. */
export type View = [Vec3, Vec3];

const ACTION = CameraControlsImpl.ACTION;
const MAX_POLAR = Math.PI / 2.05;

/** Where the pointer last went down, to tell a click from a drag. */
let pressedAt: { x: number; y: number } | null = null;

/** True when the pointer moved enough since it went down to count as a drag. */
export function wasDrag(event: { clientX: number; clientY: number }): boolean {
  if (!pressedAt) return false;
  return (
    Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 5
  );
}

/** The 3D canvas. A click on empty space calls `onMiss`; a drag does not. */
export function SceneCanvas({
  cameraPosition,
  onMiss,
  children,
}: {
  cameraPosition: Vec3;
  onMiss: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="size-full"
      onPointerDownCapture={(event) => {
        pressedAt = { x: event.clientX, y: event.clientY };
      }}
    >
      <Canvas
        camera={{ position: cameraPosition, fov: 38 }}
        dpr={[1, 2]}
        onPointerMissed={(event) => {
          if (!wasDrag(event)) onMiss();
        }}
      >
        {children}
      </Canvas>
    </div>
  );
}

/** Studio lighting, a soft floor and contact shadows. */
export function Studio({
  floorRadius = 9,
  onFloorClick,
}: {
  floorRadius?: number;
  onFloorClick?: () => void;
}) {
  return (
    <>
      <Environment resolution={256} environmentIntensity={1.6}>
        <Lightformer
          form="rect"
          intensity={4}
          position={[0, 8, 2]}
          rotation-x={Math.PI / 2}
          scale={[14, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          position={[-8, 3, 0]}
          rotation-y={Math.PI / 2}
          scale={[10, 4, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          position={[8, 3, 2]}
          rotation-y={-Math.PI / 2}
          scale={[10, 4, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.5}
          position={[0, 4, -8]}
          scale={6}
        />
      </Environment>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 9, 6]} intensity={1.4} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.45, 0]}
        onClick={(event) => {
          if (!wasDrag(event)) onFloorClick?.();
        }}
      >
        <circleGeometry args={[floorRadius, 64]} />
        <meshStandardMaterial color="#eceef1" roughness={0.95} />
      </mesh>
      <ContactShadows
        position={[0, -0.44, 0]}
        opacity={0.45}
        scale={Math.max(16, floorRadius * 1.8)}
        blur={2.6}
        far={4.5}
      />
    </>
  );
}

/** Slow at the start and end, quick in the middle. */
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface Flight {
  startedAt: number;
  duration: number;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromOffset: Spherical;
  toOffset: Spherical;
}

/**
 * Orbit controls that fly smoothly to a new view whenever `view` changes:
 * the camera swings around and pulls back a little, so it never cuts through
 * the parts. Dragging mid-flight hands control back to the user.
 */
export function FlightControls({
  view,
  minDistance = 2.2,
  maxDistance = 18,
}: {
  view: View;
  minDistance?: number;
  maxDistance?: number;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  const flight = useRef<Flight | null>(null);
  const key = view.flat().join(",");

  useEffect(() => {
    const cameraControls = controls.current;
    if (!cameraControls) return;
    const [toPosition, toTarget] = key.split(",").reduce<number[][]>(
      (groups, value, order) => {
        groups[Math.floor(order / 3)].push(Number(value));
        return groups;
      },
      [[], []],
    );
    const fromTarget = cameraControls.getTarget(new Vector3());
    const fromPosition = cameraControls.getPosition(new Vector3());
    const to = new Vector3(...(toTarget as Vec3));
    const fromOffset = new Spherical().setFromVector3(
      fromPosition.clone().sub(fromTarget),
    );
    const toOffset = new Spherical().setFromVector3(
      new Vector3(...(toPosition as Vec3)).sub(to),
    );
    // Turn the short way round.
    let turn = toOffset.theta - fromOffset.theta;
    if (turn > Math.PI) toOffset.theta -= Math.PI * 2;
    if (turn < -Math.PI) toOffset.theta += Math.PI * 2;
    turn = toOffset.theta - fromOffset.theta;
    const travel = fromTarget.distanceTo(to) + Math.abs(turn) * 2;
    flight.current = {
      startedAt: performance.now(),
      duration: Math.min(2, Math.max(0.9, 0.7 + travel * 0.18)),
      fromTarget,
      toTarget: to,
      fromOffset,
      toOffset,
    };
  }, [key]);

  useEffect(() => {
    const cameraControls = controls.current;
    if (!cameraControls) return;
    const stop = () => {
      flight.current = null;
    };
    cameraControls.addEventListener("controlstart", stop);
    return () => cameraControls.removeEventListener("controlstart", stop);
  }, []);

  useFrame(() => {
    const move = flight.current;
    const cameraControls = controls.current;
    if (!move || !cameraControls) return;
    const raw = Math.min(
      (performance.now() - move.startedAt) / 1000 / move.duration,
      1,
    );
    const eased = easeInOut(raw);
    const target = move.fromTarget.clone().lerp(move.toTarget, eased);
    const pullBack = Math.sin(Math.PI * eased) * 1.4;
    const offset = new Spherical(
      move.fromOffset.radius +
        (move.toOffset.radius - move.fromOffset.radius) * eased +
        pullBack,
      Math.min(
        MAX_POLAR,
        move.fromOffset.phi + (move.toOffset.phi - move.fromOffset.phi) * eased,
      ),
      move.fromOffset.theta +
        (move.toOffset.theta - move.fromOffset.theta) * eased,
    );
    const position = new Vector3().setFromSpherical(offset).add(target);
    void cameraControls.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
      false,
    );
    if (raw >= 1) flight.current = null;
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={MAX_POLAR}
      smoothTime={0.15}
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.NONE,
        right: ACTION.NONE,
        wheel: ACTION.DOLLY,
      }}
      touches={{
        one: ACTION.TOUCH_ROTATE,
        two: ACTION.TOUCH_DOLLY,
        three: ACTION.NONE,
      }}
    />
  );
}

/** A numbered pin that names a part and can be clicked. */
export function PinBadge({
  position,
  number,
  label,
  color,
  active,
  alwaysShowLabel = false,
  onClick,
}: {
  position: Vec3;
  number: number | string;
  label: string;
  color: string;
  active: boolean;
  alwaysShowLabel?: boolean;
  onClick: () => void;
}) {
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Select ${label}`}
        className="group flex items-center gap-1.5 rounded-full border bg-background/90 py-0.5 pr-2 pl-0.5 text-xs shadow-sm backdrop-blur transition-transform hover:scale-105"
        style={{ borderColor: active ? color : undefined }}
      >
        <span
          className="flex size-5 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {number}
        </span>
        <span
          className={`whitespace-nowrap ${
            active || alwaysShowLabel ? "" : "hidden group-hover:inline"
          }`}
        >
          {label}
        </span>
      </button>
    </Html>
  );
}
