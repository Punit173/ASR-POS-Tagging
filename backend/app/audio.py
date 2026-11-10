"""Decodes any uploaded audio or video file to the PCM format Whisper expects."""

from __future__ import annotations

import io

import av
import numpy as np

SAMPLE_RATE = 16_000


class AudioDecodeError(ValueError):
    """The upload has no decodable audio. The message is safe to show to users."""


class AudioTooLongError(ValueError):
    """The audio is longer than the configured limit."""


def decode_audio(data: bytes, max_seconds: float) -> np.ndarray:
    """Returns mono float32 samples at 16 kHz, stopping as soon as max_seconds is passed."""
    max_samples = int(max_seconds * SAMPLE_RATE)
    parts: list[np.ndarray] = []
    total = 0

    try:
        with av.open(io.BytesIO(data), mode="r") as container:
            if not container.streams.audio:
                raise AudioDecodeError("This file has no audio track.")
            stream = container.streams.audio[0]
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)

            def collect(frames) -> None:
                nonlocal total
                for frame in frames:
                    samples = frame.to_ndarray()[0]
                    parts.append(samples)
                    total += samples.size
                if total > max_samples:
                    raise AudioTooLongError(
                        f"Audio is longer than the {max_seconds / 60:g} minute limit."
                    )

            for frame in container.decode(stream):
                collect(resampler.resample(frame))
            collect(resampler.resample(None))  # Flush samples buffered by the resampler.
    except (AudioDecodeError, AudioTooLongError):
        raise
    except (av.FFmpegError, ValueError, IndexError) as exc:
        raise AudioDecodeError("This file couldn't be read as audio.") from exc

    if total == 0:
        raise AudioDecodeError("This file contains no audio samples.")
    return np.concatenate(parts).astype(np.float32)
