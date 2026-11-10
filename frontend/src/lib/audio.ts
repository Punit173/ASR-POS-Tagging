const WAV_SAMPLE_RATE = 16_000;
const PEAK_COUNT = 180;

export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

export function formatPrecise(seconds: number): string {
  const safe = Math.max(0, seconds);
  const millis = Math.round((safe % 1) * 1000) % 1000;
  return `${formatClock(safe)}.${String(millis).padStart(3, "0")}`;
}

async function decode(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close();
  }
}

/** Normalised loudness bars for drawing a waveform. Null if the browser can't decode the file. */
export async function computePeaks(blob: Blob): Promise<number[] | null> {
  try {
    const samples = (await decode(blob)).getChannelData(0);
    const size = Math.max(1, Math.floor(samples.length / PEAK_COUNT));
    const peaks: number[] = [];
    for (let i = 0; i < PEAK_COUNT; i += 1) {
      let peak = 0;
      const end = Math.min(samples.length, (i + 1) * size);
      for (let j = i * size; j < end; j += 1) {
        const value = Math.abs(samples[j]);
        if (value > peak) peak = value;
      }
      peaks.push(peak);
    }
    const max = Math.max(...peaks);
    return max > 0 ? peaks.map((p) => p / max) : peaks;
  } catch {
    return null;
  }
}

/**
 * Converts a MediaRecorder blob to 16 kHz mono WAV.
 *
 * MediaRecorder's WebM files have no duration or seek index, so <audio> reports an
 * infinite length and can't reliably jump to a word. WAV seeks exactly, and 16 kHz
 * is the rate Whisper uses anyway.
 */
export async function recordingToWav(blob: Blob): Promise<Blob> {
  const decoded = await decode(blob);
  const frames = Math.ceil(decoded.duration * WAV_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, WAV_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = (await offline.startRendering()).getChannelData(0);

  const buffer = new ArrayBuffer(44 + rendered.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + rendered.length * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, rendered.length * 2, true);
  for (let i = 0; i < rendered.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, rendered[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
