// Genera todos los assets de marca (ícono de app + splash) a partir de una
// letra "W" dibujada por código — sin depender de ningún archivo de imagen
// fuente. Después de correr esto hay que ejecutar:
//   npx capacitor-assets generate && npx cap sync
// Uso: node scripts/gen-brand-assets.js
const sharp = require('sharp');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');
const NAVY = '#122a52';
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// El ícono de home screen usa un azul MÁS VIVO que el navy de la app
// (#122a52 se pierde contra wallpapers oscuros, y un fondo blanco se
// perdería contra wallpapers claros — los íconos que se ven bien en
// cualquier fondo usan un color de marca saturado de tono medio, ni negro
// ni blanco). El splash sigue en navy/blanco porque ahí no aplica el
// problema (pantalla completa, no compite con ningún wallpaper).
const ICON_BLUE = '#2451B8';

/**
 * Dibuja una "W" y la RECORTA (trim) antes de centrarla — así el centrado es
 * exacto sin depender de las métricas verticales de la fuente (con
 * dominant-baseline solo quedaba "casi" centrada, visiblemente corrida).
 */
async function wTrimmed(color, weight, targetWidth) {
  const canvasSize = 1024;
  const svg = Buffer.from(`
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="${weight}" font-size="${Math.round(canvasSize * 0.56)}"
        fill="${color}">W</text>
    </svg>
  `);
  const raw = await sharp(svg).png().toBuffer();
  const trimmed = await sharp(raw).trim().toBuffer();
  return sharp(trimmed).resize({ width: targetWidth }).toBuffer();
}

async function main() {
  // ── Ícono de app: fondo azul vivo sólido + W blanca nítida ────────────────
  const wIcon = await wTrimmed('#ffffff', 900, 460);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ICON_BLUE } })
    .composite([{ input: wIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, 'icon-only.png'));

  // Adaptativo Android: foreground = W blanca sola (transparente, zona segura),
  // background = azul vivo sólido — así el launcher la recorta en
  // círculo/squircle sin que se vea una caja dura. 460/1024 ocupa bien el
  // círculo sin tocar el borde de la zona segura (~61% de diámetro).
  const wForeground = await wTrimmed('#ffffff', 900, 460);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: wForeground, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, 'icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ICON_BLUE } })
    .png()
    .toFile(path.join(OUT, 'icon-background.png'));

  // ── Splash screen: fondo blanco + W navy, discreta ────────────────────────
  const wSplash = await wTrimmed(NAVY, 900, Math.round(2732 * 0.3));
  const splash = await sharp({ create: { width: 2732, height: 2732, channels: 4, background: WHITE } })
    .composite([{ input: wSplash, gravity: 'center' }])
    .png()
    .toBuffer();
  await sharp(splash).toFile(path.join(OUT, 'splash.png'));
  // La app fuerza tema claro (ver global.scss), así que splash-dark usa el
  // mismo diseño en vez de un fondo oscuro que nunca se aplicaría.
  await sharp(splash).toFile(path.join(OUT, 'splash-dark.png'));

  // ── Favicon (pestaña del navegador) — mismo criterio que el ícono de app ──
  const wFavicon = await wTrimmed('#ffffff', 900, 230);
  await sharp({ create: { width: 512, height: 512, channels: 4, background: ICON_BLUE } })
    .composite([{ input: wFavicon, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, 'icon', 'favicon.png'));

  console.log('✓ Assets generados en', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
