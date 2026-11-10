"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SpeechStats, TagShare } from "@/lib/analytics";
import { posInfo } from "@/lib/pos";

const ROW_HEIGHT = 30;
const BAR_COLOR = "#3f3b34";

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  );
}

function TagTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const info = posInfo(payload?.value ?? "X");
  const left = (x ?? 0) - 148;
  return (
    <g transform={`translate(${left},${y ?? 0})`}>
      {/* The swatch ties each row to its highlight colour in the transcript. */}
      <rect y={-6} width={12} height={12} rx={3} fill={info.color} stroke="#1c1a17" strokeOpacity={0.25} />
      <text x={18} dy={4} fontSize={13} fill="#4f4b43">{info.label}</text>
    </g>
  );
}

function ShareTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload: TagShare }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded bg-ink px-2.5 py-1.5 text-xs text-surface shadow-lg">
      <span className="font-semibold">{posInfo(row.tag).label}</span>
      <span className="ml-2 font-mono">{row.count} words, {row.percent.toFixed(1)}%</span>
    </div>
  );
}

export function Analytics({ stats }: { stats: SpeechStats }) {
  const ratio = stats.verbs ? `${(stats.nouns / stats.verbs).toFixed(1)} : 1` : "—";
  const axisMax = Math.max(...stats.shares.map((s) => s.percent), 1);

  return (
    <section aria-labelledby="analytics-heading">
      <h2 id="analytics-heading" className="font-serif text-2xl">Speech composition</h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid grid-cols-2 content-start gap-3">
          <Tile label="Words" value={stats.wordCount.toLocaleString()} note={`${stats.uniqueWords.toLocaleString()} unique`} />
          <Tile
            label="Speaking rate"
            value={stats.wordsPerMinute === null ? "—" : Math.round(stats.wordsPerMinute).toString()}
            note="words per minute"
          />
          <Tile label="Nouns to verbs" value={ratio} note={`${stats.nouns} nouns, ${stats.verbs} verbs`} />
          <Tile label="Lexical density" value={`${stats.lexicalDensity.toFixed(0)}%`} note="content words" />
          <Tile
            label="Tagger confidence"
            value={stats.meanConfidence === null ? "—" : `${stats.meanConfidence.toFixed(1)}%`}
            note="mean across words"
          />
        </div>

        <figure className="rounded-md border border-line bg-surface p-4">
          <figcaption className="text-sm font-semibold">
            Share of spoken words by part of speech
            <span className="ml-2 font-normal text-muted">excludes punctuation</span>
          </figcaption>
          <div className="mt-3" style={{ height: stats.shares.length * ROW_HEIGHT + 8 }} aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.shares} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 0 }} barCategoryGap={8}>
                <XAxis type="number" hide domain={[0, axisMax]} />
                <YAxis
                  type="category"
                  dataKey="tag"
                  width={156}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={<TagTick />}
                />
                <Tooltip content={<ShareTooltip />} cursor={{ fill: "#f4f1ea" }} isAnimationActive={false} />
                <Bar dataKey="percent" fill={BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                  <LabelList
                    dataKey="percent"
                    position="right"
                    fontSize={12}
                    fill="#4f4b43"
                    formatter={(value: unknown) => `${Number(value).toFixed(1)}%`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Share of spoken words by part of speech</caption>
            <thead>
              <tr><th>Part of speech</th><th>Words</th><th>Share</th></tr>
            </thead>
            <tbody>
              {stats.shares.map((row) => (
                <tr key={row.tag}>
                  <td>{posInfo(row.tag).label}</td>
                  <td>{row.count}</td>
                  <td>{row.percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </div>
    </section>
  );
}
