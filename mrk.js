#!/usr/bin/env node
// Mürekkep komut satırı aracı.
//
//   node mrk.js belge.mrk              -> belge.html (temiz okuma)
//   node mrk.js belge.mrk --calisma    -> belge.html (çalışma modu)
//   node mrk.js belge.mrk --json       -> belge.json
//   node mrk.js belge.mrk --istatistik -> kelime sayısı, notlar, boşluklar...
//   node mrk.js belge.mrk --kontrol    -> kopuk seçenekler, tanımsız bayraklar...

const fs = require('fs');
const path = require('path');
const Murekkep = require('./murekkep.js');

const argumanlar = process.argv.slice(2);
const dosya = argumanlar.find((a) => !a.startsWith('--'));
const secenek = (ad) => argumanlar.includes('--' + ad);

if (!dosya) {
  console.log('Kullanım: node mrk.js belge.mrk [--calisma] [--json] [--istatistik] [--kontrol]');
  process.exit(1);
}

// Formüller için KaTeX (MathML çıktısı: tarayıcı kendisi çizer, yazı tipi gerekmez)
let katex = null;
try {
  katex = require('./kutuphane/katex/katex.min.js');
} catch {}
const matematik = katex
  ? (tex, blok) => katex.renderToString(tex, { output: 'mathml', displayMode: blok, throwOnError: false })
  : undefined;

// ![[x.mrk]] yolları ana dosyanın klasörüne göre çözülür
const kokDizin = path.dirname(path.resolve(dosya));
const dahilOku = (yol) => {
  try {
    return fs.readFileSync(path.join(kokDizin, yol), 'utf8');
  } catch {
    return null;
  }
};

const metin = fs.readFileSync(dosya, 'utf8');
const belge = Murekkep.ayristir(metin, { dosya: path.basename(dosya), dahilOku });
const ad = path.basename(dosya, path.extname(dosya));

if (secenek('kontrol')) {
  const uyarilar = Murekkep.kontrol(belge);
  if (!uyarilar.length) console.log('Sorun yok.');
  for (const u of uyarilar) console.log(`${u.dosya || path.basename(dosya)}:${u.satir}  ${u.mesaj}`);
  process.exit(uyarilar.length ? 1 : 0);
}

if (secenek('istatistik')) {
  const ist = Murekkep.istatistik(belge);
  const hedef = ist.hedef ? ` / ${ist.hedef} (%${Math.round((ist.kelime / ist.hedef) * 100)})` : '';
  console.log(`Kelime:        ${ist.kelime}${hedef}`);
  console.log(`Kenar notu:    ${ist.notlar}`);
  console.log(`Açık soru:     ${ist.sorular}`);
  console.log(`Boşluk:        ${ist.bosluklar}`);
  console.log(`Çizik:         ${ist.cizikler}`);
  console.log(`Alternatif:    ${ist.alternatifler}`);
  console.log(`Çekmece:       ${ist.cekmeceler}`);
  for (const b of ist.bolumler) {
    console.log(`${'  '.repeat(b.seviye - 1)}= ${b.metin}${b.durum ? ` [${b.durum}]` : ''}`);
  }
  process.exit(0);
}

let cikti, uzanti;
if (secenek('json')) {
  cikti = Murekkep.json(belge);
  uzanti = '.json';
} else {
  const css = fs.readFileSync(path.join(__dirname, 'murekkep.css'), 'utf8');
  const baslik = belge.meta['başlık'] || ad;
  const govde = Murekkep.html(belge, { mod: secenek('calisma') ? 'calisma' : 'temiz', matematik });
  cikti = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${baslik.replace(/</g, '&lt;')}</title>
<style>
${css}
</style>
</head>
<body>
${govde}
</body>
</html>
`;
  uzanti = '.html';
}

const hedefDosya = path.join(path.dirname(dosya), ad + uzanti);
fs.writeFileSync(hedefDosya, cikti, 'utf8');
console.log(`${hedefDosya} yazıldı.`);
