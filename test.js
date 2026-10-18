// Mürekkep testleri. Çalıştırmak için: node test.js
// Her test bir Mürekkep parçasını ayrıştırıp sonucu kontrol eder.
// Kurallardan biri bozulursa hangi testin kırıldığını söyler.

const assert = require('assert');
const M = require('./murekkep.js');

let gecen = 0;
let kalan = 0;

function test(ad, fn) {
  try {
    fn();
    gecen++;
  } catch (hata) {
    kalan++;
    console.log(`✗ ${ad}\n  ${hata.message.split('\n').join('\n  ')}`);
  }
}

// Konum alanlarını (satır numaraları vb.) atarak sade ağacı verir
const sade = (metin) => JSON.parse(M.json(M.ayristir(metin)));
// Tek satırı ayrıştırıp ilk paragrafın ilk satırını döndürür
const satir = (metin) => sade(metin).cocuklar[0].satirlar[0];
const temiz = (metin) => M.html(M.ayristir(metin));
const calisma = (metin) => M.html(M.ayristir(metin), { mod: 'calisma' });
const turler = (dugumler) => dugumler.map((d) => d.tur);

// --- Satır içi ---

test('kalın, italik, altı çizili, vurgu', () => {
  assert.deepStrictEqual(turler(satir('*a* /b/ _c_ !!d!!')), ['kalin', 'metin', 'italik', 'metin', 'alti', 'metin', 'vurgu']);
});

test('a/b italik olmaz', () => {
  assert.deepStrictEqual(turler(satir('ve/veya ile a/b/c')), ['metin']);
});

test('adres italik olmaz ve bağlantı olur', () => {
  const d = satir('bak https://ornek.com/a/b. tamam');
  assert.deepStrictEqual(turler(d), ['metin', 'baglanti', 'metin']);
  assert.strictEqual(d[1].hedef, 'https://ornek.com/a/b');
});

test('italiğin içindeki adres italiği kapatmaz', () => {
  const d = satir('/bak https://ornek.com/ şuna/');
  assert.deepStrictEqual(turler(d), ['italik']);
});

test('snake_case altı çizili olmaz', () => {
  assert.deepStrictEqual(turler(satir('degisken_adi_bu')), ['metin']);
});

test('kaçış karakteri', () => {
  assert.deepStrictEqual(satir('\\*kalın değil\\*'), [{ tur: 'metin', deger: '*kalın değil*' }]);
});

test('iç içe vurgu', () => {
  const d = satir('*kalın /ve italik/*');
  assert.strictEqual(d[0].tur, 'kalin');
  assert.strictEqual(d[0].icerik[1].tur, 'italik');
});

test('kod içinde işaret işlenmez', () => {
  assert.deepStrictEqual(satir('`*a*`'), [{ tur: 'kod', deger: '*a*' }]);
  assert.deepStrictEqual(satir('`` `kod` ``'), [{ tur: 'kod', deger: '`kod`' }]);
});

test('bağlantılar ve görsel', () => {
  const d = satir('[[not]] [[yazı | https://ornek.com]] ![[r.png | harita]]');
  assert.deepStrictEqual(d[0], { tur: 'baglanti', hedef: 'not', yazi: 'not', dis: false });
  assert.deepStrictEqual(d[2], { tur: 'baglanti', hedef: 'https://ornek.com', yazi: 'yazı', dis: true });
  assert.deepStrictEqual(d[4], { tur: 'gorsel', kaynak: 'r.png', aciklama: 'harita' });
});

test('etiket ve kişi, e-posta değil', () => {
  assert.deepStrictEqual(turler(satir('#lore @Ece')), ['etiket', 'metin', 'kisi']);
  assert.deepStrictEqual(turler(satir('a@b.com ve renk#3')), ['metin']);
});

test('değişken', () => {
  assert.strictEqual(temiz('::meta\nad: Ece\n::\nSelam {$ad}, {$yok}'), '<article class="mrk mrk-temiz">\n<p>Selam Ece, <span class="mrk-eksik" title="tanımlı değil">{$yok}</span></p>\n</article>');
});

test('dipnot', () => {
  const b = M.ayristir('Bir^[ilk] iki^[ikinci *kalın*]');
  assert.strictEqual(b.dipnotlar.length, 2);
  assert.strictEqual(b.dipnotlar[1][1].tur, 'kalin');
});

test('satır içi yorum', () => {
  assert.deepStrictEqual(satir('görünür ;; görünmez'), [{ tur: 'metin', deger: 'görünür' }]);
});

// --- Yazma süreci ---

test('alternatifler: temizde ilki, çalışmada hepsi', () => {
  const d = satir('Liman {sessizdi | ölü gibiydi}.');
  assert.strictEqual(d[1].tur, 'alternatif');
  assert.strictEqual(d[1].secenekler.length, 2);
  assert.ok(temiz('Liman {sessizdi | ölü gibiydi}.').includes('Liman sessizdi.'));
  assert.ok(calisma('Liman {sessizdi | ölü gibiydi}.').includes('ölü gibiydi'));
});

test('tek seçenekli süslü parantez alternatif değil', () => {
  assert.deepStrictEqual(turler(satir('{sadece bu}')), ['metin']);
});

test('kenar notu ve soru temizde gizli', () => {
  const d = satir('Ece kapıyı açtı.  >> hızlı oldu');
  assert.deepStrictEqual(d[1], { tur: 'kenar', cesit: 'not', icerik: [{ tur: 'metin', deger: 'hızlı oldu' }] });
  assert.strictEqual(satir('Gerekli mi? >? emin değilim')[1].cesit, 'soru');
  assert.ok(!temiz('a >> not').includes('not'));
});

test('boşluk ve ipucu', () => {
  assert.deepStrictEqual(satir('Gemi ?? saatte')[1], { tur: 'bosluk', ipucu: null });
  assert.deepStrictEqual(satir('Gemi ??saat kalktı')[1], { tur: 'bosluk', ipucu: 'saat' });
});

test('çizik temizde yok, çalışmada var', () => {
  assert.ok(!temiz('~~eski~~ yeni').includes('eski'));
  assert.ok(calisma('~~eski~~ yeni').includes('<del class="mrk-cizik">eski</del>'));
});

test('bölüm durumu', () => {
  const b = M.ayristir('== Liman [gözden geçir]').cocuklar[0];
  assert.strictEqual(b.durum, 'gözden geçir');
  assert.strictEqual(b.icerik[0].deger, 'Liman');
});

// --- Bloklar ve satırlar ---

test('satır sonları korunur', () => {
  assert.strictEqual(M.ayristir('bir\niki\n\nüç').cocuklar.length, 2);
  assert.ok(temiz('bir\niki').includes('bir<br>\niki'));
});

test('iç içe ve karışık listeler', () => {
  const b = M.ayristir('- a\n  - b\n  + c\n- d\n[x] bitti');
  assert.strictEqual(b.cocuklar.length, 2);
  const [madde, gorev] = b.cocuklar;
  assert.strictEqual(madde.ogeler.length, 2);
  assert.deepStrictEqual(madde.ogeler[0].alt.map((l) => l.cesit), ['madde', 'sirali']);
  assert.strictEqual(gorev.ogeler[0].durum, 'bitti');
});

test('diyalog', () => {
  const b = M.ayristir('@Ece: Selam.\n~ düşünce\n(kapı açılır)\n-> Bin => gemi\n-> Dön');
  assert.deepStrictEqual(turler(b.cocuklar), ['replik', 'dusunce', 'yon', 'secimler']);
  assert.strictEqual(b.cocuklar[0].kisi, 'Ece');
  assert.deepStrictEqual(b.cocuklar[3].ogeler.map((o) => o.hedef), ['gemi', null]);
});

test('iç içe bloklar', () => {
  const b = M.ayristir('::sahne liman\n::not\niç\n::\ndış\n::\nsonra');
  assert.deepStrictEqual(turler(b.cocuklar), ['blok', 'paragraf']);
  assert.deepStrictEqual(turler(b.cocuklar[0].cocuklar), ['blok', 'paragraf']);
});

test('kod bloğu içindeki :: satırları sayılır', () => {
  const b = M.ayristir('::kod\n::ad\niç\n::\n::\nsonra');
  assert.strictEqual(b.cocuklar[0].metin, '::ad\niç\n::');
  assert.strictEqual(b.cocuklar[1].tur, 'paragraf');
});

test('tablo hücreleri kodun içindeki | ile bölünmez', () => {
  const b = M.ayristir('::tablo\nA | B\n`x | y` | *z*\n::');
  const t = b.cocuklar[0];
  assert.strictEqual(t.baslik.length, 2);
  assert.strictEqual(t.satirlar[0][0][0].deger, 'x | y');
  assert.strictEqual(t.satirlar[0][1][0].tur, 'kalin');
});

test('tanınmayan blok genel kutu olur', () => {
  assert.ok(temiz('::harita kuzey\nx\n::').includes('data-blok="harita"'));
});

test('kendi blok türün', () => {
  const sonuc = M.html(M.ayristir('::harita kuzey\nx\n::'), {
    bloklar: { harita: (d, ic, arg) => `<figure>${arg}</figure>` },
  });
  assert.ok(sonuc.includes('<figure>kuzey</figure>'));
});

test('HTML kaçışı', () => {
  assert.ok(temiz('<script>').includes('&lt;script&gt;'));
});

test('satır numaraları', () => {
  const b = M.ayristir('::meta\na: 1\n::\n= Başlık\n\nbir\n;; yorum\niki >> not\n::sahne\n@Ece: ??\n::');
  const [baslik, paragraf, sahne] = b.cocuklar;
  assert.strictEqual(baslik.satir, 4);
  assert.deepStrictEqual(paragraf.satirNolari, [6, 8]);
  assert.strictEqual(paragraf.satirlar[1][1].satir, 8); // kenar notu
  assert.strictEqual(sahne.satir, 9);
  assert.strictEqual(sahne.cocuklar[0].icerik[0].satir, 10); // boşluk
});

test('alternatifin ham hali ve numarası', () => {
  const d = M.ayristir('a {x | *y*} b {p | q}').cocuklar[0].satirlar[0];
  assert.strictEqual(d[1].ham, '{x | *y*}');
  assert.deepStrictEqual(d[1].hamSecenekler, ['x', '*y*']);
  assert.deepStrictEqual([d[1].altNo, d[3].altNo], [1, 2]);
});

test('JSON konum alanlarını varsayılan olarak atar', () => {
  const b = M.ayristir('a {x | y} >> n');
  assert.ok(!M.json(b).includes('"satir"'));
  assert.ok(M.json(b, { konum: true }).includes('"satir"'));
});

test('html konum seçeneği', () => {
  assert.ok(M.html(M.ayristir('\n= B'), { konum: true }).includes('<h1 data-satir="2"'));
});

// --- Sürüm 0.2 ---

test('renk ve anlam notu', () => {
  const d = satir('{kırmızı: *dikkat*} ve {ardh = toprak}');
  assert.strictEqual(d[0].tur, 'renk');
  assert.strictEqual(d[0].renk, 'kırmızı');
  assert.strictEqual(d[0].icerik[0].tur, 'kalin');
  assert.deepStrictEqual(d[2], { tur: 'anlam', icerik: [{ tur: 'metin', deger: 'ardh' }], anlam: 'toprak' });
  assert.ok(temiz('{ardh = toprak}').includes('<ruby class="mrk-anlam">ardh<rp> (</rp><rt>toprak</rt>'));
});

test('süslü parantez öncelikleri', () => {
  assert.strictEqual(satir('{a = b | c}')[0].tur, 'alternatif'); // | önce gelir
  assert.deepStrictEqual(turler(satir('{böyle}')), ['metin']);
  assert.deepStrictEqual(turler(satir('{a = b = c}')), ['metin']);
});

test('satır içi matematik', () => {
  assert.deepStrictEqual(satir('formül: $x^2 + 1$.')[1], { tur: 'matematik', deger: 'x^2 + 1' });
  assert.deepStrictEqual(turler(satir('fiyat 50$ ve 30$')), ['metin']);
  assert.deepStrictEqual(turler(satir('$5 ile $6 arası')), ['metin']);
});

test('matematik bloğu ve çizici', () => {
  const b = M.ayristir('::matematik\n\\frac{1}{2}\n::');
  assert.deepStrictEqual(sade('::matematik\n\\frac{1}{2}\n::').cocuklar[0], { tur: 'matematik', blok: true, deger: '\\frac{1}{2}' });
  const h = M.html(b, { matematik: (tex, blok) => `[${blok ? 'B' : 'S'}:${tex}]` });
  assert.ok(h.includes('[B:\\frac{1}{2}]'));
  assert.ok(temiz('$x$').includes('mrk-matematik-cig'));
});

test('bayrak satırı', () => {
  const b = sade('$anahtar\n$altın = 5\n$E = mc^2$');
  assert.deepStrictEqual(b.cocuklar[0], { tur: 'bayrak', ad: 'anahtar', deger: true });
  assert.deepStrictEqual(b.cocuklar[1], { tur: 'bayrak', ad: 'altın', deger: '5' });
  assert.strictEqual(b.cocuklar[2].tur, 'paragraf'); // içinde ikinci $ var: matematik
  assert.ok(!temiz('$anahtar').includes('anahtar'));
});

test('koşullu seçenek', () => {
  const o = sade('-> Kapıyı aç => kapi ?anahtar ?!lanet\n-> Bekle ?yorgun').cocuklar[0].ogeler;
  assert.strictEqual(o[0].hedef, 'kapi');
  assert.deepStrictEqual(o[0].kosullar, [{ ad: 'anahtar', degil: false }, { ad: 'lanet', degil: true }]);
  assert.strictEqual(o[1].hedef, null);
  assert.deepStrictEqual(o[1].kosullar, [{ ad: 'yorgun', degil: false }]);
  assert.strictEqual(sade('-> Neden ?').cocuklar[0].ogeler[0].icerik[0].deger, 'Neden ?');
});

test('sahne adı ve tarifi', () => {
  const [a, b, c] = M.ayristir('::sahne liman: gece, liman\n::\n::sahne fener\n::\n::sahne gece, liman\n::').cocuklar;
  assert.deepStrictEqual([a.kimlik, a.arg], ['liman', 'gece, liman']);
  assert.deepStrictEqual([b.kimlik, b.arg], ['fener', null]);
  assert.deepStrictEqual([c.kimlik, c.arg], [undefined, 'gece, liman']);
  assert.ok(temiz('::sahne liman: gece\n::').includes('id="sahne-liman"'));
});

test('çekmece ve özet temizde yok, kelimeye girmez', () => {
  const metin = 'bir iki\n\n::çekmece\nüç dört beş\n::\n::özet\naltı\n::';
  assert.ok(!temiz(metin).includes('üç'));
  assert.ok(!temiz(metin).includes('altı'));
  assert.ok(calisma(metin).includes('mrk-cekmece'));
  const ist = M.istatistik(M.ayristir(metin));
  assert.deepStrictEqual([ist.kelime, ist.cekmeceler], [2, 1]);
});

test('karakter kartı', () => {
  const b = M.ayristir('::kişi Ece\nyaş: 24\nmemleket: Kuzey\nDenizden korkar.\n::\n@Ece: Selam');
  assert.deepStrictEqual(b.kisiler.Ece.alanlar, { yaş: '24', memleket: 'Kuzey' });
  assert.strictEqual(b.cocuklar[0].cocuklar[0].tur, 'paragraf');
  const h = temiz('::kişi Ece\nyaş: 24\n::\n@Ece: Selam');
  assert.ok(h.includes('<aside class="mrk-kisi-karti" data-kisi="Ece">'));
  assert.ok(h.includes('<span class="mrk-konusan" data-kisi="Ece">'));
});

test('zaman çizelgesi', () => {
  const z = sade('::zaman\n412 | Liman kuruldu\n419 | Fener *yandı*\n::').cocuklar[0];
  assert.strictEqual(z.olaylar.length, 2);
  assert.strictEqual(z.olaylar[0].tarih[0].deger, '412');
  assert.strictEqual(z.olaylar[1].olay[1].tur, 'kalin');
});

test('sütunlar ve satır numaraları', () => {
  const b = M.ayristir('x\n::sütunlar\nsol\n::not\niç\n||\n::\n||\nsağ\n::\nson');
  const s = b.cocuklar[1];
  assert.strictEqual(s.tur, 'sutunlar');
  assert.strictEqual(s.sutunlar.length, 2); // not bloğunun içindeki || bölmez
  assert.strictEqual(s.sutunlar[1][0].satir, 9);
  assert.strictEqual(b.cocuklar[2].satirlar[0][0].deger, 'son');
});

test('dosya dahil etme', () => {
  const dosyalar = {
    'kitap/bolumler/1.mrk': '::meta\nbaşlık: ezilmemeli\nyazar: Ece\n::\n= Bir\n![[../ortak.mrk]]',
    'kitap/ortak.mrk': '::kişi Ece\n::\n::sahne liman\n::',
    'kitap/dongu.mrk': '![[dongu.mrk]]',
  };
  const oku = (yol) => dosyalar[yol] ?? null;
  const b = M.ayristir('::meta\nbaşlık: Kitap\n::\n![[bolumler/1.mrk]]\n![[yok.mrk]]\n![[dongu.mrk]]', { dosya: 'kitap/ana.mrk', dahilOku: oku });
  const [bir, yok, dongu] = b.cocuklar;
  assert.strictEqual(bir.yol, 'kitap/bolumler/1.mrk');
  assert.strictEqual(bir.cocuklar[1].cocuklar[0].ad, 'kişi');
  assert.deepStrictEqual([b.meta['başlık'], b.meta.yazar], ['Kitap', 'Ece']);
  assert.ok(b.kisiler.Ece);
  assert.strictEqual(yok.hata, 'bulunamadı');
  assert.strictEqual(dongu.cocuklar[0].hata, 'döngü');
  assert.strictEqual(M.ayristir('![[x.mrk]]').cocuklar[0].hata, 'okunamıyor');
  assert.ok(M.sahneler(b).has('liman'));
});

test('kontrol uyarıları', () => {
  const metin = [
    '::sahne a', '-> git => b', '-> kır => yok ?anahtar', '::',
    '::sahne b', '$anahtar', '-> aç => a ?anahtar ?hayalet', '::',
    '::sahne b', '::',
    '{$tanimsiz} {$anahtar}',
  ].join('\n');
  const mesajlar = M.kontrol(M.ayristir(metin)).map((u) => `${u.satir}: ${u.mesaj}`);
  assert.deepStrictEqual(mesajlar, [
    '3: "yok" adında bir sahne yok',
    '5: "b" adında birden fazla sahne var',
    '7: "hayalet" bayrağı hiçbir yerde konmuyor',
    '9: "b" adında birden fazla sahne var',
    '11: {$tanimsiz} tanımlı değil',
  ]);
});

test('oynat için değişkenler meta\'nın üstüne yazılır', () => {
  const b = M.ayristir('::meta\naltın: 0\n::\n{$altın} altın');
  assert.ok(M.html(b, { degiskenler: { altın: '5' } }).includes('5 altın'));
});

test('istatistik', () => {
  const ist = M.istatistik(M.ayristir('::meta\nhedef: 100\n::\nbir iki {üç | dört beş} ~~altı~~ ?? >> not\n>? soru'));
  assert.strictEqual(ist.kelime, 3);
  assert.strictEqual(ist.hedef, 100);
  assert.deepStrictEqual([ist.notlar, ist.sorular, ist.bosluklar, ist.cizikler, ist.alternatifler], [1, 1, 1, 1, 1]);
});

console.log(`\n${gecen} test geçti${kalan ? `, ${kalan} test kaldı` : ''}.`);
process.exit(kalan ? 1 : 0);
