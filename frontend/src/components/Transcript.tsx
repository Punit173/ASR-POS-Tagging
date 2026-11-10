"use client";

import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from "react";
import type { Word } from "@/lib/api";
import { formatPrecise } from "@/lib/audio";
import { posInfo } from "@/lib/pos";

type Props = {
  text: string;
  words: Word[];
  activeIndex: number;
  enabledTags: Set<string>;
  showTagLabels: boolean;
  onSeek: (seconds: number) => void;
};

type Tip = { index: number; x: number; y: number };

const WordMark = memo(function WordMark({
  word,
  highlight,
  active,
  tabbable,
  label,
}: {
  word: Word;
  highlight: string | undefined;
  active: boolean;
  tabbable: boolean;
  label: string | undefined;
}) {
  const style = highlight ? ({ "--hl": highlight } as CSSProperties) : undefined;
  if (word.is_punct) {
    return <span className="punct" style={style}>{word.text}</span>;
  }
  return (
    <button
      type="button"
      className="word"
      data-i={word.id}
      data-active={active}
      tabIndex={tabbable ? 0 : -1}
      style={style}
    >
      {word.text}
      {label && <span className="word-tag">{label}</span>}
    </button>
  );
});

function confidenceLabel(word: Word): string {
  const name = posInfo(word.tag).label;
  return word.confidence === null ? `${name} (no score)` : `${name} (${(word.confidence * 100).toFixed(1)}%)`;
}

export function Transcript({ text, words, activeIndex, enabledTags, showTagLabels, onSeek }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const firstSpoken = useMemo(() => words.findIndex((w) => !w.is_punct), [words]);
  const [focusIndex, setFocusIndex] = useState(firstSpoken);

  // Keep the spoken word in view by scrolling only the transcript box, never the page.
  useEffect(() => {
    if (activeIndex < 0) return;
    const container = containerRef.current;
    const element = container?.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`);
    if (!container || !element) return;
    const box = container.getBoundingClientRect();
    const mark = element.getBoundingClientRect();
    if (mark.top < box.top + 8 || mark.bottom > box.bottom - 8) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      container.scrollTo({
        top: container.scrollTop + mark.top - box.top - box.height / 3,
        behavior: reduced ? "auto" : "smooth",
      });
    }
  }, [activeIndex]);

  const wordFrom = (target: EventTarget) =>
    target instanceof Element ? target.closest<HTMLElement>("[data-i]") : null;

  const showTip = (element: HTMLElement | null) => {
    if (!element) return setTip(null);
    const box = element.getBoundingClientRect();
    setTip({ index: Number(element.dataset.i), x: box.left + box.width / 2, y: box.top });
  };

  const moveFocus = (from: number, direction: 1 | -1) => {
    for (let i = from + direction; i >= 0 && i < words.length; i += direction) {
      if (!words[i].is_punct) {
        setFocusIndex(i);
        containerRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.focus();
        return;
      }
    }
  };

  const tipWord = tip && words[tip.index];

  return (
    <>
      <div
        ref={containerRef}
        className="max-h-[62vh] overflow-y-auto px-5 py-4 font-serif text-[1.3rem] leading-[1.85] whitespace-pre-wrap"
        onClick={(event) => {
          const element = wordFrom(event.target);
          if (element) onSeek(words[Number(element.dataset.i)].start);
        }}
        onMouseOver={(event) => showTip(wordFrom(event.target))}
        onMouseLeave={() => setTip(null)}
        onFocus={(event) => {
          const element = wordFrom(event.target);
          if (element) setFocusIndex(Number(element.dataset.i));
          showTip(element);
        }}
        onBlur={() => setTip(null)}
        onScroll={() => setTip(null)}
        onKeyDown={(event) => {
          const element = wordFrom(event.target);
          if (!element) return;
          const index = Number(element.dataset.i);
          if (event.key === "ArrowRight") moveFocus(index, 1);
          else if (event.key === "ArrowLeft") moveFocus(index, -1);
          else return;
          event.preventDefault();
        }}
      >
        {words.map((word, index) => {
          const gap = text.slice(index ? words[index - 1].char_end : 0, word.char_start);
          const enabled = enabledTags.has(word.tag);
          return (
            <span key={word.id}>
              {gap}
              <WordMark
                word={word}
                highlight={enabled ? posInfo(word.tag).color : undefined}
                active={word.id === activeIndex}
                tabbable={word.id === focusIndex}
                label={showTagLabels && enabled ? word.tag : undefined}
              />
            </span>
          );
        })}
      </div>
      {tip && tipWord && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-surface shadow-lg"
          style={{ left: Math.max(90, Math.min(window.innerWidth - 90, tip.x)), top: tip.y - 6 }}
        >
          <span className="font-semibold">{confidenceLabel(tipWord)}</span>
          <span className="ml-2 font-mono opacity-75">{formatPrecise(tipWord.start)}</span>
        </div>
      )}
    </>
  );
}
