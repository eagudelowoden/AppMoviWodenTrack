const sharp = require('./node_modules/sharp');
const path = require('path');

const INPUT  = path.join(__dirname, 'assets', 'cometa-de-viento.png');
const OUTPUT = path.join(__dirname, 'assets', 'icon-only.png');

const ICON_SIZE  = 1024; // tamaño final
const PADDING_PCT = 0.18; // 18% de padding en cada lado → imagen ocupa 64% del espacio

const padding   = Math.round(ICON_SIZE * PADDING_PCT);
const innerSize = ICON_SIZE - padding * 2;

sharp(INPUT)
  .resize(innerSize, innerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({
    top:    padding,
    bottom: padding,
    left:   padding,
    right:  padding,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toFile(OUTPUT)
  .then(() => console.log(`✓ icon-only.png generado (${innerSize}px + ${padding}px padding en cada lado)`))
  .catch(err => console.error('Error:', err));
