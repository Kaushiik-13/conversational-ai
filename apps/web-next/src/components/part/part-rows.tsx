"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/catalog/status-badge";
import type { CategoryInfo } from "@/components/catalog/category-utils";
import type { SearchItem } from "@/lib/catalog-types";
import { HUE_DOT, domainHue } from "@/lib/highlights";

/** A compact list of parts, each linking to its own page. */
export function PartRows({
  items,
  index,
}: {
  items: SearchItem[];
  index: Map<number, CategoryInfo>;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Part number</TableHead>
              <TableHead>Part</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Maker</TableHead>
              <TableHead className="text-right">Year</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const info = index.get(item.primaryCategoryId);
              return (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 font-mono text-xs">
                    <Link
                      href={`/catalog/${item.id}`}
                      className="text-hl-blue underline-offset-4 hover:underline"
                    >
                      {item.partNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate font-medium">{item.partName}</p>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className={`size-2 shrink-0 rounded-full ${
                          info?.domain
                            ? HUE_DOT[domainHue(info.domain.id)]
                            : "bg-border"
                        }`}
                      />
                      {info?.node.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{item.manufacturer}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {item.modelYear}
                  </TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={item.lifecycleStatus} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/catalog/${item.id}`}
              className="block space-y-1.5 px-4 py-3"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-hl-blue">
                  {item.partNumber}
                </span>
                <StatusBadge status={item.lifecycleStatus} />
              </span>
              <span className="block font-medium">{item.partName}</span>
              <span className="block text-xs text-muted-foreground">
                {item.manufacturer} · {item.region} · {item.modelYear}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
