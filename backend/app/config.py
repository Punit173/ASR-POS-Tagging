"""Loads the pipeline blueprint from speech_pos_model_config.pkl."""

from __future__ import annotations

import io
import os
import pickle
from dataclasses import asdict, dataclass
from pathlib import Path

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "speech_pos_model_config.pkl"


class ConfigError(RuntimeError):
    """The blueprint file is missing, unsafe, or incomplete."""


class _DataOnlyUnpickler(pickle.Unpickler):
    """Unpickles plain data only.

    A pickle can run arbitrary code by naming a global callable. The blueprint is
    just a dict of strings, so any global reference means the file isn't what we
    expect, and it is refused.
    """

    def find_class(self, module: str, name: str):
        raise ConfigError(f"Refusing to load {module}.{name} from the config pickle")


@dataclass(frozen=True)
class PipelineConfig:
    project_title: str
    asr_model: str
    asr_task: str
    pos_model: str
    pos_task: str
    pos_aggregation_strategy: str
    framework: str
    device_used_when_exported: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def load_config(path: Path | str | None = None) -> PipelineConfig:
    path = Path(path or os.environ.get("SPEECH_POS_CONFIG") or DEFAULT_CONFIG_PATH)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ConfigError(f"Cannot read config file {path}: {exc}") from exc

    try:
        data = _DataOnlyUnpickler(io.BytesIO(raw)).load()
    except ConfigError:
        raise
    except Exception as exc:
        raise ConfigError(f"{path} is not a valid pickle: {exc}") from exc

    if not isinstance(data, dict):
        raise ConfigError(f"{path} must contain a dict, found {type(data).__name__}")

    fields = PipelineConfig.__dataclass_fields__
    missing = sorted(set(fields) - data.keys())
    if missing:
        raise ConfigError(f"{path} is missing keys: {', '.join(missing)}")
    return PipelineConfig(**{name: str(data[name]) for name in fields})
