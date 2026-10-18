// Sube la versión de la APK antes de compilar: versionCode +1 (obligatorio para que Android la acepte como actualización)
// y, si no se indica otra, el último número de versionName (3.4.6 → 3.4.7).
//   node scripts/bump-version.js            → 3.4.6/13  →  3.4.7/14
//   node scripts/bump-version.js 3.5.0      → 3.4.6/13  →  3.5.0/14
const fs = require('fs');
const path = require('path');

const archivo = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let texto = fs.readFileSync(archivo, 'utf8');

const code = /versionCode\s+(\d+)/.exec(texto);
const nombre = /versionName\s+"([^"]+)"/.exec(texto);
if (!code || !nombre) {
  console.error('No encontré versionCode/versionName en android/app/build.gradle');
  process.exit(1);
}

const nuevoCode = Number(code[1]) + 1;
const pedido = process.argv[2];
let nuevoNombre = pedido;
if (!nuevoNombre) {
  const partes = nombre[1].split('.');
  partes[partes.length - 1] = String((parseInt(partes[partes.length - 1], 10) || 0) + 1);
  nuevoNombre = partes.join('.');
}
if (!/^\d+(\.\d+)*$/.test(nuevoNombre)) {
  console.error(`Versión no válida: "${nuevoNombre}" (usa algo como 3.5.0)`);
  process.exit(1);
}

texto = texto.replace(/versionCode\s+\d+/, `versionCode ${nuevoCode}`).replace(/versionName\s+"[^"]+"/, `versionName "${nuevoNombre}"`);
fs.writeFileSync(archivo, texto);
console.log(`Versión: ${nombre[1]} (${code[1]}) → ${nuevoNombre} (${nuevoCode})`);
