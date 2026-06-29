# ── Stage 1: builder (installs deps with apt/pip) ────────────────────────────
FROM python:3.11-slim AS builder

# ffmpeg needed by librosa for audio decoding; kept in builder to slim the runtime layer
# (we copy binaries into runner with multi-stage).
# boto3: AWS SDK for S3 download and Step Functions SendTaskSuccess/Failure.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /install

COPY worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefix=/install/pkg -r requirements.txt

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM python:3.11-slim AS runner

# Runtime system deps only (ffmpeg binary + libsndfile shared lib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install/pkg /usr/local

# Non-root user
RUN addgroup --system --gid 1001 worker \
 && adduser  --system --uid 1001 --ingroup worker worker

WORKDIR /app

# Copy the ML engine and the worker entry point
# The ml/ directory contains cumbre_engine.py, cumbre_scoring.py, cumbre_lyrics.py, etc.
COPY --chown=worker:worker ml/ ./ml/
COPY --chown=worker:worker worker/ ./worker/

# CUMBRE_MODEL_S3: bucket name where aws_entry.py downloads CUMBRE_fameblind_model.pkl.
# Set at runtime by the ECS task definition (injected via Step Functions container override).
ENV PYTHONUNBUFFERED=1

USER worker

# aws_entry.py: reads env TASK_TOKEN, S3_KEY, GENRE, YEAR from Step Functions container
# overrides; downloads audio from S3; runs ml/cumbre_scoring.analyze_song; calls
# states.send_task_success / send_task_failure.
ENTRYPOINT ["python", "worker/aws_entry.py"]
