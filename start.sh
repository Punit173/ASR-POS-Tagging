#!/usr/bin/env bash
# Sets up anything missing, then runs the backend and frontend. Ctrl+C stops both.
# On Windows, run it from Git Bash: ./start.sh
set -euo pipefail

BACKEND_PORT=8000
FRONTEND_PORT=3000

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
INSTALLED_MARKER="$VENV/.installed-requirements"

fail() {
  echo "Error: $*" >&2
  exit 1
}

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

find_python() {
  local candidate
  for candidate in python python3; do
    # The check matters on Windows, where "python3" can be a Microsoft Store stub.
    if "$candidate" -c "import sys; sys.exit(sys.version_info < (3, 10))" >/dev/null 2>&1; then
      echo "$candidate"
      return
    fi
  done
  fail "Python 3.10 or newer is required."
}

install_torch() {
  local python="$1"
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
    echo "NVIDIA GPU found: installing PyTorch with CUDA (about 3 GB download)."
    "$python" -m pip install torch --index-url https://download.pytorch.org/whl/cu128
  elif [ "$(uname -s)" = "Darwin" ]; then
    "$python" -m pip install torch
  else
    echo "No NVIDIA GPU found: installing CPU-only PyTorch."
    "$python" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
  fi
}

setup_backend() {
  if [ ! -d "$VENV" ]; then
    echo "Creating the Python environment..."
    "$(find_python)" -m venv "$VENV"
  fi

  if [ -x "$VENV/Scripts/python.exe" ]; then
    PYTHON="$VENV/Scripts/python.exe"
  else
    PYTHON="$VENV/bin/python"
  fi

  # Reinstalls only when requirements.txt has changed since the last full install.
  if ! cmp -s "$BACKEND/requirements.txt" "$INSTALLED_MARKER"; then
    echo "Installing backend dependencies..."
    "$PYTHON" -m pip install --upgrade pip
    "$PYTHON" -c "import torch" >/dev/null 2>&1 || install_torch "$PYTHON"
    "$PYTHON" -m pip install -r "$BACKEND/requirements.txt"
    cp "$BACKEND/requirements.txt" "$INSTALLED_MARKER"
  fi
}

setup_frontend() {
  command -v npm >/dev/null 2>&1 || fail "Node.js 20 or newer is required."
  if [ ! -d "$FRONTEND/node_modules" ]; then
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND" && npm install)
  fi
}

stop_process() {
  local pid="$1" winpid=""
  [ -r "/proc/$pid/winpid" ] && winpid="$(cat "/proc/$pid/winpid")"
  if [ -n "$winpid" ] && command -v taskkill >/dev/null 2>&1; then
    # A plain kill misses the child processes that Python and Node start on Windows.
    taskkill //PID "$winpid" //T //F >/dev/null 2>&1 || true
  else
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  fi
}

PIDS=()
cleanup() {
  trap - EXIT INT TERM
  echo
  echo "Stopping..."
  local pid
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && stop_process "$pid"
  done
}

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if port_in_use "$port"; then
    fail "Port $port is already in use. Is the app already running?"
  fi
done

setup_backend
setup_frontend

trap cleanup EXIT
trap 'exit 130' INT TERM

(cd "$BACKEND" && exec "$PYTHON" -m uvicorn app.main:app --port "$BACKEND_PORT") &
PIDS+=("$!")
(cd "$FRONTEND" && exec npm run dev -- --port "$FRONTEND_PORT") &
PIDS+=("$!")

echo
echo "Open http://localhost:$FRONTEND_PORT  (Ctrl+C stops both servers)"
echo "The first run downloads about 1.4 GB of models. The status panel shows when they're ready."
echo

# If either server exits, stop the other rather than leave half the app running.
while kill -0 "${PIDS[0]}" 2>/dev/null && kill -0 "${PIDS[1]}" 2>/dev/null; do
  sleep 1
done
echo "A server stopped unexpectedly. See the output above." >&2
exit 1
