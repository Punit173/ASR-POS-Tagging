"""Combines Whisper word timings and POS tagger spans into one list of timed, tagged words.

The two models disagree on tokens. Whisper emits " morning," as a single chunk, while
the tagger lowercases its output and, with "simple" aggregation, merges neighbours
sharing a tag ("way people" as one NOUN). Comparing strings would therefore fail, so
everything is aligned by character offset into the shared transcript.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Sequence

# Numbers keep their separators (3.14, 1,000), words keep apostrophes and hyphens
# (don't, well-known), and every other non-space character stands alone.
_TOKEN_RE = re.compile(r"\d+(?:[.,:]\d+)*|\w+(?:['’-]\w+)*|[^\w\s]")

# BERT accepts 512 tokens. Worst-case English runs about 3 characters per token here,
# which leaves room for special tokens.
MAX_POS_WINDOW_CHARS = 1200


@dataclass(frozen=True)
class TimedSpan:
    start_char: int
    end_char: int
    start: float
    end: float


@dataclass(frozen=True)
class PosSpan:
    start_char: int
    end_char: int
    tag: str
    score: float


def build_transcript(chunks: Iterable[dict], duration: float) -> tuple[str, list[TimedSpan]]:
    """Joins Whisper chunks into text, recording where each chunk sits and when it was spoken."""
    cleaned = [c for c in chunks if c.get("text") and c["text"].strip()]
    pieces: list[str] = []
    spans: list[TimedSpan] = []
    offset = 0
    previous_end = 0.0

    for index, chunk in enumerate(cleaned):
        text = chunk["text"]
        if index == 0:
            text = text.lstrip()
        start, end = chunk.get("timestamp") or (None, None)
        # Whisper can leave the final timestamp of a segment as None.
        start = previous_end if start is None else float(start)
        if end is None:
            following = cleaned[index + 1].get("timestamp") if index + 1 < len(cleaned) else None
            end = following[0] if following and following[0] is not None else duration
        end = max(start, float(end))

        leading = len(text) - len(text.lstrip())
        pieces.append(text)
        spans.append(TimedSpan(offset + leading, offset + len(text.rstrip()), start, end))
        offset += len(text)
        previous_end = end

    return "".join(pieces).rstrip(), spans


def split_for_tagger(text: str, max_chars: int = MAX_POS_WINDOW_CHARS) -> list[tuple[int, str]]:
    """Cuts text into (offset, window) pairs short enough for BERT.

    Prefers sentence ends, then spaces, and only cuts mid-word when a single run of
    characters is longer than the window.
    """
    windows: list[tuple[int, str]] = []
    start = 0
    while start < len(text):
        end = start + max_chars
        if end >= len(text):
            end = len(text)
        else:
            sentence_end = max(text.rfind(p, start, end) for p in (". ", "? ", "! "))
            if sentence_end > start:
                end = sentence_end + 1
            else:
                space = text.rfind(" ", start, end)
                if space > start:
                    end = space
        window = text[start:end]
        if window.strip():
            windows.append((start, window))
        start = end
    return windows


def _overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start))


def _best_overlap(start: int, end: int, candidates: Sequence, first: int) -> tuple[object | None, int]:
    """Finds the sorted candidate overlapping start..end the most, ties going to the earliest."""
    best = None
    best_size = 0
    index = first
    while index < len(candidates) and candidates[index].start_char < end:
        size = _overlap(start, end, candidates[index].start_char, candidates[index].end_char)
        if size > best_size:
            best, best_size = candidates[index], size
        index += 1
    while first < len(candidates) and candidates[first].end_char <= start:
        first += 1
    return best, first


def align_words(text: str, timed: Sequence[TimedSpan], pos: Sequence[PosSpan]) -> list[dict]:
    """Returns one entry per word or punctuation mark, carrying its time span and POS tag."""
    timed = sorted(timed, key=lambda s: s.start_char)
    pos = sorted(pos, key=lambda s: s.start_char)
    words: list[dict] = []
    timed_from = pos_from = 0
    last_time = (0.0, 0.0)

    for match in _TOKEN_RE.finditer(text):
        start, end = match.span()
        time_span, timed_from = _best_overlap(start, end, timed, timed_from)
        pos_span, pos_from = _best_overlap(start, end, pos, pos_from)
        if time_span is not None:
            last_time = (time_span.start, time_span.end)
        token = match.group()
        words.append(
            {
                "id": len(words),
                "text": token,
                "start": round(last_time[0], 3),
                "end": round(last_time[1], 3),
                "tag": pos_span.tag if pos_span else "X",
                "confidence": round(pos_span.score, 4) if pos_span else None,
                "char_start": start,
                "char_end": end,
                "is_punct": not any(ch.isalnum() for ch in token),
            }
        )
    return words
