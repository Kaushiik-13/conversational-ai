"use client";

import { useEffect, useState } from "react";

const PHRASES = [
  "How many parts do we have by manufacturer?",
  "Which region has the highest average cost?",
  "Show the top 5 suppliers by part count.",
  "Compare active and obsolete records.",
];

const TYPE_MS = 38;
const DELETE_MS = 18;
const HOLD_MS = 1900;
const GAP_MS = 350;

export function AnimatedCaption() {
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [reduced, setReduced] = useState(false);
  const phrase = PHRASES[index];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    if (!deleting && length < phrase.length) {
      timer = setTimeout(() => setLength((value) => value + 1), TYPE_MS);
    } else if (!deleting) {
      timer = setTimeout(() => setDeleting(true), HOLD_MS);
    } else if (length > 0) {
      timer = setTimeout(() => setLength((value) => value - 1), DELETE_MS);
    } else {
      timer = setTimeout(() => {
        setDeleting(false);
        setIndex((value) => (value + 1) % PHRASES.length);
      }, GAP_MS);
    }
    return () => clearTimeout(timer);
  }, [deleting, length, phrase, reduced]);

  const text = reduced ? PHRASES[0] : phrase.slice(0, length);

  return (
    <p
      className="flex min-h-7 items-center gap-3 text-base sm:text-lg"
      aria-label={`Try asking: ${PHRASES[0]}`}
    >
      <span
        aria-hidden
        className="shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground uppercase"
      >
        Try asking
      </span>
      <span aria-hidden className="min-w-0 truncate">
        {text}
        {reduced ? null : (
          <span
            className="motion-safe-anim ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.2em] bg-signal"
            style={{ animation: "caret-blink 1s steps(1) infinite" }}
          />
        )}
      </span>
    </p>
  );
}
