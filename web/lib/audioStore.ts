// Client-side, in-memory map of jobId -> object URL for the just-uploaded audio.
// Lets the Report screen play the "highlight" from the user's own file during the
// session WITHOUT the server ever storing audio (zero-storage guarantee). Survives
// client-side navigation; lost on a hard reload (highlight playback then disables).
const store = new Map<string, string>();

export function setAudio(jobId: string, file: File): string {
  const url = URL.createObjectURL(file);
  store.set(jobId, url);
  return url;
}

export function getAudio(jobId: string): string | null {
  return store.get(jobId) ?? null;
}
