import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'WodenTrack',
  webDir: 'www',
  server: {
    androidScheme: 'http',
    // Esta es la propiedad correcta para las versiones actuales:
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      // autoHide en false + SplashScreen.hide() manual (ver app.component.ts):
      // con autoHide:true el splash se ocultaba por su propio timer (1200ms)
      // SIN importar si Angular ya había terminado de pintar — si el arranque
      // tardaba un poco más, quedaba un hueco en blanco entre "se oculta el
      // splash nativo" y "aparece la pantalla Bienvenido", que se sentía como
      // dos pantallas distintas parpadeando. Ocultándolo a mano, justo cuando
      // Angular ya pintó la pantalla Bienvenido (mismo fondo blanco + W), no
      // hay hueco: se siente como una sola pantalla continua.
      launchAutoHide: false,
      backgroundColor: '#ffffffff',
      androidSplashResourceName: 'splash',
      // CENTER_CROP recortaba la imagen para "llenar" la pantalla — como el
      // splash es cuadrado y el teléfono es alto/angosto, el recorte era
      // agresivo y empujaba la W hacia un borde, cortándola. CENTER_INSIDE
      // muestra el cuadrado completo siempre (con margen blanco arriba/abajo
      // si hace falta), sin recortar nada — el diseño ya tiene bastante
      // padding blanco alrededor de la W, así que se ve bien igual.
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;