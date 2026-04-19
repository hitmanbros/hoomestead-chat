import { create } from "zustand";

interface AudioSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number; // 0-100
  outputVolume: number; // 0-100
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

interface SettingsState extends AudioSettings {
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  setInputVolume: (vol: number) => void;
  setOutputVolume: (vol: number) => void;
  setEchoCancellation: (on: boolean) => void;
  setNoiseSuppression: (on: boolean) => void;
  setAutoGainControl: (on: boolean) => void;
}

const STORAGE_KEY = "hoomestead-audio-settings";

function loadSettings(): Partial<AudioSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSettings(state: AudioSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    inputDeviceId: state.inputDeviceId,
    outputDeviceId: state.outputDeviceId,
    inputVolume: state.inputVolume,
    outputVolume: state.outputVolume,
    echoCancellation: state.echoCancellation,
    noiseSuppression: state.noiseSuppression,
    autoGainControl: state.autoGainControl,
  }));
}

const saved = loadSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  inputDeviceId: saved.inputDeviceId ?? "default",
  outputDeviceId: saved.outputDeviceId ?? "default",
  inputVolume: saved.inputVolume ?? 100,
  outputVolume: saved.outputVolume ?? 100,
  echoCancellation: saved.echoCancellation ?? true,
  noiseSuppression: saved.noiseSuppression ?? true,
  autoGainControl: saved.autoGainControl ?? true,

  setInputDevice: (id) => { set({ inputDeviceId: id }); saveSettings({ ...get(), inputDeviceId: id }); },
  setOutputDevice: (id) => { set({ outputDeviceId: id }); saveSettings({ ...get(), outputDeviceId: id }); },
  setInputVolume: (vol) => { set({ inputVolume: vol }); saveSettings({ ...get(), inputVolume: vol }); },
  setOutputVolume: (vol) => { set({ outputVolume: vol }); saveSettings({ ...get(), outputVolume: vol }); },
  setEchoCancellation: (on) => { set({ echoCancellation: on }); saveSettings({ ...get(), echoCancellation: on }); },
  setNoiseSuppression: (on) => { set({ noiseSuppression: on }); saveSettings({ ...get(), noiseSuppression: on }); },
  setAutoGainControl: (on) => { set({ autoGainControl: on }); saveSettings({ ...get(), autoGainControl: on }); },
}));
