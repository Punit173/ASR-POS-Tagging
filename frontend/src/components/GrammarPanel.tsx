"use client";

import { posInfo } from "@/lib/pos";

type Props = {
  tags: { tag: string; count: number }[];
  enabled: Set<string>;
  showLabels: boolean;
  onToggle: (tag: string) => void;
  onSetAll: (on: boolean) => void;
  onToggleLabels: () => void;
};

function Switch({ on, color, label, onClick, children }: {
  on: boolean;
  color: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded px-1.5 py-1.5 text-left text-sm hover:bg-paper"
    >
      <span
        aria-hidden
        className="relative h-[18px] w-8 shrink-0 rounded-full border border-ink/40 transition-colors"
        style={{ backgroundColor: on ? color : "transparent" }}
      >
        <span
          className={`absolute top-[2px] size-3 rounded-full transition-all ${on ? "left-[16px] bg-ink" : "left-[2px] bg-muted"}`}
        />
      </span>
      {children}
    </button>
  );
}

export function GrammarPanel({ tags, enabled, showLabels, onToggle, onSetAll, onToggleLabels }: Props) {
  return (
    <section aria-labelledby="grammar-heading" className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="grammar-heading" className="font-serif text-xl">Grammar highlights</h2>
        <div className="flex gap-2 text-xs text-ink-soft">
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => onSetAll(true)}>All</button>
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => onSetAll(false)}>None</button>
        </div>
      </div>
      <ul className="mt-2">
        {tags.map(({ tag, count }) => {
          const info = posInfo(tag);
          return (
            <li key={tag}>
              <Switch
                on={enabled.has(tag)}
                color={info.color}
                label={`Highlight ${info.label}, ${count} found`}
                onClick={() => onToggle(tag)}
              >
                <span className="min-w-0 flex-1 truncate">{info.label}</span>
                <span className="font-mono text-xs tabular-nums text-muted">{count}</span>
              </Switch>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 border-t border-line pt-2">
        <Switch on={showLabels} color="#d6d2c4" label="Show tag labels under words" onClick={onToggleLabels}>
          <span>Show tag labels under words</span>
        </Switch>
      </div>
    </section>
  );
}
