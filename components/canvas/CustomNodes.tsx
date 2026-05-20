"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  AlertTriangleIcon,
  ArrowRightCircleIcon,
  Building2Icon,
  CornerDownRightIcon,
  ExternalLinkIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ServerIcon,
  WorkflowIcon,
} from "lucide-react";
import type {
  ConnectionNodeData,
  StepNodeData,
} from "./graph";
import type { ExtractedGap } from "@/lib/server/interview/schema";

const GAP_KIND_META: Record<
  ExtractedGap["kind"],
  { label: string; icon: typeof PlusCircleIcon; className: string }
> = {
  add: {
    label: "add",
    icon: PlusCircleIcon,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  missing: {
    label: "missing",
    icon: MinusCircleIcon,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  },
  order: {
    label: "order",
    icon: CornerDownRightIcon,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  "local-rule": {
    label: "local",
    icon: ArrowRightCircleIcon,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
};

const CONNECTION_TYPE_META: Record<
  ConnectionNodeData["targetType"],
  { label: string; icon: typeof Building2Icon; className: string }
> = {
  workflow: {
    label: "業務",
    icon: WorkflowIcon,
    className: "border-violet-300 bg-violet-50 dark:bg-violet-950/30",
  },
  department: {
    label: "部署",
    icon: Building2Icon,
    className: "border-blue-300 bg-blue-50 dark:bg-blue-950/30",
  },
  external: {
    label: "外部",
    icon: ExternalLinkIcon,
    className: "border-orange-300 bg-orange-50 dark:bg-orange-950/30",
  },
  system: {
    label: "システム",
    icon: ServerIcon,
    className: "border-teal-300 bg-teal-50 dark:bg-teal-950/30",
  },
};

export type GapClickHandler = (gap: ExtractedGap) => void;

export function StepNode({
  data,
}: NodeProps<Node<StepNodeData & { onGapClick?: GapClickHandler }>>) {
  return (
    <div className="rounded-md border border-zinc-300 bg-white p-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <Handle type="target" position={Position.Top} />
      <div className="font-medium">{data.label}</div>
      {(data.gaps.length > 0 || data.exceptionCount > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {data.gaps.map((g) => {
            const meta = GAP_KIND_META[g.kind];
            const Icon = meta.icon;
            return (
              <button
                key={g.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onGapClick?.(g);
                }}
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}
                title={g.reason}
              >
                <Icon className="size-3" />
                {meta.label}
              </button>
            );
          })}
          {data.exceptionCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200"
              title="例外フロー"
            >
              <AlertTriangleIcon className="size-3" />
              例外 × {data.exceptionCount}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ConnectionExternalNode({
  data,
}: NodeProps<Node<ConnectionNodeData>>) {
  const meta = CONNECTION_TYPE_META[data.targetType];
  const Icon = meta.icon;
  return (
    <div
      className={`rounded-md border border-dashed p-2 text-xs shadow-sm ${meta.className}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1">
        <Icon className="size-3" />
        <span className="text-[10px] font-medium uppercase opacity-70">
          {meta.label}
        </span>
      </div>
      <div className="mt-0.5 font-medium">{data.label}</div>
      {data.note && (
        <div className="mt-0.5 line-clamp-2 text-[10px] opacity-70">{data.note}</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function GroupBoxNode({
  data,
}: NodeProps<Node<{ label?: string }>>) {
  return (
    <div className="h-full w-full rounded-xl border border-dashed border-zinc-400/80 bg-zinc-400/10">
      <div className="px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
        {data.label ?? "グループ"}
      </div>
    </div>
  );
}
