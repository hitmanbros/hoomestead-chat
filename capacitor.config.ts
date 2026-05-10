import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hoomestead.chat',
  appName: 'OpenClaw',
  webDir: 'dist',
  server: {
    // Allow cleartext for local dev backend connections
    cleartext: true,
    // In dev, load from Vite dev server; in prod, bundled assets
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1e1f22',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e1f22',
      overlaysWebView: false,
    },
  },
};

export default config;
