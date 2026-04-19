/** Load and apply saved theme color overrides from localStorage (only if custom mode). */
const STORAGE_KEY = "hoomestead-theme";
const MODE_KEY = "hoomestead-theme-mode";
try {
  const mode = localStorage.getItem(MODE_KEY);
  if (mode === "custom") {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const overrides = JSON.parse(raw) as Record<string, string>;
      const root = document.documentElement;
      for (const [key, value] of Object.entries(overrides)) {
        if (key.startsWith("--") && typeof value === "string") {
          root.style.setProperty(key, value);
        }
      }
    }
  }
} catch {
  // Ignore
}
