"""
Cumbre — In-House Audio Model (your own weights, no external pretrained models)
==============================================================================
A from-scratch convolutional encoder you train on YOUR data to produce YOUR
learned embedding — the fully-owned, commercial-safe alternative to renting
Essentia/MERT weights (which are AGPL / non-commercial).

Pipeline:
  audio --librosa--> log-mel spectrogram --AudioNet(CNN)--> 128-d embedding
                                                         --> task heads (e.g.
                                                             fame-blind hit,
                                                             aux genre)

Use it two ways:
  * as a CLASSIFIER (predict the fame-blind label directly), and/or
  * as a FEATURE EXTRACTOR: take the 128-d embedding and feed it to the same
    KNN/logistic probe you already use (best of both: owned deep features +
    simple, debuggable classifier).

Only dependencies: torch (BSD-style license, fully commercial-safe), librosa
(ISC), numpy. No third-party weights are ever downloaded.

Train:   python cumbre_audionet.py --train manifest.csv --audio-dir ./audio --epochs 30
Embed:   from cumbre_audionet import load_model, embed_file
Selftest:python cumbre_audionet.py --selftest
"""
from __future__ import annotations
import argparse, json, os, time
import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import Dataset, DataLoader
    _HAVE_TORCH = True
except Exception:
    _HAVE_TORCH = False

N_MELS = 128
SR = 22050
CLIP_SEC = 20            # fixed analysis window (center) for batching
HOP = 512
EMB_DIM = 128


# ----------------------------------------------------------------- features
def log_mel(audio_path: str, sr=SR, n_mels=N_MELS, clip_sec=CLIP_SEC, hop=HOP) -> np.ndarray:
    """Owned feature transform: log-mel spectrogram, fixed time length."""
    import librosa
    y, _ = librosa.load(audio_path, sr=sr, mono=True, duration=clip_sec)
    target = sr * clip_sec
    if len(y) < target:
        y = np.pad(y, (0, target - len(y)))
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels, hop_length=hop)
    return librosa.power_to_db(S, ref=np.max).astype("float32")   # [n_mels, T]


# ----------------------------------------------------------------- dataset
if _HAVE_TORCH:
    class LogMelDataset(Dataset):
        """Reads a manifest with columns: filename,label[,genre_id]. Audio at
        <audio_dir>/<filename>.{wav,mp3,...}. Caches mels to .npy for speed."""
        def __init__(self, rows, audio_dir, cache_dir=None, precomputed=None):
            self.rows = rows; self.audio_dir = audio_dir
            self.cache_dir = cache_dir
            self.precomputed = precomputed  # optional list of (mel, label, genre)
            if cache_dir: os.makedirs(cache_dir, exist_ok=True)

        def __len__(self): return len(self.precomputed or self.rows)

        def _mel_for(self, r):
            stem = r["filename"]
            if self.cache_dir:
                cp = os.path.join(self.cache_dir, stem + ".npy")
                if os.path.exists(cp): return np.load(cp)
            for ext in (".wav", ".mp3", ".m4a", ".flac", ".ogg"):
                p = os.path.join(self.audio_dir, stem + ext)
                if os.path.exists(p):
                    m = log_mel(p)
                    if self.cache_dir: np.save(os.path.join(self.cache_dir, stem + ".npy"), m)
                    return m
            raise FileNotFoundError(stem)

        def __getitem__(self, i):
            if self.precomputed is not None:
                mel, label, genre = self.precomputed[i]
            else:
                r = self.rows[i]; mel = self._mel_for(r)
                label = int(r["label"]); genre = int(r.get("genre_id", 0))
            x = torch.from_numpy(np.asarray(mel)).unsqueeze(0).float()   # [1,n_mels,T]
            return x, torch.tensor(label).long(), torch.tensor(genre).long()


    class AudioNet(nn.Module):
        """Compact CNN encoder (4 conv blocks) -> 128-d embedding -> task heads.
        Trained from scratch; the embedding is YOUR learned representation."""
        def __init__(self, n_mels=N_MELS, emb_dim=EMB_DIM, n_genres=3):
            super().__init__()
            def blk(ci, co): return nn.Sequential(
                nn.Conv2d(ci, co, 3, padding=1), nn.BatchNorm2d(co), nn.ReLU(),
                nn.MaxPool2d(2))
            self.enc = nn.Sequential(blk(1, 32), blk(32, 64), blk(64, 128), blk(128, 128))
            self.proj = nn.Linear(128, emb_dim)
            self.head_hit = nn.Linear(emb_dim, 2)        # fame-blind hit / not
            self.head_genre = nn.Linear(emb_dim, n_genres)  # auxiliary task (regularizer)

        def embed(self, x):
            h = self.enc(x)                              # [B,128,h,w]
            h = F.adaptive_avg_pool2d(h, 1).flatten(1)   # [B,128]
            return F.relu(self.proj(h))                  # [B,emb_dim]

        def forward(self, x):
            e = self.embed(x)
            return self.head_hit(e), self.head_genre(e), e


def train(rows=None, audio_dir=None, *, precomputed=None, epochs=30, bs=16, lr=1e-3,
          n_genres=3, val_frac=0.2, seed=42, save_path="cumbre_audionet.pt", log=True):
    """Train AudioNet on your data. Multitask: fame-blind hit (main) + genre (aux).
    Returns metrics dict; saves YOUR weights to save_path."""
    assert _HAVE_TORCH, "pip install torch  (CPU build is fine)"
    torch.manual_seed(seed); np.random.seed(seed)
    ds = LogMelDataset(rows, audio_dir, precomputed=precomputed)
    n_val = max(1, int(len(ds) * val_frac)); n_tr = len(ds) - n_val
    tr, va = torch.utils.data.random_split(ds, [n_tr, n_val],
                                           generator=torch.Generator().manual_seed(seed))
    tl = DataLoader(tr, batch_size=bs, shuffle=True)
    vl = DataLoader(va, batch_size=bs)
    model = AudioNet(n_genres=n_genres)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    best_acc, best_state = 0.0, None
    for ep in range(epochs):
        model.train()
        for x, y, g in tl:
            opt.zero_grad()
            ph, pg, _ = model(x)
            loss = F.cross_entropy(ph, y) + 0.3 * F.cross_entropy(pg, g)
            loss.backward(); opt.step()
        # val
        model.eval(); correct = tot = 0
        with torch.no_grad():
            for x, y, g in vl:
                ph, _, _ = model(x)
                correct += (ph.argmax(1) == y).sum().item(); tot += len(y)
        acc = correct / max(tot, 1)
        if acc >= best_acc:
            best_acc, best_state = acc, {k: v.clone() for k, v in model.state_dict().items()}
        if log and (ep % max(1, epochs // 6) == 0 or ep == epochs - 1):
            print(f"  epoch {ep:>3}  val_acc {acc:.3f}")
    if best_state: model.load_state_dict(best_state)
    meta = {"n_mels": N_MELS, "sr": SR, "clip_sec": CLIP_SEC, "emb_dim": EMB_DIM,
            "n_genres": n_genres, "val_acc": round(best_acc, 4),
            "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "license": "your own weights — fully in-house, commercial-safe"}
    torch.save({"state_dict": model.state_dict(), "meta": meta}, save_path)
    json.dump(meta, open(save_path + ".json", "w"), indent=2)
    return meta


def load_model(path="cumbre_audionet.pt"):
    assert _HAVE_TORCH, "pip install torch"
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    m = AudioNet(n_genres=ckpt["meta"].get("n_genres", 3))
    m.load_state_dict(ckpt["state_dict"]); m.eval()
    return m, ckpt["meta"]


def embed_file(model, audio_path: str) -> np.ndarray:
    """Return YOUR learned 128-d embedding for a song (feed to your KNN/logistic probe)."""
    assert _HAVE_TORCH
    mel = log_mel(audio_path)
    x = torch.from_numpy(mel).unsqueeze(0).unsqueeze(0).float()
    with torch.no_grad():
        return model.embed(x).squeeze(0).numpy()


def _selftest():
    """Synthetic mel dataset with a learnable pattern -> model must beat chance,
    embeddings have right shape, save/load round-trips. CPU, ~seconds."""
    assert _HAVE_TORCH, "pip install torch to run the audionet self-test"
    rng = np.random.default_rng(0)
    T = SR * CLIP_SEC // HOP + 1
    data = []
    for _ in range(120):
        label = int(rng.random() < 0.5)
        mel = rng.normal(0, 1, (N_MELS, T)).astype("float32")
        if label:                      # 'hit' class gets extra low-freq energy + a band
            mel[:20] += 3.0; mel[60:70] += 2.0
        genre = int(rng.integers(0, 3))
        data.append((mel, label, genre))
    meta = train(precomputed=data, epochs=8, bs=16, save_path="cumbre_audionet_selftest.pt", log=True)
    model, m2 = load_model("cumbre_audionet_selftest.pt")
    emb = model.embed(torch.from_numpy(data[0][0]).unsqueeze(0).unsqueeze(0).float())
    print(json.dumps({"val_acc": meta["val_acc"], "emb_dim": int(emb.shape[1])}, indent=2))
    assert meta["val_acc"] > 0.6, "model failed to learn the synthetic signal"
    assert emb.shape[1] == EMB_DIM
    print("AUDIONET SELFTEST OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--train"); ap.add_argument("--audio-dir")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--out", default="cumbre_audionet.pt")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
    elif a.train:
        import csv
        rows = list(csv.DictReader(open(a.train)))
        meta = train(rows, a.audio_dir, epochs=a.epochs, save_path=a.out)
        print(json.dumps(meta, indent=2))
    else:
        print("Use --selftest, or --train manifest.csv --audio-dir ./audio")
