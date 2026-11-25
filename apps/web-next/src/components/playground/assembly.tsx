"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { PinBadge, wasDrag, type Vec3 } from "./stage";

export interface Tint {
  color: string;
  glow: number;
}

export interface PartMeta {
  color: string;
  label: string;
  number: number | string;
}

/**
 * A part of an assembly. It slides between where it sits ("home") and an
 * exploded spot, glows when hovered or selected, and can show a pin.
 */
export function Part({
  id,
  meta,
  home,
  offset = [0, 0, 0],
  exploded,
  visible,
  selected,
  hovered,
  pin,
  pinVisible = true,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  meta: PartMeta;
  home: Vec3;
  offset?: Vec3;
  exploded: boolean;
  visible: boolean;
  selected: boolean;
  hovered: boolean;
  pin?: Vec3;
  /** Set false to hide the pin while the part stays visible. */
  pinVisible?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  children: (tint: Tint) => ReactNode;
}) {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    const target = exploded
      ? [home[0] + offset[0], home[1] + offset[1], home[2] + offset[2]]
      : home;
    const ease = 1 - Math.exp(-delta * 6);
    node.position.x += (target[0] - node.position.x) * ease;
    node.position.y += (target[1] - node.position.y) * ease;
    node.position.z += (target[2] - node.position.z) * ease;
  });

  return (
    <group
      ref={group}
      position={home}
      visible={visible}
      onClick={(event) => {
        event.stopPropagation();
        if (wasDrag(event)) return;
        onSelect(id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "";
      }}
    >
      {children({
        color: meta.color,
        glow: selected ? 0.5 : hovered ? 0.22 : 0,
      })}
      {pin && visible && pinVisible ? (
        <PinBadge
          position={pin}
          number={meta.number}
          label={meta.label}
          color={meta.color}
          active={selected || hovered}
          onClick={() => onSelect(id)}
        />
      ) : null}
    </group>
  );
}
