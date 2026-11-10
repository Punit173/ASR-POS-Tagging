"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "./Analytics";
import { Capture } from "./Capture";
import { GrammarPanel } from "./GrammarPanel";
import { PipelinePanel } from "./PipelinePanel";
import { Player } from "./Player";
import { Transcript } from "./Transcript";
import { activeWordAt, computeStats } from "@/lib/analytics";
import { type Analysis, analyzeAudio, fetchStatus, type PipelineStatus } from "@/lib/api";
import { computePeaks, formatClock } from "@/lib/audio";
import { DEFAULT_ENABLED_TAGS, POS_ORDER } from "@/lib/pos";

type Source = { blob: Blob; url: string; name: string };

const FALLBACK_TITLE = "Speech-to-Text Transcription and Part-of-Speech Tagging";
const POLL_MS_LOADING = 2_000;
const POLL_MS_READY = 15_000;

export function Workbench() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [enabledTags, setEnabledTags] = useState(() => new Set(DEFAULT_ENABLED_TAGS));
  const [showTagLabels, setShowTagLabels] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const runRef = useRef(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = POLL_MS_LOADING;
      try {
        const next = await fetchStatus();
        if (stopped) return;
        setStatus(next);
        setOffline(false);
        if (next.state === "ready") delay = POLL_MS_READY;
      } catch {
        if (stopped) return;
        setOffline(true);
      }
      timer = setTimeout(poll, delay);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!processing) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 500);
    return () => clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  const submit = useCallback(async (blob: Blob, name: string) => {
    const run = ++runRef.current;
    setError(null);
    setAnalysis(null);
    setElapsed(0);
    setProcessing(true);
    try {
      const result = await analyzeAudio(blob, name);
      if (run === runRef.current) setAnalysis(result);
    } catch (failure) {
      if (run === runRef.current) setError(failure instanceof Error ? failure.message : "Analysis failed.");
    } finally {
      if (run === runRef.current) setProcessing(false);
    }
  }, []);

  const handleAudio = useCallback(
    (blob: Blob, name: string) => {
      setSource({ blob, url: URL.createObjectURL(blob), name });
      setPeaks(null);
      setActiveIndex(-1);
      void computePeaks(blob).then(setPeaks);
      void submit(blob, name);
    },
    [submit],
  );

  const reset = () => {
    runRef.current += 1;
    setSource(null);
    setAnalysis(null);
    setProcessing(false);
    setError(null);
    setActiveIndex(-1);
  };

  const words = useMemo(() => analysis?.words ?? [], [analysis]);
  const timedIndexes = useMemo(() => words.filter((w) => !w.is_punct).map((w) => w.id), [words]);
  const stats = useMemo(() => computeStats(words), [words]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of words) counts.set(word.tag, (counts.get(word.tag) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => POS_ORDER.indexOf(a.tag) - POS_ORDER.indexOf(b.tag));
  }, [words]);

  const handleTime = useCallback(
    (seconds: number) => setActiveIndex(activeWordAt(words, timedIndexes, seconds)),
    [words, timedIndexes],
  );

  const seekAndPlay = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    void audio.play();
  }, []);

  const toggleTag = (tag: string) =>
    setEnabledTags((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });

  const ready = status?.state === "ready" && !offline;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="max-w-3xl font-serif text-3xl leading-tight tracking-tight sm:text-[2.6rem]">
          {status?.config.project_title ?? FALLBACK_TITLE}
        </h1>
      </header>

      <div className="mt-6">
        <PipelinePanel status={status} offline={offline} />
      </div>

      <div className="mt-4 space-y-4">
        {!source && (
          <Capture
            disabled={!ready}
            maxUploadMb={status?.limits.max_upload_mb ?? 100}
            maxAudioMinutes={status?.limits.max_audio_minutes ?? 30}
            onAudio={handleAudio}
            onError={setError}
          />
        )}

        {source && (
          <>
            <Player
              key={source.url}
              src={source.url}
              name={source.name}
              peaks={peaks}
              audioRef={audioRef}
              onTime={handleTime}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-soft" role="status">
                {processing && (
                  <>
                    <span aria-hidden className="mr-2 inline-block size-2 animate-pulse rounded-full bg-amber-500" />
                    Transcribing and tagging, {formatClock(elapsed)} so far. Long files take a while.
                  </>
                )}
                {analysis &&
                  `Transcribed in ${analysis.timing.asr_seconds.toFixed(1)} s on ${analysis.timing.asr_device}, tagged in ${analysis.timing.pos_seconds.toFixed(1)} s on ${analysis.timing.pos_device}.`}
              </p>
              <div className="flex gap-2">
                {error && !processing && (
                  <button
                    type="button"
                    onClick={() => void submit(source.blob, source.name)}
                    className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-surface hover:bg-ink-soft"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-surface"
                >
                  New audio
                </button>
              </div>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      {analysis && words.length === 0 && (
        <p className="mt-6 rounded-md border border-line bg-surface p-6 text-center text-ink-soft">
          No speech was detected in this audio.
        </p>
      )}

      {analysis && words.length > 0 && (
        <div className="mt-6 space-y-8">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section aria-labelledby="transcript-heading" className="rounded-md border border-line bg-surface">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
                <h2 id="transcript-heading" className="font-serif text-xl">Transcript</h2>
                <p className="text-xs text-muted">Click a word to play from there. Hover for its tag.</p>
              </div>
              <Transcript
                key={analysis.text}
                text={analysis.text}
                words={words}
                activeIndex={activeIndex}
                enabledTags={enabledTags}
                showTagLabels={showTagLabels}
                onSeek={seekAndPlay}
              />
            </section>
            <GrammarPanel
              tags={tagCounts}
              enabled={enabledTags}
              showLabels={showTagLabels}
              onToggle={toggleTag}
              onSetAll={(on) => setEnabledTags(new Set(on ? tagCounts.map((t) => t.tag) : []))}
              onToggleLabels={() => setShowTagLabels((on) => !on)}
            />
          </div>
          <Analytics stats={stats} />
        </div>
      )}
    </main>
  );
}
