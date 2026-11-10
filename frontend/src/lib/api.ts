const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PipelineStatus = {
  state: "pending" | "loading" | "ready" | "error";
  stage: string;
  error: string | null;
  device: { type: "gpu" | "cpu"; name: string };
  pos_device: "GPU" | "CPU";
  config: {
    project_title: string;
    asr_model: string;
    asr_task: string;
    pos_model: string;
    pos_task: string;
    pos_aggregation_strategy: string;
    framework: string;
    device_used_when_exported: string;
  };
  limits: { max_upload_mb: number; max_audio_minutes: number };
};

export type Word = {
  id: number;
  text: string;
  start: number;
  end: number;
  tag: string;
  confidence: number | null;
  char_start: number;
  char_end: number;
  is_punct: boolean;
};

export type Analysis = {
  text: string;
  duration: number;
  words: Word[];
  timing: { asr_seconds: number; pos_seconds: number; asr_device: string; pos_device: string };
};

export async function fetchStatus(signal?: AbortSignal): Promise<PipelineStatus> {
  const response = await fetch(`${API_URL}/api/status`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Status check failed (${response.status})`);
  return response.json();
}

export async function analyzeAudio(audio: Blob, filename: string): Promise<Analysis> {
  const form = new FormData();
  form.append("file", audio, filename);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/analyze`, { method: "POST", body: form });
  } catch {
    throw new Error("Couldn't reach the backend. Check that it's still running.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string" ? body.detail : `The backend returned an error (${response.status}).`,
    );
  }
  return response.json();
}
