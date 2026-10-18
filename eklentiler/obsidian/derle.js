// Obsidian eklentisini derler. Obsidian bir eklentide üç dosya bekler: main.js, styles.css,
// manifest.json. Bu betik onları ./murekkep/ klasörüne üretir:
//   main.js    = murekkep.js + vurgulayici.js + eklenti.js (tek dosyada)
//   styles.css = murekkep.css (kökü ve body'si atılmış) + stil.css
//
// Kullanım:
//   node derle.js                    sadece derle
//   node derle.js --kur "<kasa>"     derle ve kasanın eklenti klasörüne bağla (junction)
//
// Bağlantı kurulduktan sonra her derlemede Obsidian yeni hali görür; eklentiyi Obsidian'da
// kapatıp açmak (ya da Obsidian'ı yeniden başlatmak) yeter.

const fs = require('fs');
const path = require('path');

const burasi = __dirname;
const kok = path.join(burasi, '..', '..'); // murekkep/
const cikti = path.join(burasi, 'murekkep');

const oku = (yol) => fs.readFileSync(yol, 'utf8');

// Bir CSS bloğunu (seçicisinden kapanan süslü parantezine kadar) siler
function blokSil(css, secici) {
  const bas = css.indexOf(secici);
  if (bas === -1) throw new Error(`murekkep.css içinde bulunamadı: ${secici}`);
  let derinlik = 0;
  for (let k = css.indexOf('{', bas); k < css.length; k++) {
    if (css[k] === '{') derinlik++;
    else if (css[k] === '}' && --derinlik === 0) return css.slice(0, bas) + css.slice(k + 1);
  }
  throw new Error(`kapanmayan blok: ${secici}`);
}

// Bir dosyayı yerel bir module nesnesiyle sarar; dosyanın UMD başlığı module.exports'a yazar.
const modulOlarak = (ad, kaynak) =>
  `var ${ad} = (function () {\n  var module = { exports: {} };\n  var exports = module.exports;\n${kaynak}\n  return module.exports;\n})();\n`;

function derle() {
  fs.mkdirSync(cikti, { recursive: true });

  const main =
    `/* Mürekkep Obsidian eklentisi. Bu dosya derle.js ile üretildi, elle değiştirme.\n` +
    `   Kaynaklar: murekkep/murekkep.js, murekkep/vurgulayici.js, eklentiler/obsidian/eklenti.js */\n` +
    `'use strict';\n` +
    `var obsidian = require('obsidian');\n\n` +
    modulOlarak('Murekkep', oku(path.join(kok, 'murekkep.js'))) +
    '\n' +
    modulOlarak('Vurgulayici', oku(path.join(kok, 'vurgulayici.js'))) +
    '\n' +
    oku(path.join(burasi, 'eklenti.js'));
  fs.writeFileSync(path.join(cikti, 'main.js'), main);

  let css = oku(path.join(kok, 'murekkep.css'));
  css = css.replace(/@import[^;]+;\s*/, '');
  css = blokSil(css, ':root {');
  css = blokSil(css, '@media (prefers-color-scheme: dark) {');
  css = blokSil(css, 'body {');
  const stil = `/* derle.js ile üretildi, elle değiştirme. Kaynaklar: murekkep/murekkep.css, eklentiler/obsidian/stil.css */\n\n` + css + '\n' + oku(path.join(burasi, 'stil.css'));
  fs.writeFileSync(path.join(cikti, 'styles.css'), stil);

  fs.copyFileSync(path.join(burasi, 'manifest.json'), path.join(cikti, 'manifest.json'));
  console.log(`Derlendi: ${cikti}`);
}

function kur(kasa) {
  if (!fs.existsSync(path.join(kasa, '.obsidian'))) {
    throw new Error(`Bu bir Obsidian kasası değil (.obsidian klasörü yok): ${kasa}`);
  }
  const eklentiler = path.join(kasa, '.obsidian', 'plugins');
  const hedef = path.join(eklentiler, 'murekkep');
  fs.mkdirSync(eklentiler, { recursive: true });
  if (fs.existsSync(hedef)) {
    console.log(`Zaten kurulu: ${hedef}`);
    return;
  }
  fs.symlinkSync(cikti, hedef, 'junction');
  console.log(`Bağlandı: ${hedef} -> ${cikti}`);
  console.log(`Obsidian'da: Ayarlar > Topluluk eklentileri > Mürekkep'i aç.`);
}

derle();
const i = process.argv.indexOf('--kur');
if (i !== -1) {
  const kasa = process.argv[i + 1];
  if (!kasa) throw new Error('--kur için kasa yolu ver');
  kur(path.resolve(kasa));
}
