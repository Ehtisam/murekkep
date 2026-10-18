# Mürekkep önizlemesi: .mrk dosyasının yanında Sublime'ın kendi HTML sekmesinde temiz okuma.
#
# - .mrk dosyası açılınca önizleme kendiliğinden sağda açılır (ayar: murekkep_onizleme_otomatik)
# - Yazdıkça güncellenir, kaydetmek gerekmez
# - Önizlemedeki bağlantılar (Temiz/Çalışma, başlıklar, uyarılar) murekkep_eylem komutunu çalıştırır
# - Metni HTML'e çevirme işini onizleme.js yapar (parser tek: murekkep.js)

import json
import os
import subprocess

import sublime
import sublime_plugin

# Paket Packages klasörüne bağlantı (junction) olarak kurulu; gerçek yer repodaki klasör
PAKET_YERI = os.path.realpath(os.path.dirname(__file__))
ONIZLEYICI = os.path.join(PAKET_YERI, 'onizleme.js')
KOPRU = os.path.join(PAKET_YERI, 'mrk-kopru.js')

# kaynak görünüm kimliği -> { sheet, mod, sira, kapatildi }
onizlemeler = {}
# Bölmeyi biz ikiye ayırdıysak, iş bitince geri toplamak için
duzeni_biz_actik = set()


def mrk_mi(view):
    return view is not None and view.is_valid() and view.match_selector(0, 'text.murekkep')


def ayar(view, ad, varsayilan):
    return view.settings().get(ad, varsayilan)


def gizli_pencere():
    # Windows'ta node çalışırken siyah konsol penceresi açılmasın
    if os.name != 'nt':
        return {}
    bilgi = subprocess.STARTUPINFO()
    bilgi.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return {'startupinfo': bilgi, 'creationflags': 0x08000000}


def node_calistir(view, betik, argumanlar, girdi=None):
    komut = [ayar(view, 'murekkep_node', 'node'), betik] + argumanlar
    sonuc = subprocess.run(
        komut,
        input=girdi.encode('utf-8') if girdi is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=15,
        **gizli_pencere()
    )
    return sonuc.stdout.decode('utf-8', 'replace'), sonuc.stderr.decode('utf-8', 'replace')


def sheet_acik(sheet):
    return sheet is not None and sheet.window() is not None


def onizleme_adi(view):
    ad = os.path.basename(view.file_name()) if view.file_name() else (view.name() or 'adsız')
    return '◉ ' + os.path.splitext(ad)[0]


def onizlemeyi_ac(view):
    window = view.window()
    if window is None:
        return
    kayit = onizlemeler.get(view.id())
    if kayit and sheet_acik(kayit['sheet']):
        return

    # Önizleme, yazının olduğu bölmenin yanındaki bölmeye gider; tek bölme varsa ikiye ayır
    if window.num_groups() == 1:
        window.set_layout({'cols': [0.0, 0.5, 1.0], 'rows': [0.0, 1.0], 'cells': [[0, 0, 1, 1], [1, 0, 2, 1]]})
        duzeni_biz_actik.add(window.id())
    grup, _ = window.get_view_index(view)
    hedef_grup = (grup + 1) % window.num_groups()

    sheet = window.new_html_sheet(onizleme_adi(view), '<p>…</p>', group=hedef_grup)
    mod = kayit['mod'] if kayit else ayar(view, 'murekkep_onizleme_mod', 'temiz')
    onizlemeler[view.id()] = {'sheet': sheet, 'mod': mod, 'sira': 0, 'kapatildi': False}
    window.focus_view(view)
    ciz_iste(view, gecikme=0)


def onizlemeyi_kapat(view_id):
    kayit = onizlemeler.pop(view_id, None)
    if not kayit or not sheet_acik(kayit['sheet']):
        return
    sheet = kayit['sheet']
    window = sheet.window()
    try:
        sheet.close()
    except AttributeError:
        window.focus_sheet(sheet)
        window.run_command('close_file')
    sublime.set_timeout(lambda: duzeni_topla(window), 50)


def duzeni_topla(window):
    # Bölmeyi biz açtıysak ve sağ taraf boş kaldıysa tek bölmeye dön
    if window is None or window.id() not in duzeni_biz_actik or window.num_groups() != 2:
        return
    if not window.sheets_in_group(1):
        window.set_layout({'cols': [0.0, 1.0], 'rows': [0.0, 1.0], 'cells': [[0, 0, 1, 1]]})
        duzeni_biz_actik.discard(window.id())


def ciz_iste(view, gecikme=250):
    # Hızlı yazarken her tuşta değil, yazma durunca bir kez çiz
    kayit = onizlemeler.get(view.id())
    if not kayit:
        return
    kayit['sira'] += 1
    sira = kayit['sira']
    sublime.set_timeout_async(lambda: ciz(view, sira), gecikme)


def ciz(view, sira):
    kayit = onizlemeler.get(view.id())
    if not kayit or kayit['sira'] != sira or not view.is_valid():
        return
    if not sheet_acik(kayit['sheet']):
        # Önizleme sekmesini kullanıcı kapattı: bu dosya için bir daha kendiliğinden açma
        kayit['kapatildi'] = True
        return
    metin = view.substr(sublime.Region(0, view.size()))
    argumanlar = ['--gorunum', str(view.id()), '--mod', kayit['mod']]
    if view.file_name():
        argumanlar += ['--dosya', view.file_name()]
    try:
        cikti, hata = node_calistir(view, ONIZLEYICI, argumanlar, metin)
        sonuc = json.loads(cikti) if cikti else {'hata': hata or 'node çıktı vermedi'}
    except FileNotFoundError:
        sonuc = {'hata': 'node bulunamadı. Node.js kurulu mu? Ayarlardan "murekkep_node" ile yolunu verebilirsin.'}
    except Exception as e:
        sonuc = {'hata': str(e)}
    if kayit['sira'] != sira:
        return
    if 'html' in sonuc:
        kayit['sheet'].set_contents(sonuc['html'])
    else:
        mesaj = sonuc['hata'].replace('&', '&amp;').replace('<', '&lt;').replace('\n', '<br>')
        kayit['sheet'].set_contents('<p style="color: var(--redish)">Önizleme çizilemedi</p><p>{}</p>'.format(mesaj))


def tarayicida_ac(view, mod):
    if not view.file_name():
        sublime.status_message('Mürekkep: tarayıcıda açmak için önce dosyayı kaydet')
        return
    if view.is_dirty():
        view.run_command('save')
    argumanlar = [view.file_name(), '--ac'] + (['--calisma'] if mod == 'calisma' else [])

    def calistir():
        cikti, hata = node_calistir(view, KOPRU, argumanlar)
        sublime.status_message('Mürekkep: ' + (cikti.strip() or hata.strip()))

    sublime.set_timeout_async(calistir, 0)


def satira_git(view, satir):
    window = view.window()
    if window:
        window.focus_view(view)
    nokta = view.text_point(max(0, satir - 1), 0)
    view.sel().clear()
    view.sel().add(sublime.Region(nokta))
    view.show_at_center(nokta)


# ------------------------------------------------------------------
# Olaylar
# ------------------------------------------------------------------

class MurekkepDinleyici(sublime_plugin.EventListener):
    def on_activated_async(self, view):
        if not mrk_mi(view) or not ayar(view, 'murekkep_onizleme_otomatik', True):
            return
        kayit = onizlemeler.get(view.id())
        if kayit and (kayit['kapatildi'] or sheet_acik(kayit['sheet'])):
            return
        sublime.set_timeout(lambda: onizlemeyi_ac(view), 0)

    def on_modified_async(self, view):
        if view.id() in onizlemeler:
            ciz_iste(view)

    def on_post_save_async(self, view):
        if view.id() in onizlemeler:
            ciz_iste(view, gecikme=0)

    def on_pre_close(self, view):
        if view.id() in onizlemeler:
            vid = view.id()
            sublime.set_timeout(lambda: onizlemeyi_kapat(vid), 0)


# ------------------------------------------------------------------
# Komutlar (komut paleti ve sağ tık menüsü)
# ------------------------------------------------------------------

class MurekkepOnizlemeCommand(sublime_plugin.TextCommand):
    """Önizlemeyi açar ya da kapatır."""

    def run(self, edit):
        kayit = onizlemeler.get(self.view.id())
        if kayit and sheet_acik(kayit['sheet']):
            onizlemeyi_kapat(self.view.id())
            # Elle kapatıldı: bu dosyada kendiliğinden yeniden açılmasın
            onizlemeler[self.view.id()] = {'sheet': None, 'mod': kayit['mod'], 'sira': 0, 'kapatildi': True}
        else:
            onizlemeyi_ac(self.view)

    def is_enabled(self):
        return mrk_mi(self.view)

    def is_visible(self):
        return mrk_mi(self.view)


class MurekkepModCommand(sublime_plugin.TextCommand):
    """Önizlemede temiz okuma ile çalışma modu arasında geçer."""

    def run(self, edit):
        kayit = onizlemeler.get(self.view.id())
        if not kayit or not sheet_acik(kayit['sheet']):
            onizlemeyi_ac(self.view)
            kayit = onizlemeler.get(self.view.id())
        kayit['mod'] = 'calisma' if kayit['mod'] == 'temiz' else 'temiz'
        ciz_iste(self.view, gecikme=0)

    def is_visible(self):
        return mrk_mi(self.view)


class MurekkepTarayicidaAcCommand(sublime_plugin.TextCommand):
    """Tam görünüm: HTML üretip tarayıcıda açar."""

    def run(self, edit, mod=None):
        kayit = onizlemeler.get(self.view.id())
        tarayicida_ac(self.view, mod or (kayit['mod'] if kayit else 'temiz'))

    def is_visible(self):
        return mrk_mi(self.view)


class MurekkepDerleCommand(sublime_plugin.TextCommand):
    """Murekkep.sublime-build'deki bir seçeneği çalıştırır (Kontrol, İstatistik, JSON)."""

    def run(self, edit, secenek):
        if self.view.is_dirty() and self.view.file_name():
            self.view.run_command('save')
        self.view.window().run_command('build', {'build_system': 'Packages/Murekkep/Murekkep.sublime-build', 'variant': secenek})

    def is_visible(self, secenek=None):
        return mrk_mi(self.view)


class MurekkepEylemCommand(sublime_plugin.WindowCommand):
    """Önizlemedeki bağlantılar bunu çağırır."""

    def run(self, gorunum, eylem, mod=None, satir=None, dosya=None, hedef=None):
        view = sublime.View(gorunum)
        if not view.is_valid():
            return
        if eylem == 'mod':
            kayit = onizlemeler.get(gorunum)
            if kayit:
                kayit['mod'] = mod
                ciz_iste(view, gecikme=0)
        elif eylem == 'tarayici':
            kayit = onizlemeler.get(gorunum)
            tarayicida_ac(view, kayit['mod'] if kayit else 'temiz')
        elif eylem == 'git' and satir:
            if dosya and view.file_name():
                # Uyarı dahil edilen başka bir dosyada
                yol = os.path.join(os.path.dirname(view.file_name()), dosya)
                self.window.open_file('{}:{}'.format(yol, satir), sublime.ENCODED_POSITION)
            else:
                satira_git(view, satir)
        elif eylem == 'not' and hedef:
            # [[not]] bağlantısı: aynı klasörde hedef.mrk ya da hedef
            if not view.file_name():
                return
            klasor = os.path.dirname(view.file_name())
            for aday in (hedef, hedef + '.mrk'):
                yol = os.path.join(klasor, aday)
                if os.path.isfile(yol):
                    self.window.open_file(yol)
                    return
            sublime.status_message('Mürekkep: "{}" bulunamadı'.format(hedef))
