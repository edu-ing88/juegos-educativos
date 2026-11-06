/* =====================================================================
   COMPLETAR FRASES - JavaScript puro
   Módulos: Util · Sound · Store · Confirm · Game · Admin
   ===================================================================== */
(() => {
'use strict';

/* ================= Util ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
const show = id => { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); };
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3000); }

/* Convierte "El [sol] sale" en partes de texto y espacios en blanco */
function parse(text) {
  const parts = []; let last = 0;
  text.replace(/\[([^\[\]]*)\]/g, (m, g, i) => {
    if (i > last) parts.push({ t: 'text', v: text.slice(last, i) });
    parts.push({ t: 'gap', v: g.trim() }); last = i + m.length; return m;
  });
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}
const gapsOf = text => parse(text).filter(p => p.t === 'gap');
const distractors = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
function checkSentence(text) {
  if (/[\[\]]/.test(text.replace(/\[([^\[\]]*)\]/g, ''))) return 'tiene corchetes sin cerrar o sobrantes';
  const g = gapsOf(text);
  if (!g.length) return 'necesita al menos un espacio entre corchetes, como [palabra]';
  if (g.some(x => !x.v)) return 'tiene un espacio vacío []';
  return '';
}
function validate(a) {
  if (!a.title.trim()) return 'Escribe un título para la actividad.';
  if (!a.sentences.length) return 'Agrega al menos una oración.';
  for (let i = 0; i < a.sentences.length; i++) { const e = checkSentence(a.sentences[i].text); if (e) return `La oración ${i + 1} ${e}.`; }
  if (!(a.time >= 0)) return 'El tiempo límite no es válido.';
  return '';
}

/* ================= Sound (Web Audio API) ================= */
const Sound = {
  on: true, ctx: null,
  seqs: {
    pick: [[520, 0, .08, 'triangle']], drop: [[330, 0, .08, 'sine', .2]], tick: [[440, 0, .12, 'square', .07]],
    ok: [[660, 0, .12], [880, .12, .22]],
    bad: [[240, 0, .16, 'sawtooth', .1], [160, .16, .28, 'sawtooth', .1]],
    win: [[523, 0, .15], [659, .15, .15], [784, .3, .15], [1047, .45, .5]]
  },
  play(n) {
    if (!this.on) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = this.ctx || new AC(); if (this.ctx.state === 'suspended') this.ctx.resume();
      const t0 = this.ctx.currentTime;
      this.seqs[n].forEach(([f, st, d, type = 'sine', v = .16]) => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + st); g.gain.linearRampToValueAtTime(v, t0 + st + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + st + d);
        o.connect(g).connect(this.ctx.destination); o.start(t0 + st); o.stop(t0 + st + d + .05);
      });
    } catch (e) { }
  }
};

/* ================= Store (LocalStorage) ================= */
function defaultActivity() {
  const d = [['El [sol] sale por la [mañana]', 'luna, noche'], ['Los [niños] juegan en el [parque]', 'casa, escuela'],
    ['Mi mamá cocina una [sopa] muy [rica]', 'fría'], ['Los [peces] viven en el [agua]', 'aire']];
  return { id: 'demo', title: 'Completa las oraciones', shuffle: false, time: 0, sound: true, sentences: d.map(([text, dist]) => ({ id: uid(), text, dist })) };
}
const blankActivity = () => ({ id: uid(), title: 'Mi actividad', shuffle: false, time: 0, sound: true, sentences: [{ id: uid(), text: '', dist: '' }] });
const Store = {
  KEY: 'cf_activities', CUR: 'cf_current',
  load() { try { const a = JSON.parse(localStorage.getItem(this.KEY)); if (Array.isArray(a) && a.length) return a; } catch (e) { } return [defaultActivity()]; },
  save(l) { try { localStorage.setItem(this.KEY, JSON.stringify(l)); return true; } catch (e) { toast('No se pudo guardar en el navegador.'); return false; } },
  getCur() { try { return localStorage.getItem(this.CUR); } catch (e) { return null; } },
  setCur(id) { try { localStorage.setItem(this.CUR, id); } catch (e) { } }
};
const S = { acts: Store.load(), cur: null };
S.cur = S.acts.some(a => a.id === Store.getCur()) ? Store.getCur() : S.acts[0].id;
const curAct = () => S.acts.find(a => a.id === S.cur) || S.acts[0];

/* ================= Confirm (modal reutilizable) ================= */
const G = { act: null, list: [], idx: 0, ok: 0, err: 0, tries: 0, fails: 0, score: 0, details: [], sec: 0, active: false, paused: false, phase: 'idle', sel: null, drag: null, token: 0, timer: null, suppress: false };
const Confirm = {
  fn: null, cancelFn: null,
  ask(text, o, fn) {
    if (this.isOpen) return;
    this.fn = fn; this.cancelFn = o.onCancel || null;
    $('#cText').textContent = text; $('#cIcon').textContent = o.icon || '❓';
    $('#cYes').textContent = o.yes || 'SÍ'; $('#cNo').textContent = o.no || 'CANCELAR';
    $('#cModal').classList.add('show'); $('#cNo').focus();
  },
  get isOpen() { return $('#cModal').classList.contains('show'); },
  close() { $('#cModal').classList.remove('show'); this.fn = this.cancelFn = null; },
  cancel() { const f = this.cancelFn; this.close(); if (f) f(); }
};
$('#cNo').addEventListener('click', () => Confirm.cancel());
$('#cYes').addEventListener('click', () => { const f = Confirm.fn; Confirm.close(); if (f) f(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && Confirm.isOpen) Confirm.cancel(); });
/* Pregunta durante la partida: pausa el cronómetro mientras el modal está abierto */
function askInGame(text, o, fn) {
  if (Confirm.isOpen) return;
  const was = G.paused; G.paused = true;
  Confirm.ask(text, { ...o, onCancel: () => { G.paused = was; } }, () => { G.paused = false; fn(); });
}

/* ================= Home ================= */
function renderHome() {
  const s = $('#homeSelect'); s.innerHTML = '';
  S.acts.forEach(a => { const o = el('option', '', a.title); o.value = a.id; s.append(o); });
  s.value = curAct().id;
}
$('#homeSelect').addEventListener('change', e => { S.cur = e.target.value; Store.setCur(S.cur); });
$('#btnStart').addEventListener('click', () => start(curAct()));


/* ================= Game ================= */
function say(t, c) { const m = $('#msg'); m.className = 'msg'; void m.offsetWidth; m.className = 'msg ' + (c || ''); m.textContent = t || '\u00a0'; }
function stats() {
  const n = G.list.length;
  $('#sS').textContent = Math.min(G.idx + 1, n) + '/' + n; $('#sOk').textContent = G.ok; $('#sErr').textContent = G.err;
  const lim = G.act.time; $('#sTime').textContent = fmt(lim > 0 ? lim - G.sec : G.sec);
  const pct = Math.round(G.ok / n * 100); $('#pBar').style.width = pct + '%'; $('#pTxt').textContent = pct + '%';
  $('.progress').setAttribute('aria-valuenow', pct);
}
function start(act) {
  const err = validate(act); if (err) return toast('⚠ ' + err);
  clearInterval(G.timer); G.token++;
  Object.assign(G, { act, list: act.shuffle ? shuffle(act.sentences) : [...act.sentences], idx: 0, ok: 0, err: 0, tries: 0, fails: 0, score: 0, details: [], sec: 0, active: false, paused: false, phase: 'idle', sel: null });
  Sound.on = act.sound; $('#gSound').textContent = Sound.on ? '🔊' : '🔇';
  $('#gTitle').textContent = act.title; $('#stage').classList.add('off'); $('#rModal').classList.remove('show');
  loadSentence(); stats(); show('game');
  const token = G.token, o = $('#countdown'), n = $('#cdNum'), seq = ['3', '2', '1', '¡COMIENZA!']; let i = 0;
  o.classList.add('show');
  (function step() {
    if (token !== G.token) { o.classList.remove('show'); return; }
    n.textContent = seq[i]; n.className = ''; void n.offsetWidth; n.className = 'tick' + (i === 3 ? ' small' : '');
    Sound.play(i === 3 ? 'ok' : 'tick'); i++;
    setTimeout(i < seq.length ? step : () => {
      o.classList.remove('show'); if (token !== G.token) return;
      G.active = true; G.phase = 'play'; $('#stage').classList.remove('off'); G.timer = setInterval(tick, 1000);
    }, 900);
  })();
}
function tick() {
  if (!G.active || G.paused) return;
  G.sec++; stats(); if (G.act.time > 0 && G.sec >= G.act.time) finish(false);
}
function loadSentence() {
  const s = G.list[G.idx], parts = parse(s.text), sent = $('#sentence'), bank = $('#bank');
  sent.innerHTML = ''; bank.innerHTML = ''; G.sel = null; G.fails = 0; G.phase = G.active ? 'play' : 'idle';
  let n = 0; const answers = [];
  parts.forEach(p => {
    if (p.t === 'text') sent.append(el('span', 'txt', p.v));
    else { const g = el('div', 'gap'); g.dataset.i = n; g.dataset.n = ++n; g.dataset.ans = p.v; answers.push(p.v); g.tabIndex = 0;
      g.addEventListener('click', () => { if (G.sel) move(G.sel, g); });
      g.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && G.sel) { e.preventDefault(); move(G.sel, g); } });
      sent.append(g); }
  });
  shuffle([...answers, ...distractors(s.dist)]).forEach(t => bank.append(chip(t)));
  say('');
}
function chip(text) {
  const c = el('div', 'chip', text); c.dataset.text = text; c.tabIndex = 0;
  c.addEventListener('click', e => {
    e.stopPropagation();
    if (G.suppress || !G.active || G.phase !== 'play' || c.classList.contains('locked')) return;
    const par = c.parentElement;
    if (G.sel && G.sel !== c && par.classList.contains('gap')) return move(G.sel, par);   // intercambiar
    const was = G.sel === c; clearSel(); if (!was) { G.sel = c; c.classList.add('sel'); Sound.play('pick'); }
  });
  c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
  c.addEventListener('pointerdown', e => {
    if (!G.active || G.phase !== 'play' || c.classList.contains('locked') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    G.drag = { c, x: e.clientX, y: e.clientY, moved: false, ghost: null };
    document.addEventListener('pointermove', pmove); document.addEventListener('pointerup', pup); document.addEventListener('pointercancel', pup);
  });
  return c;
}
$('#bank').addEventListener('click', () => { if (G.sel) move(G.sel, $('#bank')); });
function clearSel() { $$('.chip.sel').forEach(x => x.classList.remove('sel')); G.sel = null; }
function targetAt(x, y) { const e = document.elementFromPoint(x, y); return e && e.closest ? (e.closest('.gap') || e.closest('#bank')) : null; }
function pmove(e) {
  const g = G.drag; if (!g) return;
  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) {
    g.moved = true; clearSel(); g.c.classList.add('dragging'); Sound.play('pick');
    g.ghost = g.c.cloneNode(true); g.ghost.className = 'chip ghost'; g.ghost.style.width = g.c.offsetWidth + 'px'; g.ghost.style.height = g.c.offsetHeight + 'px'; document.body.append(g.ghost);
  }
  if (!g.moved) return;
  g.ghost.style.transform = `translate(${e.clientX - g.ghost.offsetWidth / 2}px,${e.clientY - g.ghost.offsetHeight / 2}px)`;
  $$('.gap.over').forEach(x => x.classList.remove('over'));
  const t = targetAt(e.clientX, e.clientY); if (t && t.classList.contains('gap')) t.classList.add('over');
}
function pup(e) {
  document.removeEventListener('pointermove', pmove); document.removeEventListener('pointerup', pup); document.removeEventListener('pointercancel', pup);
  const g = G.drag; G.drag = null; if (!g) return;
  $$('.gap.over').forEach(x => x.classList.remove('over'));
  if (!g.moved) return;
  g.ghost.remove(); g.c.classList.remove('dragging');
  G.suppress = true; setTimeout(() => G.suppress = false, 80);
  const t = e.type === 'pointerup' ? targetAt(e.clientX, e.clientY) : null; if (t) move(g.c, t);
}
/* Mueve una palabra a un espacio o al banco (intercambia si el espacio está ocupado) */
function move(c, target) {
  if (!G.active || G.phase !== 'play' || c.classList.contains('locked')) return;
  clearSel();
  const from = c.parentElement;
  if (target.classList.contains('gap')) {
    const other = target.firstElementChild;
    if (other === c) return;
    if (other && other.classList.contains('locked')) { Sound.play('bad'); return; }
    if (other) from.append(other);
    target.append(c);
  } else { if (from === target) return; target.append(c); }
  $$('.gap.no').forEach(x => x.classList.remove('no'));
  Sound.play('drop'); updateCheck();
}
function updateCheck() { if (G.phase === 'play' && $$('#sentence .gap').every(g => g.firstElementChild)) check(); }

/* Validación automática al completar todos los espacios */
function check() {
  if (!G.active || G.phase !== 'play') return;
  const gaps = $$('#sentence .gap');
  if (!gaps.length || !gaps.every(g => g.firstElementChild)) return;
  G.phase = 'done'; G.tries++;
  let correct = 0; const mistakes = [];
  gaps.forEach((g, i) => {
    const c = g.firstElementChild, answer = c.dataset.text, expected = g.dataset.ans;
    if (norm(answer) === norm(expected)) {
      correct++; g.classList.remove('no'); g.classList.add('ok'); c.classList.add('locked');
    } else {
      G.err++; g.classList.remove('ok'); g.classList.add('no');
      mistakes.push({ number: i + 1, expected, answer });
    }
  });
  const points = Math.round(correct / gaps.length * 100);
  G.score += points; if (!mistakes.length) G.ok++;
  G.details.push({ correct, total: gaps.length, points, mistakes });
  stats();
  if (mistakes.length) { Sound.play('bad'); say(`Oración revisada: ${mistakes.length} respuesta(s) incorrecta(s). Pasando a la siguiente…`, 'bad'); }
  else { Sound.play('ok'); say('¡Muy bien! Todas las respuestas son correctas.', 'ok'); }
  const token = G.token;
  setTimeout(() => {
    if (token !== G.token || !G.active) return;
    if (G.idx >= G.list.length - 1) finish(true);
    else { G.idx++; loadSentence(); stats(); }
  }, 1300);
}

function stop() { G.active = false; clearInterval(G.timer); G.token++; G.phase = 'idle'; $('#countdown').classList.remove('show'); $('#rModal').classList.remove('show'); }
function finish(win) {
  G.active = false; G.phase = 'idle'; clearInterval(G.timer); stats();
  const perf = G.tries ? Math.round(G.ok / G.tries * 100) : 0;
  $('#rIcon').textContent = win ? (perf >= 80 ? '🏆' : '🌟') : '⏰';
  $('#rTitle').textContent = win ? '¡Felicidades, has completado la actividad!' : '¡Se acabó el tiempo!';
  $('#rMsg').textContent = !win ? 'No te preocupes, puedes intentarlo de nuevo.' : perf >= 90 ? '¡Excelente trabajo! Casi no cometiste errores.' : perf >= 60 ? '¡Muy bien! Sigue practicando para mejorar aún más.' : '¡Buen esfuerzo! Con práctica lo harás cada vez mejor.';
  $('#rScore').textContent = G.score; $('#rOk').textContent = G.ok + '/' + G.list.length; $('#rErr').textContent = G.err;
  $('#rTime').textContent = fmt(G.sec); $('#rPerf').textContent = perf + '%';
  const detailBox = $('#rDetails');
  if (detailBox) {
    detailBox.innerHTML = '';
    detailBox.append(el('h3', '', 'Detalle por oración'));
    G.details.forEach((d, i) => {
      const item = el('div', 'result-detail');
      item.append(el('strong', '', `Oración ${i + 1}: ${d.points}/100 puntos`));
      item.append(el('p', '', `${d.correct} de ${d.total} respuestas correctas`));
      d.mistakes.forEach(m => item.append(el('p', 'mistake', `Espacio ${m.number}: pusiste «${m.answer}»; respuesta correcta: «${m.expected}».`)));
      if (!d.mistakes.length) item.append(el('p', 'right-answer', 'Todas las respuestas correctas.'));
      detailBox.append(item);
    });
  }
  Sound.play(win ? 'win' : 'bad'); $('#rModal').classList.add('show');
}

/* Botones del juego */
$('#gSound').addEventListener('click', () => { Sound.on = !Sound.on; $('#gSound').textContent = Sound.on ? '🔊' : '🔇'; Sound.play('tick'); });
const inRun = () => G.active || G.phase !== 'idle';
$('#gRestart').addEventListener('click', () => { if (G.act && inRun()) askInGame('¿Quieres reiniciar la actividad? Empezarás de nuevo y perderás tu progreso actual.', { yes: 'SÍ, REINICIAR', icon: '↻', no: 'CONTINUAR JUGANDO' }, () => start(G.act)); });
$('#gExit').addEventListener('click', () => { if (G.act && inRun()) askInGame('¿Estás seguro de que deseas salir del juego? Tu progreso actual se perderá.', { yes: 'SÍ, SALIR', icon: '🚪', no: 'CONTINUAR JUGANDO' }, () => { stop(); renderHome(); show('home'); }); });
$('#rAgain').addEventListener('click', () => start(G.act));
$('#rExit').addEventListener('click', () => { stop(); renderHome(); show('home'); });

/* ================= Admin (configuración) ================= */
const Admin = {
  d: null,
  open(a) { this.d = clone(a); this.fill(); show('admin'); },
  fill() {
    const d = this.d;
    $('#aTitle').value = d.title; $('#aTime').value = d.time; $('#aShuffle').checked = d.shuffle; $('#aSound').checked = d.sound;
    this.saved(); this.list();
  },
  read() { const d = this.d; d.title = $('#aTitle').value; d.time = parseInt($('#aTime').value, 10) || 0; d.shuffle = $('#aShuffle').checked; d.sound = $('#aSound').checked; },
  saved() {
    const s = $('#aSaved'); s.innerHTML = '';
    S.acts.forEach(a => { const o = el('option', '', a.title); o.value = a.id; s.append(o); });
    s.value = S.acts.some(a => a.id === this.d.id) ? this.d.id : S.acts[0].id;
  },
  list() {
    const box = $('#aList'), d = this.d; box.innerHTML = ''; $('#aCount').textContent = d.sentences.length + ' oraciones';
    d.sentences.forEach((s, i) => {
      const row = el('div', 'srow'), t = el('input'), dist = el('input', 'dist'), prev = el('div', 'prev'), del = el('button', 'btn small red', '🗑');
      t.type = 'text'; t.value = s.text; t.maxLength = 200; t.placeholder = 'Ej.: El [sol] sale por la [mañana]'; t.setAttribute('aria-label', 'Oración ' + (i + 1));
      dist.type = 'text'; dist.value = s.dist || ''; dist.maxLength = 120; dist.placeholder = 'Palabras distractoras (opcional): luna, noche'; dist.setAttribute('aria-label', 'Distractoras de la oración ' + (i + 1));
      const upd = () => {
        prev.innerHTML = ''; const e = s.text.trim() ? checkSentence(s.text) : '';
        if (!s.text.trim()) { prev.textContent = 'Vista previa…'; return; }
        parse(s.text).forEach(p => { if (p.t === 'text') prev.append(document.createTextNode(p.v)); else { const u = el('u', p.v ? '' : 'bad', p.v || '___'); prev.append(u); } });
        if (e) prev.append(el('em', '', '  ⚠ ' + e));
      };
      t.oninput = () => { s.text = t.value; upd(); }; dist.oninput = () => { s.dist = dist.value; }; upd();
      del.title = 'Eliminar oración'; del.setAttribute('aria-label', 'Eliminar oración ' + (i + 1));
      del.onclick = () => {
        this.read(); if (d.sentences.length <= 1) return toast('Debe haber al menos una oración.');
        Confirm.ask(`¿Seguro que deseas eliminar la oración ${i + 1}? Esta acción no se puede deshacer.`, { yes: 'SÍ, ELIMINAR', icon: '🗑️' }, () => { d.sentences.splice(i, 1); this.list(); toast('Oración eliminada'); });
      };
      row.append(el('span', 'n', i + 1), t, del, dist, prev); box.append(row);
    });
  },
  save() {
    this.read(); const err = validate(this.d); if (err) { toast('⚠ ' + err); return false; }
    const c = clone(this.d), i = S.acts.findIndex(a => a.id === c.id);
    if (i >= 0) S.acts[i] = c; else S.acts.push(c);
    if (!Store.save(S.acts)) { if (i < 0) S.acts.pop(); return false; }
    S.cur = c.id; Store.setCur(c.id); this.saved(); toast('Actividad guardada ✅'); return true;
  }
};
$('#btnConfig').addEventListener('click', () => Admin.open(curAct()));
$('#aAdd').addEventListener('click', () => { Admin.read(); if (Admin.d.sentences.length >= 40) return toast('Máximo 40 oraciones.'); Admin.d.sentences.push({ id: uid(), text: '', dist: '' }); Admin.list(); const r = $$('#aList .srow > input:not(.dist)'); r[r.length - 1].focus(); });
$('#aSave').addEventListener('click', () => Admin.save());
$('#aPlay').addEventListener('click', () => { if (Admin.save()) start(curAct()); });
$('#aBack').addEventListener('click', () => { renderHome(); show('home'); });
$('#aLoad').addEventListener('click', () => { const a = S.acts.find(x => x.id === $('#aSaved').value); if (a) { Admin.open(a); toast('Actividad cargada'); } });
$('#aDelete').addEventListener('click', () => {
  const a = S.acts.find(x => x.id === $('#aSaved').value); if (!a) return;
  Confirm.ask(`¿Seguro que deseas eliminar la actividad «${a.title}»? Esta acción no se puede deshacer.`, { yes: 'SÍ, ELIMINAR', icon: '🗑️' }, () => {
    S.acts = S.acts.filter(x => x.id !== a.id); if (!S.acts.length) S.acts = [defaultActivity()];
    Store.save(S.acts); S.cur = S.acts[0].id; Store.setCur(S.cur); Admin.open(S.acts[0]); toast('Actividad eliminada');
  });
});
$('#aReset').addEventListener('click', () => { Admin.d = Object.assign(blankActivity(), { title: '' }); Admin.fill(); $('#aTitle').value = ''; $('#aTitle').focus(); toast('Configuración reiniciada'); });

/* ================= Inicio ================= */
try { if (!localStorage.getItem(Store.KEY)) Store.save(S.acts); } catch (e) { }
renderHome();
})();
