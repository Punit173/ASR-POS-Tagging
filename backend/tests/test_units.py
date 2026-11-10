"""Fast tests that need no model downloads."""

import io
import pickle
import wave
from pathlib import Path

import numpy as np
import pytest

from app.alignment import (
    MAX_POS_WINDOW_CHARS,
    PosSpan,
    align_words,
    build_transcript,
    split_for_tagger,
)
from app.audio import AudioDecodeError, AudioTooLongError, decode_audio
from app.config import ConfigError, load_config

ROOT = Path(__file__).resolve().parents[2]


def wav_bytes(seconds: float, rate: int = 44_100) -> bytes:
    samples = (np.sin(np.linspace(0, 440 * seconds * 6.28, int(rate * seconds))) * 20000).astype(np.int16)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(samples.tobytes())
    return buffer.getvalue()


def test_loads_real_blueprint():
    config = load_config(ROOT / "speech_pos_model_config.pkl")
    assert config.asr_model == "openai/whisper-small"
    assert config.pos_model == "vblagoje/bert-english-uncased-finetuned-pos"
    assert config.pos_aggregation_strategy == "simple"


def test_refuses_pickle_that_would_run_code(tmp_path):
    class Evil:
        def __reduce__(self):
            return (print, ("pwned",))

    path = tmp_path / "evil.pkl"
    path.write_bytes(pickle.dumps(Evil()))
    with pytest.raises(ConfigError, match="Refusing"):
        load_config(path)


def test_rejects_incomplete_blueprint(tmp_path):
    path = tmp_path / "partial.pkl"
    path.write_bytes(pickle.dumps({"asr_model": "x"}))
    with pytest.raises(ConfigError, match="missing keys"):
        load_config(path)


def test_alignment_splits_merged_spans_and_punctuation():
    chunks = [
        {"text": " The", "timestamp": (0.0, 0.2)},
        {"text": " way", "timestamp": (0.2, 0.5)},
        {"text": " people", "timestamp": (0.5, 0.9)},
        {"text": " work,", "timestamp": (0.9, 1.3)},
    ]
    text, timed = build_transcript(chunks, duration=2.0)
    assert text == "The way people work,"

    pos = [
        PosSpan(0, 3, "DET", 0.99),
        PosSpan(4, 14, "NOUN", 0.97),  # The tagger's merged "way people"
        PosSpan(15, 19, "VERB", 0.98),
        PosSpan(19, 20, "PUNCT", 0.95),
    ]
    words = align_words(text, timed, pos)

    assert [(w["text"], w["tag"]) for w in words] == [
        ("The", "DET"),
        ("way", "NOUN"),
        ("people", "NOUN"),
        ("work", "VERB"),
        (",", "PUNCT"),
    ]
    assert (words[2]["start"], words[2]["end"]) == (0.5, 0.9)
    assert (words[4]["start"], words[4]["is_punct"]) == (0.9, True)
    # Character offsets reproduce the transcript exactly.
    assert all(text[w["char_start"]:w["char_end"]] == w["text"] for w in words)


def test_word_split_across_tags_takes_the_larger_part():
    text, timed = build_transcript([{"text": " don't", "timestamp": (0, 1)}], 1)
    words = align_words(text, timed, [PosSpan(0, 3, "AUX", 0.9), PosSpan(3, 5, "PART", 0.8)])
    assert [(w["text"], w["tag"], w["confidence"]) for w in words] == [("don't", "AUX", 0.9)]


def test_missing_timestamps_are_filled_in():
    chunks = [
        {"text": " one", "timestamp": (0.0, None)},
        {"text": " two", "timestamp": (1.0, None)},
    ]
    _, timed = build_transcript(chunks, duration=3.0)
    assert (timed[0].start, timed[0].end) == (0.0, 1.0)
    assert (timed[1].start, timed[1].end) == (1.0, 3.0)


def test_untagged_word_has_null_confidence():
    text, timed = build_transcript([{"text": " hi", "timestamp": (0, 1)}], 1)
    word = align_words(text, timed, [])[0]
    assert (word["tag"], word["confidence"]) == ("X", None)


def test_empty_transcript():
    text, timed = build_transcript([{"text": "  ", "timestamp": (0, 1)}], 1)
    assert text == "" and timed == [] and align_words(text, timed, []) == []
    assert split_for_tagger("") == []


@pytest.mark.parametrize(
    "text",
    [
        "This is a sentence. " * 500,
        "no punctuation at all " * 500,
        "x" * 5000,
    ],
)
def test_tagger_windows_are_bounded_and_lossless(text):
    windows = split_for_tagger(text)
    assert all(len(window) <= MAX_POS_WINDOW_CHARS for _, window in windows)
    assert all(text[offset:offset + len(window)] == window for offset, window in windows)
    assert "".join(window for _, window in windows) == text


def test_decode_resamples_to_16k_mono():
    audio = decode_audio(wav_bytes(2.0), max_seconds=60)
    assert audio.dtype == np.float32
    assert abs(audio.size - 32_000) < 200


def test_decode_enforces_duration_limit():
    with pytest.raises(AudioTooLongError):
        decode_audio(wav_bytes(3.0), max_seconds=1)


def test_decode_rejects_non_audio():
    with pytest.raises(AudioDecodeError):
        decode_audio(b"this is definitely not audio" * 100, max_seconds=60)
