// Sublime önizlemesi için Mürekkep → minihtml.
//
// Sublime'ın HTML sekmeleri "minihtml" denen kısıtlı bir HTML gösterir: tablo, ruby, details,
// MathML yok; CSS'i de sınırlı. Bu yüzden murekkep.js'teki html() yerine ağacı burada
// sadeleştirerek çiziyoruz. Parser yine tek: murekkep.js.
//
// Kullanım (Sublime eklentisi çağırır): metin stdin'den gelir
//   node onizleme.js --gorunum <id> --mod temiz|calisma [--dosya <yol>]
// Çıktı (stdout): { "html": "..." } ya da { "hata": "..." }

const fs = require('fs');
const path = require('path');
// Node, paket bağlantısının (junction) gerçek yerini bulur; parser repoda üç üst klasörde
const M = require('../../../murekkep.js');

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf('--' + ad);
  return i === -1 ? varsayilan : process.argv[i + 1];
};
const gorunumNo = Number(arg('gorunum', 0));
const calisma = arg('mod', 'temiz') === 'calisma';
const dosya = arg('dosya', '') || '';

const kac = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// href tek tırnaklı yazılır; içindeki JSON'un çift tırnakları olduğu gibi kalır,
// tek tırnak ve HTML karakterleri kaçırılır
const hrefKac = (s) => String(s).replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' })[c]);
const komut = (ad, args) => `subl:${ad} ${hrefKac(JSON.stringify(args))}`;

// Tıklanınca eklentideki murekkep_eylem komutunu çalıştıran bağlantı
const eylem = (args, ic, sinif = '') =>
  `<a${sinif ? ` class="${sinif}"` : ''} href='${komut('murekkep_eylem', { gorunum: gorunumNo, ...args })}'>${ic}</a>`;

const RENKLER = {
  kırmızı: 'var(--redish)',
  turuncu: 'var(--orangish)',
  sarı: 'var(--yellowish)',
  yeşil: 'var(--greenish)',
  mavi: 'var(--bluish)',
  mor: 'var(--purplish)',
  gri: 'color(var(--foreground) alpha(0.55))',
};

const GOREV_ISARETI = { bekliyor: '☐', bitti: '☑', suruyor: '◐', iptal: '☒' };

function ciz(belge) {
  const meta = belge.meta;
  const dizin = dosya ? path.dirname(dosya) : '';

  const satirIci = (dugumler) => dugumler.map(dugum).join('');

  function dugum(d) {
    switch (d.tur) {
      case 'metin': return kac(d.deger);
      case 'kalin': return `<b>${satirIci(d.icerik)}</b>`;
      case 'italik': return `<i>${satirIci(d.icerik)}</i>`;
      case 'alti': return `<u>${satirIci(d.icerik)}</u>`;
      case 'vurgu': return `<span class="vurgu">${satirIci(d.icerik)}</span>`;
      case 'kod': return `<code>${kac(d.deger)}</code>`;
      case 'matematik': return `<code>${kac(d.deger)}</code>`;
      case 'cizik': return calisma ? `<span class="cizik">${satirIci(d.icerik)}</span>` : '';
      case 'baglanti':
        if (d.dis) {
          const adres = /^www\./i.test(d.hedef) ? 'https://' + d.hedef : d.hedef;
          return `<a href='${komut('open_url', { url: adres })}'>${kac(d.yazi)}</a>`;
        }
        return eylem({ eylem: 'not', hedef: d.hedef }, kac(d.yazi));
      case 'gorsel': {
        const tam = dizin ? path.resolve(dizin, d.kaynak) : d.kaynak;
        // minihtml SVG gösteremez; PNG, JPG ve GIF dosyadan okunur
        if (/\.(png|jpe?g|gif)$/i.test(d.kaynak) && fs.existsSync(tam)) {
          return `<img src="file:///${kac(tam.replace(/\\/g, '/'))}" width="360">`;
        }
        return `<span class="soluk">[görsel: ${kac(d.aciklama || d.kaynak)}]</span>`;
      }
      case 'etiket': return `<span class="vurgu-mavi">#${kac(d.ad)}</span>`;
      case 'kisi': return `<span class="vurgu-mavi">@${kac(d.ad)}</span>`;
      case 'dipnot': return `<sup class="vurgu-mavi">${d.no}</sup>`;
      case 'degisken':
        if (meta[d.ad] !== undefined && meta[d.ad] !== true) return kac(meta[d.ad]);
        return `<span class="eksik">{$${kac(d.ad)}}</span>`;
      case 'renk': {
        const renk = RENKLER[d.renk];
        return renk ? `<span style="color: ${renk};">${satirIci(d.icerik)}</span>` : satirIci(d.icerik);
      }
      case 'anlam': return `${satirIci(d.icerik)} <span class="soluk">(${kac(d.anlam)})</span>`;
      case 'alternatif': {
        const ilk = satirIci(d.secenekler[0]);
        if (!calisma) return ilk;
        return `<span class="alt">${ilk}</span><span class="soluk"> | ${d.secenekler.slice(1).map(satirIci).join(' | ')}</span>`;
      }
      case 'bosluk': return `<span class="bosluk">&nbsp;${calisma && d.ipucu ? kac(d.ipucu) : '&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span>`;
      case 'kenar':
        if (!calisma) return '';
        return ` <span class="${d.cesit === 'soru' ? 'soru' : 'not'}">&nbsp;${d.cesit === 'soru' ? '? ' : ''}${satirIci(d.icerik)}&nbsp;</span>`;
      default: return '';
    }
  }

  const satirlar = (liste) => liste.map(satirIci).filter((s) => s.trim()).join('<br>');
  const kodMetni = (s) => kac(s).replace(/ /g, '&nbsp;').replace(/\n/g, '<br>');
  const duzMetin = (dugumler) => {
    let s = '';
    M.gez(dugumler, (x) => { if (x.tur === 'metin' || x.tur === 'kod') s += x.deger; });
    return s;
  };

  function liste(l, girinti = 0) {
    const bosluk = '&nbsp;'.repeat(girinti * 4);
    return l.ogeler
      .map((o, i) => {
        const isaret = l.cesit === 'gorev' ? GOREV_ISARETI[o.durum] : l.cesit === 'sirali' ? `${i + 1}.` : '•';
        const sinif = l.cesit === 'gorev' && o.durum === 'iptal' ? ' soluk' : '';
        const alt = o.alt.map((a) => liste(a, girinti + 1)).join('');
        return `<div class="madde${sinif}">${bosluk}<span class="soluk">${isaret}</span>&nbsp;${satirIci(o.icerik)}</div>${alt}`;
      })
      .join('');
  }

  // Tabloyu eş genişlikli yazıyla hizalar (minihtml'de tablo yok)
  function tablo(d) {
    const satirlar = [d.baslik, ...d.satirlar].map((s) => s.map((h) => duzMetin(h).trim()));
    const genislik = [];
    for (const s of satirlar) s.forEach((h, i) => (genislik[i] = Math.max(genislik[i] || 0, [...h].length)));
    const metin = satirlar
      .map((s, si) => {
        const satir = s.map((h, i) => h + ' '.repeat(genislik[i] - [...h].length)).join('   ');
        return si === 0 ? `<b>${kodMetni(satir)}</b>` : kodMetni(satir);
      })
      .join('<br>');
    return `<div class="kod"><code>${metin}</code></div>`;
  }

  function blok(d) {
    switch (d.tur) {
      case 'baslik': {
        const durum = calisma && d.durum ? ` <span class="rozet">${kac(d.durum)}</span>` : '';
        return `<h${d.seviye}>${eylem({ eylem: 'git', satir: d.satir }, satirIci(d.icerik), 'baslik')}${durum}</h${d.seviye}>`;
      }
      case 'paragraf': {
        const ic = satirlar(d.satirlar);
        return ic ? `<p>${ic}</p>` : '';
      }
      case 'alinti': return `<div class="alinti">${satirlar(d.satirlar)}</div>`;
      case 'liste': return `<div class="liste">${liste(d)}</div>`;
      case 'ayrac': return '<p class="ayrac">⁂</p>';
      case 'replik': return `<p><span class="konusan">${kac(d.kisi.toLocaleUpperCase('tr'))}</span>&nbsp;&nbsp;${satirIci(d.icerik)}</p>`;
      case 'dusunce': return `<p class="dusunce"><i>${satirIci(d.icerik)}</i></p>`;
      case 'yon': return `<p class="yon"><i>${satirIci(d.icerik)}</i></p>`;
      case 'secimler':
        return d.ogeler
          .map((s) => {
            const hedef = calisma && s.hedef ? ` <span class="soluk">⇒ ${kac(s.hedef)}</span>` : '';
            const kosul = calisma ? (s.kosullar || []).map((k) => ` <span class="kosul">?${k.degil ? '!' : ''}${kac(k.ad)}</span>`).join('') : '';
            return `<div class="secim"><span class="vurgu-mavi">→</span> ${satirIci(s.icerik)}${hedef}${kosul}</div>`;
          })
          .join('');
      case 'bayrak':
        return calisma ? `<div class="soluk"><code>$${kac(d.ad)}${d.deger === true ? '' : ' = ' + kac(d.deger)}</code></div>` : '';
      case 'kod': return `<div class="kod"><code>${kodMetni(d.metin)}</code></div>`;
      case 'matematik': return `<div class="kod orta"><code>${kodMetni(d.deger)}</code></div>`;
      case 'tablo': return tablo(d);
      case 'zaman':
        return `<div class="liste">${d.olaylar
          .map((o) => `<div class="madde"><span class="vurgu-mavi">${satirIci(o.tarih)}</span>&nbsp;&nbsp;${satirIci(o.olay)}</div>`)
          .join('')}</div>`;
      case 'sutunlar':
        return d.sutunlar.map((s) => s.map(blok).join('')).join('<div class="sutun-ayrac"></div>');
      case 'dahil':
        if (d.hata) return `<p class="eksik">${kac(d.kaynak)}: ${kac(d.hata)}</p>`;
        return d.cocuklar.map(blok).join('');
      case 'blok': {
        if (!calisma && (d.ad === 'çekmece' || d.ad === 'özet')) return '';
        const ic = d.cocuklar.map(blok).join('');
        const arg = d.argIcerik ? satirIci(d.argIcerik) : '';
        if (d.ad === 'sahne') {
          const ad = calisma && d.kimlik ? `<span class="vurgu-mor">${kac(d.kimlik)}</span>&nbsp;&nbsp;` : '';
          return `<div class="sahne">${ad || arg ? `<div class="sahne-yer">${ad}${arg.toLocaleUpperCase('tr')}</div>` : ''}${ic}</div>`;
        }
        if (d.ad === 'kişi') {
          const alanlar = Object.entries(d.alanlar || {})
            .map(([k, v]) => `<span class="soluk">${kac(k)}:</span> ${kac(v)}`)
            .join('<br>');
          return `<div class="kutu"><b>${kac(d.arg || '')}</b>${alanlar ? `<br>${alanlar}` : ''}${ic}</div>`;
        }
        const etiket = {
          gizli: `▸ ${arg || 'Gizli'}`,
          çekmece: 'ÇEKMECE',
          özet: 'ÖZET',
          not: arg,
          uyarı: arg,
        }[d.ad];
        const baslik = etiket !== undefined ? etiket : `${kac(d.ad)}${arg ? ' · ' + arg : ''}`;
        const sinif = d.ad === 'uyarı' ? 'kutu uyari' : d.ad === 'çekmece' || d.ad === 'özet' ? 'kutu soluk' : 'kutu';
        return `<div class="${sinif}">${baslik ? `<div class="kutu-baslik">${baslik}</div>` : ''}${ic}</div>`;
      }
      default: return '';
    }
  }

  let govde = belge.cocuklar.map(blok).join('\n');
  if (belge.dipnotlar.length) {
    govde += `<div class="dipnotlar">${belge.dipnotlar
      .map((d, i) => `<div><span class="vurgu-mavi">${i + 1}</span>&nbsp;&nbsp;${satirIci(d)}</div>`)
      .join('')}</div>`;
  }
  return govde;
}

function ust(belge) {
  const ist = M.istatistik(belge);
  const uyarilar = M.kontrol(belge);
  const dugme = (mod, ad) => eylem({ eylem: 'mod', mod }, ad, `dugme${(mod === 'calisma') === calisma ? ' secili' : ''}`);
  const sayilar = [ist.hedef ? `${ist.kelime} / ${ist.hedef} kelime` : `${ist.kelime} kelime`];
  if (ist.sorular) sayilar.push(`<span class="kirmizi">${ist.sorular} soru</span>`);
  if (ist.bosluklar) sayilar.push(`<span class="kirmizi">${ist.bosluklar} boşluk</span>`);
  if (ist.notlar) sayilar.push(`${ist.notlar} not`);
  let html =
    `<div class="cubuk">${dugme('temiz', 'Temiz')} ${dugme('calisma', 'Çalışma')}&nbsp;&nbsp;&nbsp;` +
    `${eylem({ eylem: 'tarayici' }, 'Tarayıcıda aç')}&nbsp;&nbsp;&nbsp;<span class="soluk">${sayilar.join(' · ')}</span></div>`;
  if (uyarilar.length) {
    html += `<div class="uyarilar">${uyarilar
      .map((u) => `<div>${eylem({ eylem: 'git', satir: u.satir, dosya: u.dosya || null }, `${kac(u.dosya || 'satır')} ${u.satir}`)}&nbsp;&nbsp;${kac(u.mesaj)}</div>`)
      .join('')}</div>`;
  }
  return html;
}

const STIL = `
body { padding: 0.8rem 1.6rem 3rem; font-size: 1.05rem; }
h1, h2, h3, h4, h5, h6 { margin: 1.1rem 0 0.4rem; }
h1 { font-size: 1.7rem; } h2 { font-size: 1.35rem; } h3 { font-size: 1.15rem; } h4, h5, h6 { font-size: 1.05rem; }
p { margin: 0.5rem 0; }
a { color: var(--bluish); text-decoration: none; }
a.baslik { color: var(--foreground); }
code { font-size: 0.95rem; }
.soluk { color: color(var(--foreground) alpha(0.55)); }
.kirmizi, .eksik { color: var(--redish); }
.vurgu-mavi { color: var(--bluish); }
.vurgu-mor { color: var(--purplish); }
.vurgu { background-color: color(var(--yellowish) alpha(0.3)); }
.alt { color: var(--bluish); }
.cizik { color: color(var(--foreground) alpha(0.45)); font-style: italic; }
.not { background-color: color(var(--yellowish) alpha(0.25)); border-radius: 3px; font-size: 0.85rem; }
.soru { background-color: color(var(--redish) alpha(0.2)); color: var(--redish); border-radius: 3px; font-size: 0.85rem; }
.bosluk { background-color: color(var(--redish) alpha(0.2)); color: var(--redish); border-radius: 3px; font-size: 0.85rem; }
.kosul { color: var(--redish); font-size: 0.9rem; }
.rozet { color: color(var(--foreground) alpha(0.55)); font-size: 0.7rem; }
.cubuk { padding: 0.4rem 0 0.6rem; margin-bottom: 0.6rem; border-bottom: 1px solid color(var(--foreground) alpha(0.12)); font-size: 0.9rem; }
.dugme { color: var(--foreground); padding: 0.15rem 0.6rem; border-radius: 3px; border: 1px solid color(var(--foreground) alpha(0.2)); }
.secili { background-color: var(--foreground); color: var(--background); }
.uyarilar { background-color: color(var(--redish) alpha(0.12)); border-radius: 4px; padding: 0.5rem 0.8rem; margin-bottom: 0.8rem; font-size: 0.9rem; }
.alinti { color: color(var(--foreground) alpha(0.65)); font-style: italic; padding-left: 1rem; border-left: 2px solid color(var(--foreground) alpha(0.2)); margin: 0.6rem 0; }
.liste { margin: 0.5rem 0; }
.madde { margin: 0.15rem 0; }
.ayrac { color: color(var(--foreground) alpha(0.4)); }
.konusan { font-weight: bold; font-size: 0.85rem; color: var(--cyanish); }
.dusunce { color: color(var(--foreground) alpha(0.6)); padding-left: 1.4rem; }
.yon { color: color(var(--foreground) alpha(0.6)); padding-left: 3rem; }
.secim { margin: 0.25rem 0; }
.sahne { margin: 1rem 0; padding: 0.4rem 0; border-top: 1px solid color(var(--foreground) alpha(0.12)); border-bottom: 1px solid color(var(--foreground) alpha(0.12)); }
.sahne-yer { color: color(var(--foreground) alpha(0.55)); font-size: 0.8rem; margin: 0.3rem 0 0.5rem; }
.kutu { background-color: color(var(--background) blend(var(--foreground) 93%)); border-radius: 4px; padding: 0.6rem 0.9rem; margin: 0.7rem 0; }
.uyari { background-color: color(var(--redish) alpha(0.15)); }
.kutu-baslik { color: color(var(--foreground) alpha(0.55)); font-size: 0.8rem; margin-bottom: 0.3rem; }
.kod { background-color: color(var(--background) blend(var(--foreground) 93%)); border-radius: 4px; padding: 0.6rem 0.9rem; margin: 0.7rem 0; }
.sutun-ayrac { margin: 0.4rem 0; border-top: 1px dashed color(var(--foreground) alpha(0.15)); }
.dipnotlar { margin-top: 2rem; padding-top: 0.6rem; border-top: 1px solid color(var(--foreground) alpha(0.12)); font-size: 0.9rem; color: color(var(--foreground) alpha(0.7)); }
`;

let girdi = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (parca) => (girdi += parca));
process.stdin.on('end', () => {
  try {
    const kokDizin = dosya ? path.dirname(dosya) : process.cwd();
    const dahilOku = (yol) => {
      try {
        return fs.readFileSync(path.join(kokDizin, yol), 'utf8');
      } catch {
        return null;
      }
    };
    const belge = M.ayristir(girdi, { dosya: dosya ? path.basename(dosya) : '', dahilOku: dosya ? dahilOku : undefined });
    const html = `<html><style>${STIL}</style><body>${ust(belge)}${ciz(belge)}</body></html>`;
    process.stdout.write(JSON.stringify({ html }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ hata: String((e && e.stack) || e) }));
  }
});
