# Speech-to-Text Transcription and Part-of-Speech Tagging

Record or upload English speech, then follow a synced transcript with grammar highlights and analytics. A FastAPI backend reads `speech_pos_model_config.pkl` to decide which models to run, and a Next.js frontend displays the results.

## Run it

You need Python 3.10+ and Node 20+. ffmpeg is not required.

### With one command

From the project folder (in Git Bash on Windows):

```bash
./start.sh
```

This installs anything missing, starts both servers, and stops them on Ctrl+C. Then open http://localhost:3000. The first run downloads PyTorch and about 1.4 GB of models.

### Manually

**Backend** (first run downloads about 1.4 GB of models):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

That `torch` line is for NVIDIA GPUs. For CPU only, use `--index-url https://download.pytorch.org/whl/cpu` instead.

**Frontend**, in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Recording needs `localhost` or HTTPS, because browsers block the microphone on other plain HTTP addresses.

If you've already set up the project, you only need the `uvicorn` and `npm run dev` lines.

## Features

| Feature | Where |
| --- | --- |
| Pipeline status: models, framework, GPU or CPU, load state | Top panel, from `GET /api/status` |
| Microphone recording with a live waveform, or drag-and-drop upload | `Capture.tsx` |
| Word-level synced transcript; click a word to jump to it | `Transcript.tsx`, `Player.tsx` |
| Grammar highlight switches and confidence tooltips | `GrammarPanel.tsx`, `Transcript.tsx` |
| Analytics: part-of-speech shares, speaking rate, lexical density | `Analytics.tsx`, `lib/analytics.ts` |

## How it works

- **Config:** `backend/app/config.py` reads the `.pkl` with an unpickler that refuses anything except plain data, so a tampered file can't run code.
- **Audio:** `backend/app/audio.py` uses PyAV to decode uploads to 16 kHz mono.
- **Transcription:** Whisper runs with `return_timestamps="word"`, in 30-second chunks for long files.
- **Alignment:** Whisper and the tagger split text differently, and `simple` aggregation merges neighbours such as `way people`. `backend/app/alignment.py` matches them by character offset and gives every word its own time and tag. A word the tagger splits (`don't`) takes the tag of its larger part.

## API

- `GET /api/status`: load state, device, config and limits.
- `POST /api/analyze`: multipart `file` field. Returns `text`, `duration`, `timing` and `words[]`, where each word has `text`, `start`, `end`, `tag`, `confidence`, `char_start`, `char_end` and `is_punct`.

## Settings

Backend environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SPEECH_POS_CONFIG` | `../speech_pos_model_config.pkl` | Blueprint path |
| `SPEECH_POS_DEVICE` | `auto` | `auto`, `cuda` or `cpu` |
| `MAX_UPLOAD_MB` | `100` | Upload size limit |
| `MAX_AUDIO_MINUTES` | `30` | Audio length limit |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed frontend origins |

To point the frontend at another backend address, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`.

## Limits

- **English only:** the tagger is an English model, so Whisper is told to expect English.
- **Local use:** the API has no authentication, so don't expose it publicly as it stands.

## Tests

```powershell
cd backend
.venv\Scripts\python -m pytest
```
