import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pensionados.app',
  appName: 'Doggy Care',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
