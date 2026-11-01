/* ============================================================
   KASKU - app.js
   Frontend: input cepat, dashboard, grafik, riwayat, PIN.
   ============================================================ */
(() => {
'use strict';

/* ---------- Konfigurasi & util ---------- */
const CFG = window.KASKU_CONFIG || {};
const K = {
  kunci: 'kasku.kunci', pin: 'kasku.pin', garam: 'kasku.garam', cache: 'kasku.cache',
  sumber: 'kasku.sumberTerakhir', jenis: 'kasku.jenisTerakhir', periode: 'kasku.periode', gagal: 'kasku.gagalPin'
};
const DEFAULT_KAT = {
  pengeluaran: ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan'],
  pemasukan: ['Gaji', 'Bonus', 'Freelance']
};
const WARNA = ['#4f7cff', '#8b5cf6', '#14b8a6', '#38bdf8', '#c084fc', '#2dd4bf', '#94a3b8'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLN_PENUH = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = new Intl.NumberFormat('id-ID');
const rp = (n) => (n < 0 ? '-' : '') + 'Rp ' + nf.format(Math.abs(Math.round(n)));
const rpRingkas = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' jt';
  if (a >= 1e3) return Math.round(n / 1e3) + ' rb';
  return String(n);
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dari = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const tambahHari = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const selisihHari = (a, b) => Math.round((dari(b) - dari(a)) / 864e5);
const hariIni = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const tglPendek = (s) => { const d = dari(s); return `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`; };
const tglPanjang = (s) => `${HARI[dari(s).getDay()]}, ${tglPendek(s)}`;
const tglSingkat = (s) => { const d = dari(s); return `${d.getDate()} ${BLN[d.getMonth()]}`; };

/* ---------- State ---------- */
const S = {
  items: [], kategori: { pemasukan: [], pengeluaran: [] }, sumber: { pemasukan: [], pengeluaran: [] },
  sheetUrl: '', loading: false, error: '', terakhir: 0,
  tab: 'beranda', periode: store.get(K.periode) || 'bulan', custom: { dari: '', sampai: '' },
  tren: 'harian', rw: { q: '', jenis: '', kat: '', dari: '', sampai: '', batas: 60 },
  terbuka: false
};
let F = null;            // state form
let G = { mode: '', buf: '', first: '' };   // state gerbang
let charts = {};
let promptInstal = null;
let waktuSembunyi = 0;
let kunciSementara = '';

const ICON = {
  masuk: '<svg viewBox="0 0 24 24" class="ic"><path d="M17 7L7 17M7 17h8M7 17V9"/></svg>',
  keluar: '<svg viewBox="0 0 24 24" class="ic"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 5v14M5 12h14"/></svg>',
  dompet: '<svg viewBox="0 0 24 24" class="ic"><path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM17 14h.01"/></svg>'
};

/* ---------- API ---------- */
async function api(aksi, data = {}) {
  if (!CFG.API_URL || CFG.API_URL.indexOf('PASTE') === 0) {
    throw new Error('URL Web App belum diisi di config.js');
  }
  const kunci = kunciSementara || store.get(K.kunci) || '';
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ kunci, aksi }, data)),
      redirect: 'follow',
      signal: ctl.signal
    });
    let j;
    try { j = await res.json(); } catch (_) {
      throw new Error('Respons tidak valid. Pastikan Web App di-deploy dengan akses "Siapa saja".');
    }
    if (!j.ok) {
      const e = new Error(j.pesan || 'Terjadi kesalahan');
      e.kode = j.kode;
      throw e;
    }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Waktu habis. Periksa koneksi lalu coba lagi.');
    if (e instanceof TypeError) throw new Error('Tidak bisa terhubung. Periksa koneksi internet.');
    throw e;
  } finally {
    clearTimeout(to);
  }
}

/* ---------- Toast & dialog ---------- */
function toast(msg, tipe = 'ok', ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast ' + tipe;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('keluar'); setTimeout(() => el.remove(), 260); }, ms);
}
function konfirmasi(judul, isi, labelOk = 'Hapus') {
  return new Promise((resolve) => {
    $('#dlg-judul').textContent = judul;
    $('#dlg-isi').textContent = isi;
    $('#dlg-ok').textContent = labelOk;
    const w = $('#dialog');
    w.hidden = false;
    const selesai = (v) => { w.hidden = true; $('#dlg-ok').onclick = $('#dlg-batal').onclick = null; resolve(v); };
    $('#dlg-ok').onclick = () => selesai(true);
    $('#dlg-batal').onclick = () => selesai(false);
  });
}
const getar = () => { try { navigator.vibrate && navigator.vibrate(14); } catch (_) {} };

/* ============================================================
   GERBANG: Kunci Akses & PIN
   ============================================================ */
async function hash(pin) {
  let garam = store.get(K.garam);
  if (!garam) {
    garam = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
    store.set(K.garam, garam);
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(garam + ':' + pin));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function tampilGerbang(mode, pesan = '') {
  G = { mode, buf: '', first: '' };
  $('#gerbang').hidden = false;
  $('#utama').hidden = true; $('#nav').hidden = true;
  tutupForm(true);
  const judul = $('#g-judul'), sub = $('#g-sub');
  $('#g-kunci-wrap').hidden = mode !== 'kunci';
  $('#g-pin-wrap').hidden = mode === 'kunci';
  $('#g-lupa').hidden = mode !== 'masuk';
  $('#g-batal').hidden = mode !== 'ubahpin';
  $('#g-err').textContent = pesan;
  if (mode === 'kunci') {
    judul.textContent = 'Selamat datang';
    sub.textContent = 'Tempel Kunci Akses yang kamu buat di Code.gs. Cukup sekali di HP ini.';
    $('#g-kunci').value = '';
    setTimeout(() => $('#g-kunci').focus(), 50);
  } else if (mode === 'buatpin' || mode === 'ubahpin') {
    judul.textContent = 'Buat PIN';
    sub.textContent = 'PIN 4 angka untuk mengunci aplikasi di HP ini.';
  } else if (mode === 'ulangpin') {
    judul.textContent = 'Ulangi PIN';
    sub.textContent = 'Masukkan PIN yang sama sekali lagi.';
  } else {
    judul.textContent = 'Masukkan PIN';
    sub.textContent = 'Kasku terkunci.';
  }
  gambarDots();
}

function gambarDots(salah = false) {
  const d = $('#g-dots');
  $$('i', d).forEach((el, i) => el.classList.toggle('isi', i < G.buf.length));
  d.classList.toggle('salah', salah);
  if (salah) setTimeout(() => d.classList.remove('salah'), 400);
}

async function tekanTombol(k) {
  if (G.mode === 'kunci') return;
  const kunciSelesai = Date.now() < Number(store.get(K.gagal + '.sampai', 0));
  if (kunciSelesai) {
    const dtk = Math.ceil((Number(store.get(K.gagal + '.sampai')) - Date.now()) / 1000);
    $('#g-err').textContent = `Terlalu banyak percobaan. Coba lagi dalam ${dtk} detik.`;
    return;
  }
  if (k === 'x') G.buf = G.buf.slice(0, -1);
  else if (G.buf.length < 4) G.buf += k;
  gambarDots();
  if (G.buf.length < 4) return;
  const pin = G.buf;
  G.buf = '';

  if (G.mode === 'buatpin' || G.mode === 'ubahpin') {
    G.first = pin;
    G.mode = G.mode === 'ubahpin' ? 'ulangpin-ubah' : 'ulangpin';
    $('#g-judul').textContent = 'Ulangi PIN';
    $('#g-sub').textContent = 'Masukkan PIN yang sama sekali lagi.';
    $('#g-err').textContent = '';
    gambarDots();
  } else if (G.mode === 'ulangpin' || G.mode === 'ulangpin-ubah') {
    if (pin === G.first) {
      store.set(K.pin, await hash(pin));
      const dariUbah = G.mode === 'ulangpin-ubah';
      if (dariUbah) toast('PIN berhasil diubah');
      masukApp();
    } else {
      gambarDots(true); getar();
      tampilGerbang(G.mode === 'ulangpin-ubah' ? 'ubahpin' : 'buatpin', 'PIN tidak sama. Coba lagi.');
    }
  } else if (G.mode === 'masuk') {
    if ((await hash(pin)) === store.get(K.pin)) {
      store.del(K.gagal); store.del(K.gagal + '.sampai');
      masukApp();
    } else {
      const n = Number(store.get(K.gagal, 0)) + 1;
      store.set(K.gagal, n);
      gambarDots(true); getar();
      if (n >= 5) {
        store.set(K.gagal + '.sampai', Date.now() + 30000 * (n - 4));
        $('#g-err').textContent = 'Terlalu banyak percobaan. Tunggu 30 detik.';
      } else {
        $('#g-err').textContent = `PIN salah (${n}/5).`;
      }
    }
  }
}

async function lanjutKunci() {
  const v = $('#g-kunci').value.trim();
  const tombol = $('#g-lanjut');
  if (v.length < 16) { $('#g-err').textContent = 'Kunci Akses terlalu pendek (minimal 16 karakter).'; return; }
  tombol.disabled = true; tombol.classList.add('proses'); $('#g-err').textContent = '';
  kunciSementara = v;
  try {
    await api('ping');
    store.set(K.kunci, v);
    kunciSementara = '';
    tampilGerbang(store.get(K.pin) ? 'masuk' : 'buatpin');
  } catch (e) {
    kunciSementara = '';
    $('#g-err').textContent = e.kode === 'AUTH' ? 'Kunci Akses tidak cocok dengan yang di Code.gs.' : e.message;
  } finally {
    tombol.disabled = false; tombol.classList.remove('proses');
  }
}

async function resetPerangkat(tanya = true) {
  if (tanya && !(await konfirmasi('Keluar dari perangkat ini?', 'Kunci Akses, PIN, dan salinan data di HP ini akan dihapus. Data di spreadsheet tetap aman.', 'Keluar'))) return;
  Object.values(K).forEach((k) => store.del(k));
  store.del(K.gagal + '.sampai');
  S.items = [];
  tampilGerbang('kunci');
}

/* ============================================================
   MASUK APP & MUAT DATA
   ============================================================ */
function masukApp() {
  $('#gerbang').hidden = true;
  $('#utama').hidden = false; $('#nav').hidden = false;
  S.terbuka = true;
  pulihCache();
  gantiTab(S.tab);
  muat();
  const q = new URLSearchParams(location.search);
  if (q.get('aksi') === 'tambah') {
    history.replaceState(null, '', location.pathname);
    bukaForm();
  }
}

function simpanCache() {
  store.set(K.cache, JSON.stringify({ items: S.items, kategori: S.kategori, sumber: S.sumber, sheetUrl: S.sheetUrl, t: Date.now() }));
}
function pulihCache() {
  try {
    const c = JSON.parse(store.get(K.cache, 'null'));
    if (c && Array.isArray(c.items) && !S.items.length) {
      S.items = c.items; S.kategori = c.kategori || S.kategori; S.sumber = c.sumber || S.sumber;
      S.sheetUrl = c.sheetUrl || ''; S.terakhir = c.t || 0;
    }
  } catch (_) {}
}
const urut = () => S.items.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.baris - a.baris);

async function muat({ diam = false } = {}) {
  if (S.loading) return;
  S.loading = true;
  if (!diam) document.body.classList.add('memuat');
  renderBanner();
  try {
    const r = await api('daftar');
    S.items = r.items; S.kategori = r.kategori; S.sumber = r.sumber; S.sheetUrl = r.sheetUrl || '';
    S.error = ''; S.terakhir = Date.now();
    urut(); simpanCache();
  } catch (e) {
    if (e.kode === 'AUTH') {
      S.loading = false; document.body.classList.remove('memuat');
      store.del(K.kunci);
      tampilGerbang('kunci', 'Kunci Akses tidak cocok. Tempel ulang kunci yang benar.');
      return;
    }
    S.error = e.message;
  } finally {
    S.loading = false;
    document.body.classList.remove('memuat');
    renderSemua();
  }
}

/* ============================================================
   PERIODE
   ============================================================ */
function rentang() {
  const t = hariIni(), hari = iso(t);
  let a, b, pa, pb, label;
  const p = S.periode;
  if (p === 'hari') {
    a = b = hari; pa = pb = iso(tambahHari(t, -1)); label = 'kemarin';
  } else if (p === 'minggu') {
    const sen = tambahHari(t, -((t.getDay() + 6) % 7));
    a = iso(sen); b = iso(tambahHari(sen, 6));
    const lalu = tambahHari(sen, -7);
    pa = iso(lalu); pb = iso(tambahHari(lalu, Math.min(6, selisihHari(a, hari)))); label = 'minggu lalu';
  } else if (p === 'bulan') {
    const awal = new Date(t.getFullYear(), t.getMonth(), 1);
    const akhir = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    a = iso(awal); b = iso(akhir);
    const awalL = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const akhirL = new Date(t.getFullYear(), t.getMonth(), 0);
    pa = iso(awalL); pb = iso(new Date(Math.min(+akhirL, +tambahHari(awalL, t.getDate() - 1)))); label = 'bulan lalu';
  } else {
    a = S.custom.dari || hari; b = S.custom.sampai || hari;
    if (a > b) [a, b] = [b, a];
    const n = selisihHari(a, b) + 1;
    pb = iso(tambahHari(dari(a), -1)); pa = iso(tambahHari(dari(a), -n)); label = 'periode sebelumnya';
  }
  return { a, b, pa, pb, label, hari };
}
function labelPeriode(r) {
  const p = S.periode;
  if (p === 'hari') return 'Hari ini · ' + tglPendek(r.a);
  if (p === 'minggu') return `Minggu ini · ${tglSingkat(r.a)} – ${tglSingkat(r.b)}`;
  if (p === 'bulan') { const d = dari(r.a); return `${BLN_PENUH[d.getMonth()]} ${d.getFullYear()}`; }
  return r.a === r.b ? tglPendek(r.a) : `${tglSingkat(r.a)} – ${tglPendek(r.b)}`;
}
const dalam = (arr, a, b) => arr.filter((x) => x.tanggal >= a && x.tanggal <= b);
const jumlah = (arr, jenis) => arr.reduce((s, x) => (x.jenis === jenis ? s + x.nominal : s), 0);

/* ============================================================
   RENDER
   ============================================================ */
function renderSemua() {
  renderPeriodeBar();
  renderBanner();
  renderKatFilter();
  renderTab();
}

function renderBanner() {
  const b = $('#banner');
  if (S.error) {
    b.hidden = false;
    b.innerHTML = `<span>${esc(S.error)}${S.items.length ? ' (menampilkan data tersimpan)' : ''}</span><button data-aksi="refresh">Coba lagi</button>`;
  } else b.hidden = true;
}

function renderPeriodeBar() {
  const tampil = S.tab === 'beranda' || S.tab === 'analisis';
  $('#periode-bar').hidden = !tampil;
  $$('#periode-chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.p === S.periode));
  $('#custom-wrap').hidden = S.periode !== 'custom';
  $('#cu-dari').value = S.custom.dari; $('#cu-sampai').value = S.custom.sampai;
  const sub = $('#top-sub');
  sub.textContent = S.terakhir ? 'Diperbarui ' + new Date(S.terakhir).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Catatan keuanganmu';
}

function gantiTab(t) {
  S.tab = t;
  $$('.tab').forEach((el) => { el.hidden = el.id !== 'tab-' + t; });
  $$('.nav-i').forEach((el) => el.classList.toggle('on', el.dataset.t === t));
  renderPeriodeBar();
  renderTab();
  window.scrollTo({ top: 0 });
}
function renderTab() {
  if (S.tab === 'beranda') renderBeranda();
  else if (S.tab === 'riwayat') renderRiwayat();
  else if (S.tab === 'analisis') renderAnalisis();
  else renderSetelan();
}

function barisTrx(x, tampilTanggal) {
  const masuk = x.jenis === 'pemasukan';
  const detail = [x.sumber, x.catatan].filter(Boolean).join(' · ');
  const sub = tampilTanggal ? [tglPendek(x.tanggal), detail].filter(Boolean).join(' · ') : (detail || (masuk ? 'Pemasukan' : 'Pengeluaran'));
  return `<button class="trx" data-aksi="ubah" data-id="${esc(x.id)}">
    <span class="trx-ico ${masuk ? 'in' : 'out'}">${masuk ? ICON.masuk : ICON.keluar}</span>
    <span class="trx-main"><b>${esc(x.kategori)}</b><small>${esc(sub)}</small></span>
    <span class="trx-amt ${masuk ? 'in' : 'out'}">${masuk ? '+' : '-'}${rp(x.nominal)}</span>
  </button>`;
}

function kosongHtml(judul, isi, tombol = true) {
  return `<div class="kosong glass"><div class="lingkar">${ICON.dompet}</div><b>${esc(judul)}</b><p>${esc(isi)}</p>
    ${tombol ? '<button class="btn-utama" style="max-width:240px;margin:0 auto" data-aksi="tambah"><span>+ Tambah Transaksi</span></button>' : ''}</div>`;
}

/* ---------- Beranda ---------- */
function renderBeranda() {
  const el = $('#tab-beranda');
  if (!S.items.length && S.loading) {
    el.innerHTML = '<div class="skel" style="height:190px;margin:10px 0"></div><div class="insight"><div class="skel" style="height:78px"></div><div class="skel" style="height:78px"></div></div><div class="skel" style="height:64px;margin:8px 0"></div><div class="skel" style="height:64px;margin:8px 0"></div>';
    return;
  }
  const r = rentang();
  const cur = dalam(S.items, r.a, r.b), prev = dalam(S.items, r.pa, r.pb);
  const masuk = jumlah(cur, 'pemasukan'), keluar = jumlah(cur, 'pengeluaran'), saldo = masuk - keluar;
  const semua = jumlah(S.items, 'pemasukan') - jumlah(S.items, 'pengeluaran');

  // insight
  const per = {};
  cur.filter((x) => x.jenis === 'pengeluaran').forEach((x) => { per[x.kategori] = (per[x.kategori] || 0) + x.nominal; });
  const top = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
  const akhirEf = r.b > r.hari ? r.hari : r.b;
  const nHari = r.a > r.hari ? 0 : selisihHari(r.a, akhirEf) + 1;
  const rata = nHari ? keluar / nHari : 0;
  const keluarPrev = jumlah(prev, 'pengeluaran'), masukPrev = jumlah(prev, 'pemasukan');
  let banding = '<div class="v">–</div><div class="d">Belum ada data ' + esc(r.label) + ' untuk dibandingkan</div>';
  if (keluarPrev > 0) {
    const pct = ((keluar - keluarPrev) / keluarPrev) * 100;
    const arah = pct > 0.5 ? 'naik' : pct < -0.5 ? 'turun' : '';
    const kata = pct > 0.5 ? 'Naik' : pct < -0.5 ? 'Turun' : 'Sama';
    banding = `<div class="v ${arah}">${kata} ${Math.abs(pct) < 0.5 ? '' : Math.abs(pct).toFixed(0) + '%'}</div><div class="d">Pengeluaran vs ${esc(r.label)} (${rp(keluarPrev)})</div>`;
  }
  const tabung = masuk > 0 ? Math.round(((masuk - keluar) / masuk) * 100) : null;

  const terbaru = S.items.slice(0, 5);
  el.innerHTML = `
    <div class="hero">
      <div class="lab">Saldo bersih · ${esc(labelPeriode(r))}</div>
      <div class="angka">${rp(saldo)}</div>
      <div class="kecil">Saldo semua catatan: ${rp(semua)}</div>
      <div class="dua">
        <div class="sel"><span class="kecil">Pemasukan</span><b>${rp(masuk)}</b></div>
        <div class="sel"><span class="kecil">Pengeluaran</span><b>${rp(keluar)}</b></div>
      </div>
    </div>
    ${cur.length ? `
    <div class="insight">
      <div class="ins glass"><div class="t">Kategori terbesar</div><div class="v">${top ? esc(top[0]) : '–'}</div><div class="d">${top ? rp(top[1]) + ' · ' + Math.round(top[1] / keluar * 100) + '% dari pengeluaran' : 'Belum ada pengeluaran'}</div></div>
      <div class="ins glass"><div class="t">Rata-rata harian</div><div class="v">${rp(rata)}</div><div class="d">Pengeluaran per hari (${nHari} hari)</div></div>
      <div class="ins glass"><div class="t">Dibanding ${esc(r.label)}</div>${banding}</div>
      <div class="ins glass"><div class="t">Sisa dari pemasukan</div><div class="v ${tabung !== null && tabung < 0 ? 'naik' : ''}">${tabung === null ? '–' : tabung + '%'}</div><div class="d">${tabung === null ? 'Belum ada pemasukan' : 'Pemasukan ' + rp(masuk) + (masukPrev ? ' (sebelumnya ' + rp(masukPrev) + ')' : '')}</div></div>
    </div>` : ''}
    <div class="judul-bagian"><h3>Transaksi terbaru</h3>${S.items.length > 5 ? '<button class="link" data-aksi="tab" data-t="riwayat">Lihat semua</button>' : ''}</div>
    ${terbaru.length ? terbaru.map((x) => barisTrx(x, true)).join('') : kosongHtml('Belum ada transaksi', 'Catat transaksi pertamamu. Cukup beberapa detik.')}
  `;
}

/* ---------- Riwayat ---------- */
function renderKatFilter() {
  const sel = $('#rw-kat');
  const semua = Array.from(new Set(S.items.map((x) => x.kategori))).sort((a, b) => a.localeCompare(b, 'id'));
  const lama = S.rw.kat;
  sel.innerHTML = '<option value="">Semua kategori</option>' + semua.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  sel.value = semua.includes(lama) ? lama : '';
  S.rw.kat = sel.value;
  $$('#rw-jenis .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === S.rw.jenis));
}
function renderRiwayat() {
  const w = S.rw, q = w.q.trim().toLowerCase();
  $$('#rw-jenis .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === w.jenis));
  const arr = S.items.filter((x) =>
    (!w.jenis || x.jenis === w.jenis) && (!w.kat || x.kategori === w.kat) &&
    (!w.dari || x.tanggal >= w.dari) && (!w.sampai || x.tanggal <= w.sampai) &&
    (!q || [x.kategori, x.sumber, x.catatan, String(x.nominal)].join(' ').toLowerCase().includes(q)));
  const tot = arr.reduce((s, x) => s + (x.jenis === 'pemasukan' ? x.nominal : -x.nominal), 0);
  $('#rw-info').textContent = arr.length ? `${arr.length} transaksi · selisih ${rp(tot)}` : '';
  const list = $('#rw-list');
  if (!S.items.length && S.loading) { list.innerHTML = '<div class="skel" style="height:64px;margin:8px 0"></div>'.repeat(4); return; }
  if (!arr.length) {
    list.innerHTML = S.items.length ? kosongHtml('Tidak ada hasil', 'Coba ubah kata kunci atau filter.', false) : kosongHtml('Belum ada transaksi', 'Riwayat akan muncul di sini.');
    return;
  }
  const tampil = arr.slice(0, w.batas);
  let html = '', tglTerakhir = '';
  tampil.forEach((x) => {
    if (x.tanggal !== tglTerakhir) { html += `<div class="grup">${esc(tglPanjang(x.tanggal))}</div>`; tglTerakhir = x.tanggal; }
    html += barisTrx(x, false);
  });
  if (arr.length > tampil.length) html += `<button class="btn-sekunder" style="width:100%;margin-top:10px" data-aksi="lagi">Tampilkan lebih banyak (${arr.length - tampil.length})</button>`;
  list.innerHTML = html;
}

/* ---------- Analisis ---------- */
function buatChart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const c = document.getElementById(id);
  charts[id] = new Chart(c.getContext('2d'), cfg);
}
function renderAnalisis() {
  const kosong = $('#an-kosong'), isi = $('#an-isi');
  const r = rentang();
  const cur = dalam(S.items, r.a, r.b), prev = dalam(S.items, r.pa, r.pb);
  $('#seg-tren').dataset.v = S.tren;
  if (typeof Chart === 'undefined') {
    isi.hidden = true;
    kosong.innerHTML = kosongHtml('Grafik belum bisa dimuat', 'Butuh internet saat pertama kali membuka grafik. Coba muat ulang.', false);
    return;
  }
  if (!cur.length && !prev.length && !S.items.length) {
    isi.hidden = true; kosong.innerHTML = kosongHtml('Belum ada data untuk dianalisis', 'Grafik muncul setelah ada transaksi.'); return;
  }
  isi.hidden = false; kosong.innerHTML = '';
  Chart.defaults.font.family = "'Plus Jakarta Sans',system-ui,sans-serif";
  Chart.defaults.color = '#64748b';

  // 1) Pengeluaran per kategori
  const per = {};
  cur.filter((x) => x.jenis === 'pengeluaran').forEach((x) => { per[x.kategori] = (per[x.kategori] || 0) + x.nominal; });
  let ent = Object.entries(per).sort((a, b) => b[1] - a[1]);
  if (ent.length > 6) { const sisa = ent.slice(6).reduce((s, e) => s + e[1], 0); ent = ent.slice(0, 6).concat([['Lainnya', sisa]]); }
  const total = ent.reduce((s, e) => s + e[1], 0);
  const boxKat = $('#ch-kategori').closest('.kartu');
  if (!ent.length) {
    if (charts['ch-kategori']) { charts['ch-kategori'].destroy(); delete charts['ch-kategori']; }
    $('#legend-kat').innerHTML = '<p class="sub">Belum ada pengeluaran di periode ini.</p>';
    $('#ch-kategori').parentElement.hidden = true;
  } else {
    $('#ch-kategori').parentElement.hidden = false;
    buatChart('ch-kategori', {
      type: 'doughnut',
      data: { labels: ent.map((e) => e[0]), datasets: [{ data: ent.map((e) => e[1]), backgroundColor: ent.map((_, i) => WARNA[i % WARNA.length]), borderWidth: 3, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${rp(c.parsed)}` } } } }
    });
    $('#legend-kat').innerHTML = ent.map((e, i) => `<div class="row"><span class="dot" style="background:${WARNA[i % WARNA.length]}"></span><span class="nm">${esc(e[0])}</span><b>${rp(e[1])}</b><span class="pc">${Math.round(e[1] / total * 100)}%</span></div>`).join('');
  }

  // 2) Tren
  const gr = $('#ch-tren').getContext('2d');
  if (S.tren === 'harian') {
    let akhir = r.b > r.hari ? r.hari : r.b, awal = r.a;
    if (awal > akhir) awal = akhir;
    let ket = labelPeriode(r);
    if (selisihHari(awal, akhir) < 6) { awal = iso(tambahHari(dari(akhir), -6)); ket = '7 hari terakhir'; }
    if (selisihHari(awal, akhir) > 61) { awal = iso(tambahHari(dari(akhir), -61)); ket = '62 hari terakhir di periode ini'; }
    const labels = [], keluar = [], masuk = [];
    const mk = {}, mm = {};
    S.items.forEach((x) => { if (x.tanggal >= awal && x.tanggal <= akhir) { (x.jenis === 'pengeluaran' ? mk : mm)[x.tanggal] = ((x.jenis === 'pengeluaran' ? mk : mm)[x.tanggal] || 0) + x.nominal; } });
    for (let d = dari(awal); iso(d) <= akhir; d = tambahHari(d, 1)) { const k = iso(d); labels.push(tglSingkat(k)); keluar.push(mk[k] || 0); masuk.push(mm[k] || 0); }
    $('#tren-ket').textContent = ket;
    const g1 = gr.createLinearGradient(0, 0, 0, 230); g1.addColorStop(0, 'rgba(139,92,246,.30)'); g1.addColorStop(1, 'rgba(139,92,246,0)');
    buatChart('ch-tren', {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Pengeluaran', data: keluar, borderColor: '#8b5cf6', backgroundColor: g1, fill: true, tension: .35, pointRadius: labels.length > 20 ? 0 : 3, borderWidth: 2.5 },
        { label: 'Pemasukan', data: masuk, borderColor: '#14b8a6', backgroundColor: 'transparent', tension: .35, pointRadius: labels.length > 20 ? 0 : 3, borderWidth: 2.5 }
      ] },
      options: opsiGaris()
    });
  } else {
    const t = hariIni(), labels = [], keluar = [], masuk = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const pre = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      labels.push(BLN[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
      keluar.push(S.items.filter((x) => x.jenis === 'pengeluaran' && x.tanggal.startsWith(pre)).reduce((s, x) => s + x.nominal, 0));
      masuk.push(S.items.filter((x) => x.jenis === 'pemasukan' && x.tanggal.startsWith(pre)).reduce((s, x) => s + x.nominal, 0));
    }
    $('#tren-ket').textContent = '6 bulan terakhir';
    buatChart('ch-tren', {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Pemasukan', data: masuk, backgroundColor: '#2dd4bf', borderRadius: 8, maxBarThickness: 22 },
        { label: 'Pengeluaran', data: keluar, backgroundColor: '#8b5cf6', borderRadius: 8, maxBarThickness: 22 }
      ] },
      options: opsiGaris()
    });
  }

  // 3) Periode ini vs sebelumnya
  buatChart('ch-banding', {
    type: 'bar',
    data: { labels: ['Periode ini', 'Sebelumnya'], datasets: [
      { label: 'Pemasukan', data: [jumlah(cur, 'pemasukan'), jumlah(prev, 'pemasukan')], backgroundColor: '#2dd4bf', borderRadius: 10, maxBarThickness: 40 },
      { label: 'Pengeluaran', data: [jumlah(cur, 'pengeluaran'), jumlah(prev, 'pengeluaran')], backgroundColor: '#8b5cf6', borderRadius: 10, maxBarThickness: 40 }
    ] },
    options: opsiGaris()
  });
}
function opsiGaris() {
  return {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${rp(c.parsed.y)}` } } },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
      y: { beginAtZero: true, grid: { color: 'rgba(99,102,241,.08)' }, ticks: { callback: (v) => rpRingkas(v), maxTicksLimit: 5 }, border: { display: false } }
    }
  };
}

/* ---------- Setelan ---------- */
function renderSetelan() {
  const a = $('#link-sheet');
  if (S.sheetUrl) { a.href = S.sheetUrl; a.hidden = false; } else a.hidden = true;
  $('#btn-instal').hidden = !promptInstal;
}

/* ============================================================
   FORM TRANSAKSI
   ============================================================ */
function daftarPilihan(jenis, tipe) {
  const dariServer = (tipe === 'kategori' ? S.kategori : S.sumber)[jenis] || [];
  const arr = dariServer.slice();
  if (tipe === 'kategori') {
    DEFAULT_KAT[jenis].forEach((d) => { if (!arr.some((x) => x.toLowerCase() === d.toLowerCase())) arr.push(d); });
  }
  return arr;
}
function bukaForm(item = null) {
  const edit = !!item;
  const jenis = item ? item.jenis : (store.get(K.jenis) === 'pemasukan' ? 'pemasukan' : 'pengeluaran');
  F = {
    mode: edit ? 'ubah' : 'tambah', item, jenis,
    kategori: item ? item.kategori : '', sumber: item ? item.sumber : '',
    kategoriBaru: false, sumberBaru: false, semuaKat: false, sedang: false
  };
  if (!edit) F.sumber = lastSumber(jenis);
  $('#form-judul').textContent = edit ? 'Edit Transaksi' : 'Tambah Transaksi';
  $('#f-nominal').value = edit ? nf.format(item.nominal) : '';
  $('#f-tanggal').value = edit ? item.tanggal : iso(hariIni());
  $('#f-catatan').value = edit ? item.catatan : '';
  $('#f-kategori-baru').hidden = true; $('#f-kategori-baru').value = '';
  $('#f-sumber-baru').hidden = true; $('#f-sumber-baru').value = '';
  $('#btn-hapus').hidden = !edit;
  $('#seg-jenis').style.opacity = edit ? .55 : 1;
  $('#seg-jenis').style.pointerEvents = edit ? 'none' : '';
  ['#err-nominal', '#err-kategori', '#err-tanggal'].forEach((s) => { $(s).textContent = ''; });
  setBtnSimpan(false);
  renderForm();
  const w = $('#sheet');
  $('#form').classList.remove('tutup');
  w.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => { if (!edit) $('#f-nominal').focus(); }, 120);
}
function lastSumber(jenis) {
  try { return (JSON.parse(store.get(K.sumber, '{}')) || {})[jenis] || ''; } catch (_) { return ''; }
}
function simpanSumberTerakhir(jenis, v) {
  let o = {}; try { o = JSON.parse(store.get(K.sumber, '{}')) || {}; } catch (_) {}
  o[jenis] = v; store.set(K.sumber, JSON.stringify(o));
}
function tutupForm(cepat = false) {
  const w = $('#sheet');
  if (w.hidden) return;
  document.body.style.overflow = '';
  if (cepat) { w.hidden = true; F = null; return; }
  $('#form').classList.add('tutup');
  setTimeout(() => { w.hidden = true; F = null; }, 210);
}
function renderForm() {
  $('#seg-jenis').dataset.v = F.jenis;
  const kat = daftarPilihan(F.jenis, 'kategori');
  if (F.kategori && !kat.some((x) => x.toLowerCase() === F.kategori.toLowerCase()) && !F.kategoriBaru) kat.unshift(F.kategori);
  const bats = 10;
  const tampilKat = F.semuaKat ? kat : kat.slice(0, bats);
  $('#chips-kategori').innerHTML =
    tampilKat.map((k) => `<button type="button" class="chip ${!F.kategoriBaru && k.toLowerCase() === F.kategori.toLowerCase() ? 'on' : ''}" data-aksi="kat" data-v="${esc(k)}">${esc(k)}</button>`).join('') +
    (kat.length > bats && !F.semuaKat ? `<button type="button" class="chip" data-aksi="semua-kat">Lainnya (${kat.length - bats})</button>` : '') +
    `<button type="button" class="chip baru ${F.kategoriBaru ? 'on' : ''}" data-aksi="baru" data-t="kategori">+ Baru</button>`;
  const sum = daftarPilihan(F.jenis, 'sumber');
  if (F.sumber && !sum.some((x) => x.toLowerCase() === F.sumber.toLowerCase()) && !F.sumberBaru) sum.unshift(F.sumber);
  $('#chips-sumber').innerHTML =
    sum.slice(0, 8).map((k) => `<button type="button" class="chip ${!F.sumberBaru && k.toLowerCase() === F.sumber.toLowerCase() ? 'on' : ''}" data-aksi="sum" data-v="${esc(k)}">${esc(k)}</button>`).join('') +
    `<button type="button" class="chip baru ${F.sumberBaru ? 'on' : ''}" data-aksi="baru" data-t="sumber">+ Baru</button>`;
}
function setBtnSimpan(proses) {
  const b = $('#btn-simpan');
  b.disabled = proses; b.classList.toggle('proses', proses);
  b.querySelector('span').textContent = proses ? 'Menyimpan…' : (F && F.mode === 'ubah' ? 'Simpan Perubahan' : 'Simpan');
}
function ambilForm() {
  const nominal = parseInt($('#f-nominal').value.replace(/\D/g, ''), 10) || 0;
  return {
    jenis: F.jenis, nominal,
    kategori: (F.kategoriBaru ? $('#f-kategori-baru').value : F.kategori).trim(),
    sumber: (F.sumberBaru ? $('#f-sumber-baru').value : F.sumber).trim(),
    tanggal: $('#f-tanggal').value, catatan: $('#f-catatan').value.trim()
  };
}
function validasiForm(d) {
  let ok = true;
  ['#err-nominal', '#err-kategori', '#err-tanggal'].forEach((s) => { $(s).textContent = ''; });
  if (!(d.nominal > 0)) {
    $('#err-nominal').textContent = 'Nominal tidak boleh kosong atau nol.';
    const bx = $('#nominal-box'); bx.classList.remove('geter'); void bx.offsetWidth; bx.classList.add('geter');
    ok = false;
  } else if (d.nominal > 1e12) { $('#err-nominal').textContent = 'Nominal terlalu besar.'; ok = false; }
  if (!d.kategori) { $('#err-kategori').textContent = 'Pilih atau isi kategori.'; ok = false; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal)) { $('#err-tanggal').textContent = 'Tanggal tidak valid.'; ok = false; }
  return ok;
}
async function simpanForm(e) {
  e.preventDefault();
  if (!F || F.sedang) return;
  const d = ambilForm();
  if (!validasiForm(d)) { getar(); if (!(d.nominal > 0)) $('#f-nominal').focus(); return; }
  F.sedang = true; setBtnSimpan(true);
  try {
    let r;
    if (F.mode === 'tambah') r = await api('tambah', { data: d });
    else r = await api('ubah', { data: d, baris: F.item.baris, cek: F.item.cek });
    if (F.mode === 'ubah') S.items = S.items.filter((x) => x.id !== F.item.id);
    S.items.push(r.item); urut();
    // perbarui daftar kategori/sumber lokal
    const tambahLokal = (peta, v) => { if (v && !peta.some((x) => x.toLowerCase() === v.toLowerCase())) peta.unshift(v); };
    tambahLokal(S.kategori[d.jenis] = S.kategori[d.jenis] || [], d.kategori);
    tambahLokal(S.sumber[d.jenis] = S.sumber[d.jenis] || [], d.sumber);
    if (F.mode === 'tambah') { simpanSumberTerakhir(d.jenis, d.sumber); store.set(K.jenis, d.jenis); }
    simpanCache(); getar();
    toast(F.mode === 'tambah' ? 'Tersimpan ke Google Sheets ✓' : 'Perubahan tersimpan ✓', 'ok');
    tutupForm(); renderSemua();
    muat({ diam: true });
  } catch (err) {
    if (F) { F.sedang = false; setBtnSimpan(false); }
    if (err.kode === 'DATA_BERUBAH') { toast(err.message, 'gagal', 4000); tutupForm(); muat(); }
    else if (err.kode === 'AUTH') { tutupForm(true); tampilGerbang('kunci', 'Kunci Akses tidak cocok.'); }
    else toast('Gagal menyimpan: ' + err.message, 'gagal', 4200);
  }
}
async function hapusForm() {
  if (!F || !F.item || F.sedang) return;
  const x = F.item;
  const ya = await konfirmasi('Hapus transaksi ini?', `${x.kategori} · ${rp(x.nominal)} · ${tglPendek(x.tanggal)}. Data ini juga dikosongkan dari Google Sheets dan tidak bisa dikembalikan dari aplikasi.`);
  if (!ya) return;
  F.sedang = true;
  const b = $('#btn-hapus'); b.disabled = true; b.textContent = 'Menghapus…';
  try {
    await api('hapus', { jenis: x.jenis, baris: x.baris, cek: x.cek });
    S.items = S.items.filter((i) => i.id !== x.id);
    simpanCache(); getar(); toast('Transaksi dihapus', 'ok');
    tutupForm(); renderSemua(); muat({ diam: true });
  } catch (err) {
    if (F) F.sedang = false;
    b.disabled = false; b.textContent = 'Hapus';
    if (err.kode === 'DATA_BERUBAH') { toast(err.message, 'gagal', 4000); tutupForm(); muat(); }
    else toast('Gagal menghapus: ' + err.message, 'gagal', 4200);
  }
}

/* ============================================================
   EVENT
   ============================================================ */
function pasangEvent() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-aksi]');
    if (!t) return;
    const a = t.dataset.aksi;
    switch (a) {
      case 'tab': gantiTab(t.dataset.t); break;
      case 'tambah': bukaForm(); break;
      case 'refresh': muat(); break;
      case 'periode':
        S.periode = t.dataset.p; store.set(K.periode, S.periode);
        if (S.periode === 'custom' && !S.custom.dari) { S.custom.dari = iso(tambahHari(hariIni(), -6)); S.custom.sampai = iso(hariIni()); }
        renderPeriodeBar(); renderTab(); break;
      case 'tren': S.tren = t.dataset.v; renderAnalisis(); break;
      case 'rw-jenis': S.rw.jenis = t.dataset.v; S.rw.batas = 60; renderRiwayat(); break;
      case 'lagi': S.rw.batas += 60; renderRiwayat(); break;
      case 'ubah': {
        const it = S.items.find((x) => x.id === t.dataset.id);
        if (it) bukaForm(it);
        break;
      }
      case 'tutup': tutupForm(); break;
      case 'jenis': if (F) { F.jenis = t.dataset.v; F.kategori = ''; F.kategoriBaru = false; F.sumberBaru = false; F.sumber = lastSumber(F.jenis); $('#f-kategori-baru').hidden = true; $('#f-sumber-baru').hidden = true; renderForm(); } break;
      case 'kat': if (F) { F.kategori = t.dataset.v; F.kategoriBaru = false; $('#f-kategori-baru').hidden = true; $('#err-kategori').textContent = ''; renderForm(); getar(); } break;
      case 'sum': if (F) { F.sumber = F.sumber.toLowerCase() === t.dataset.v.toLowerCase() && !F.sumberBaru ? '' : t.dataset.v; F.sumberBaru = false; $('#f-sumber-baru').hidden = true; renderForm(); } break;
      case 'semua-kat': if (F) { F.semuaKat = true; renderForm(); } break;
      case 'baru':
        if (F) {
          const tipe = t.dataset.t, inp = $(tipe === 'kategori' ? '#f-kategori-baru' : '#f-sumber-baru');
          if (tipe === 'kategori') { F.kategoriBaru = true; F.kategori = ''; } else { F.sumberBaru = true; F.sumber = ''; }
          inp.hidden = false; renderForm(); inp.focus();
        }
        break;
      case 'tgl': $('#f-tanggal').value = iso(tambahHari(hariIni(), Number(t.dataset.n))); break;
      case 'hapus': hapusForm(); break;
      case 'tombol': tekanTombol(t.dataset.k); break;
      case 'ubahpin': tampilGerbang('ubahpin'); break;
      case 'kunci-sekarang': tampilGerbang('masuk'); break;
      case 'reset-perangkat': resetPerangkat(); break;
      case 'instal': if (promptInstal) { promptInstal.prompt(); promptInstal.userChoice.finally(() => { promptInstal = null; renderSetelan(); }); } break;
    }
  });

  $('#form').addEventListener('submit', simpanForm);
  $('#f-nominal').addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    e.target.value = d ? nf.format(Number(d)) : '';
    $('#err-nominal').textContent = '';
  });
  $('#f-kategori-baru').addEventListener('input', () => { $('#err-kategori').textContent = ''; });

  // Riwayat
  $('#rw-q').addEventListener('input', (e) => { S.rw.q = e.target.value; S.rw.batas = 60; renderRiwayat(); });
  $('#rw-kat').addEventListener('change', (e) => { S.rw.kat = e.target.value; S.rw.batas = 60; renderRiwayat(); });
  $('#rw-dari').addEventListener('change', (e) => { S.rw.dari = e.target.value; S.rw.batas = 60; renderRiwayat(); });
  $('#rw-sampai').addEventListener('change', (e) => { S.rw.sampai = e.target.value; S.rw.batas = 60; renderRiwayat(); });

  // Periode kustom
  $('#cu-dari').addEventListener('change', (e) => { S.custom.dari = e.target.value; renderTab(); });
  $('#cu-sampai').addEventListener('change', (e) => { S.custom.sampai = e.target.value; renderTab(); });

  // Gerbang
  $('#g-lanjut').addEventListener('click', lanjutKunci);
  $('#g-kunci').addEventListener('keydown', (e) => { if (e.key === 'Enter') lanjutKunci(); });
  $('#g-lupa').addEventListener('click', () => resetPerangkat());
  $('#g-batal').addEventListener('click', () => masukApp());
  document.addEventListener('keydown', (e) => {
    if ($('#gerbang').hidden || G.mode === 'kunci') return;
    if (/^\d$/.test(e.key)) tekanTombol(e.key);
    else if (e.key === 'Backspace') tekanTombol('x');
  });

  // Kunci otomatis & segarkan saat kembali ke aplikasi
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { waktuSembunyi = Date.now(); return; }
    if (!S.terbuka || !$('#gerbang').hidden) return;
    if (Date.now() - waktuSembunyi > 60000 && store.get(K.pin)) tampilGerbang('masuk');
    else if (Date.now() - S.terakhir > 30000) muat({ diam: true });
  });

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstal = e; renderSetelan(); });
  window.addEventListener('online', () => { if (S.terbuka && S.error) muat({ diam: true }); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && F) tutupForm(); });
}

/* ============================================================
   MULAI
   ============================================================ */
function mulai() {
  pasangEvent();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!CFG.API_URL || CFG.API_URL.indexOf('PASTE') === 0) {
    tampilGerbang('kunci', 'URL Web App belum diisi di config.js. Lihat panduan langkah 6.');
    return;
  }
  if (!store.get(K.kunci)) tampilGerbang('kunci');
  else if (!store.get(K.pin)) tampilGerbang('buatpin');
  else tampilGerbang('masuk');
}
mulai();
})();
