import type { PipelineStatus } from "@/lib/api";

function Cell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[13px] text-ink" title={value}>
        {value}
      </dd>
      {detail && <dd className="mt-0.5 truncate text-xs text-muted" title={detail}>{detail}</dd>}
    </div>
  );
}

function StateBadge({ status, offline }: { status: PipelineStatus | null; offline: boolean }) {
  let label = "Connecting…";
  let detail = "Checking the backend";
  let tone = "bg-muted animate-pulse";

  if (offline) {
    label = "Backend offline";
    detail = "Start it on port 8000, see the README";
    tone = "bg-bad";
  } else if (status?.state === "ready") {
    label = "Ready";
    detail = "Both models loaded";
    tone = "bg-good";
  } else if (status?.state === "error") {
    label = "Models failed to load";
    detail = status.error ?? "See the backend log";
    tone = "bg-bad";
  } else if (status) {
    label = "Loading models…";
    detail = status.stage || "The first run downloads about 1.4 GB";
    tone = "bg-amber-500 animate-pulse";
  }

  return (
    <div className="min-w-0 px-4 py-3" role="status">
      <dt className="text-xs text-muted">Status</dt>
      <dd className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone}`} />
        {label}
      </dd>
      <dd className="mt-0.5 truncate text-xs text-muted" title={detail}>{detail}</dd>
    </div>
  );
}

export function PipelinePanel({ status, offline }: { status: PipelineStatus | null; offline: boolean }) {
  const config = status?.config;
  const unavailable = "—";
  return (
    <section aria-label="Active pipeline status" className="rounded-md border border-line bg-surface">
      <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-[1.1fr_1.5fr_1fr_1fr] lg:divide-x">
        <Cell
          label="Speech model"
          value={config?.asr_model ?? unavailable}
          detail={config?.asr_task}
        />
        <Cell
          label="Grammar model"
          value={config?.pos_model ?? unavailable}
          detail={config && `${config.pos_task}, ${config.pos_aggregation_strategy} aggregation`}
        />
        <Cell
          label="Speech model runs on"
          value={status ? (status.device.type === "gpu" ? `GPU: ${status.device.name}` : "CPU") : unavailable}
          detail={status ? `Tagger on ${status.pos_device}. ${status.config.framework}, exported on ${status.config.device_used_when_exported}` : undefined}
        />
        <StateBadge status={status} offline={offline} />
      </dl>
    </section>
  );
}
