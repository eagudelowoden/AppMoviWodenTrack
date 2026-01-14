import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'WodenTrack',
  webDir: 'www',
  server: {
    androidScheme: 'http',
    // Esta es la propiedad correcta para las versiones actuales:
    cleartext: true 
  }
};

export default config;