"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/lib/audio";

type Props = {
  src: string;
  name: string;
  peaks: number[] | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  onTime: (seconds: number) => void;
};

const FLAT_PEAKS = Array.from({ length: 180 }, () => 0.12);

function Bars({ peaks, className }: { peaks: number[]; className: string }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${peaks.length * 3} 100`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full ${className}`}
    >
      {peaks.map((peak, index) => {
        const height = Math.max(3, peak * 96);
        return <rect key={index} x={index * 3} y={(100 - height) / 2} width={2} height={height} fill="currentColor" />;
      })}
    </svg>
  );
}

export function Player({ src, name, peaks, audioRef, onTime }: Props) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [clock, setClock] = useState(0);
  const playedRef = useRef<HTMLDivElement>(null);
  const bars = useMemo(() => peaks ?? FLAT_PEAKS, [peaks]);

  // The played-portion overlay updates each frame without re-rendering React.
  const sync = (audio: HTMLAudioElement) => {
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    const percent = total ? (audio.currentTime / total) * 100 : 0;
    if (playedRef.current) playedRef.current.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    setClock(Math.floor(audio.currentTime));
    onTime(audio.currentTime);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    let frame = 0;
    const tick = () => {
      sync(audio);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // sync only uses onTime, which is stable for a given transcript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, onTime]);

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
    sync(audio);
  };

  const seekToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - box.left) / box.width) * duration);
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  return (
    <section aria-label="Audio playback" className="rounded-md border border-line bg-surface p-4">
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onSeeked={(event) => sync(event.currentTarget)}
      />
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-surface hover:bg-ink-soft"
        >
          {playing ? (
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-current">
              <rect x="3" y="2" width="3.5" height="12" rx="0.75" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="0.75" />
            </svg>
          ) : (
            <svg aria-hidden viewBox="0 0 16 16" className="ml-0.5 size-4 fill-current">
              <path d="M3.5 1.8v12.4c0 .6.6.9 1.1.6l9.5-6.2c.5-.3.5-.9 0-1.2L4.6 1.2c-.5-.3-1.1 0-1.1.6Z" />
            </svg>
          )}
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={clock}
          aria-valuetext={`${formatClock(clock)} of ${formatClock(duration)}`}
          className="relative h-14 min-w-0 flex-1 cursor-pointer touch-none select-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekToPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) seekToPointer(event);
          }}
          onKeyDown={(event) => {
            const now = audioRef.current?.currentTime ?? 0;
            if (event.key === "ArrowRight") seek(now + 5);
            else if (event.key === "ArrowLeft") seek(now - 5);
            else if (event.key === " ") toggle();
            else return;
            event.preventDefault();
          }}
        >
          <Bars peaks={bars} className="text-[#c9c3b4]" />
          <div ref={playedRef} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)" }}>
            <Bars peaks={bars} className="text-ink" />
          </div>
        </div>
        <p className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
          {formatClock(clock)} / {formatClock(duration)}
        </p>
      </div>
      <p className="mt-2 truncate text-xs text-muted" title={name}>{name}</p>
    </section>
  );
}
