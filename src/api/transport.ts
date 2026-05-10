let _cachedUrl: string | null = null;

/** Detect if running inside Capacitor (mobile app). */
function isCapacitor(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** Detect if running inside Electron. */
function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

/** Backend URL detection — works in Electron, Capacitor mobile, and browser. */
export function getBackendUrl(): string {
  if (_cachedUrl !== null) return _cachedUrl;

  // Electron: preload script injects this
  const electronUrl = (window as any).electronAPI?.getBackendUrl?.();
  if (electronUrl) {
    _cachedUrl = electronUrl;
    return electronUrl;
  }

  // Capacitor mobile: read from localStorage (set in Settings)
  if (isCapacitor()) {
    const mobileUrl = localStorage.getItem("hoomestead_backend_url");
    if (mobileUrl) {
      _cachedUrl = mobileUrl;
      return mobileUrl;
    }
  }

  // Browser dev mode or deployed
  if (import.meta.env.VITE_BACKEND_URL) {
    _cachedUrl = import.meta.env.VITE_BACKEND_URL as string;
    return _cachedUrl;
  }

  // Default: same origin (when served from the Rust backend directly)
  return "";
}

/** Explicitly set the backend URL (used by mobile settings + restore). */
export function setBackendUrl(url: string): void {
  _cachedUrl = url;
  localStorage.setItem("hoomestead_backend_url", url);
}

/** Get the platform name for UI conditional rendering. */
export function getPlatform(): "electron" | "capacitor" | "web" {
  if (isElectron()) return "electron";
  if (isCapacitor()) return "capacitor";
  return "web";
}

/** Wait for backend URL to be available (needed in Electron where preload is async). */
export async function waitForBackendUrl(): Promise<string> {
  const electronApi = (window as any).electronAPI;
  if (electronApi?.getBackendUrlAsync) {
    const url = await electronApi.getBackendUrlAsync();
    _cachedUrl = url;
    return url;
  }
  return getBackendUrl();
}

/** Standard fetch wrapper with error handling. */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getBackendUrl()}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  const resp = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  clearTimeout(timeoutId);

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body.error || `Request failed: ${resp.status}`);
  }

  return resp.json();
}

/** Fetch that sends FormData (no Content-Type header — browser sets multipart boundary). */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const url = `${getBackendUrl()}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body.error || `Upload failed: ${resp.status}`);
  }

  return resp.json();
}
