import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.entregafast.app',
  appName: 'EntregaFast AI',
  webDir: 'dist', // Pasta onde seu build do React é gerado (geralmente 'dist' ou 'build')
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true
    }
  }
};

export default config;npm install @capacitor/android
npx cap add android