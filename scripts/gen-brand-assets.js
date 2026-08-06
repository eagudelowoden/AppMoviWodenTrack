// Genera assets/icon-only.png, icon-foreground.png, icon-background.png,
// splash.png y splash-dark.png a partir del ícono de reloj de arena, con
// fondo blanco. Después de correr esto hay que ejecutar:
//   npx capacitor-assets generate && npx cap sync
// Uso: node scripts/gen-brand-assets.js
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'resources-src', 'reloj-source.png');
const OUT = path.join(__dirname, '..', 'assets');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function composeOnWhite(size, hourglassRatio) {
  const glassSize = Math.round(size * hourglassRatio);
  const hourglass = await sharp(SRC).resize(glassSize, glassSize, { fit: 'contain' }).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{ input: hourglass, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  // Ícono de app: reloj ocupando ~68% del lienzo, fondo blanco — sirve como
  // ícono "legacy" y como fallback si el generador no arma el adaptativo.
  const icon = await composeOnWhite(1024, 0.68);
  await sharp(icon).toFile(path.join(OUT, 'icon-only.png'));

  // Ícono adaptativo Android: foreground (reloj SIN fondo, dentro de la zona
  // segura ~46%) + background (blanco sólido) — así el launcher lo recorta
  // en círculo/squircle sin que se vea un cuadrado blanco duro.
  const foreground = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: await sharp(SRC).resize(470, 470, { fit: 'contain' }).toBuffer(),
      gravity: 'center',
    }])
    .png()
    .toBuffer();
  await sharp(foreground).toFile(path.join(OUT, 'icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
    .png()
    .toFile(path.join(OUT, 'icon-background.png'));

  // Splash screen: fondo blanco, reloj centrado y discreto (~30% del lienzo)
  // — mismo criterio que cualquier splash de marca: no ocupar toda la pantalla.
  // La app fuerza tema claro (ver global.scss), así que splash-dark usa el
  // mismo diseño en vez de un fondo oscuro que nunca se aplicaría.
  const splash = await composeOnWhite(2732, 0.3);
  await sharp(splash).toFile(path.join(OUT, 'splash.png'));
  await sharp(splash).toFile(path.join(OUT, 'splash-dark.png'));

  console.log('✓ Assets generados en', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
