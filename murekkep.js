// Mürekkep, sürüm 0.1
//
// İki aşamada çalışır:
//   1. Blok aşaması: metni satır satır okur, her satırın ne olduğuna karar verir
//      (başlık mı, liste mi, replik mi...). Satırları gruplar: paragraf, liste, blok.
//   2. Satır içi aşaması: her satırın içini karakter karakter tarar
//      (*kalın*, [[bağlantı]], {alternatif}, >> not...).
//
// Sonuç bir ağaçtır: iç içe JavaScript nesneleri ve dizileri. Lua'daki iç içe
// tablolar gibi düşünebilirsin. Her düğümün bir `tur` alanı vardır.
// Bu ağaç hem HTML'e çevrilir hem de olduğu gibi JSON olarak dışarı verilir.

(function (kok, fabrika) {
  // Aynı dosya hem Node'da (require) hem tarayıcıda (<script>) çalışsın diye.
  if (typeof module === 'object' && module.exports) module.exports = fabrika();
  else kok.Murekkep = fabrika();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SURUM = '0.1';

  // ------------------------------------------------------------------
  // Yardımcılar
  // ------------------------------------------------------------------

  // \p{L} her dildeki harf, \p{N} rakam demek. Böylece ç, ğ, ı, ö, ş, ü de harf sayılır.
  const HARF = /[\p{L}\p{N}]/u;
  const harfMi = (c) => c !== undefined && HARF.test(c);
  const boslukMu = (c) => c === undefined || /\s/.test(c);

  // Sonu "y" bayrağıyla biten düzenli ifadeler (sticky) sadece lastIndex'te eşleşir.
  // Metni her seferinde kesip kopyalamadan "tam şu noktada şu var mı?" diye sormamızı sağlar.
  const AD_Y = /[\p{L}\p{N}_-]+/uy;
  const DEGISKEN_Y = /\{\$([\p{L}\p{N}_-]+)\}/uy;
  const URL_Y = /(?:https?:\/\/|www\.)[^\s<>]+/iy;

  function eslesBurada(re, s, i) {
    re.lastIndex = i;
    return re.exec(s);
  }

  // Adresin sonuna yapışan noktalamayı at: "bak: https://ornek.com." -> nokta adrese dahil değil
  const urlKirp = (u) => u.replace(/[.,;:!?)\]'"»]+$/, '');

  // [bas, son) aralığının başındaki ve sonundaki boşlukları atar.
  function kirp(s, bas, son) {
    while (bas < son && /\s/.test(s[bas])) bas++;
    while (son > bas && /\s/.test(s[son - 1])) son--;
    return [bas, son];
  }

  // i noktasında `...` kod parçası başlıyorsa, bittiği yeri döndürür; yoksa -1.
  function kodSonu(s, i, son) {
    let n = 0;
    while (s[i + n] === '`') n++;
    const kapanis = '`'.repeat(n);
    let k = i + n;
    while (k < son) {
      const j = s.indexOf(kapanis, k);
      if (j === -1 || j >= son) return -1;
      // Tam olarak n tane ters tırnak olmalı, fazlası değil.
      let m = 0;
      while (s[j + m] === '`') m++;
      if (m === n) return j + n;
      k = j + m;
    }
    return -1;
  }

  // Korunan bir parça (kod, [[bağlantı]], adres, kaçış) i'de başlıyorsa sonunu döndürür.
  // Kalın, italik gibi işaretlerin kapanışını ararken bu parçaların içine bakmayız;
  // yoksa https://ornek.com/ içindeki "/" italiği kapatırdı.
  function korunanSonu(s, i, son) {
    const c = s[i];
    if (c === '\\') return Math.min(i + 2, son);
    if (c === '`') return kodSonu(s, i, son);
    if (c === '[' && s[i + 1] === '[') {
      const j = s.indexOf(']]', i + 2);
      return j !== -1 && j < son ? j + 2 : -1;
    }
    if ((c === 'h' || c === 'H' || c === 'w' || c === 'W') && !harfMi(s[i - 1])) {
      const m = eslesBurada(URL_Y, s, i);
      if (m) return Math.min(i + urlKirp(m[0]).length, son);
    }
    return -1;
  }

  // Aralığı en üst düzeydeki ayraç karakterinden böler. Kodun, [[bağlantı]]nın ve
  // {süslü parantez}in içindeki ayraçlar sayılmaz. Tablo hücreleri ve alternatifler için.
  function ustDuzeyBol(s, bas, son, ayrac) {
    const parcalar = [];
    let derinlik = 0;
    let baslangic = bas;
    let k = bas;
    while (k < son) {
      const atla = korunanSonu(s, k, son);
      if (atla > k) { k = atla; continue; }
      const c = s[k];
      if (c === '{') derinlik++;
      else if (c === '}') derinlik = Math.max(0, derinlik - 1);
      else if (c === ayrac && derinlik === 0) {
        parcalar.push([baslangic, k]);
        baslangic = k + 1;
      }
      k++;
    }
    parcalar.push([baslangic, son]);
    return parcalar;
  }

  // i'deki açılış parantezinin kapanışını bulur (iç içe parantezleri sayarak).
  function eslesenParantez(s, i, son, ac, kapa) {
    let derinlik = 0;
    let k = i;
    while (k < son) {
      const atla = korunanSonu(s, k, son);
      if (atla > k) { k = atla; continue; }
      if (s[k] === ac) derinlik++;
      else if (s[k] === kapa) {
        derinlik--;
        if (derinlik === 0) return k;
      }
      k++;
    }
    return -1;
  }

  // ------------------------------------------------------------------
  // Satır içi aşaması
  // ------------------------------------------------------------------

  // Vurgu işaretleri. Uzun olanlar önce denenir ki "!!" tek "!" gibi okunmasın.
  const VURGULAR = [
    ['!!', 'vurgu'],
    ['~~', 'cizik'],
    ['*', 'kalin'],
    ['/', 'italik'],
    ['_', 'alti'],
  ];

  // Açılış kuralı: önünde harf olmayacak, arkasında boşluk olmayacak.
  // "/" daha sıkı: önünde sadece boşluk, satır başı ya da açılış parantezi olabilir.
  // Böylece a/b, snake_case, 2*3 gibi şeyler işarete dönüşmez.
  function acilabilir(s, i, isaret) {
    const once = s[i - 1];
    const sonra = s[i + isaret.length];
    if (boslukMu(sonra) || sonra === isaret[0]) return false;
    if (isaret === '/') return once === undefined || /[\s([{"'«“‘]/.test(once);
    return !harfMi(once) && once !== isaret[0];
  }

  // Kapanış kuralı: önünde boşluk olmayacak, arkasında harf olmayacak.
  function kapanisBul(s, bas, son, isaret) {
    let k = bas;
    while (k < son) {
      const atla = korunanSonu(s, k, son);
      if (atla > k) { k = atla; continue; }
      if (
        k > bas &&
        s.startsWith(isaret, k) &&
        !boslukMu(s[k - 1]) &&
        !harfMi(s[k + isaret.length]) &&
        s[k + isaret.length] !== isaret[0]
      ) return k;
      k++;
    }
    return -1;
  }

  // s metninin [bas, son) aralığını satır içi düğümlerine çevirir.
  // durum: belge boyunca paylaşılan bilgi (şimdilik dipnotlar).
  function satirIci(s, durum, bas = 0, son = s.length) {
    const cikti = [];
    let tampon = ''; // düz metni biriktirir, bir işaret gelince düğüm olarak döker

    const bosalt = () => {
      if (tampon) cikti.push({ tur: 'metin', deger: tampon });
      tampon = '';
    };

    let i = bas;
    while (i < son) {
      const c = s[i];
      const once = s[i - 1];

      // \x: x'i olduğu gibi yaz
      if (c === '\\' && i + 1 < son) {
        tampon += s[i + 1];
        i += 2;
        continue;
      }

      // `kod`
      if (c === '`') {
        const j = kodSonu(s, i, son);
        if (j !== -1) {
          let n = 0;
          while (s[i + n] === '`') n++;
          let ic = s.slice(i + n, j - n);
          // `` `kod` `` yazımında kenardaki tek boşluklar sayılmaz
          if (ic.length > 1 && ic[0] === ' ' && ic[ic.length - 1] === ' ' && ic.trim()) ic = ic.slice(1, -1);
          bosalt();
          cikti.push({ tur: 'kod', deger: ic });
          i = j;
          continue;
        }
      }

      // ;; yorum: satırın geri kalanı yok sayılır
      if (c === ';' && s[i + 1] === ';' && boslukMu(once)) {
        tampon = tampon.replace(/\s+$/, '');
        break;
      }

      // >> kenar notu, >? soru: satır sonuna kadar
      if (c === '>' && (s[i + 1] === '>' || s[i + 1] === '?') && boslukMu(once)) {
        tampon = tampon.replace(/\s+$/, '');
        bosalt();
        const [a, b] = kirp(s, i + 2, son);
        cikti.push({
          tur: 'kenar',
          cesit: s[i + 1] === '>' ? 'not' : 'soru',
          icerik: satirIci(s, durum, a, b),
          satir: durum.satir,
        });
        i = son;
        continue;
      }

      // ![[resim.png | açıklama]] ve [[hedef]] / [[yazı | hedef]]
      const gorselMi = c === '!' && s.startsWith('[[', i + 1);
      if (gorselMi || (c === '[' && s[i + 1] === '[')) {
        const ic = gorselMi ? i + 3 : i + 2;
        const j = s.indexOf(']]', ic);
        if (j !== -1 && j < son) {
          const parcalar = s.slice(ic, j).split('|').map((p) => p.trim());
          bosalt();
          if (gorselMi) {
            cikti.push({ tur: 'gorsel', kaynak: parcalar[0], aciklama: parcalar[1] || '' });
          } else {
            const hedef = parcalar.length > 1 ? parcalar[1] : parcalar[0];
            const yazi = parcalar[0];
            cikti.push({ tur: 'baglanti', hedef, yazi, dis: /^(https?:\/\/|www\.|mailto:)/i.test(hedef) });
          }
          i = j + 2;
          continue;
        }
      }

      // ^[dipnot]
      if (c === '^' && s[i + 1] === '[') {
        const j = eslesenParantez(s, i + 1, son, '[', ']');
        if (j !== -1) {
          bosalt();
          const [a, b] = kirp(s, i + 2, j);
          durum.dipnotlar.push(satirIci(s, durum, a, b));
          cikti.push({ tur: 'dipnot', no: durum.dipnotlar.length });
          i = j + 1;
          continue;
        }
      }

      // {$değişken} ve {a | b | c}
      if (c === '{') {
        const m = eslesBurada(DEGISKEN_Y, s, i);
        if (m) {
          bosalt();
          cikti.push({ tur: 'degisken', ad: m[1] });
          i += m[0].length;
          continue;
        }
        const j = eslesenParantez(s, i, son, '{', '}');
        if (j !== -1) {
          const araliklar = ustDuzeyBol(s, i + 1, j, '|');
          if (araliklar.length >= 2) {
            bosalt();
            const kirpilmis = araliklar.map(([a, b]) => kirp(s, a, b));
            cikti.push({
              tur: 'alternatif',
              secenekler: kirpilmis.map(([a, b]) => satirIci(s, durum, a, b)),
              // Editörün seçenekleri kaynakta yer değiştirebilmesi için ham hali
              ham: s.slice(i, j + 1),
              hamSecenekler: kirpilmis.map(([a, b]) => s.slice(a, b)),
              altNo: ++durum.altSayac,
              satir: durum.satir,
            });
            i = j + 1;
            continue;
          }
        }
      }

      // ?? boşluk, ??ipucu
      if (c === '?' && s[i + 1] === '?') {
        bosalt();
        const m = eslesBurada(AD_Y, s, i + 2);
        cikti.push({ tur: 'bosluk', ipucu: m ? m[0] : null, satir: durum.satir });
        i += 2 + (m ? m[0].length : 0);
        continue;
      }

      // yalın adres: https://... ya da www....
      if ((c === 'h' || c === 'H' || c === 'w' || c === 'W') && !harfMi(once)) {
        const m = eslesBurada(URL_Y, s, i);
        if (m) {
          const adres = urlKirp(m[0]);
          bosalt();
          cikti.push({ tur: 'baglanti', hedef: adres, yazi: adres, dis: true });
          i += adres.length;
          continue;
        }
      }

      // #etiket ve @kişi: önünde boşluk ya da satır başı olmalı
      if ((c === '#' || c === '@') && (once === undefined || /[\s(]/.test(once)) && harfMi(s[i + 1])) {
        const m = eslesBurada(AD_Y, s, i + 1);
        bosalt();
        cikti.push({ tur: c === '#' ? 'etiket' : 'kisi', ad: m[0] });
        i += 1 + m[0].length;
        continue;
      }

      // *kalın*, /italik/, _altı çizili_, !!vurgu!!, ~~çizik~~
      let vurguBulundu = false;
      for (const [isaret, tur] of VURGULAR) {
        if (!s.startsWith(isaret, i) || !acilabilir(s, i, isaret)) continue;
        const j = kapanisBul(s, i + isaret.length, son, isaret);
        if (j === -1) continue;
        bosalt();
        const dugum = { tur, icerik: satirIci(s, durum, i + isaret.length, j) };
        if (tur === 'cizik') dugum.satir = durum.satir;
        cikti.push(dugum);
        i = j + isaret.length;
        vurguBulundu = true;
        break;
      }
      if (vurguBulundu) continue;

      // Hiçbiri değilse düz metin
      tampon += c;
      i++;
    }

    bosalt();
    return cikti;
  }

  // ------------------------------------------------------------------
  // Blok aşaması
  // ------------------------------------------------------------------

  const GOREV_DURUMU = { ' ': 'bekliyor', x: 'bitti', '~': 'suruyor', '-': 'iptal' };
  const BOLUM_DURUMU = /\s*\[(taslak|gözden geçir|bitti)\]$/u;

  // Girinti seviyesi: iki boşluk ya da bir sekme bir seviye.
  function girintiSeviyesi(bosluklar) {
    let n = 0;
    for (const c of bosluklar) n += c === '\t' ? 2 : 1;
    return Math.floor(n / 2);
  }

  // Okuyucu: satırlar ve şu an hangi satırda olduğumuz. Bloklar iç içe okunurken
  // hepsi aynı okuyucuyu paylaşır, böylece biri bir satırı tükettiğinde diğeri bilir.
  function bloklariOku(o, durum, derinlik) {
    const cikti = [];

    // Açık gruplar: art arda gelen satırlar aynı düğüme eklenir.
    let paragraf = null;
    let alinti = null;
    let secimler = null;
    let listeYigini = []; // { girinti, liste } — iç içe listeler için yığın

    const kapat = () => {
      paragraf = alinti = secimler = null;
      listeYigini = [];
    };

    while (o.i < o.satirlar.length) {
      const satir = o.satirlar[o.i].replace(/\s+$/, '');
      const duz = satir.trim();
      // Satır numarası (1'den başlar). Editör bununla kaynağa geri döner.
      const no = o.i + 1;
      durum.satir = no;
      let m;

      // Boş satır: açık grupları kapatır
      if (duz === '') { kapat(); o.i++; continue; }

      // ;; yorum satırı: hiçbir şey yapmaz, grubu da bozmaz
      if (duz.startsWith(';;')) { o.i++; continue; }

      // :: tek başına: bloğu kapatır
      if (duz === '::') {
        o.i++;
        if (derinlik > 0) return cikti;
        continue; // açılmamış bir bloğu kapatmaya çalışıyor, yok say
      }

      // ::ad argüman: blok açılışı
      if ((m = /^::([\p{L}\p{N}_-]+)\s*(.*)$/u.exec(duz))) {
        kapat();
        o.i++;
        const blok = blokOku(o, durum, m[1], m[2], derinlik, no);
        if (blok) cikti.push(blok);
        continue;
      }

      // = Başlık [durum]
      if ((m = /^(={1,6})\s+(.*)$/.exec(duz))) {
        kapat();
        let metin = m[2];
        let bolumDurumu = null;
        const d = BOLUM_DURUMU.exec(metin);
        if (d) {
          bolumDurumu = d[1];
          metin = metin.slice(0, d.index);
        }
        cikti.push({ tur: 'baslik', seviye: m[1].length, durum: bolumDurumu, icerik: satirIci(metin, durum), satir: no });
        o.i++;
        continue;
      }

      // --- ayraç
      if (/^-{3,}$/.test(duz)) {
        kapat();
        cikti.push({ tur: 'ayrac', satir: no });
        o.i++;
        continue;
      }

      // | alıntı
      if ((m = /^\|(?:\s(.*))?$/.exec(duz))) {
        if (!alinti) {
          kapat();
          alinti = { tur: 'alinti', satirlar: [], satir: no, satirNolari: [] };
          cikti.push(alinti);
        }
        alinti.satirlar.push(satirIci(m[1] || '', durum));
        alinti.satirNolari.push(no);
        o.i++;
        continue;
      }

      // - madde, + numaralı, [ ] görev (girinti önemli, o yüzden kırpılmamış satıra bakıyoruz)
      if ((m = /^(\s*)(?:([-+])|\[([ x~-])\])\s+(.*)$/.exec(satir))) {
        if (!listeYigini.length) kapat();
        const girinti = girintiSeviyesi(m[1]);
        const cesit = m[2] === '-' ? 'madde' : m[2] === '+' ? 'sirali' : 'gorev';
        const oge = { icerik: satirIci(m[4], durum), alt: [], satir: no };
        if (cesit === 'gorev') oge.durum = GOREV_DURUMU[m[3]];
        listeyeEkle(cikti, listeYigini, girinti, cesit, oge);
        o.i++;
        continue;
      }

      // -> seçenek => hedef
      if ((m = /^->\s*(.*?)(?:\s+=>\s*(\S+))?$/.exec(duz))) {
        if (!secimler) {
          kapat();
          secimler = { tur: 'secimler', ogeler: [], satir: no };
          cikti.push(secimler);
        }
        secimler.ogeler.push({ icerik: satirIci(m[1], durum), hedef: m[2] || null, satir: no });
        o.i++;
        continue;
      }

      // @Ad: replik
      if ((m = /^@([\p{L}\p{N}_-]+):\s*(.*)$/u.exec(duz))) {
        kapat();
        cikti.push({ tur: 'replik', kisi: m[1], icerik: satirIci(m[2], durum), satir: no });
        o.i++;
        continue;
      }

      // ~ iç ses
      if ((m = /^~\s+(.*)$/.exec(duz))) {
        kapat();
        cikti.push({ tur: 'dusunce', icerik: satirIci(m[1], durum), satir: no });
        o.i++;
        continue;
      }

      // (sahne yönü)
      if (duz.length > 1 && duz[0] === '(' && duz[duz.length - 1] === ')') {
        kapat();
        cikti.push({ tur: 'yon', icerik: satirIci(duz.slice(1, -1), durum), satir: no });
        o.i++;
        continue;
      }

      // Hiçbiri değilse paragraf satırı
      if (!paragraf) {
        kapat();
        paragraf = { tur: 'paragraf', satirlar: [], satir: no, satirNolari: [] };
        cikti.push(paragraf);
      }
      paragraf.satirlar.push(satirIci(duz, durum));
      paragraf.satirNolari.push(no);
      o.i++;
    }

    return cikti;
  }

  // Liste öğesini doğru yere koyar. Yığının tepesi en derindeki açık listedir.
  function listeyeEkle(cikti, yigin, girinti, cesit, oge) {
    const sonOge = (liste) => liste.ogeler[liste.ogeler.length - 1];

    // Bizden daha derindeki listeler kapandı
    while (yigin.length && yigin[yigin.length - 1].girinti > girinti) yigin.pop();

    const ust = yigin[yigin.length - 1];
    if (ust && ust.girinti === girinti && ust.liste.cesit === cesit) {
      ust.liste.ogeler.push(oge); // aynı listenin devamı
      return;
    }

    const yeni = { tur: 'liste', cesit, ogeler: [oge], satir: oge.satir };
    if (ust && ust.girinti === girinti) {
      // Aynı seviyede ama başka çeşit (mesela - sonra +): yanına yeni liste
      yigin.pop();
      const ebeveyn = yigin[yigin.length - 1];
      if (ebeveyn) sonOge(ebeveyn.liste).alt.push(yeni);
      else cikti.push(yeni);
    } else if (ust) {
      sonOge(ust.liste).alt.push(yeni); // daha derin: son öğenin altına
    } else {
      cikti.push(yeni); // ilk liste
    }
    yigin.push({ girinti, liste: yeni });
  }

  // ::ad ile açılan bir bloğu okur. Okuyucu bloğun ilk iç satırında.
  function blokOku(o, durum, ad, arg, derinlik, no) {
    // Ham satırları kapanışa kadar toplar: { metin, no }. Kod bloğu iç içe ::ad satırlarını sayar.
    const hamTopla = (icIceSay) => {
      const satirlar = [];
      let seviye = 1;
      while (o.i < o.satirlar.length) {
        const satir = o.satirlar[o.i++];
        const duz = satir.trim();
        if (duz === '::') {
          seviye--;
          if (seviye === 0) break;
        } else if (icIceSay && /^::[\p{L}\p{N}_-]/u.test(duz)) {
          seviye++;
        }
        satirlar.push({ metin: satir, no: o.i });
      }
      return satirlar;
    };

    if (ad === 'kod') {
      const metin = hamTopla(true).map((s) => s.metin).join('\n');
      return { tur: 'kod', dil: arg || null, metin, satir: no };
    }

    if (ad === 'meta') {
      for (const { metin } of hamTopla(false)) {
        const m = /^\s*([^:;][^:]*):\s*(.*)$/.exec(metin);
        if (m) durum.meta[m[1].trim()] = m[2].trim();
      }
      return null; // meta ağaçta düğüm olmaz, belgenin meta alanına gider
    }

    if (ad === 'tablo') {
      const satirlar = hamTopla(false)
        .map((s) => ({ metin: s.metin.trim(), no: s.no }))
        .filter((s) => s.metin && !s.metin.startsWith(';;'));
      const hucreler = satirlar.map(({ metin: s, no: satirNo }) => {
        durum.satir = satirNo;
        return ustDuzeyBol(s, 0, s.length, '|').map(([a, b]) => {
          [a, b] = kirp(s, a, b);
          return satirIci(s, durum, a, b);
        });
      });
      return {
        tur: 'tablo',
        baslik: hucreler[0] || [],
        satirlar: hucreler.slice(1),
        satir: no,
        satirNolari: satirlar.map((s) => s.no),
      };
    }

    // Diğer bütün bloklar (not, uyarı, gizli, sahne ve tanınmayanlar): içi yine Mürekkep
    return {
      tur: 'blok',
      ad,
      arg: arg || null,
      argIcerik: arg ? satirIci(arg, durum) : null,
      satir: no,
      cocuklar: bloklariOku(o, durum, derinlik + 1),
    };
  }

  // Ana giriş noktası: metni ağaca çevirir.
  function ayristir(metin) {
    const satirlar = String(metin).replace(/\r\n?/g, '\n').split('\n');
    const durum = { meta: {}, dipnotlar: [], satir: 0, altSayac: 0 };
    const cocuklar = bloklariOku({ satirlar, i: 0 }, durum, 0);
    return { tur: 'belge', surum: SURUM, meta: durum.meta, cocuklar, dipnotlar: durum.dipnotlar };
  }

  // ------------------------------------------------------------------
  // HTML çıktısı
  // ------------------------------------------------------------------

  const KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const kac = (s) => String(s).replace(/[&<>"']/g, (c) => KACIS[c]);

  // Düğümlerdeki düz metni toplar (başlık kimlikleri için).
  function duzMetin(dugumler, meta) {
    return dugumler
      .map((d) => {
        if (d.tur === 'metin' || d.tur === 'kod') return d.deger;
        if (d.tur === 'degisken') return meta[d.ad] ?? '';
        if (d.tur === 'alternatif') return duzMetin(d.secenekler[0], meta);
        if (d.tur === 'baglanti') return d.yazi;
        if (d.tur === 'cizik' || d.tur === 'kenar') return '';
        if (d.icerik) return duzMetin(d.icerik, meta);
        return '';
      })
      .join('');
  }

  function kimlik(metin) {
    return (
      metin
        .toLocaleLowerCase('tr')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-|-$/g, '') || 'bolum'
    );
  }

  // ayar.mod: 'temiz' (varsayılan) ya da 'calisma'
  // ayar.icBaglanti: [[not]] hedefini adrese çeviren fonksiyon
  // ayar.bloklar: { ad: (dugum, icHTML, argHTML) => html } — kendi blok türlerin için
  // ayar.konum: true ise bloklara data-satir yazılır (editör kaydırma için kullanır)
  function html(belge, ayar = {}) {
    const calisma = ayar.mod === 'calisma';
    const konum = !!ayar.konum;
    const icBaglanti = ayar.icBaglanti || ((hedef) => encodeURI(hedef));
    const ozelBloklar = ayar.bloklar || {};
    const meta = belge.meta;
    const kullanilanKimlikler = new Map();

    const satirIciHTML = (dugumler) => dugumler.map(dugumHTML).join('');

    function dugumHTML(d) {
      switch (d.tur) {
        case 'metin': return kac(d.deger);
        case 'kalin': return `<strong>${satirIciHTML(d.icerik)}</strong>`;
        case 'italik': return `<em>${satirIciHTML(d.icerik)}</em>`;
        case 'alti': return `<u>${satirIciHTML(d.icerik)}</u>`;
        case 'vurgu': return `<mark>${satirIciHTML(d.icerik)}</mark>`;
        case 'kod': return `<code>${kac(d.deger)}</code>`;
        case 'cizik': return calisma ? `<del class="mrk-cizik">${satirIciHTML(d.icerik)}</del>` : '';
        case 'baglanti':
          if (d.dis) {
            const adres = /^www\./i.test(d.hedef) ? 'https://' + d.hedef : d.hedef;
            return `<a class="mrk-dis" href="${kac(adres)}">${kac(d.yazi)}</a>`;
          }
          return `<a class="mrk-ic" href="${kac(icBaglanti(d.hedef))}" data-hedef="${kac(d.hedef)}">${kac(d.yazi)}</a>`;
        case 'gorsel': return `<img class="mrk-gorsel" src="${kac(d.kaynak)}" alt="${kac(d.aciklama)}">`;
        case 'etiket': return `<span class="mrk-etiket">#${kac(d.ad)}</span>`;
        case 'kisi': return `<span class="mrk-kisi">@${kac(d.ad)}</span>`;
        case 'dipnot':
          return `<sup class="mrk-dn"><a href="#mrk-dn-${d.no}" id="mrk-dnr-${d.no}">${d.no}</a></sup>`;
        case 'degisken':
          if (meta[d.ad] !== undefined) return kac(meta[d.ad]);
          return `<span class="mrk-eksik" title="meta'da yok">{$${kac(d.ad)}}</span>`;
        case 'alternatif': {
          const ilk = satirIciHTML(d.secenekler[0]);
          if (!calisma) return ilk;
          const digerleri = d.secenekler.slice(1).map(satirIciHTML).join(' | ');
          return `<span class="mrk-alt" data-alt-no="${d.altNo}"><span class="mrk-alt-secili">${ilk}</span><span class="mrk-alt-diger">${digerleri}</span></span>`;
        }
        case 'bosluk':
          if (calisma && d.ipucu) return `<span class="mrk-bosluk" title="sonra doldurulacak">${kac(d.ipucu)}</span>`;
          return `<span class="mrk-bosluk" title="sonra doldurulacak"></span>`;
        case 'kenar':
          if (!calisma) return '';
          return `<span class="mrk-kenar mrk-kenar-${d.cesit}">${satirIciHTML(d.icerik)}</span>`;
        default: return '';
      }
    }

    // Satırları <br> ile birleştirir; temiz modda tamamen boşalan satırları atar.
    const satirlarHTML = (satirlar) =>
      satirlar
        .map(satirIciHTML)
        .filter((s) => s.trim() !== '')
        .join('<br>\n');

    function listeHTML(liste) {
      const etiket = liste.cesit === 'sirali' ? 'ol' : 'ul';
      const sinif = liste.cesit === 'gorev' ? ' class="mrk-gorevler"' : '';
      const ogeler = liste.ogeler
        .map((oge) => {
          const alt = oge.alt.map(listeHTML).join('');
          if (liste.cesit === 'gorev') {
            return `<li class="mrk-gorev mrk-gorev-${oge.durum}"><span class="mrk-kutu"></span>${satirIciHTML(oge.icerik)}${alt}</li>`;
          }
          return `<li>${satirIciHTML(oge.icerik)}${alt}</li>`;
        })
        .join('');
      return `<${etiket}${sinif}>${ogeler}</${etiket}>`;
    }

    // Bloğun ilk etiketine satır numarasını ekler: <p ...> -> <p data-satir="12" ...>
    function blokHTML(d) {
      const h = blokIcHTML(d);
      if (!konum || !h || !d.satir) return h;
      return h.replace(/^<([a-z0-9]+)/i, `<$1 data-satir="${d.satir}"`);
    }

    function blokIcHTML(d) {
      switch (d.tur) {
        case 'baslik': {
          let k = kimlik(duzMetin(d.icerik, meta));
          const n = kullanilanKimlikler.get(k) || 0;
          kullanilanKimlikler.set(k, n + 1);
          if (n) k += '-' + (n + 1);
          const sinif = d.durum ? ` class="mrk-durum-${kimlik(d.durum)}"` : '';
          const rozet = calisma && d.durum ? ` <span class="mrk-durum">${kac(d.durum)}</span>` : '';
          return `<h${d.seviye} id="${kac(k)}"${sinif}>${satirIciHTML(d.icerik)}${rozet}</h${d.seviye}>`;
        }
        case 'paragraf': {
          const ic = satirlarHTML(d.satirlar);
          return ic ? `<p>${ic}</p>` : '';
        }
        case 'alinti': return `<blockquote><p>${satirlarHTML(d.satirlar)}</p></blockquote>`;
        case 'liste': return listeHTML(d);
        case 'ayrac': return '<hr>';
        case 'replik':
          return `<p class="mrk-replik"><span class="mrk-konusan">${kac(d.kisi)}</span> <span class="mrk-soz">${satirIciHTML(d.icerik)}</span></p>`;
        case 'dusunce': return `<p class="mrk-dusunce">${satirIciHTML(d.icerik)}</p>`;
        case 'yon': return `<p class="mrk-yon">${satirIciHTML(d.icerik)}</p>`;
        case 'secimler': {
          const ogeler = d.ogeler
            .map((s) => {
              const hedef = calisma && s.hedef ? ` <span class="mrk-hedef">${kac(s.hedef)}</span>` : '';
              return `<li>${satirIciHTML(s.icerik)}${hedef}</li>`;
            })
            .join('');
          return `<ul class="mrk-secimler">${ogeler}</ul>`;
        }
        case 'kod': {
          const dil = d.dil ? ` data-dil="${kac(d.dil)}"` : '';
          return `<pre class="mrk-kod"${dil}><code>${kac(d.metin)}</code></pre>`;
        }
        case 'tablo': {
          const bas = d.baslik.map((h) => `<th>${satirIciHTML(h)}</th>`).join('');
          const govde = d.satirlar
            .map((satir) => `<tr>${satir.map((h) => `<td>${satirIciHTML(h)}</td>`).join('')}</tr>`)
            .join('');
          return `<div class="mrk-tablo"><table><thead><tr>${bas}</tr></thead><tbody>${govde}</tbody></table></div>`;
        }
        case 'blok': {
          const ic = d.cocuklar.map(blokHTML).join('\n');
          const arg = d.argIcerik ? satirIciHTML(d.argIcerik) : '';
          if (ozelBloklar[d.ad]) return ozelBloklar[d.ad](d, ic, arg);
          if (d.ad === 'gizli') {
            return `<details class="mrk-gizli"><summary>${arg || 'Gizli'}</summary>${ic}</details>`;
          }
          if (d.ad === 'sahne') {
            const yer = arg ? `<header class="mrk-sahne-yer">${arg}</header>` : '';
            return `<section class="mrk-sahne">${yer}${ic}</section>`;
          }
          const baslik = arg ? `<div class="mrk-blok-baslik">${arg}</div>` : '';
          return `<div class="mrk-blok mrk-blok-${kac(kimlik(d.ad))}" data-blok="${kac(d.ad)}">${baslik}${ic}</div>`;
        }
        default: return '';
      }
    }

    let govde = belge.cocuklar.map(blokHTML).filter(Boolean).join('\n');

    if (belge.dipnotlar.length) {
      const dn = belge.dipnotlar
        .map((icerik, i) => `<li id="mrk-dn-${i + 1}">${satirIciHTML(icerik)} <a href="#mrk-dnr-${i + 1}">↩</a></li>`)
        .join('');
      govde += `\n<ol class="mrk-dipnotlar">${dn}</ol>`;
    }

    return `<article class="mrk mrk-${calisma ? 'calisma' : 'temiz'}">\n${govde}\n</article>`;
  }

  // ------------------------------------------------------------------
  // JSON ve istatistik
  // ------------------------------------------------------------------

  // Konum bilgileri (satır numaraları, alternatiflerin ham hali) editör içindir.
  // JSON'da varsayılan olarak çıkarılır; Godot gibi okuyucular için gürültü olur.
  const KONUM_ALANLARI = new Set(['satir', 'satirNolari', 'ham', 'hamSecenekler', 'altNo']);

  function json(belge, ayar = {}) {
    const ayikla = ayar.konum ? undefined : (anahtar, deger) => (KONUM_ALANLARI.has(anahtar) ? undefined : deger);
    return JSON.stringify(belge, ayikla, 2);
  }

  // Temiz okumadaki kelime sayısı ve yazma süreci sayaçları.
  function istatistik(belge) {
    const sonuc = {
      kelime: 0,
      hedef: Number(belge.meta.hedef) || null,
      notlar: 0,
      sorular: 0,
      bosluklar: 0,
      cizikler: 0,
      alternatifler: 0,
      bolumler: [],
    };

    const kelimeSay = (s) => s.split(/\s+/).filter((w) => HARF.test(w)).length;

    // Ağacı gezer. sayilir: bu kısım temiz okumada görünüyor mu?
    function gez(x, sayilir) {
      if (Array.isArray(x)) { x.forEach((y) => gez(y, sayilir)); return; }
      if (!x || typeof x !== 'object') return;

      switch (x.tur) {
        case 'metin':
          if (sayilir) sonuc.kelime += kelimeSay(x.deger);
          return;
        case 'kod':
          // Satır içi kod sayılır, ::kod blokları (deger yerine metin taşır) sayılmaz
          if (sayilir && x.deger !== undefined) sonuc.kelime += kelimeSay(x.deger);
          return;
        case 'degisken':
          if (sayilir && belge.meta[x.ad]) sonuc.kelime += kelimeSay(belge.meta[x.ad]);
          return;
        case 'cizik': sonuc.cizikler++; gez(x.icerik, false); return;
        case 'kenar': x.cesit === 'soru' ? sonuc.sorular++ : sonuc.notlar++; gez(x.icerik, false); return;
        case 'bosluk': sonuc.bosluklar++; return;
        case 'alternatif':
          sonuc.alternatifler++;
          x.secenekler.forEach((s, i) => gez(s, sayilir && i === 0));
          return;
        case 'baslik':
          sonuc.bolumler.push({ seviye: x.seviye, metin: duzMetin(x.icerik, belge.meta), durum: x.durum });
          break;
      }
      for (const anahtar in x) {
        if (anahtar !== 'meta' && !KONUM_ALANLARI.has(anahtar)) gez(x[anahtar], sayilir);
      }
    }

    gez(belge.cocuklar, true);
    gez(belge.dipnotlar, true);
    return sonuc;
  }

  return { surum: SURUM, ayristir, html, json, istatistik };
});
