/* ============================================================
   Note & Interviste — gestione appunti e domande per il reality
   Tutti i dati restano sul dispositivo: nessun server, nessun account.
   ============================================================ */

'use strict';

const KEY = 'appthefifty.stato.v1';
const KEY_UI = 'appthefifty.ui.v1';
const KEY_SNAP = 'appthefifty.snapshot.v1';
const MAX_SNAP = 8;

/* ---------------- Stato ---------------- */

function statoIniziale() {
  return {
    v: 1,
    creato: Date.now(),
    aggiornato: Date.now(),
    impostazioni: { giorni: 8, titolo: 'Note & Interviste' },
    concorrenti: [],
    note: [],
    domande: [],
    ultimoBackup: 0,
  };
}

let stato = statoIniziale();

let ui = {
  vista: 'giorni',
  giorno: 1,
  cid: null,
  filtro: 'tutte',      // tutte | dafare | fatte
  q: '',
  qTutti: false,
  soloDaFare: false,
  modifica: null,       // id della nota in modifica
  setupGiorno: 1,
  importGiorno: 1,
  anteprima: null,
  bozza: '',
};

/* ---------------- Utilità ---------------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const app = () => document.getElementById('app');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function esc(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

function giorniLista() {
  const n = stato.impostazioni.giorni || 8;
  return Array.from({ length: n }, (_, i) => i + 1);
}

function conc(id) {
  return stato.concorrenti.find(c => c.id === id) || null;
}

function attivi() {
  return stato.concorrenti.filter(c => c.attivo !== false);
}

function coloreDi(c) {
  return c ? `hsl(${c.colore} 68% 62%)` : 'hsl(0 0% 50%)';
}

function iniziali(nome) {
  const p = (nome || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

function nuovoColore(i) {
  return Math.round((i * 360) / 13 + 18) % 360;
}

/* Genera un tag univoco (una sola parola) a partire dal nome. */
function generaTag(nome, escludiId) {
  const parti = norm(nome).replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = parti[0] || 'concorrente';
  const usati = new Set(stato.concorrenti.filter(c => c.id !== escludiId).map(c => norm(c.tag)));
  if (!usati.has(base)) return base;
  if (parti[1]) {
    const esteso = base + parti[1][0];
    if (!usati.has(esteso)) return esteso;
    const pieno = base + parti[1];
    if (!usati.has(pieno)) return pieno;
  }
  let n = 2;
  while (usati.has(base + n)) n++;
  return base + n;
}

/* ---------------- Salvataggio ---------------- */

function salva() {
  stato.aggiornato = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(stato));
  } catch (e) {
    toast('⚠️ Salvataggio non riuscito: memoria piena. Fai subito un backup.');
    console.error(e);
  }
}

function salvaUi() {
  try {
    localStorage.setItem(KEY_UI, JSON.stringify({ vista: ui.vista, giorno: ui.giorno, cid: ui.cid }));
  } catch (e) { /* non critico */ }
}

function carica() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object' && Array.isArray(s.concorrenti)) stato = migra(s);
    }
  } catch (e) {
    console.error('Dati illeggibili', e);
    toast('⚠️ Dati non leggibili: controlla i backup nel Setup.');
  }
  try {
    const rawUi = localStorage.getItem(KEY_UI);
    if (rawUi) Object.assign(ui, JSON.parse(rawUi));
  } catch (e) { /* non critico */ }
}

function migra(s) {
  const base = statoIniziale();
  s.impostazioni = Object.assign(base.impostazioni, s.impostazioni || {});
  s.note = (s.note || []).map(n => Object.assign({ tags: [], fatto: {}, fattoGen: false }, n));
  s.domande = (s.domande || []).map(d => Object.assign({ fatto: {} }, d));
  s.concorrenti = (s.concorrenti || []).map((c, i) => Object.assign({ attivo: true, colore: nuovoColore(i) }, c));
  s.ultimoBackup = s.ultimoBackup || 0;
  return s;
}

/* Copia di sicurezza automatica: una al giorno, ne conserva le ultime 8. */
function snapshotGiornaliero() {
  try {
    const oggi = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(KEY_SNAP);
    const snaps = raw ? JSON.parse(raw) : [];
    if (snaps.some(s => s.data === oggi)) return;
    if (!stato.note.length && !stato.domande.length) return;
    snaps.push({ data: oggi, ts: Date.now(), stato: JSON.stringify(stato) });
    while (snaps.length > MAX_SNAP) snaps.shift();
    localStorage.setItem(KEY_SNAP, JSON.stringify(snaps));
  } catch (e) {
    console.warn('Snapshot non riuscito', e);
  }
}

function leggiSnapshot() {
  try {
    const raw = localStorage.getItem(KEY_SNAP);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

/* ---------------- Riconoscimento concorrenti ---------------- */

/* Tag scritti a mano nel testo, es. @marco */
function tagsDalTesto(testo) {
  const trovati = new Set();
  const re = /@([\p{L}\p{N}_]+)/gu;
  let m;
  while ((m = re.exec(testo || '')) !== null) {
    const t = norm(m[1]);
    const c = stato.concorrenti.find(x => norm(x.tag) === t) ||
              stato.concorrenti.find(x => norm(x.nome).replace(/\s+/g, '') === t);
    if (c) trovati.add(c.id);
  }
  return [...trovati];
}

/* Minuscolo senza togliere gli accenti: in italiano servono a distinguere
   le parole comuni dai nomi propri (per esempio "sara" da "sara'"). */
function normLeggera(s) {
  return (s || '').toString().toLowerCase();
}

/* Nomi citati nel testo libero (usato dall'importazione) */
function nomiNelTesto(testo) {
  const t = ' ' + normLeggera(testo).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const trovati = new Set();

  for (const c of stato.concorrenti) {
    if (c.attivo === false) continue;

    const varianti = new Set();
    const aggiungi = (v) => {
      if (!v || v.length < 3) return;
      varianti.add(v);
      // Chi scrive potrebbe omettere gli accenti del nome.
      const senzaAccenti = norm(v);
      if (senzaAccenti !== v) varianti.add(senzaAccenti);
    };

    aggiungi(normLeggera(c.tag));
    const parole = normLeggera(c.nome).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    aggiungi(parole[0]);
    if (parole.length > 1) aggiungi(parole.join(' '));

    for (const v of varianti) {
      if (t.includes(' ' + v + ' ')) { trovati.add(c.id); break; }
    }
  }
  return [...trovati];
}

/* ---------------- Interrogazioni ---------------- */

function noteDelGiorno(g) {
  return stato.note.filter(n => n.giorno === g).sort((a, b) => b.creato - a.creato);
}

function noteDi(cid, g) {
  return stato.note
    .filter(n => (g == null || n.giorno === g) && n.tags.includes(cid))
    .sort((a, b) => a.creato - b.creato);
}

function domandeDi(g) {
  return stato.domande.filter(d => d.giorno === g).sort((a, b) => a.creato - b.creato);
}

function avanzamento(cid, g) {
  const dom = domandeDi(g);
  const note = noteDi(cid, g);
  const tot = dom.length + note.length;
  let fatte = 0;
  for (const d of dom) if (d.fatto[cid]) fatte++;
  for (const n of note) if (n.fatto[cid]) fatte++;
  return { tot, fatte };
}

/* ---------------- Rendering ---------------- */

function render() {
  const a = document.activeElement;
  const keep = a && a.dataset && a.dataset.keep
    ? { k: a.dataset.keep, s: a.selectionStart, e: a.selectionEnd } : null;

  document.getElementById('sottotitolo').textContent = sottotitolo();
  app().innerHTML = vistaCorrente();

  for (const b of document.querySelectorAll('#tabbar button')) {
    if (b.dataset.view === ui.vista) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }

  if (keep) {
    const el = app().querySelector(`[data-keep="${keep.k}"]`);
    if (el) {
      el.focus();
      try { el.setSelectionRange(keep.s, keep.e); } catch (_) { /* non selezionabile */ }
    }
  }
  dopoRender();
  salvaUi();
}

function sottotitolo() {
  if (ui.vista === 'giorni' || ui.vista === 'concorrenti') return 'Day ' + ui.giorno;
  return '';
}

function vistaCorrente() {
  switch (ui.vista) {
    case 'giorni': return vistaGiorni();
    case 'concorrenti': return ui.cid ? vistaConcorrente() : vistaElencoConcorrenti();
    case 'import': return vistaImport();
    case 'export': return vistaExport();
    case 'setup': return vistaSetup();
    default: return vistaGiorni();
  }
}

function barraGiorni(attivo, azione) {
  return `<div class="daybar">` + giorniLista().map(g => {
    const n = stato.note.filter(x => x.giorno === g).length;
    return `<button class="daychip" data-act="${azione}" data-g="${g}" aria-pressed="${g === attivo}">Day ${g}${n ? '<span class="dot"></span>' : ''}</button>`;
  }).join('') + `</div>`;
}

function avatar(c, cls) {
  return `<span class="avatar ${cls || ''}" style="background:${coloreDi(c)}">${esc(iniziali(c.nome))}</span>`;
}

/* Evidenzia le @menzioni nel testo della nota */
function testoConMenzioni(testo) {
  return esc(testo).replace(/@([\p{L}\p{N}_]+)/gu, (tutto, t) => {
    const c = stato.concorrenti.find(x => norm(x.tag) === norm(t));
    if (!c) return tutto;
    return `<span class="mention" style="color:${coloreDi(c)};background:${coloreDi(c).replace('hsl(', 'hsla(').replace(')', ' / 0.13)')}">@${esc(t)}</span>`;
  });
}

function bannerBackup() {
  const giorniDaBackup = (Date.now() - (stato.ultimoBackup || 0)) / 86400000;
  if (!stato.note.length || giorniDaBackup < 1) return '';
  const mai = !stato.ultimoBackup;
  return `<div class="banner">
    <span class="grow">${mai ? 'Non hai ancora fatto un backup.' : 'Ultimo backup oltre 24 ore fa.'} Scarica il file per non rischiare di perdere il lavoro.</span>
    <button class="btn sm" data-act="backup">Backup</button>
  </div>`;
}

/* ---------------- Vista: Giorni ---------------- */

function vistaGiorni() {
  if (!stato.concorrenti.length) {
    return `<div class="empty" style="margin-top:20px">
      Nessun concorrente inserito.<br><br>
      Vai in <b>Setup</b> e aggiungi i concorrenti: da lì potrai richiamarli con <b>@nome</b> mentre scrivi.
      <div style="margin-top:14px"><button class="btn primary" data-act="vai" data-v="setup">Apri il Setup</button></div>
    </div>`;
  }

  const tutte = ui.qTutti ? [...stato.note].sort((a, b) => b.creato - a.creato) : noteDelGiorno(ui.giorno);
  const q = norm(ui.q).trim();
  const filtrate = tutte.filter(n => {
    if (q && !norm(n.testo + ' ' + (n.autore || '')).includes(q)) return false;
    if (ui.filtro === 'dafare' && statoNota(n) === 'fatte') return false;
    if (ui.filtro === 'fatte' && statoNota(n) !== 'fatte') return false;
    return true;
  });

  const conTag = filtrate.filter(n => n.tags.length);
  const generali = filtrate.filter(n => !n.tags.length);

  return `
  ${bannerBackup()}
  ${barraGiorni(ui.giorno, 'giorno')}

  <div class="composer">
    <div class="ac" id="ac" hidden></div>
    <textarea data-keep="composer" id="composer" placeholder="Appunto del Day ${ui.giorno}… scrivi @ per richiamare un concorrente"></textarea>
    <div class="composer-actions">
      <span class="composer-hint" id="hint"></span>
      <button class="btn primary" data-act="addNota">Aggiungi</button>
    </div>
  </div>

  <div class="toolbar">
    <input class="field search" data-keep="cerca" data-act="cerca" placeholder="Cerca nelle note…" value="${esc(ui.q)}">
    <button class="btn sm ${ui.qTutti ? 'primary' : 'ghost'}" data-act="qTutti">${ui.qTutti ? 'Tutti i giorni' : 'Solo Day ' + ui.giorno}</button>
  </div>
  <div class="toolbar">
    <div class="seg">
      <button data-act="filtro" data-v="tutte" aria-pressed="${ui.filtro === 'tutte'}">Tutte</button>
      <button data-act="filtro" data-v="dafare" aria-pressed="${ui.filtro === 'dafare'}">Da fare</button>
      <button data-act="filtro" data-v="fatte" aria-pressed="${ui.filtro === 'fatte'}">Fatte</button>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Note con concorrenti <span class="count">${conTag.length}</span></h2>
    ${conTag.length ? conTag.map(cardNota).join('') : `<div class="empty">Nessuna nota${q ? ' per questa ricerca' : ''}.</div>`}
  </div>

  <div class="section">
    <h2 class="section-title">Generali <span class="count">${generali.length}</span></h2>
    ${generali.length
      ? generali.map(cardNota).join('')
      : `<div class="empty">Le note che non citano nessun concorrente finiscono qui.</div>`}
  </div>`;
}

/* 'fatte' se spuntata per tutti i concorrenti citati (o, se generale, se spuntata) */
function statoNota(n) {
  if (!n.tags.length) return n.fattoGen ? 'fatte' : 'dafare';
  return n.tags.every(cid => n.fatto[cid]) ? 'fatte' : 'dafare';
}

function cardNota(n) {
  if (ui.modifica === n.id) return cardNotaModifica(n);

  const meta = [];
  if (n.autore) meta.push(esc(n.autore));
  if (n.ora) meta.push(esc(n.ora));
  meta.push('Day ' + n.giorno);
  const fatte = n.tags.filter(cid => n.fatto[cid]).length;

  return `<article class="note ${n.daRivedere ? 'rivedere' : ''}">
    <div class="note-meta">
      ${meta.map(m => `<span>${m}</span>`).join('<span>·</span>')}
      ${n.daRivedere ? '<span class="badge warn">da rivedere</span>' : ''}
      ${!n.tags.length ? '<span class="badge gen">generale</span>' : `<span class="badge">${fatte}/${n.tags.length} chiesto</span>`}
    </div>
    <div class="note-text">${testoConMenzioni(n.testo)}</div>
    ${n.tags.length ? `<div class="chips">${n.tags.map(cid => {
      const c = conc(cid);
      if (!c) return '';
      return `<button class="chip ${n.fatto[cid] ? 'done' : ''}" data-act="apriConc" data-cid="${cid}" data-g="${n.giorno}" style="border-color:${coloreDi(c)};color:${coloreDi(c)}">${esc(c.nome)}</button>`;
    }).join('')}</div>` : ''}
    <div class="note-tools">
      ${!n.tags.length
        ? `<button class="btn sm ghost" data-act="toggleGen" data-id="${n.id}">${n.fattoGen ? '☑ Trattata' : '☐ Segna trattata'}</button>` : ''}
      <button class="btn sm ghost" data-act="modifica" data-id="${n.id}">Modifica</button>
      <button class="btn sm danger" data-act="elimina" data-id="${n.id}">Elimina</button>
    </div>
  </article>`;
}

function cardNotaModifica(n) {
  return `<article class="note">
    <textarea class="field" data-keep="edit" id="edit-${n.id}" style="min-height:110px">${esc(n.testo)}</textarea>
    <div class="toolbar" style="margin:10px 0 0">
      <label class="composer-hint">Giorno:
        <select class="btn sm" data-act="spostaGiorno" data-id="${n.id}">
          ${giorniLista().map(g => `<option value="${g}" ${g === n.giorno ? 'selected' : ''}>Day ${g}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="note-tools">
      <button class="btn sm primary" data-act="salvaNota" data-id="${n.id}">Salva</button>
      <button class="btn sm ghost" data-act="annullaModifica">Annulla</button>
    </div>
  </article>`;
}

/* ---------------- Vista: elenco concorrenti ---------------- */

function vistaElencoConcorrenti() {
  if (!stato.concorrenti.length) {
    return `<div class="empty" style="margin-top:20px">Nessun concorrente. Aggiungili dal <b>Setup</b>.
      <div style="margin-top:14px"><button class="btn primary" data-act="vai" data-v="setup">Apri il Setup</button></div></div>`;
  }
  return `
  ${barraGiorni(ui.giorno, 'giorno')}
  <p class="help">Tocca un concorrente per aprire la sua scaletta del Day ${ui.giorno}.</p>
  <div class="people">
    ${stato.concorrenti.map(c => {
      const p = avanzamento(c.id, ui.giorno);
      const completo = p.tot > 0 && p.fatte === p.tot;
      return `<div class="person-card ${c.attivo === false ? 'off' : ''}" data-act="apriConc" data-cid="${c.id}">
        ${avatar(c)}
        <div class="info">
          <div class="nome">${esc(c.nome)}${c.attivo === false ? ' — disattivato' : ''}</div>
          <div class="meta">@${esc(c.tag)}</div>
        </div>
        <span class="stat ${completo ? 'full' : ''}">${p.fatte}/${p.tot}</span>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------------- Vista: singolo concorrente ---------------- */

function vistaConcorrente() {
  const c = conc(ui.cid);
  if (!c) { ui.cid = null; return vistaElencoConcorrenti(); }

  const g = ui.giorno;
  const dom = domandeDi(g);
  const note = noteDi(c.id, g);
  const p = avanzamento(c.id, g);
  const perc = p.tot ? Math.round((p.fatte / p.tot) * 100) : 0;

  const filtro = (fatto) => !(ui.soloDaFare && fatto);
  const domVis = dom.filter(d => filtro(!!d.fatto[c.id]));
  const noteVis = note.filter(n => filtro(!!n.fatto[c.id]));
  const generali = noteDelGiorno(g).filter(n => !n.tags.length);

  return `
  <div class="person-head">
    ${avatar(c)}
    <div>
      <div class="nome">${esc(c.nome)}</div>
      <div class="tag">@${esc(c.tag)}${c.attivo === false ? ' · disattivato' : ''}</div>
    </div>
    <div class="nav-arrows">
      <button class="btn sm" data-act="concPrec" title="Concorrente precedente">‹</button>
      <button class="btn sm" data-act="concSucc" title="Concorrente successivo">›</button>
      <button class="btn sm ghost" data-act="elencoConc">Elenco</button>
    </div>
  </div>

  ${barraGiorni(g, 'giorno')}

  <div class="progress">
    <div class="progress-head"><span>Avanzamento Day ${g}</span><span>${p.fatte} di ${p.tot}</span></div>
    <div class="bar"><i style="width:${perc}%"></i></div>
  </div>

  <div class="toolbar">
    <button class="btn sm ${ui.soloDaFare ? 'primary' : 'ghost'}" data-act="soloDaFare">${ui.soloDaFare ? 'Solo da fare' : 'Tutte le voci'}</button>
    <button class="btn sm ghost" data-act="esportaConc" data-cid="${c.id}">Esporta ODT</button>
  </div>

  <div class="section">
    <h2 class="section-title">Domande standard — Day ${g} <span class="count">${dom.filter(d => d.fatto[c.id]).length}/${dom.length}</span></h2>
    ${dom.length === 0
      ? `<div class="empty">Nessuna domanda standard per il Day ${g}. Le imposti dal <b>Setup</b>.</div>`
      : (domVis.length
          ? domVis.map(d => rigaSpunta(d.testo, !!d.fatto[c.id], `data-act="toggleDom" data-id="${d.id}" data-cid="${c.id}"`)).join('')
          : `<div class="empty">Tutte le domande standard sono state fatte.</div>`)}
  </div>

  <div class="section">
    <h2 class="section-title">Note su ${esc(c.nome)} — Day ${g} <span class="count">${note.filter(n => n.fatto[c.id]).length}/${note.length}</span></h2>
    ${note.length === 0
      ? `<div class="empty">Nessuna nota che cita @${esc(c.tag)} nel Day ${g}.</div>`
      : (noteVis.length
          ? noteVis.map(n => {
              const altri = n.tags.filter(x => x !== c.id).map(x => conc(x)).filter(Boolean);
              const extra = `${n.autore ? `<div class="note-meta" style="margin:6px 0 0">${esc(n.autore)}${n.ora ? ' · ' + esc(n.ora) : ''}</div>` : ''}
                ${altri.length ? `<div class="chips">${altri.map(o => `<button class="chip" data-act="apriConc" data-cid="${o.id}" data-g="${g}" style="border-color:${coloreDi(o)};color:${coloreDi(o)}">${esc(o.nome)}</button>`).join('')}</div>` : ''}`;
              return rigaSpunta(n.testo, !!n.fatto[c.id], `data-act="toggleNota" data-id="${n.id}" data-cid="${c.id}"`, extra, n.daRivedere);
            }).join('')
          : `<div class="empty">Tutte le note sono state trattate.</div>`)}
  </div>

  ${generali.length ? `<details class="fold">
    <summary>Note generali del Day ${g} (${generali.length})</summary>
    <div class="fold-body">
      ${generali.map(n => `<div class="note" style="margin-bottom:8px"><div class="note-text">${testoConMenzioni(n.testo)}</div></div>`).join('')}
    </div>
  </details>` : ''}`;
}

function rigaSpunta(testo, fatto, attrs, extra, rivedere) {
  return `<div class="check ${fatto ? 'on' : ''}" ${attrs}>
    <span class="box">✓</span>
    <div class="check-body">
      <div class="check-text">${testoConMenzioni(testo)}</div>
      ${rivedere ? '<div class="note-meta" style="margin:6px 0 0"><span class="badge warn">da rivedere</span></div>' : ''}
      ${extra || ''}
    </div>
  </div>`;
}

/* ---------------- Vista: Importa ---------------- */

function vistaImport() {
  const a = ui.anteprima;
  return `
  <h2 class="section-title">Importa da chat</h2>
  <p class="help">
    Incolla qui i messaggi copiati da WhatsApp (o qualunque altro testo). I messaggi vengono riportati
    <b>parola per parola</b>, senza interpretazioni: l'app riconosce solo i nomi dei concorrenti per catalogarli.
    Le note importate restano marcate <b>“da rivedere”</b> finché non le modifichi.
  </p>

  <div class="row">
    <span class="grow">Giorno di destinazione</span>
    <select class="btn sm" data-act="importGiorno">
      ${giorniLista().map(g => `<option value="${g}" ${g === ui.importGiorno ? 'selected' : ''}>Day ${g}</option>`).join('')}
    </select>
  </div>

  <div class="row">
    <span class="grow">Considera anche il nome di chi scrive</span>
    <button class="switch" data-act="importAutore" aria-pressed="${ui.importAutore === true}"></button>
  </div>
  <p class="help">Tienilo spento se nella chat scrivono i colleghi di produzione: eviti che il nome di chi manda il messaggio venga scambiato per un concorrente.</p>

  <textarea class="field" data-keep="incolla" data-act="testoImport" id="incolla" placeholder="Incolla qui i messaggi…" style="min-height:150px;margin-bottom:10px">${esc(ui.testoImport || '')}</textarea>

  <div class="btn-row" style="margin-bottom:16px">
    <button class="btn primary" data-act="analizza">Analizza</button>
    ${a ? `<button class="btn ghost" data-act="annullaImport">Ricomincia</button>` : ''}
  </div>

  ${a ? anteprimaImport(a) : ''}`;
}

function anteprimaImport(a) {
  const sel = a.voci.filter(v => v.sel).length;
  const conNome = a.voci.filter(v => v.tags.length).length;
  return `
  <div class="progress">
    <div class="progress-head">
      <span>${a.voci.length} messaggi riconosciuti · ${conNome} con concorrenti</span>
      <span>${sel} selezionati</span>
    </div>
  </div>
  <div class="btn-row" style="margin-bottom:12px">
    <button class="btn sm ghost" data-act="selTutti">Seleziona tutti</button>
    <button class="btn sm ghost" data-act="selNessuno">Deseleziona tutti</button>
    <button class="btn sm ghost" data-act="selConNome">Solo quelli con un concorrente</button>
  </div>

  ${a.voci.map((v, i) => `
    <div class="prev-item ${v.sel ? '' : 'off'}" data-act="togglePrev" data-i="${i}">
      <span class="box" style="${v.sel ? 'background:var(--ok);border-color:var(--ok);color:#0b1b14' : ''}">✓</span>
      <div class="check-body">
        ${v.autore || v.ora ? `<div class="note-meta">${esc(v.autore || '')}${v.ora ? ' · ' + esc(v.ora) : ''}</div>` : ''}
        <div class="check-text">${esc(v.testo)}</div>
        <div class="chips">
          ${v.tags.length
            ? v.tags.map(cid => { const c = conc(cid); return c ? `<span class="chip" style="border-color:${coloreDi(c)};color:${coloreDi(c)}">${esc(c.nome)}</span>` : ''; }).join('')
            : '<span class="badge gen">generale</span>'}
        </div>
      </div>
    </div>`).join('')}

  <button class="btn primary block" data-act="importa" style="margin-top:12px" ${sel ? '' : 'disabled'}>Importa ${sel} note nel Day ${ui.importGiorno}</button>`;
}

/* ---------------- Vista: Esporta ---------------- */

function vistaExport() {
  const c = ui.cid ? conc(ui.cid) : null;
  return `
  <h2 class="section-title">Esporta in ODT</h2>
  <p class="help">Il file <b>.odt</b> si apre con LibreOffice, OpenOffice, Word e Google Documenti. Le spunte compaiono come ☑ / ☐.</p>

  <div class="row">
    <span class="grow">Concorrente</span>
    <select class="btn sm" data-act="expConc">
      <option value="">— scegli —</option>
      ${stato.concorrenti.map(x => `<option value="${x.id}" ${c && c.id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
    </select>
  </div>
  <div class="row">
    <span class="grow">Giorno</span>
    <select class="btn sm" data-act="giornoSelect">
      ${giorniLista().map(g => `<option value="${g}" ${g === ui.giorno ? 'selected' : ''}>Day ${g}</option>`).join('')}
    </select>
  </div>
  <div class="row">
    <span class="grow">Includi anche le voci già spuntate</span>
    <button class="switch" data-act="expFatte" aria-pressed="${ui.expFatte !== false}"></button>
  </div>
  <div class="row">
    <span class="grow">Includi le note generali del giorno</span>
    <button class="switch" data-act="expGenerali" aria-pressed="${ui.expGenerali !== false}"></button>
  </div>

  <div class="section" style="margin-top:18px">
    <h2 class="section-title">Cosa esportare</h2>
    <div class="btn-row">
      <button class="btn block" data-act="exp" data-tipo="conc-giorno" ${c ? '' : 'disabled'}>${c ? esc(c.nome) : 'Concorrente'} — Day ${ui.giorno}</button>
      <button class="btn block" data-act="exp" data-tipo="conc-tutti" ${c ? '' : 'disabled'}>${c ? esc(c.nome) : 'Concorrente'} — tutti i giorni</button>
      <button class="btn block" data-act="exp" data-tipo="giorno">Day ${ui.giorno} — tutti i concorrenti</button>
      <button class="btn block primary" data-act="exp" data-tipo="tutto">Tutto (${stato.impostazioni.giorni} giorni)</button>
    </div>
  </div>`;
}

/* ---------------- Vista: Setup ---------------- */

function vistaSetup() {
  const g = ui.setupGiorno;
  const dom = domandeDi(g);
  const snaps = leggiSnapshot();

  return `
  ${bannerBackup()}

  <div class="section">
    <h2 class="section-title">Concorrenti <span class="count">${stato.concorrenti.filter(c => c.attivo !== false).length} attivi</span></h2>
    <p class="help">Il <b>tag</b> è la parola che scrivi dopo la @. Disattiva un concorrente per toglierlo dai suggerimenti senza perderne lo storico.</p>
    ${stato.concorrenti.map(c => `
      <div class="row">
        ${avatar(c)}
        <div class="grow">
          <input class="inline" data-act="rinomina" data-cid="${c.id}" value="${esc(c.nome)}" placeholder="Nome">
          <div class="meta" style="font-size:12.5px;color:var(--text-faint)">@${esc(c.tag)} · ${stato.note.filter(n => n.tags.includes(c.id)).length} note</div>
        </div>
        <button class="switch" data-act="attivaConc" data-cid="${c.id}" aria-pressed="${c.attivo !== false}"></button>
        <button class="btn sm danger" data-act="eliminaConc" data-cid="${c.id}">✕</button>
      </div>`).join('')}
    <div class="row">
      <input class="inline grow" data-keep="nuovoConc" id="nuovoConc" placeholder="Nome del nuovo concorrente">
      <button class="btn sm primary" data-act="addConc">Aggiungi</button>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Domande standard</h2>
    <p class="help">Ogni giorno ha il suo elenco: queste domande compaiono nella pagina di <b>ogni</b> concorrente, con una spunta indipendente per ciascuno.</p>
    ${barraGiorni(g, 'setupGiorno')}
    ${dom.map(d => `
      <div class="row">
        <div class="grow"><input class="inline" data-act="modDomanda" data-id="${d.id}" value="${esc(d.testo)}"></div>
        <button class="btn sm danger" data-act="eliminaDomanda" data-id="${d.id}">✕</button>
      </div>`).join('')}
    <div class="row">
      <input class="inline grow" data-keep="nuovaDomanda" id="nuovaDomanda" placeholder="Nuova domanda per il Day ${g}">
      <button class="btn sm primary" data-act="addDomanda">Aggiungi</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <select class="btn sm" data-act="copiaDaGiorno">
        <option value="">Copia le domande da…</option>
        ${giorniLista().filter(x => x !== g).map(x => `<option value="${x}">Day ${x} (${domandeDi(x).length})</option>`).join('')}
      </select>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Backup e sicurezza dei dati</h2>
    <p class="help">
      Le note vivono <b>solo su questo dispositivo</b>: non passano da internet e nessuno può leggerle da remoto.
      Il rovescio della medaglia è che se cancelli i dati del browser spariscono. Scarica un backup a fine giornata,
      e usalo anche per spostare il lavoro fra telefono e PC.
    </p>
    <div class="row"><span class="grow">Ultimo backup</span>
      <span style="color:var(--text-dim)">${stato.ultimoBackup ? new Date(stato.ultimoBackup).toLocaleString('it-IT') : 'mai'}</span></div>
    <div class="row"><span class="grow">Memoria persistente</span>
      <span id="persist" style="color:var(--text-dim)">verifica…</span></div>
    <div class="btn-row" style="margin-bottom:10px">
      <button class="btn primary" data-act="backup">Scarica backup</button>
      <button class="btn" data-act="ripristina">Carica backup</button>
    </div>
    <p class="help">Copie automatiche di sicurezza sul dispositivo (una al giorno, ultime ${MAX_SNAP}):</p>
    ${snaps.length
      ? snaps.slice().reverse().map(s => `<div class="row"><span class="grow">${s.data}</span>
          <button class="btn sm ghost" data-act="ripristinaSnap" data-data="${s.data}">Ripristina</button></div>`).join('')
      : '<div class="empty">Ancora nessuna copia automatica.</div>'}
  </div>

  <div class="section">
    <h2 class="section-title">Generale</h2>
    <div class="row">
      <span class="grow">Numero di giorni</span>
      <input class="btn sm" style="width:70px;text-align:center" type="number" min="1" max="30" value="${stato.impostazioni.giorni}" data-act="numGiorni">
    </div>
    <div class="row">
      <span class="grow">Note totali</span>
      <span style="color:var(--text-dim)">${stato.note.length}</span>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn danger" data-act="reset">Cancella tutti i dati</button>
    </div>
  </div>`;
}

/* ============================================================
   Importazione da chat
   I messaggi vengono riportati fedelmente: si riconoscono
   soltanto data, ora, autore e i nomi dei concorrenti.
   ============================================================ */

/* Caratteri invisibili che WhatsApp inserisce nelle esportazioni */
const CH_DIREZIONE = String.fromCharCode(0x200e, 0x200f);
const CH_SPAZI = String.fromCharCode(0x00a0, 0x202f);
const CH_TRATTINI = String.fromCharCode(0x2013, 0x2014);
const RE_INVISIBILI = new RegExp('[' + CH_DIREZIONE + ']', 'g');
const RE_SPAZI_STRANI = new RegExp('[' + CH_SPAZI + ']', 'g');

/* Android: "07/09/26, 14:32 - Mario: testo"
   iPhone:  "[07/09/26, 14:32:11] Mario: testo" */
const RE_DATA = new RegExp(
  '^\\[?\\s*(\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}),?\\s+' +
  '(\\d{1,2}[:.]\\d{2}(?::\\d{2})?)\\s*(?:[APap]\\.?\\s?[Mm]\\.?)?\\s*\\]?' +
  '\\s*(?:[-' + CH_TRATTINI + ']\\s*)?'
);
const RE_AUTORE = /^([^:\n]{1,60}):[ \t]?([\s\S]*)$/;

function analizzaChat(testo) {
  const righe = (testo || '')
    .replace(/\r/g, '')
    .replace(RE_INVISIBILI, '')
    .replace(RE_SPAZI_STRANI, ' ')
    .split('\n');
  const voci = [];
  let corrente = null;

  for (const riga of righe) {
    const md = riga.match(RE_DATA);
    if (md) {
      const ma = riga.slice(md[0].length).match(RE_AUTORE);
      if (ma) {
        corrente = { autore: ma[1].trim(), data: md[1], ora: md[2], testo: ma[2].trim() };
        voci.push(corrente);
      } else {
        corrente = null; // messaggio di sistema ("X ha aggiunto Y"): ignorato
      }
      continue;
    }
    if (corrente) corrente.testo += '\n' + riga;
  }

  let risultato = voci.filter(v => v.testo.trim());

  // Nessun formato chat riconosciuto: i blocchi di testo diventano note singole.
  if (!risultato.length) {
    const t = (testo || '').replace(/\r/g, '').trim();
    if (!t) return { voci: [] };
    let blocchi = t.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    if (blocchi.length <= 1) blocchi = t.split('\n').map(x => x.trim()).filter(Boolean);
    risultato = blocchi.map(b => ({ autore: '', data: '', ora: '', testo: b }));
  }

  return {
    voci: risultato.map(v => {
      const tags = nomiNelTesto(v.testo + (ui.importAutore ? ' ' + v.autore : ''));
      return { autore: v.autore, ora: v.ora, data: v.data, testo: v.testo.trim(), tags, sel: tags.length > 0 };
    }),
  };
}

/* ============================================================
   Esportazione ODT (archivio ZIP non compresso + XML OpenDocument)
   ============================================================ */

let TAB_CRC = null;
function crc32(u8) {
  if (!TAB_CRC) {
    TAB_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TAB_CRC[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) crc = TAB_CRC[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const oraDos = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dataDos = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

  const pezzi = [];
  const centrale = [];
  let offset = 0;

  for (const f of files) {
    const nome = enc.encode(f.name);
    const crc = crc32(f.data);

    const lh = new Uint8Array(30 + nome.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);            // metodo 0 = nessuna compressione
    dv.setUint16(10, oraDos, true);
    dv.setUint16(12, dataDos, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, nome.length, true);
    dv.setUint16(28, 0, true);
    lh.set(nome, 30);

    const ch = new Uint8Array(46 + nome.length);
    const dc = new DataView(ch.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(8, 0, true);
    dc.setUint16(10, 0, true);
    dc.setUint16(12, oraDos, true);
    dc.setUint16(14, dataDos, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, f.data.length, true);
    dc.setUint32(24, f.data.length, true);
    dc.setUint16(28, nome.length, true);
    dc.setUint32(38, 0, true);
    dc.setUint32(42, offset, true);
    ch.set(nome, 46);

    pezzi.push(lh, f.data);
    centrale.push(ch);
    offset += lh.length + f.data.length;
  }

  let dimCentrale = 0;
  for (const c of centrale) dimCentrale += c.length;

  const eocd = new Uint8Array(22);
  const de = new DataView(eocd.buffer);
  de.setUint32(0, 0x06054b50, true);
  de.setUint16(8, files.length, true);
  de.setUint16(10, files.length, true);
  de.setUint32(12, dimCentrale, true);
  de.setUint32(16, offset, true);

  return new Blob([...pezzi, ...centrale, eocd], { type: 'application/vnd.oasis.opendocument.text' });
}

/* Rimuove i caratteri non ammessi in XML e protegge i simboli speciali. */
function xmlEsc(s) {
  let out = '';
  for (const ch of (s == null ? '' : String(s))) {
    const c = ch.codePointAt(0);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a) continue;
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else out += ch;
  }
  return out;
}

const BOX_ON = String.fromCharCode(0x2611) + '  ';
const BOX_OFF = String.fromCharCode(0x2610) + '  ';

function paragrafo(testo, stile) {
  const righe = (testo || '').split('\n').map(xmlEsc);
  return `<text:p text:style-name="${stile}">${righe.join('<text:line-break/>')}</text:p>`;
}

function odtBlob(titolo, blocchi) {
  const corpo = blocchi.map(b => {
    switch (b.tipo) {
      case 'titolo': return paragrafo(b.testo, 'Titolo');
      case 'h1': return `<text:h text:style-name="Titolo_20_1" text:outline-level="1">${xmlEsc(b.testo)}</text:h>`;
      case 'h2': return `<text:h text:style-name="Titolo_20_2" text:outline-level="2">${xmlEsc(b.testo)}</text:h>`;
      case 'sez': return paragrafo(b.testo, 'Sezione');
      case 'meta': return paragrafo(b.testo, 'Meta');
      case 'check': return paragrafo((b.fatto ? BOX_ON : BOX_OFF) + b.testo, 'Voce');
      default: return paragrafo(b.testo, 'Standard');
    }
  }).join('');

  const NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
    `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ` +
    `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
    `xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"`;

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.2">
<office:scripts/><office:font-face-decls/><office:automatic-styles/>
<office:body><office:text>${corpo}</office:text></office:body>
</office:document-content>`;

  const stile = (nome, mostrato, dim, grassetto, sopra, sotto, colore) =>
    `<style:style style:name="${nome}" style:display-name="${mostrato}" style:family="paragraph" style:parent-style-name="Standard">` +
    `<style:paragraph-properties fo:margin-top="${sopra}cm" fo:margin-bottom="${sotto}cm" fo:keep-with-next="always"/>` +
    `<style:text-properties fo:font-size="${dim}pt" fo:font-weight="${grassetto ? 'bold' : 'normal'}"${colore ? ` fo:color="${colore}"` : ''}/></style:style>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.2">
<office:font-face-decls/>
<office:styles>
<style:style style:name="Standard" style:family="paragraph">
<style:paragraph-properties fo:margin-bottom="0.15cm"/>
<style:text-properties fo:font-family="Liberation Sans, Arial, sans-serif" fo:font-size="11pt"/></style:style>
${stile('Titolo', 'Titolo', 20, true, 0, 0.6)}
${stile('Titolo_20_1', 'Titolo 1', 15, true, 0.7, 0.25)}
${stile('Titolo_20_2', 'Titolo 2', 13, true, 0.5, 0.2)}
${stile('Sezione', 'Sezione', 11, true, 0.35, 0.15)}
${stile('Meta', 'Meta', 9, false, 0, 0.15, '#707070')}
<style:style style:name="Voce" style:display-name="Voce" style:family="paragraph" style:parent-style-name="Standard">
<style:paragraph-properties fo:margin-left="0.5cm" fo:margin-bottom="0.18cm" fo:text-indent="-0.5cm"/></style:style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
</office:document-styles>`;

  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">
<office:meta><dc:title>${xmlEsc(titolo)}</dc:title><meta:generator>Note e Interviste</meta:generator>
<dc:date>${new Date().toISOString().slice(0, 19)}</dc:date></office:meta></office:document-meta>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  const enc = new TextEncoder();
  return zipStore([
    { name: 'mimetype', data: enc.encode('application/vnd.oasis.opendocument.text') },
    { name: 'content.xml', data: enc.encode(content) },
    { name: 'styles.xml', data: enc.encode(styles) },
    { name: 'meta.xml', data: enc.encode(meta) },
    { name: 'META-INF/manifest.xml', data: enc.encode(manifest) },
  ]);
}

/* ---------- Composizione del documento ---------- */

function blocchiConcorrente(c, g, opt, conIntestazione) {
  const out = [];
  if (conIntestazione) out.push({ tipo: 'h2', testo: c.nome });

  const dom = domandeDi(g).filter(d => opt.fatte || !d.fatto[c.id]);
  out.push({ tipo: 'sez', testo: 'Domande standard' });
  if (dom.length) dom.forEach(d => out.push({ tipo: 'check', testo: d.testo, fatto: !!d.fatto[c.id] }));
  else out.push({ tipo: 'meta', testo: '- nessuna -' });

  const note = noteDi(c.id, g).filter(n => opt.fatte || !n.fatto[c.id]);
  out.push({ tipo: 'sez', testo: 'Note dal reality' });
  if (note.length) {
    note.forEach(n => {
      out.push({ tipo: 'check', testo: n.testo, fatto: !!n.fatto[c.id] });
      const m = [n.autore, n.ora].filter(Boolean).join(' - ');
      if (m) out.push({ tipo: 'meta', testo: m });
    });
  } else {
    out.push({ tipo: 'meta', testo: '- nessuna -' });
  }
  return out;
}

function blocchiGenerali(g) {
  const gen = noteDelGiorno(g).filter(n => !n.tags.length);
  if (!gen.length) return [];
  const out = [{ tipo: 'sez', testo: 'Note generali del giorno' }];
  gen.forEach(n => out.push({ tipo: 'check', testo: n.testo, fatto: !!n.fattoGen }));
  return out;
}

function costruisciDocumento(tipo) {
  const opt = { fatte: ui.expFatte !== false, generali: ui.expGenerali !== false };
  const c = ui.cid ? conc(ui.cid) : null;
  const g = ui.giorno;
  const blocchi = [];
  const attiviLista = () => stato.concorrenti.filter(x => x.attivo !== false);
  let titolo, nomeFile;

  if (tipo === 'conc-giorno' && c) {
    titolo = `Interviste - ${c.nome} - Day ${g}`;
    nomeFile = `Interviste_${c.nome}_Day${g}`;
    blocchi.push({ tipo: 'titolo', testo: titolo });
    blocchi.push(...blocchiConcorrente(c, g, opt, false));
    if (opt.generali) blocchi.push(...blocchiGenerali(g));
  } else if (tipo === 'conc-tutti' && c) {
    titolo = `Interviste - ${c.nome}`;
    nomeFile = `Interviste_${c.nome}_completo`;
    blocchi.push({ tipo: 'titolo', testo: titolo });
    for (const gg of giorniLista()) {
      blocchi.push({ tipo: 'h1', testo: 'Day ' + gg });
      blocchi.push(...blocchiConcorrente(c, gg, opt, false));
    }
  } else if (tipo === 'giorno') {
    titolo = `Interviste - Day ${g}`;
    nomeFile = `Interviste_Day${g}`;
    blocchi.push({ tipo: 'titolo', testo: titolo });
    for (const x of attiviLista()) blocchi.push(...blocchiConcorrente(x, g, opt, true));
    if (opt.generali) {
      const gen = blocchiGenerali(g);
      if (gen.length) { blocchi.push({ tipo: 'h2', testo: 'Generali' }); blocchi.push(...gen); }
    }
  } else {
    titolo = 'Interviste - documento completo';
    nomeFile = 'Interviste_completo';
    blocchi.push({ tipo: 'titolo', testo: titolo });
    for (const gg of giorniLista()) {
      blocchi.push({ tipo: 'h1', testo: 'Day ' + gg });
      for (const x of attiviLista()) blocchi.push(...blocchiConcorrente(x, gg, opt, true));
      if (opt.generali) {
        const gen = blocchiGenerali(gg);
        if (gen.length) { blocchi.push({ tipo: 'h2', testo: 'Generali' }); blocchi.push(...gen); }
      }
    }
  }

  return { blob: odtBlob(titolo, blocchi), nome: pulisciNome(nomeFile) + '.odt' };
}

function pulisciNome(s) {
  const combinanti = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
  return (s || 'documento').normalize('NFD').replace(combinanti, '')
    .replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function scarica(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================================================
   Backup, ripristino e azioni sui dati
   ============================================================ */

function faiBackup() {
  const nome = 'backup-interviste-' + new Date().toISOString().slice(0, 10) + '.json';
  scarica(new Blob([JSON.stringify(stato, null, 1)], { type: 'application/json' }), nome);
  stato.ultimoBackup = Date.now();
  salva();
  render();
  toast('Backup scaricato: ' + nome);
}

function unisciStato(nuovo) {
  const idsC = new Set(stato.concorrenti.map(c => c.id));
  let agg = 0;
  for (const c of nuovo.concorrenti || []) if (!idsC.has(c.id)) { stato.concorrenti.push(c); agg++; }

  const mappaNote = new Map(stato.note.map(n => [n.id, n]));
  for (const n of nuovo.note || []) {
    const e = mappaNote.get(n.id);
    if (!e) { stato.note.push(Object.assign({ tags: [], fatto: {} }, n)); agg++; }
    else { Object.assign(e.fatto, n.fatto || {}); e.fattoGen = e.fattoGen || !!n.fattoGen; }
  }

  const mappaDom = new Map(stato.domande.map(d => [d.id, d]));
  for (const d of nuovo.domande || []) {
    const e = mappaDom.get(d.id);
    if (!e) { stato.domande.push(Object.assign({ fatto: {} }, d)); agg++; }
    else Object.assign(e.fatto, d.fatto || {});
  }

  if ((nuovo.impostazioni || {}).giorni > stato.impostazioni.giorni) {
    stato.impostazioni.giorni = nuovo.impostazioni.giorni;
  }
  return agg;
}

function ripristinaDaFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      let nuovo;
      try {
        nuovo = JSON.parse(fr.result);
        if (!nuovo || !Array.isArray(nuovo.concorrenti)) throw new Error('formato');
      } catch (e) {
        toast('File di backup non valido.');
        return;
      }
      const sostituisci = confirm(
        'OK = SOSTITUISCI tutto con il backup (i dati attuali vengono persi).\n\n' +
        'Annulla = UNISCI il backup ai dati attuali (consigliato per portare il lavoro da un dispositivo all\'altro).'
      );
      if (sostituisci) {
        stato = migra(nuovo);
        salva();
        render();
        toast('Dati sostituiti con il backup.');
      } else {
        const n = unisciStato(migra(nuovo));
        salva();
        render();
        toast(n + ' elementi aggiunti dal backup.');
      }
    };
    fr.readAsText(f);
  });
  inp.click();
}

function ripristinaSnapshot(data) {
  const s = leggiSnapshot().find(x => x.data === data);
  if (!s) { toast('Copia non trovata.'); return; }
  if (!confirm('Ripristinare la copia del ' + data + '?\nI dati attuali verranno sostituiti.')) return;
  try {
    stato = migra(JSON.parse(s.stato));
    salva();
    render();
    toast('Ripristinata la copia del ' + data + '.');
  } catch (e) {
    toast('Copia illeggibile.');
  }
}

function aggiungiNota() {
  const testo = (ui.bozza || '').trim();
  if (!testo) { toast('Scrivi qualcosa prima di aggiungere.'); return; }
  const tags = tagsDalTesto(testo);
  stato.note.push({
    id: uid(), giorno: ui.giorno, testo, tags,
    autore: '', ora: '', origine: 'manuale', daRivedere: false,
    creato: Date.now(), fatto: {}, fattoGen: false,
  });
  ui.bozza = '';
  salva();
  render();
  toast(tags.length ? 'Nota aggiunta a ' + tags.length + ' concorrente/i.' : 'Nota aggiunta alle generali.');
}

function rinominaConcorrente(cid, nuovoNome) {
  const c = conc(cid);
  if (!c) return;
  const nome = (nuovoNome || '').trim();
  if (!nome || nome === c.nome) return;
  const vecchioTag = c.tag;
  c.nome = nome;
  const nuovoTag = generaTag(nome, cid);
  if (nuovoTag !== vecchioTag) {
    c.tag = nuovoTag;
    const re = new RegExp('@' + vecchioTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    for (const n of stato.note) {
      if (n.testo.match(re)) n.testo = n.testo.replace(re, '@' + nuovoTag);
    }
  }
  salva();
  render();
}

function eliminaConcorrente(cid) {
  const c = conc(cid);
  if (!c) return;
  const n = stato.note.filter(x => x.tags.includes(cid)).length;
  if (!confirm('Eliminare "' + c.nome + '"?\n' +
    (n ? 'Le ' + n + ' note che lo citano restano, ma perdono il collegamento.\n' : '') +
    'Se vuoi solo toglierlo dai suggerimenti, usa invece l\'interruttore per disattivarlo.')) return;
  stato.concorrenti = stato.concorrenti.filter(x => x.id !== cid);
  for (const nota of stato.note) {
    nota.tags = nota.tags.filter(x => x !== cid);
    delete nota.fatto[cid];
  }
  for (const d of stato.domande) delete d.fatto[cid];
  if (ui.cid === cid) ui.cid = null;
  salva();
  render();
}

function cambiaConcorrente(passo) {
  const lista = stato.concorrenti.filter(c => c.attivo !== false);
  if (!lista.length) return;
  let i = lista.findIndex(c => c.id === ui.cid);
  if (i < 0) i = 0;
  else i = (i + passo + lista.length) % lista.length;
  ui.cid = lista[i].id;
  window.scrollTo(0, 0);
  render();
}

function esporta(tipo) {
  try {
    const doc = costruisciDocumento(tipo);
    scarica(doc.blob, doc.nome);
    toast('Scaricato ' + doc.nome);
  } catch (e) {
    console.error(e);
    toast('Esportazione non riuscita.');
  }
}

/* ============================================================
   Eventi
   ============================================================ */

function vaiA(vista) {
  ui.vista = vista;
  ui.modifica = null;
  window.scrollTo(0, 0);
  render();
}

document.addEventListener('click', (ev) => {
  const tab = ev.target.closest('#tabbar button');
  if (tab) { vaiA(tab.dataset.view); return; }

  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const cid = el.dataset.cid;

  switch (act) {
    case 'vai': vaiA(el.dataset.v); break;

    case 'giorno':
      ui.giorno = +el.dataset.g;
      ui.modifica = null;
      render();
      break;

    case 'setupGiorno':
      ui.setupGiorno = +el.dataset.g;
      render();
      break;

    case 'addNota': aggiungiNota(); break;

    case 'filtro': ui.filtro = el.dataset.v; render(); break;
    case 'qTutti': ui.qTutti = !ui.qTutti; render(); break;
    case 'soloDaFare': ui.soloDaFare = !ui.soloDaFare; render(); break;

    case 'apriConc':
      ui.cid = cid;
      if (el.dataset.g) ui.giorno = +el.dataset.g;
      ui.vista = 'concorrenti';
      window.scrollTo(0, 0);
      render();
      break;

    case 'elencoConc': ui.cid = null; window.scrollTo(0, 0); render(); break;
    case 'concPrec': cambiaConcorrente(-1); break;
    case 'concSucc': cambiaConcorrente(1); break;

    case 'toggleNota': {
      const n = stato.note.find(x => x.id === id);
      if (!n) break;
      if (n.fatto[cid]) delete n.fatto[cid]; else n.fatto[cid] = true;
      salva();
      render();
      break;
    }

    case 'toggleDom': {
      const d = stato.domande.find(x => x.id === id);
      if (!d) break;
      if (d.fatto[cid]) delete d.fatto[cid]; else d.fatto[cid] = true;
      salva();
      render();
      break;
    }

    case 'toggleGen': {
      const n = stato.note.find(x => x.id === id);
      if (!n) break;
      n.fattoGen = !n.fattoGen;
      salva();
      render();
      break;
    }

    case 'modifica': ui.modifica = id; render(); break;
    case 'annullaModifica': ui.modifica = null; render(); break;

    case 'salvaNota': {
      const n = stato.note.find(x => x.id === id);
      const ta = document.getElementById('edit-' + id);
      if (n && ta) {
        n.testo = ta.value.trim();
        const daTag = tagsDalTesto(n.testo);
        n.tags = n.origine === 'import'
          ? [...new Set([...daTag, ...nomiNelTesto(n.testo)])]
          : daTag;
        for (const k of Object.keys(n.fatto)) if (!n.tags.includes(k)) delete n.fatto[k];
        n.daRivedere = false;
      }
      ui.modifica = null;
      salva();
      render();
      break;
    }

    case 'elimina': {
      if (!confirm('Eliminare definitivamente questa nota?')) break;
      stato.note = stato.note.filter(x => x.id !== id);
      ui.modifica = null;
      salva();
      render();
      break;
    }

    case 'analizza': {
      const ta = document.getElementById('incolla');
      const testo = ta ? ta.value : (ui.testoImport || '');
      if (!testo.trim()) { toast('Incolla prima i messaggi.'); break; }
      ui.testoImport = testo;
      ui.anteprima = analizzaChat(testo);
      render();
      if (!ui.anteprima.voci.length) toast('Nessun messaggio riconosciuto.');
      break;
    }

    case 'importAutore':
      ui.importAutore = ui.importAutore !== true;
      if (ui.anteprima && ui.testoImport) ui.anteprima = analizzaChat(ui.testoImport);
      render();
      break;

    case 'annullaImport': ui.anteprima = null; ui.testoImport = ''; render(); break;
    case 'selTutti': ui.anteprima.voci.forEach(v => { v.sel = true; }); render(); break;
    case 'selNessuno': ui.anteprima.voci.forEach(v => { v.sel = false; }); render(); break;
    case 'selConNome': ui.anteprima.voci.forEach(v => { v.sel = v.tags.length > 0; }); render(); break;

    case 'togglePrev': {
      const v = ui.anteprima.voci[+el.dataset.i];
      if (v) v.sel = !v.sel;
      render();
      break;
    }

    case 'importa': {
      const scelte = ui.anteprima.voci.filter(v => v.sel);
      if (!scelte.length) break;
      const base = Date.now();
      scelte.forEach((v, i) => {
        stato.note.push({
          id: uid(), giorno: ui.importGiorno, testo: v.testo, tags: v.tags.slice(),
          autore: v.autore || '', ora: v.ora || '', origine: 'import', daRivedere: true,
          creato: base + i, fatto: {}, fattoGen: false,
        });
      });
      ui.anteprima = null;
      ui.testoImport = '';
      ui.giorno = ui.importGiorno;
      ui.vista = 'giorni';
      salva();
      render();
      toast(scelte.length + ' note importate nel Day ' + ui.giorno + '.');
      break;
    }

    case 'exp': esporta(el.dataset.tipo); break;
    case 'esportaConc': ui.cid = cid; esporta('conc-giorno'); break;
    case 'expFatte': ui.expFatte = ui.expFatte === false; render(); break;
    case 'expGenerali': ui.expGenerali = ui.expGenerali === false; render(); break;

    case 'addConc': {
      const inp = document.getElementById('nuovoConc');
      const nome = inp ? inp.value.trim() : '';
      if (!nome) { toast('Scrivi il nome.'); break; }
      stato.concorrenti.push({
        id: uid(), nome, tag: generaTag(nome), attivo: true,
        colore: nuovoColore(stato.concorrenti.length),
      });
      salva();
      render();
      const nuovo = document.getElementById('nuovoConc');
      if (nuovo) nuovo.focus();
      break;
    }

    case 'attivaConc': {
      const c = conc(cid);
      if (c) { c.attivo = c.attivo === false; salva(); render(); }
      break;
    }

    case 'eliminaConc': eliminaConcorrente(cid); break;

    case 'addDomanda': {
      const inp = document.getElementById('nuovaDomanda');
      const testo = inp ? inp.value.trim() : '';
      if (!testo) { toast('Scrivi la domanda.'); break; }
      stato.domande.push({ id: uid(), giorno: ui.setupGiorno, testo, creato: Date.now(), fatto: {} });
      salva();
      render();
      const nuova = document.getElementById('nuovaDomanda');
      if (nuova) nuova.focus();
      break;
    }

    case 'eliminaDomanda': {
      if (!confirm('Eliminare questa domanda standard?')) break;
      stato.domande = stato.domande.filter(x => x.id !== id);
      salva();
      render();
      break;
    }

    case 'backup': faiBackup(); break;
    case 'ripristina': ripristinaDaFile(); break;
    case 'ripristinaSnap': ripristinaSnapshot(el.dataset.data); break;

    case 'reset': {
      if (!confirm('Cancellare TUTTI i dati (concorrenti, note, domande)?')) break;
      if (!confirm('Conferma definitiva: l\'operazione non si puo annullare. Hai scaricato un backup?')) break;
      stato = statoIniziale();
      ui.cid = null;
      ui.anteprima = null;
      salva();
      render();
      toast('Dati cancellati.');
      break;
    }
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  switch (el.dataset.act) {
    case 'importGiorno': ui.importGiorno = +el.value; render(); break;
    case 'giornoSelect': ui.giorno = +el.value; render(); break;
    case 'expConc': ui.cid = el.value || null; render(); break;

    case 'spostaGiorno': {
      const n = stato.note.find(x => x.id === el.dataset.id);
      if (n) { n.giorno = +el.value; salva(); }
      break;
    }

    case 'rinomina': rinominaConcorrente(el.dataset.cid, el.value); break;

    case 'modDomanda': {
      const d = stato.domande.find(x => x.id === el.dataset.id);
      if (d) { d.testo = el.value.trim(); salva(); }
      break;
    }

    case 'copiaDaGiorno': {
      const da = +el.value;
      if (!da) break;
      const fonte = domandeDi(da);
      if (!fonte.length) { toast('Nessuna domanda nel Day ' + da + '.'); break; }
      const base = Date.now();
      fonte.forEach((d, i) => stato.domande.push({
        id: uid(), giorno: ui.setupGiorno, testo: d.testo, creato: base + i, fatto: {},
      }));
      salva();
      render();
      toast(fonte.length + ' domande copiate nel Day ' + ui.setupGiorno + '.');
      break;
    }

    case 'numGiorni': {
      const n = Math.max(1, Math.min(30, +el.value || 8));
      const perse = stato.note.filter(x => x.giorno > n).length;
      if (perse && !confirm(perse + ' note si trovano oltre il Day ' + n + '.\nRestano salvate ma non saranno visibili finche non rialzi il numero di giorni. Procedere?')) {
        render();
        break;
      }
      stato.impostazioni.giorni = n;
      if (ui.giorno > n) ui.giorno = n;
      if (ui.setupGiorno > n) ui.setupGiorno = n;
      if (ui.importGiorno > n) ui.importGiorno = n;
      salva();
      render();
      break;
    }
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'cerca') { ui.q = el.value; render(); }
  else if (el.dataset.act === 'testoImport') { ui.testoImport = el.value; }
});

/* ============================================================
   Composer con autocompletamento @nome
   ============================================================ */

const ac = { aperto: false, voci: [], sel: 0, inizio: 0, lung: 0 };

function dopoRender() {
  const ta = document.getElementById('composer');
  if (ta) {
    ta.value = ui.bozza || '';
    aggiornaSuggerimento();
    ta.addEventListener('input', () => { ui.bozza = ta.value; aggiornaSuggerimento(); aggiornaAc(); });
    ta.addEventListener('click', aggiornaAc);
    ta.addEventListener('keydown', tastiAc);
    ta.addEventListener('blur', () => setTimeout(chiudiAc, 260));
  }

  for (const idInput of ['nuovoConc', 'nuovaDomanda']) {
    const inp = document.getElementById(idInput);
    if (!inp) continue;
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const btn = inp.parentElement.querySelector('[data-act="addConc"], [data-act="addDomanda"]');
      if (btn) btn.click();
    });
  }

  const p = document.getElementById('persist');
  if (p) {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(ok => {
        p.textContent = ok ? 'attiva' : 'non garantita';
        p.style.color = ok ? 'var(--ok)' : 'var(--warn)';
      }).catch(() => { p.textContent = 'sconosciuta'; });
    } else {
      p.textContent = 'non supportata';
    }
  }
}

function aggiornaSuggerimento() {
  const h = document.getElementById('hint');
  if (!h) return;
  const tags = tagsDalTesto(ui.bozza || '');
  if (!(ui.bozza || '').trim()) h.textContent = 'Scrivi @ per taggare un concorrente';
  else if (!tags.length) h.textContent = 'Nessun concorrente citato: finira nelle generali';
  else h.textContent = 'Va a: ' + tags.map(id => (conc(id) || {}).nome).filter(Boolean).join(', ');
}

function chiudiAc() {
  ac.aperto = false;
  ac.voci = [];
  const box = document.getElementById('ac');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

function aggiornaAc() {
  const ta = document.getElementById('composer');
  const box = document.getElementById('ac');
  if (!ta || !box) return;

  const pos = ta.selectionStart;
  const prima = ta.value.slice(0, pos);
  const m = prima.match(/@([\p{L}\p{N}_]*)$/u);
  if (!m) { chiudiAc(); return; }

  const q = norm(m[1]);
  const lista = attivi().filter(c => !q || norm(c.tag).startsWith(q) || norm(c.nome).includes(q));
  if (!lista.length) { chiudiAc(); return; }

  ac.aperto = true;
  ac.voci = lista;
  ac.sel = 0;
  ac.inizio = pos - m[0].length;
  ac.lung = m[0].length;
  disegnaAc();
}

function disegnaAc() {
  const box = document.getElementById('ac');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = ac.voci.map((c, i) => `
    <div class="ac-item ${i === ac.sel ? 'sel' : ''}" data-i="${i}">
      ${avatar(c)}<span class="nome">${esc(c.nome)}</span><span class="tag">@${esc(c.tag)}</span>
    </div>`).join('');

  for (const it of box.querySelectorAll('.ac-item')) {
    // Con il mouse si blocca il default per non togliere il fuoco al campo di testo;
    // al tocco si lascia passare tutto, altrimenti alcuni browser annullano il tap.
    it.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') e.preventDefault(); });
    it.addEventListener('click', (e) => { e.preventDefault(); scegliAc(+it.dataset.i); });
  }
}

function scegliAc(i) {
  const ta = document.getElementById('composer');
  const c = ac.voci[i];
  if (!ta || !c) return;
  const testo = ta.value;
  const nuovo = testo.slice(0, ac.inizio) + '@' + c.tag + ' ' + testo.slice(ac.inizio + ac.lung);
  ta.value = nuovo;
  ui.bozza = nuovo;
  const caret = ac.inizio + c.tag.length + 2;
  ta.focus();
  ta.setSelectionRange(caret, caret);
  chiudiAc();
  aggiornaSuggerimento();
}

function tastiAc(e) {
  if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) && !ac.aperto) {
    e.preventDefault();
    aggiungiNota();
    return;
  }
  if (!ac.aperto) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); ac.sel = (ac.sel + 1) % ac.voci.length; disegnaAc(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); ac.sel = (ac.sel - 1 + ac.voci.length) % ac.voci.length; disegnaAc(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); scegliAc(ac.sel); }
  else if (e.key === 'Escape') { e.preventDefault(); chiudiAc(); }
}

/* ============================================================
   Avvio
   ============================================================ */

function avvio() {
  carica();
  snapshotGiornaliero();

  const max = stato.impostazioni.giorni || 8;
  if (!(ui.giorno >= 1 && ui.giorno <= max)) ui.giorno = 1;
  ui.setupGiorno = ui.giorno;
  ui.importGiorno = ui.giorno;
  if (ui.cid && !conc(ui.cid)) ui.cid = null;

  render();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(ok => { if (!ok) return navigator.storage.persist(); }).catch(() => {});
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) salva(); });
  window.addEventListener('pagehide', salva);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

avvio();
