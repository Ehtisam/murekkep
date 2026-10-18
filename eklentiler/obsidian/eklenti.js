// Mürekkep Obsidian eklentisi.
//
// Bu dosya tek başına çalışmaz: derle.js onu murekkep.js ve vurgulayici.js ile birleştirip
// main.js üretir. Burada `obsidian`, `Murekkep` ve `Vurgulayici` hazır gelir.
//
// Ne yapar:
//   - .mrk dosyalarını kendi görünümüyle açar: okuma (kâğıt) ya da düzenleme (yazı + kâğıt)
//   - .md notlarının içindeki ```mrk kod bloklarını Mürekkep olarak çizer
//   - [[not]] bağlantıları Obsidian'ın içinde açılır, üstüne gelince önizleme çıkar
//   - ![[dosya.mrk]] dahil etme kasadaki dosyalardan okunur
//   - matematik Obsidian'ın kendi MathJax'ıyla çizilir

const { Plugin, TextFileView, PluginSettingTab, Setting, Notice, TFile, TFolder, Keymap, normalizePath, loadMathJax, renderMath, finishRenderMath } = obsidian;

const GORUNUM_TURU = 'murekkep';
const VARSAYILAN_AYARLAR = { mod: 'temiz', acilis: 'duzenleme' };

const kac = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Formüller önce yer tutucu olarak yazılır, HTML sayfaya girince MathJax ile değiştirilir.
const matematikYerTutucu = (tex, blok) => `<span class="mrk-mat-yer" data-blok="${blok ? 1 : 0}" data-tex="${kac(tex)}"></span>`;

async function matematigiCiz(kutu) {
  const yerler = kutu.querySelectorAll('.mrk-mat-yer');
  if (!yerler.length) return;
  await loadMathJax();
  for (const yer of yerler) {
    try {
      yer.replaceWith(renderMath(yer.dataset.tex, yer.dataset.blok === '1'));
    } catch (e) {
      yer.textContent = yer.dataset.tex;
    }
  }
  await finishRenderMath();
}

// ------------------------------------------------------------------
// .mrk görünümü
// ------------------------------------------------------------------

class MurekkepGorunumu extends TextFileView {
  constructor(leaf, eklenti) {
    super(leaf);
    this.eklenti = eklenti;
    this.mod = eklenti.ayarlar.mod;
    this.duzenleme = eklenti.ayarlar.acilis === 'duzenleme';
    this.cizimSirasi = 0;
    this.cizimZamanlayici = null;
  }

  getViewType() { return GORUNUM_TURU; }
  getDisplayText() { return this.file ? this.file.basename : 'Mürekkep'; }
  getIcon() { return 'feather'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('murekkep-gorunum');

    this.yazi = this.contentEl.createDiv({ cls: 'mrk-yazi' });
    this.vurgu = this.yazi.createEl('pre', { cls: 'mrk-vurgu', attr: { 'aria-hidden': 'true' } });
    this.kaynak = this.yazi.createEl('textarea', { cls: 'mrk-kaynak', attr: { spellcheck: 'false', 'aria-label': 'Mürekkep kaynağı' } });
    this.sag = this.contentEl.createDiv({ cls: 'mrk-sag' });
    this.bilgi = this.sag.createDiv({ cls: 'mrk-bilgi' });
    this.kagit = this.sag.createDiv({ cls: 'mrk-kagit' });

    this.duzenleDugmesi = this.addAction('pencil', 'Düzenle / oku', () => this.duzenlemeyiDegistir());
    this.modDugmesi = this.addAction('eye', 'Temiz / çalışma', () => this.moduDegistir());

    this.kaynak.addEventListener('input', () => {
      this.data = this.kaynak.value;
      this.vurgulamayiGuncelle();
      this.requestSave();
      this.cizimIste();
    });
    this.kaynak.addEventListener('scroll', () => { this.vurgu.scrollTop = this.kaynak.scrollTop; });
    this.kaynak.addEventListener('keydown', (e) => this.tusaBasildi(e));

    this.kagit.addEventListener('click', (e) => this.kagittaTiklama(e));
    // Okurken bir yere çift tıklayınca düzenlemeye geçip o satıra git
    this.kagit.addEventListener('dblclick', (e) => {
      const el = e.target.closest('[data-satir]');
      if (!this.duzenleme) this.duzenlemeyiDegistir();
      if (el) this.satiraGit(Number(el.dataset.satir));
    });
    this.bilgi.addEventListener('click', (e) => {
      if (e.target.closest('.mrk-bilgi-dugme')) this.duzenlemeyiDegistir();
    });
    this.kagit.addEventListener('mouseover', (e) => this.kagittaUzerine(e));
    this.kagit.addEventListener('mouseout', (e) => { if (e.target.closest('[data-kisi]')) this.kisiKartiniKapat(); });

    this.registerDomEvent(window, 'resize', () => this.vurgulamayiGuncelle());
    this.duzeniUygula();

    // Dosya, görünüm kurulmadan önce yüklendiyse şimdi göster
    if (this.data) {
      this.kaynak.value = this.data;
      this.vurgulamayiGuncelle();
      this.ciz();
    }
  }

  async onClose() {
    this.kisiKartiniKapat();
    this.contentEl.empty();
  }

  // --- TextFileView sözleşmesi ---

  getViewData() { return this.data; }

  setViewData(data, temizle) {
    this.data = data;
    if (this.kaynak && this.kaynak.value !== data) {
      const { selectionStart, selectionEnd } = this.kaynak;
      this.kaynak.value = data;
      if (!temizle) this.kaynak.setSelectionRange(selectionStart, selectionEnd);
    }
    this.vurgulamayiGuncelle();
    this.ciz();
  }

  clear() {
    this.data = '';
    if (this.kaynak) this.kaynak.value = '';
  }

  // --- Görünüm ---

  duzeniUygula() {
    this.contentEl.toggleClass('mrk-duzenleme', this.duzenleme);
    this.contentEl.toggleClass('mrk-okuma', !this.duzenleme);
    this.duzenleDugmesi.toggleClass('is-active', this.duzenleme);
    this.modDugmesi.toggleClass('is-active', this.mod === 'calisma');
    this.modDugmesi.setAttribute('aria-label', this.mod === 'calisma' ? 'Temiz okumaya geç' : 'Çalışma moduna geç');
    if (this.duzenleme) {
      this.vurgulamayiGuncelle();
      setTimeout(() => this.kaynak.focus(), 0);
    }
    if (this.belge) this.bilgiyiCiz(this.belge);
  }

  satiraGit(n) {
    const metin = this.kaynak.value;
    let bas = 0;
    for (let i = 1; i < n && bas !== -1; i++) bas = metin.indexOf('\n', bas) + 1 || -1;
    if (bas === -1) bas = metin.length;
    let son = metin.indexOf('\n', bas);
    if (son === -1) son = metin.length;
    this.kaynak.focus();
    this.kaynak.setSelectionRange(son, son);
    const satirEl = this.vurgu.querySelectorAll('.sl')[n - 1];
    if (satirEl) this.kaynak.scrollTop = Math.max(0, satirEl.offsetTop - this.kaynak.clientHeight / 3);
  }

  duzenlemeyiDegistir() {
    this.duzenleme = !this.duzenleme;
    this.duzeniUygula();
  }

  moduDegistir() {
    this.mod = this.mod === 'temiz' ? 'calisma' : 'temiz';
    this.duzeniUygula();
    this.ciz();
  }

  vurgulamayiGuncelle() {
    if (!this.vurgu || !this.duzenleme) return;
    this.vurgu.innerHTML = Vurgulayici.vurgula(this.kaynak.value);
    this.vurgu.scrollTop = this.kaynak.scrollTop;
  }

  cizimIste() {
    clearTimeout(this.cizimZamanlayici);
    this.cizimZamanlayici = setTimeout(() => this.ciz(), 120);
  }

  async ciz() {
    if (!this.kagit) return;
    const sira = ++this.cizimSirasi;
    const metin = this.data || '';
    const dosyaYolu = this.file ? this.file.path : '';
    const dosyalar = await this.eklenti.dahilleriOku(metin, dosyaYolu);
    if (sira !== this.cizimSirasi) return; // bu arada yeni bir çizim istendi

    const belge = Murekkep.ayristir(metin, { dosya: dosyaYolu, dahilOku: (yol) => (dosyalar.has(yol) ? dosyalar.get(yol) : null) });
    this.belge = belge;
    this.kisiKartlari = new Map();
    Murekkep.gez(belge.cocuklar, (d) => {
      if (d.tur === 'blok' && d.ad === 'kişi' && d.arg) this.kisiKartlari.set(d.arg, d);
    });

    this.kagit.innerHTML = Murekkep.html(belge, { mod: this.mod, matematik: matematikYerTutucu, icBaglanti: (h) => h, konum: true });
    for (const a of this.kagit.querySelectorAll('a.mrk-ic')) a.addClass('internal-link');
    await matematigiCiz(this.kagit);
    this.bilgiyiCiz(belge);
    this.eklenti.durumCubugunuGuncelle();
  }

  bilgiyiCiz(belge) {
    const ist = Murekkep.istatistik(belge);
    const uyarilar = Murekkep.kontrol(belge);
    this.istatistik = ist;
    const parcalar = [ist.hedef ? `${ist.kelime} / ${ist.hedef} kelime` : `${ist.kelime} kelime`];
    if (ist.sorular) parcalar.push(`<span class="mrk-bilgi-is">${ist.sorular} soru</span>`);
    if (ist.bosluklar) parcalar.push(`<span class="mrk-bilgi-is">${ist.bosluklar} boşluk</span>`);
    if (ist.notlar) parcalar.push(`${ist.notlar} not`);
    if (ist.alternatifler) parcalar.push(`${ist.alternatifler} alternatif`);
    if (uyarilar.length) {
      const liste = uyarilar.map((u) => `${u.dosya || 'bu dosya'}:${u.satir}  ${u.mesaj}`).join('\n');
      parcalar.push(`<span class="mrk-bilgi-is" title="${kac(liste)}">${uyarilar.length} uyarı</span>`);
    }
    const dugme = this.duzenleme
      ? '<button class="mrk-bilgi-dugme" title="Sadece kâğıdı göster">Oku</button>'
      : '<button class="mrk-bilgi-dugme mod-cta" title="Yazı ve kâğıdı yan yana aç (ya da kâğıtta çift tıkla)">Düzenle</button>';
    this.bilgi.innerHTML = dugme + '<span>' + parcalar.join(' · ') + '</span>';
  }

  // --- Kâğıtta etkileşim ---

  kagittaTiklama(e) {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.classList.contains('mrk-ic')) {
      e.preventDefault();
      this.app.workspace.openLinkText(a.dataset.hedef, this.file ? this.file.path : '', Keymap.isModEvent(e));
    } else if (a.classList.contains('mrk-dis')) {
      e.preventDefault();
      window.open(a.href, '_blank');
    }
  }

  kagittaUzerine(e) {
    const a = e.target.closest('a.mrk-ic');
    if (a) {
      this.app.workspace.trigger('hover-link', {
        event: e,
        source: GORUNUM_TURU,
        hoverParent: this,
        targetEl: a,
        linktext: a.dataset.hedef,
        sourcePath: this.file ? this.file.path : '',
      });
      return;
    }
    const el = e.target.closest('[data-kisi]');
    if (!el || el.tagName === 'ASIDE' || !this.kisiKartlari) return;
    const kart = this.kisiKartlari.get(el.dataset.kisi);
    if (!kart) return;
    this.kisiKartiniKapat();
    const kutu = document.body.createDiv({ cls: 'murekkep-gorunum mrk-kisi-ipucu' });
    kutu.innerHTML = Murekkep.html({ meta: this.belge.meta, cocuklar: [kart], dipnotlar: [] }, { mod: this.mod });
    const r = el.getBoundingClientRect();
    const kr = kutu.getBoundingClientRect();
    kutu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - kr.width - 8)) + 'px';
    kutu.style.top = (r.bottom + 6 + kr.height > window.innerHeight ? Math.max(8, r.top - kr.height - 6) : r.bottom + 6) + 'px';
    this.kisiKarti = kutu;
  }

  kisiKartiniKapat() {
    if (this.kisiKarti) this.kisiKarti.remove();
    this.kisiKarti = null;
  }

  // --- Yazarken kolaylıklar (editor.html ile aynı) ---

  metniDegistir(bas, son, yeni) {
    this.kaynak.focus();
    this.kaynak.setSelectionRange(bas, son);
    if (!document.execCommand('insertText', false, yeni)) {
      this.kaynak.setRangeText(yeni, bas, son, 'end');
      this.kaynak.dispatchEvent(new Event('input'));
    }
  }

  tusaBasildi(e) {
    const k = this.kaynak;
    const ctrl = e.ctrlKey || e.metaKey;
    const satirBas = k.value.lastIndexOf('\n', k.selectionStart - 1) + 1;
    let satirSon = k.value.indexOf('\n', k.selectionStart);
    if (satirSon === -1) satirSon = k.value.length;
    const satir = k.value.slice(satirBas, satirSon);

    if (e.key === 'Tab' && !ctrl) {
      e.preventDefault();
      if (e.shiftKey) {
        const kalan = satir.replace(/^ {1,2}/, '');
        if (kalan !== satir) this.metniDegistir(satirBas, satirSon, kalan);
      } else {
        this.metniDegistir(k.selectionStart, k.selectionEnd, '  ');
      }
      return;
    }

    if (e.key === 'Enter' && !ctrl && !e.shiftKey && k.selectionStart === k.selectionEnd && k.selectionStart === satirSon) {
      const m = /^(\s*)([-+|]|\[[ x~-]\])\s(.*)$/.exec(satir);
      if (!m) return;
      e.preventDefault();
      if (!m[3].trim()) this.metniDegistir(satirBas, satirSon, '');
      else this.metniDegistir(satirSon, satirSon, `\n${m[1]}${m[2].startsWith('[') ? '[ ]' : m[2]} `);
      return;
    }

    if (ctrl && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault();
      const isaret = e.key === 'b' ? '*' : '/';
      const a = k.selectionStart;
      const secili = k.value.slice(a, k.selectionEnd);
      this.metniDegistir(a, k.selectionEnd, isaret + secili + isaret);
      if (!secili) k.setSelectionRange(a + 1, a + 1);
    }
  }
}

// ------------------------------------------------------------------
// Ayarlar
// ------------------------------------------------------------------

class MurekkepAyarlari extends PluginSettingTab {
  constructor(app, eklenti) {
    super(app, eklenti);
    this.eklenti = eklenti;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Varsayılan mod')
      .setDesc('Temiz okuma notları ve çizikleri gizler. Çalışma modu hepsini gösterir.')
      .addDropdown((d) =>
        d
          .addOption('temiz', 'Temiz okuma')
          .addOption('calisma', 'Çalışma')
          .setValue(this.eklenti.ayarlar.mod)
          .onChange(async (v) => {
            this.eklenti.ayarlar.mod = v;
            await this.eklenti.saveData(this.eklenti.ayarlar);
          })
      );

    new Setting(containerEl)
      .setName('Dosya açılınca')
      .setDesc('Düzenleme, yazıyla kâğıdı yan yana açar. Okuma sadece kâğıdı gösterir; kâğıtta çift tıklayınca düzenlemeye geçer.')
      .addDropdown((d) =>
        d
          .addOption('okuma', 'Okuma')
          .addOption('duzenleme', 'Düzenleme')
          .setValue(this.eklenti.ayarlar.acilis)
          .onChange(async (v) => {
            this.eklenti.ayarlar.acilis = v;
            await this.eklenti.saveData(this.eklenti.ayarlar);
          })
      );
  }
}

// ------------------------------------------------------------------
// Eklenti
// ------------------------------------------------------------------

class MurekkepEklentisi extends Plugin {
  async onload() {
    this.ayarlar = Object.assign({}, VARSAYILAN_AYARLAR, await this.loadData());

    this.registerView(GORUNUM_TURU, (leaf) => new MurekkepGorunumu(leaf, this));
    this.registerExtensions(['mrk'], GORUNUM_TURU);
    this.registerHoverLinkSource(GORUNUM_TURU, { display: 'Mürekkep', defaultMod: true });
    this.addSettingTab(new MurekkepAyarlari(this.app, this));

    // .md notlarının içinde ```mrk bloğu
    this.registerMarkdownCodeBlockProcessor('mrk', async (kaynak, el, ctx) => {
      el.addClass('murekkep-gorunum', 'mrk-gomulu');
      const dosyalar = await this.dahilleriOku(kaynak, ctx.sourcePath);
      const belge = Murekkep.ayristir(kaynak, { dosya: ctx.sourcePath, dahilOku: (y) => (dosyalar.has(y) ? dosyalar.get(y) : null) });
      el.innerHTML = Murekkep.html(belge, { mod: this.ayarlar.mod, matematik: matematikYerTutucu, icBaglanti: (h) => h });
      for (const a of el.querySelectorAll('a.mrk-ic')) {
        a.addClass('internal-link');
        a.addEventListener('click', (e) => {
          e.preventDefault();
          this.app.workspace.openLinkText(a.dataset.hedef, ctx.sourcePath, Keymap.isModEvent(e));
        });
      }
      await matematigiCiz(el);
    });

    this.addCommand({
      id: 'yeni-belge',
      name: 'Yeni Mürekkep belgesi',
      callback: () => this.yeniBelge(),
    });
    this.addCommand({
      id: 'duzenle-oku',
      name: 'Düzenle / oku',
      checkCallback: (kontrol) => this.etkinGorunumle(kontrol, (g) => g.duzenlemeyiDegistir()),
    });
    this.addCommand({
      id: 'mod',
      name: 'Temiz okuma / çalışma modu',
      checkCallback: (kontrol) => this.etkinGorunumle(kontrol, (g) => g.moduDegistir()),
    });
    this.addCommand({
      id: 'kontrol',
      name: 'Kontrol: kopuk seçenekler, tanımsız bayraklar',
      checkCallback: (kontrol) =>
        this.etkinGorunumle(kontrol, (g) => {
          const uyarilar = g.belge ? Murekkep.kontrol(g.belge) : [];
          new Notice(uyarilar.length ? uyarilar.map((u) => `${u.dosya || g.file.name}:${u.satir}  ${u.mesaj}`).join('\n') : 'Sorun yok.', 8000);
        }),
    });

    // Dosya gezgininde klasöre sağ tıklayınca
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, dosya) => {
        const klasor = dosya instanceof TFolder ? dosya : dosya.parent;
        menu.addItem((oge) => oge.setTitle('Yeni Mürekkep belgesi').setIcon('feather').onClick(() => this.yeniBelge(klasor)));
      })
    );

    // Durum çubuğu: etkin .mrk dosyasının kelime sayısı
    this.durumOgesi = this.addStatusBarItem();
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.durumCubugunuGuncelle()));
  }

  etkinGorunumle(sadeceKontrol, islem) {
    const g = this.app.workspace.getActiveViewOfType(MurekkepGorunumu);
    if (!g) return false;
    if (!sadeceKontrol) islem(g);
    return true;
  }

  durumCubugunuGuncelle() {
    if (!this.durumOgesi) return;
    const g = this.app.workspace.getActiveViewOfType(MurekkepGorunumu);
    const ist = g && g.istatistik;
    this.durumOgesi.setText(ist ? (ist.hedef ? `${ist.kelime} / ${ist.hedef} kelime` : `${ist.kelime} kelime`) : '');
  }

  async yeniBelge(klasor) {
    if (!klasor) {
      const etkin = this.app.workspace.getActiveFile();
      klasor = etkin ? etkin.parent : this.app.vault.getRoot();
    }
    const taban = klasor.isRoot() ? '' : klasor.path + '/';
    let ad = 'Adsız.mrk';
    for (let n = 2; this.app.vault.getAbstractFileByPath(normalizePath(taban + ad)); n++) ad = `Adsız ${n}.mrk`;
    const dosya = await this.app.vault.create(normalizePath(taban + ad), '::meta\nbaşlık: \n::\n\n= \n');
    const yaprak = this.app.workspace.getLeaf(false);
    await yaprak.openFile(dosya);
    const g = yaprak.view;
    if (g instanceof MurekkepGorunumu && !g.duzenleme) g.duzenlemeyiDegistir();
  }

  // ![[dosya.mrk]] satırlarını izleyip dahil edilen dosyaları önceden okur (parser eşzamanlı çalışır,
  // Obsidian'da dosya okumak ise eşzamansız). Yol -> metin haritası döndürür; bulunamayan null.
  async dahilleriOku(metin, kaynakYol) {
    const harita = new Map();
    const kuyruk = [[metin, kaynakYol]];
    let okunan = 0;
    while (kuyruk.length && okunan < 64) {
      const [m, yol] = kuyruk.shift();
      for (const satir of m.split('\n')) {
        const e = Murekkep.DAHIL_SATIRI.exec(satir);
        if (!e) continue;
        const hedef = Murekkep.yol.birlestir(Murekkep.yol.dizin(yol), e[1]);
        if (harita.has(hedef)) continue;
        // Önce göreli yol, bulunamazsa Obsidian'ın kendi bağlantı çözümü (dosya adına göre)
        let dosya = this.app.vault.getAbstractFileByPath(normalizePath(hedef));
        if (!(dosya instanceof TFile)) dosya = this.app.metadataCache.getFirstLinkpathDest(e[1], yol);
        const icerik = dosya instanceof TFile ? await this.app.vault.cachedRead(dosya) : null;
        harita.set(hedef, icerik);
        if (icerik !== null) {
          kuyruk.push([icerik, hedef]);
          okunan++;
        }
      }
    }
    return harita;
  }
}

module.exports = MurekkepEklentisi;
