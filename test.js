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
  assert.strictEqual(temiz('::meta\nad: Ece\n::\nSelam {$ad}, {$yok}'), '<article class="mrk mrk-temiz">\n<p>Selam Ece, <span class="mrk-eksik" title="meta\'da yok">{$yok}</span></p>\n</article>');
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

test('istatistik', () => {
  const ist = M.istatistik(M.ayristir('::meta\nhedef: 100\n::\nbir iki {üç | dört beş} ~~altı~~ ?? >> not\n>? soru'));
  assert.strictEqual(ist.kelime, 3);
  assert.strictEqual(ist.hedef, 100);
  assert.deepStrictEqual([ist.notlar, ist.sorular, ist.bosluklar, ist.cizikler, ist.alternatifler], [1, 1, 1, 1, 1]);
});

console.log(`\n${gecen} test geçti${kalan ? `, ${kalan} test kaldı` : ''}.`);
process.exit(kalan ? 1 : 0);
