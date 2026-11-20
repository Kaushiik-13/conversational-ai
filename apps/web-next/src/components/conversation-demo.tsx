"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Example {
  question: string;
  trace: string[];
  columns: [string, string];
  rows: [string, string][];
}

// Illustrative sample only. These are not real customer or catalog figures.
const EXAMPLES: Example[] = [
  {
    question: "How many parts do we have by manufacturer in Europe?",
    trace: ["part_count", "by manufacturer", "region = Europe"],
    columns: ["Manufacturer", "Parts"],
    rows: [
      ["Zephyr Powertrain", "18,402"],
      ["Norden Brakes", "15,967"],
      ["Alta Dynamics", "12,310"],
    ],
  },
  {
    question: "Which commodities cost the most on average?",
    trace: ["average_cost_usd", "by commodity", "top 3"],
    columns: ["Commodity", "Avg cost (USD)"],
    rows: [
      ["Battery", "412.80"],
      ["ADAS", "298.10"],
      ["Transmission", "251.45"],
    ],
  },
  {
    question: "Compare active and obsolete parts.",
    trace: ["part_count", "by lifecycle_status", "2 values"],
    columns: ["Lifecycle status", "Parts"],
    rows: [
      ["active", "4,120,330"],
      ["obsolete", "211,904"],
    ],
  },
];

type Phase = "typing" | "trace" | "result";

const TYPE_MS = 26;
const TRACE_MS = 450;
const RESULT_MS = 650;
const HOLD_MS = 4200;

export function ConversationDemo() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [reduced, setReduced] = useState(false);
  const example = EXAMPLES[index];

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
    if (phase === "typing") {
      if (typed < example.question.length) {
        timer = setTimeout(() => setTyped((value) => value + 1), TYPE_MS);
      } else {
        timer = setTimeout(() => setPhase("trace"), TRACE_MS);
      }
    } else if (phase === "trace") {
      timer = setTimeout(() => setPhase("result"), RESULT_MS);
    } else {
      timer = setTimeout(() => {
        setIndex((value) => (value + 1) % EXAMPLES.length);
        setTyped(0);
        setPhase("typing");
      }, HOLD_MS);
    }
    return () => clearTimeout(timer);
  }, [phase, typed, example, reduced]);

  const showTrace = reduced || phase !== "typing";
  const showResult = reduced || phase === "result";
  const question = reduced
    ? example.question
    : example.question.slice(0, typed);

  return (
    <div
      className="w-full max-w-xl rounded-lg border bg-card shadow-[0_1px_0_0_var(--border),0_24px_48px_-32px_oklch(0.2_0.02_60/0.35)]"
      aria-label="Example conversation"
      role="img"
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        <span>Illustrative example</span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-signal" />
          read-only
        </span>
      </div>

      <div className="space-y-5 p-5">
        <p className="min-h-14 font-display text-2xl leading-snug">
          {question}
          {!reduced && phase === "typing" ? (
            <span
              aria-hidden
              className="motion-safe-anim ml-0.5 inline-block h-5 w-px translate-y-0.5 bg-foreground"
              style={{ animation: "caret-blink 1s steps(1) infinite" }}
            />
          ) : null}
        </p>

        <div
          className="min-h-7 flex-wrap gap-1.5 transition-opacity duration-300"
          style={{ display: "flex", opacity: showTrace ? 1 : 0 }}
        >
          <span className="mr-1 self-center font-mono text-[11px] text-muted-foreground uppercase">
            Read as
          </span>
          {example.trace.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="font-mono text-[11px] font-normal"
            >
              {item}
            </Badge>
          ))}
        </div>

        <div
          className="motion-safe-anim min-h-36 rounded-md border"
          style={{
            opacity: showResult ? 1 : 0,
            animation: showResult && !reduced ? "rise-in 400ms ease-out" : undefined,
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{example.columns[0]}</TableHead>
                <TableHead className="text-right">{example.columns[1]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {example.rows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
