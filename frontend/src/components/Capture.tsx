"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock, recordingToWav } from "@/lib/audio";

type Props = {
  disabled: boolean;
  maxUploadMb: number;
  maxAudioMinutes: number;
  onAudio: (audio: Blob, name: string) => void;
  onError: (message: string) => void;
};

const MIN_RECORDING_SECONDS = 0.5;

function micErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in your browser's site settings, then try again.";
  }
  if (name === "NotFoundError") return "No microphone was found. You can upload an audio file instead.";
  if (name === "NotReadableError") return "Another app is using the microphone. Close it and try again.";
  return "Couldn't start the microphone.";
}

export function Capture({ disabled, maxUploadMb, maxAudioMinutes, onAudio, onError }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => () => teardownRef.current?.(), []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("Recording needs a secure page. Open the app at http://localhost:3000.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      onError(micErrorMessage(error));
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    let frame = 0;
    let cancelled = false;
    const startedAt = performance.now();
    const samples = new Uint8Array(analyser.fftSize);
    const levels: number[] = [];

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const seconds = (performance.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= maxAudioMinutes * 60 && recorder.state === "recording") recorder.stop();

      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
      levels.push(peak);

      const canvas = canvasRef.current;
      const graphics = canvas?.getContext("2d");
      if (!canvas || !graphics) return;
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      graphics.setTransform(ratio, 0, 0, ratio, 0, 0);
      graphics.clearRect(0, 0, width, height);
      graphics.fillStyle = "#c0392b";
      const step = 4;
      const visible = Math.ceil(width / step);
      const recent = levels.slice(-visible);
      if (levels.length > visible * 2) levels.splice(0, levels.length - visible);
      recent.forEach((level, index) => {
        const bar = Math.max(2, Math.min(1, level * 1.8) * height * 0.92);
        const x = width - (recent.length - index) * step;
        graphics.fillRect(x, (height - bar) / 2, 2, bar);
      });
    };
    frame = requestAnimationFrame(draw);

    const teardown = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      if (recorder.state === "recording") recorder.stop();
      teardownRef.current = null;
    };
    teardownRef.current = teardown;

    recorder.onstop = async () => {
      if (cancelled) return;
      const seconds = (performance.now() - startedAt) / 1000;
      teardown();
      setRecording(false);
      if (seconds < MIN_RECORDING_SECONDS) {
        onError("That recording was too short. Hold on a little longer.");
        return;
      }
      const raw = new Blob(chunks, { type: recorder.mimeType });
      try {
        onAudio(await recordingToWav(raw), "recording.wav");
      } catch {
        // Still usable: the backend decodes the original format, only seeking is less exact.
        onAudio(raw, "recording.webm");
      }
    };

    recorder.start();
    setElapsed(0);
    setRecording(true);
  };

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxUploadMb * 1024 * 1024) {
      onError(`That file is larger than the ${maxUploadMb} MB limit.`);
      return;
    }
    onAudio(file, file.name);
  };

  if (recording) {
    return (
      <section aria-label="Recording" className="rounded-md border border-line bg-surface p-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => recorderRef.current?.stop()}
            className="flex h-11 shrink-0 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-surface hover:bg-ink-soft"
          >
            <span aria-hidden className="size-3 rounded-[2px] bg-surface" />
            Stop and analyze
          </button>
          <p className="font-mono text-lg tabular-nums" role="timer">
            <span aria-hidden className="mr-2 inline-block size-2.5 animate-pulse rounded-full bg-record" />
            {formatClock(elapsed)}
          </p>
        </div>
        <canvas ref={canvasRef} aria-label="Live microphone waveform" className="mt-4 h-24 w-full" />
      </section>
    );
  }

  return (
    <section aria-label="Add audio" className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <button
        type="button"
        disabled={disabled}
        onClick={startRecording}
        className="flex items-center justify-center gap-3 rounded-md bg-ink px-8 py-6 text-base font-semibold text-surface hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden className="size-3.5 rounded-full bg-[#ef6a5a]" />
        Record
      </button>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) acceptFile(event.dataTransfer.files[0]);
        }}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-5 py-5 transition-colors ${
          dragging ? "border-ink bg-[#fbe27a]/40" : "border-[#b9b3a3] bg-surface"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <div>
          <p className="text-sm font-semibold">Drop an audio or video file here</p>
          <p className="mt-0.5 text-xs text-muted">
            English speech. MP3, WAV, M4A, OGG, FLAC, WebM or MP4, up to {maxUploadMb} MB and {maxAudioMinutes} minutes.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-surface disabled:cursor-not-allowed"
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.mkv,.mov"
          className="sr-only"
          tabIndex={-1}
          aria-label="Audio file"
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </section>
  );
}
