// Mürekkep renklendiricisi: kaynak metni renkli HTML'e çevirir (editörlerde yazarken).
//
// Parser'dan bağımsız, daha kaba bir tarayıcı. Amacı doğru ağaç kurmak değil, yazarken
// işaretleri renkle göstermek. Her satır <span class="sl"> içine konur ki editör satırların
// ekrandaki yerini bulabilsin. Renk sınıfları "v-" ile başlar (v-baslik, v-not...).
// Sublime eklentisindeki Murekkep.sublime-syntax aynı kuralları izler.

(function (kok, fabrika) {
  if (typeof module === 'object' && module.exports) module.exports = fabrika();
  else kok.Vurgulayici = fabrika();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const kac = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sp = (sinif, icerik) => `<span class="v-${sinif}">${icerik}</span>`;

  // Satır içi kurallar. Her biri "tam bu noktada eşleşiyor mu?" diye bakılan bir sticky regex.
  const SATIR_ICI = [
    [/\\./y, 'isaret'],
    [/(`+)[^`]*?\1/y, 'kod'],
    [/(?<=\s);;.*$/y, 'yorum'],
    [/(?<=\s|^)>>.*$/y, 'not'],
    [/(?<=\s|^)>\?.*$/y, 'soru'],
    [/!?\[\[[^\]]*\]\]/y, 'baglanti'],
    [/\^\[[^\]]*\]/y, 'isaret'],
    [/\{\$[\p{L}\p{N}_-]+\}/uy, 'degisken'],
    [/\{[^{}]*\|[^{}]*\}/y, 'alt'],
    [/\{[\p{L}][\p{L}\p{N}_-]*:\s[^{}]*\}/uy, 'renk'],
    [/\{[^{}=]+=[^{}=]+\}/y, 'anlam'],
    [/(?<![\p{L}\p{N}])\$(?=[^\s$])[^$]*?\S\$(?![\p{L}\p{N}])/uy, 'kod'],
    [/\?\?[\p{L}\p{N}_-]*/uy, 'bosluk'],
    [/~~[^~]+~~/y, 'cizik'],
    [/!![^!]+!!/y, 'vurgu'],
    [/(?<![\p{L}\p{N}])\*(?=\S)[^*]*?\S\*(?![\p{L}\p{N}])/uy, 'kalin'],
    [/(?<=\s|^|\()\/(?=\S)[^/]*?\S\/(?![\p{L}\p{N}])/uy, 'italik'],
    [/(?<![\p{L}\p{N}])_(?=\S)[^_]*?\S_(?![\p{L}\p{N}])/uy, 'italik'],
    [/(?:https?:\/\/|www\.)[^\s<>]+/iy, 'baglanti'],
    [/(?<=\s|^|\()[#@][\p{L}\p{N}_-]+/uy, 'etiket'],
  ];
  // Bu karakterlerden biri yoksa o noktada hiçbir kuralı denemeye gerek yok
  const TETIK = new Set('\\`;>![^{?~*/_#@$hHwW');

  function satirIci(s) {
    let cikti = '';
    let duz = '';
    let i = 0;
    while (i < s.length) {
      if (TETIK.has(s[i])) {
        let bulundu = false;
        for (const [re, sinif] of SATIR_ICI) {
          re.lastIndex = i;
          const m = re.exec(s);
          if (m && m[0].length) {
            cikti += kac(duz) + sp(sinif, kac(m[0]));
            duz = '';
            i += m[0].length;
            bulundu = true;
            break;
          }
        }
        if (bulundu) continue;
      }
      duz += s[i++];
    }
    return cikti + kac(duz);
  }

  const onbellek = new Map(); // satır metni -> renkli HTML

  function satir(s) {
    if (onbellek.has(s)) return onbellek.get(s);
    let m;
    let h;
    const duz = s.trim();
    if (duz.startsWith(';;')) h = sp('yorum', kac(s));
    else if (/^\s*::/.test(s) || /^\s*\|\|\s*$/.test(s)) h = sp('blok', kac(s));
    else if ((m = /^(\s*={1,6}\s)(.*?)(\s*\[(?:taslak|gözden geçir|bitti)\])?$/u.exec(s)))
      h = sp('isaret', kac(m[1])) + sp('baslik', satirIci(m[2])) + (m[3] ? sp('durum', kac(m[3])) : '');
    else if (/^\s*-{3,}\s*$/.test(s)) h = sp('isaret', kac(s));
    else if (/^\s*\$[\p{L}\p{N}_-]+(\s*=[^$]*)?$/u.test(s)) h = sp('degisken', kac(s));
    else if (/^\s*!\[\[[^\]]+\.mrk[^\]]*\]\]\s*$/.test(s)) h = sp('baglanti', kac(s));
    else if ((m = /^(\s*(?:[-+|]|\[[ x~-]\])\s)(.*)$/.exec(s))) h = sp('isaret', kac(m[1])) + satirIci(m[2]);
    else if ((m = /^(\s*->\s?)(.*?)(\s+=>\s*[^\s?]+)?((?:\s+\?!?[\p{L}\p{N}_-]+)*)\s*$/u.exec(s)))
      h = sp('isaret', kac(m[1])) + satirIci(m[2]) + (m[3] ? sp('blok', kac(m[3])) : '') + (m[4] ? sp('kosul', kac(m[4])) : '');
    else if ((m = /^(\s*@[\p{L}\p{N}_-]+:)(.*)$/u.exec(s))) h = sp('konusan', kac(m[1])) + satirIci(m[2]);
    else if (/^\s*~\s/.test(s)) h = sp('dusunce', satirIci(s));
    else if (/^\s*\(.*\)\s*$/.test(s)) h = sp('yon', kac(s));
    else h = satirIci(s);
    if (onbellek.size > 5000) onbellek.clear();
    onbellek.set(s, h);
    return h;
  }

  // Bütün metni renklendirir. Her satır <span class="sl">; satırlar \n ile ayrılır.
  function vurgula(metin) {
    const satirlar = String(metin).split('\n');
    const parcalar = [];
    let hamSeviye = 0; // ::kod ve ::matematik içindeyken renklendirme yapılmaz
    for (const s of satirlar) {
      const duz = s.trim();
      let h;
      if (hamSeviye > 0) {
        if (duz === '::') hamSeviye--;
        else if (/^::[\p{L}\p{N}_-]/u.test(duz)) hamSeviye++;
        h = hamSeviye === 0 ? sp('blok', kac(s)) : sp('kod', kac(s));
      } else {
        if (/^::(kod|matematik)(\s|$)/.test(duz)) hamSeviye = 1;
        h = satir(s);
      }
      parcalar.push(`<span class="sl">${h}</span>`);
    }
    // Sondaki boş satırın da yüksekliği olsun diye fazladan bir boşluk
    return parcalar.join('\n') + '\n ';
  }

  return { vurgula };
});
