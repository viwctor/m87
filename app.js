/* ============================================================
   M87 — Controle de Faltas
   Vanilla JS · localStorage · PWA
   ------------------------------------------------------------
   Modelo de dados (chave localStorage: "m87.data")
   {
     version, activeSemester,
     semesters: {
       "2026.1": {
         label, start:"YYYY-MM-DD", end:"YYYY-MM-DD",
         subjects: [{ id, code, name, prof, credits, color,
                      meetings:[{ weekday:1-6, slot:"m1|m2|n1|n2" }] }]
       }
     },
     occ:   { "2026.1": { "YYYY-MM-DD": { "n1":"falta"|"prof", ... } } },
     marks: { "2026.1": { "YYYY-MM-DD": "holiday"|"noclass" } },
     notes: { "2026.1": { "YYYY-MM-DD": "texto da observação" } }
   }
   Slots (horários): manhã m1/m2, noite n1/n2.
   Cada slot com status "falta" = 1 falta. "prof" não conta.
   Limite: 4 créditos = 8 faltas · 2 créditos = 4 faltas.
   ============================================================ */

const STORE_KEY = "m87.data";
const APP_VERSION = "0.8 (beta)";

/* id único deste aparelho (para ignorar o eco das próprias escritas no tempo real) */
const DEVICE_ID = (() => {
  let id = localStorage.getItem("m87.device");
  if (!id) { id = "d_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("m87.device", id); }
  return id;
})();

/* Paleta de cores (gradientes) das matérias */
const PALETTE = [
  "linear-gradient(135deg, #ff8a1e, #ffd23f)",
  "linear-gradient(135deg, #ff4e50, #ff8a1e)",
  "linear-gradient(135deg, #ffd23f, #ff7a18)",
  "linear-gradient(135deg, #ff5e7e, #ff4e50)",
  "linear-gradient(135deg, #25d0a4, #1fb6ff)",
  "linear-gradient(135deg, #5ee7a0, #25d0a4)",
  "linear-gradient(135deg, #b06bff, #ff5e7e)",
  "linear-gradient(135deg, #ffb347, #e8552d)",
];

/* Horários possíveis, em ordem cronológica */
const SLOT_DEFS = [
  { id: "m1", time: "08:00 – 09:40", short: "08h",   start: "08:00", label: "1ª aula", shift: "Manhã" },
  { id: "m2", time: "10:00 – 11:40", short: "10h",   start: "10:00", label: "2ª aula", shift: "Manhã" },
  { id: "mi", time: "08:00 – 12:00", short: "08h",   start: "08:00", label: "Integral", shift: "Manhã" },
  { id: "t1", time: "13:00 – 14:40", short: "13h",   start: "13:00", label: "1ª aula", shift: "Tarde" },
  { id: "t2", time: "15:00 – 16:40", short: "15h",   start: "15:00", label: "2ª aula", shift: "Tarde" },
  { id: "ti", time: "13:00 – 17:00", short: "13h",   start: "13:00", label: "Integral", shift: "Tarde" },
  { id: "n1", time: "19:00 – 20:40", short: "19h",   start: "19:00", label: "1ª aula", shift: "Noite" },
  { id: "n2", time: "20:50 – 22:30", short: "20h50", start: "20:50", label: "2ª aula", shift: "Noite" },
];
const SLOT_BY_ID = Object.fromEntries(SLOT_DEFS.map(s => [s.id, s]));
const SLOT_ORDER = SLOT_DEFS.map(s => s.id);

/* resolve um slot, seja preset ou personalizado ("c:HH:MM-HH:MM") */
function slotInfo(id) {
  if (SLOT_BY_ID[id]) return SLOT_BY_ID[id];
  if (typeof id === "string" && id.startsWith("c:")) {
    const [a, b] = id.slice(2).split("-");
    const h = parseInt(a, 10) || 0;
    const shift = h < 12 ? "Manhã" : h < 18 ? "Tarde" : "Noite";
    return { id, time: `${a} – ${b}`, short: a, start: a, label: "Personalizado", shift };
  }
  return { id, time: id, short: id, start: "99:99", label: String(id), shift: "" };
}

const WEEKDAYS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const WD_SHORT = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/* ---------- Dados iniciais: grade 2026.1 (noite) ---------- */
function seedData() {
  const d = {
    version: 2,
    activeSemester: "2026.1",
    semesters: {
      "2026.1": {
        label: "3º Semestre (Fev - Jun 2026)",
        start: "2026-02-02",
        end: "2026-06-30",
        subjects: [
          { id: "rad1604", code: "RAD1604", name: "Desenvolvimento de Sistemas de Informação", prof: "Ildeberto Aparecido Rodello", credits: 4, color: "#ff9e2c",
            meetings: [{ weekday: 1, slot: "n1" }, { weekday: 3, slot: "n2" }] },
          { id: "rad1307", code: "RAD1307", name: "Comportamento Organizacional", prof: "Clarissa Dourado Freire", credits: 4, color: "#ff5e3a",
            meetings: [{ weekday: 1, slot: "n2" }, { weekday: 2, slot: "n2" }] },
          { id: "rad1618", code: "RAD1618", name: "Direito Tributário", prof: "Alexandre Ganan de Brites Figueiredo", credits: 2, color: "#ffd23f",
            meetings: [{ weekday: 2, slot: "n1" }] },
          { id: "rad1301", code: "RAD1301", name: "Matemática Financeira", prof: "Tabajara Pimenta Júnior", credits: 4, color: "#f7773d",
            meetings: [{ weekday: 3, slot: "n1" }, { weekday: 4, slot: "n2" }] },
          { id: "rec2403", code: "REC2403", name: "Introdução à Economia Brasileira", prof: "Marcio Bobik Braga", credits: 4, color: "#ffb347",
            meetings: [{ weekday: 4, slot: "n1" }, { weekday: 5, slot: "n2" }] },
          { id: "rad1408", code: "RAD1408", name: "Estatística Aplicada à Administração", prof: "Evandro Marcos Saidel Ribeiro", credits: 2, color: "#e8552d",
            meetings: [{ weekday: 5, slot: "n1" }] },
        ],
      },
      "2026.2": {
        label: "4º Semestre (Ago - Dez 2026)",
        start: "2026-08-03",
        end: "2026-12-18",
        subjects: [
          { id: "s_arh",   code: "", name: "Administração de Recursos Humanos", prof: "", credits: 4, color: "#ff9e2c", meetings: [] },
          { id: "s_anfin", code: "", name: "Análise Financeira", prof: "", credits: 2, color: "#ffd23f", meetings: [] },
          { id: "s_mkt",   code: "", name: "Marketing I", prof: "", credits: 4, color: "#ff5e3a", meetings: [] },
          { id: "s_ops",   code: "", name: "Administração de Operações I", prof: "", credits: 4, color: "#f7773d", meetings: [] },
          { id: "s_dcom",  code: "", name: "Direito Comercial", prof: "", credits: 2, color: "#e8552d", meetings: [] },
        ],
      },
    },
    occ: { "2026.1": {}, "2026.2": {} },
    marks: { "2026.1": {}, "2026.2": {} },
    notes: { "2026.1": {}, "2026.2": {} },
  };
  Object.values(d.semesters).forEach(sem =>
    sem.subjects.forEach((s, i) => { s.color = PALETTE[i % PALETTE.length]; }));
  return d;
}

/* estado vazio (novo usuário escolhe o semestre) */
function emptyData() {
  return { version: 2, activeSemester: null, semesters: {}, occ: {}, marks: {}, notes: {}, lastCustomTime: "" };
}

/* ---------- Estado ---------- */
let data = loadData();
let calRef = null;
let lastSwipe = 0;
let autoSwitched = false; // calendário trocou de semestre automaticamente ao navegar
let activeView = "dashboard";
let _dataVer = 0;         // contador para invalidar o cache da grade de horários

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedData();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error("Falha ao ler dados, recriando.", e);
    return seedData();
  }
}

/* Migra dados antigos (slots numéricos 1/2 = noite) para o novo formato */
function migrate(d) {
  d.occ = d.occ || {};
  d.marks = d.marks || {};
  d.notes = d.notes || {};
  const slotMap = { "1": "n1", "2": "n2", 1: "n1", 2: "n2" };
  for (const sem of Object.values(d.semesters || {})) {
    if (sem.label) sem.label = sem.label.replace(/\s*[–—]\s*/g, " - "); // normaliza travessões
    for (const s of sem.subjects || []) {
      for (const m of s.meetings || []) {
        if (slotMap[m.slot]) m.slot = slotMap[m.slot];
      }
    }
  }
  for (const occSem of Object.values(d.occ)) {
    for (const date of Object.keys(occSem)) {
      const slots = occSem[date];
      for (const k of Object.keys(slots)) {
        if (slotMap[k] && k !== slotMap[k]) { slots[slotMap[k]] = slots[k]; delete slots[k]; }
      }
    }
  }
  // garante que o semestre ativo realmente existe (protege contra backups corrompidos)
  if (d.semesters && !d.semesters[d.activeSemester]) {
    d.activeSemester = Object.keys(d.semesters)[0];
  }
  d.version = 2;
  return d;
}

let cloudUserId = null;       // id do usuário logado (null = modo local)
let cloudUsername = "";
let cloudEmail = "";
let cloudSaveTimer = null;
function saveData() {
  _dataVer++;
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  if (cloudUserId) {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      data._device = DEVICE_ID; // marca a origem para o tempo real ignorar o eco
      M87Cloud.saveData(cloudUserId, data).catch(e => console.error("Falha ao salvar na nuvem:", e));
    }, 800);
  }
}

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function activeSem() { return data.semesters[data.activeSemester]; }
function semOcc()    { return (data.occ[data.activeSemester]   ||= {}); }
function semMarks()  { return (data.marks[data.activeSemester] ||= {}); }
function semNotes()  { return (data.notes[data.activeSemester] ||= {}); }
function maxFor(subject) { return subject.credits === 4 ? 8 : 4; }

function fmtDate(y, m, d) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function parseDate(str) { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d); }
function isoWeekday(dateObj) { const wd = dateObj.getDay(); return wd === 0 ? 7 : wd; }

/* mapa weekday -> { slotId: subject } */
let _ttCache = null, _ttVer = -1, _ttSem = null;
function buildTimetable() {
  if (_ttCache && _ttVer === _dataVer && _ttSem === data.activeSemester) return _ttCache;
  const tt = {};
  for (const s of (activeSem()?.subjects || [])) {
    for (const m of (s.meetings || [])) {
      (tt[m.weekday] ||= {})[m.slot] = s;
    }
  }
  _ttCache = tt; _ttVer = _dataVer; _ttSem = data.activeSemester;
  return tt;
}
/* slots de um dia da semana, em ordem cronológica (inclui horários personalizados) */
function slotsForWeekday(wd) {
  const day = buildTimetable()[wd] || {};
  return Object.keys(day)
    .map(id => ({ id, subj: day[id], start: slotInfo(id).start }))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ id, subj }) => ({ id, subj }));
}
function subjectAt(weekday, slotId) {
  const tt = buildTimetable();
  return tt[weekday] ? tt[weekday][slotId] : null;
}

function countAbsences(subjectId) {
  const occ = semOcc(), marks = semMarks();
  let count = 0;
  for (const [date, slots] of Object.entries(occ)) {
    if (marks[date]) continue;
    const wd = isoWeekday(parseDate(date));
    for (const slotId of Object.keys(slots)) {
      if (slots[slotId] === "falta") {
        const subj = subjectAt(wd, slotId);
        if (subj && subj.id === subjectId) count++;
      }
    }
  }
  return count;
}

function meetingsText(s) {
  return (s.meetings || []).length
    ? s.meetings.map(m => `${WD_SHORT[m.weekday]} ${slotInfo(m.slot).short}`).join(" · ")
    : "sem horário definido";
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => (t.hidden = true), 2200);
}
function esc(str = "") {
  return str.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function copyText(t) {
  if (!t) return;
  const done = () => toast("E-mail copiado ✓");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done).catch(() => toast(t));
  } else {
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch { toast(t); }
    ta.remove();
  }
}

/* notificação quando uma matéria fica com só 1 falta de margem */
const _notified = new Set();
function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "./icons/icon-192.png" }); } catch {}
  } else if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
function maybeNotifyLimit() {
  const sem = activeSem();
  if (!sem) return;
  for (const s of sem.subjects) {
    const remaining = maxFor(s) - countAbsences(s.id);
    const key = data.activeSemester + ":" + s.id;
    if (remaining === 1) {
      if (!_notified.has(key)) { _notified.add(key); notify("Só pode faltar mais 1 dia", s.name); }
    } else {
      _notified.delete(key);
    }
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const sem = activeSem();
  if (!sem) {
    $("#semesterBanner").textContent = "";
    $("#dashboardGrid").innerHTML = `<div class="empty-state"><div class="big">🕳️</div>Nenhum semestre ainda.<br/>Toque no seletor de semestre (no topo) para criar um.</div>`;
    $("#semesterSummary").innerHTML = "";
    return;
  }
  $("#semesterBanner").textContent = `${sem.label} · ${sem.subjects.length} matéria(s)`;

  const grid = $("#dashboardGrid");
  grid.innerHTML = "";

  if (!sem.subjects.length) {
    grid.innerHTML = `<div class="empty-state"><div class="big">🕳️</div>
      Nenhuma matéria neste semestre.<br/>Vá em Config → "+ Matéria".</div>`;
    $("#semesterSummary").innerHTML = "";
    return;
  }

  const sorted = [...sem.subjects].sort((a, b) =>
    (countAbsences(b.id) / maxFor(b)) - (countAbsences(a.id) / maxFor(a)));

  for (const s of sorted) {
    const used = countAbsences(s.id);
    const max = maxFor(s);
    const ratio = max ? used / max : 0;
    const remaining = max - used;

    let level = "safe";
    if (used >= max) level = "critical";
    else if (remaining <= 1) level = "danger";
    else if (ratio >= 0.5) level = "warn";

    const numColor = level === "safe" ? "var(--text)" : `var(--${level})`;

    let alertHtml = "";
    if (remaining === 1) alertHtml = `<div class="sc-alert a-warn">Só pode faltar mais 1</div>`;
    else if (remaining === 0) alertHtml = `<div class="sc-alert a-critical">Limite de faltas atingido</div>`;
    else if (remaining < 0) alertHtml = `<div class="sc-alert a-critical">Limite ultrapassado em ${-remaining}</div>`;

    const card = document.createElement("div");
    card.className = "subject-card";
    card.style.setProperty("--card-accent", s.color);
    card.innerHTML = `
      <div class="sc-top">
        <div>
          <div class="sc-name">${esc(s.name)}</div>
          <div class="sc-meta">${meetingsText(s)}</div>
        </div>
        <div class="sc-count">
          <span class="label">Faltas</span>
          <b style="color:${numColor}">${used}</b><span class="max">/${max}</span>
        </div>
      </div>
      <div class="bar"><div class="bar-fill fill-${level}" style="width:${Math.min(100, ratio * 100)}%"></div></div>
      <div class="sc-foot">
        <span class="muted">${remaining > 0 ? `Pode faltar mais ${remaining}` : "Sem margem"}</span>
      </div>
      ${alertHtml}`;
    grid.appendChild(card);
  }
  renderSummary();
}

/* nº de aulas (sessões) que ainda vão acontecer da matéria, de hoje até o fim do semestre */
function remainingSessions(subject) {
  const sem = activeSem();
  const marks = semMarks();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseDate(sem.start), end = parseDate(sem.end);
  let cur = today > start ? new Date(today) : new Date(start);
  let count = 0;
  for (; cur <= end; cur.setDate(cur.getDate() + 1)) {
    const dateStr = fmtDate(cur.getFullYear(), cur.getMonth(), cur.getDate());
    if (marks[dateStr]) continue; // feriado / sem aula não conta
    const wd = isoWeekday(cur);
    for (const m of (subject.meetings || [])) if (m.weekday === wd) count++;
  }
  return count;
}

function renderSummary() {
  const sem = activeSem();
  const wrap = $("#semesterSummary");
  if (!sem.subjects.length) { wrap.innerHTML = ""; return; }

  let usedTotal = 0, maxTotal = 0, creditsTotal = 0;
  const rows = sem.subjects.map(s => {
    const used = countAbsences(s.id), max = maxFor(s);
    usedTotal += used; maxTotal += max; creditsTotal += (Number(s.credits) || 0);
    return { s, rest: remainingSessions(s) };
  });

  const list = rows.map(({ s, rest }) => `
    <div class="sum-item">
      <span class="sum-dot" style="background:${s.color}"></span>
      <span class="sum-name">${esc(s.name)}</span>
      <span class="sum-rest">${rest} aula${rest === 1 ? "" : "s"}</span>
    </div>`).join("");

  wrap.innerHTML = `
    <div class="summary-card">
      <div class="summary-head">
        <h3>Resumo do semestre</h3>
        <span class="muted small">${creditsTotal} créditos · ${usedTotal}/${maxTotal} faltas</span>
      </div>
      <div class="sum-subtitle muted small">Aulas restantes por matéria</div>
      ${list}
    </div>`;
}

/* ============================================================
   CALENDÁRIO
   ============================================================ */
function initCalRef() {
  const sem = activeSem();
  const today = new Date();
  const start = parseDate(sem.start), end = parseDate(sem.end);
  let ref = (today >= start && today <= end) ? today : start;
  calRef = { year: ref.getFullYear(), month: ref.getMonth() };
}

function renderCalendar() {
  const sem = activeSem();
  if (!sem) { $("#calGrid").innerHTML = ""; $("#calTitle").textContent = "—"; return; }
  if (!calRef) initCalRef();
  const { year, month } = calRef;
  const occ = semOcc(), marks = semMarks(), notes = semNotes();

  const calLabel = new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $("#calTitle").textContent = calLabel.charAt(0).toUpperCase() + calLabel.slice(1);

  const grid = $("#calGrid");
  grid.innerHTML = "";

  const startWd = isoWeekday(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const semStart = parseDate(sem.start), semEnd = parseDate(sem.end);
  const now = new Date();
  const todayStr = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 1; i < startWd; i++) {
    const c = document.createElement("div");
    c.className = "cal-cell empty";
    grid.appendChild(c);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = fmtDate(year, month, d);
    const wd = isoWeekday(dateObj);
    const inSem = dateObj >= semStart && dateObj <= semEnd;
    const slots = slotsForWeekday(wd);
    const hasClass = slots.length > 0 && inSem;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (dateStr === todayStr) cell.classList.add("today");

    const mark = marks[dateStr];
    if (mark === "holiday") cell.classList.add("holiday");
    else if (mark === "noclass") cell.classList.add("noclass-mark");
    else if (!hasClass) cell.classList.add("noclassday");

    if (!mark && hasClass) {
      const slotsWrap = document.createElement("div");
      slotsWrap.className = "cal-slots";
      for (const { id } of slots) {
        const seg = document.createElement("div");
        seg.className = "cal-slot";
        const st = occ[dateStr] && occ[dateStr][id];
        if (st === "falta") seg.classList.add("s-falta");
        else if (st === "prof") seg.classList.add("s-prof");
        slotsWrap.appendChild(seg);
      }
      cell.appendChild(slotsWrap);
    }

    const num = document.createElement("div");
    num.className = "cal-day-num";
    num.textContent = d;
    cell.appendChild(num);

    if (notes[dateStr]) cell.classList.add("has-note");

    if (inSem) {
      cell.classList.add("classday");
      cell.addEventListener("click", () => {
        if (Date.now() - lastSwipe < 400) return; // ignora toque logo após deslizar
        openDayModal(dateStr);
      });
    }
    grid.appendChild(cell);
  }
}

/* semestre que contém hoje (ou o ativo, se nenhum) */
function currentSemesterKey() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const [key, sem] of Object.entries(data.semesters)) {
    if (today >= parseDate(sem.start) && today <= parseDate(sem.end)) return key;
  }
  return data.activeSemester || Object.keys(data.semesters)[0];
}

/* semestre cujo período cruza o mês exibido (null se nenhum) */
function semesterForMonth(year, month) {
  const mStart = new Date(year, month, 1), mEnd = new Date(year, month + 1, 0);
  for (const [key, sem] of Object.entries(data.semesters)) {
    if (parseDate(sem.start) <= mEnd && parseDate(sem.end) >= mStart) return key;
  }
  return null;
}

function calShift(delta) {
  let m = calRef.month + delta, y = calRef.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  calRef = { year: y, month: m };
  // troca automaticamente de semestre se o mês pertencer a outro
  const semKey = semesterForMonth(y, m);
  if (semKey && semKey !== data.activeSemester) {
    data.activeSemester = semKey;
    autoSwitched = true;
    updateSemesterButton();
    renderDashboard();
    toast("Mudou para " + data.semesters[semKey].label);
  }
  renderCalendar();
}

/* volta para o mês/semestre de hoje */
function goToday() {
  data.activeSemester = currentSemesterKey();
  autoSwitched = false;
  updateSemesterButton();
  const t = new Date();
  calRef = { year: t.getFullYear(), month: t.getMonth() };
  renderDashboard();
  renderCalendar();
}

/* ============================================================
   MODAL DE DIA
   ============================================================ */
let dayModalState = null;

function openDayModal(dateStr) {
  dayModalState = { date: dateStr };
  $("#dayDate").value = dateStr;
  buildDayModalBody(dateStr);
  showModal("#dayModal");
}

function buildDayModalBody(dateStr) {
  const occ = semOcc(), marks = semMarks();
  const dateObj = parseDate(dateStr);
  const wd = isoWeekday(dateObj);

  $("#dayModalTitle").textContent =
    `${WEEKDAYS[wd]}, ${dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;

  const wrap = $("#daySlots");
  wrap.innerHTML = "";
  const mark = marks[dateStr];
  const slots = slotsForWeekday(wd);

  if (!slots.length) {
    wrap.innerHTML = `<p class="muted small">Sem aulas cadastradas neste dia. Você ainda pode marcá-lo como feriado/sem aula abaixo.</p>`;
  } else {
    let lastShift = null;
    for (const { id, subj } of slots) {
      const def = slotInfo(id);
      if (def.shift !== lastShift) {
        const h = document.createElement("div");
        h.className = "slot-shift muted small";
        h.textContent = def.shift;
        wrap.appendChild(h);
        lastShift = def.shift;
      }
      const cur = (occ[dateStr] && occ[dateStr][id]) || "presente";
      const div = document.createElement("div");
      div.className = `slot ${mark ? "disabled" : ""}`;
      div.dataset.slot = id;
      div.innerHTML = `
        <div class="slot-head">
          <span class="slot-color" style="background:${subj.color}"></span>
          <div>
            <div class="slot-subj">${esc(subj.name)}</div>
            <div class="slot-time">${def.label} · ${def.time}</div>
          </div>
        </div>
        <div class="slot-options">
          <button class="seg-btn ${cur === "presente" ? "active" : ""}" data-val="presente">Presente</button>
          <button class="seg-btn ${cur === "falta" ? "active" : ""}" data-val="falta">Falta</button>
          <button class="seg-btn ${cur === "prof" ? "active" : ""}" data-val="prof">Prof. faltou</button>
        </div>`;
      wrap.appendChild(div);
    }
  }

  $$("#dayModal .chip[data-mark]").forEach(ch => {
    ch.classList.toggle("active",
      (ch.dataset.mark === "holiday" && mark === "holiday") ||
      (ch.dataset.mark === "noclass" && mark === "noclass"));
  });

  $$("#daySlots .seg-btn").forEach(btn => {
    btn.onclick = () => {
      $$(".seg-btn", btn.parentElement).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  $("#dayNote").value = semNotes()[dateStr] || "";
}

function saveDayModal() {
  const newDate = $("#dayDate").value;
  if (!newDate) return;
  const occ = semOcc(), marks = semMarks();

  const notes = semNotes();
  const oldDate = dayModalState.date;
  if (newDate !== oldDate) { delete occ[oldDate]; delete marks[oldDate]; delete notes[oldDate]; dayModalState.date = newDate; }
  const date = newDate;

  const markActive = $$("#dayModal .chip[data-mark]").find(c => c.classList.contains("active"));
  if (markActive) {
    marks[date] = markActive.dataset.mark;
    delete occ[date];
  } else {
    delete marks[date];
    const result = {};
    $$("#daySlots .slot").forEach(slotEl => {
      const active = $(".seg-btn.active", slotEl);
      const val = active ? active.dataset.val : "presente";
      if (val !== "presente") result[slotEl.dataset.slot] = val;
    });
    if (Object.keys(result).length) occ[date] = result; else delete occ[date];
  }

  const noteVal = $("#dayNote").value.trim();
  if (noteVal) notes[date] = noteVal; else delete notes[date];

  saveData();
  closeModals();
  renderAll();
  maybeNotifyLimit();
  toast("Salvo ✓");
  showBackupReminder();
}

function clearDay() {
  const date = $("#dayDate").value;
  delete semOcc()[date];
  delete semMarks()[date];
  delete semNotes()[date];
  saveData();
  buildDayModalBody(date); // atualiza o modal mostrando o dia zerado
  renderAll();
  toast("Dia limpo ✓");
  showBackupReminder();
}

/* ============================================================
   GUIA MATÉRIAS + CONFIG
   ============================================================ */
function renderSubjectsTab() {
  const sem = activeSem();
  $("#subjectsBanner").textContent = sem ? sem.label : "Nenhum semestre — crie um no topo";
  renderSubjectsByDay();
  renderSubjectList();
  renderSemesterList();
}

/* informações das matérias agrupadas por dia da semana (seg–sex) */
function renderSubjectsByDay() {
  const wrap = $("#subjectsByDay");
  wrap.innerHTML = "";
  let any = false;
  for (let wd = 1; wd <= 5; wd++) {
    const slots = slotsForWeekday(wd);
    if (!slots.length) continue;
    any = true;
    const block = document.createElement("div");
    block.className = "day-block";
    block.innerHTML = `<h3 class="day-title">${WEEKDAYS[wd]}</h3>`;
    for (const { id, subj } of slots) {
      const def = slotInfo(id);
      const meeting = (subj.meetings || []).find(m => m.weekday === wd && m.slot === id);
      const room = meeting && meeting.room ? meeting.room : "";
      const card = document.createElement("div");
      card.className = "matter-card";
      card.style.setProperty("--card-accent", subj.color);
      card.innerHTML = `
        <div class="mc-top">
          <span class="mc-name">${esc(subj.name)}</span>
          ${room ? `<span class="mc-room">${esc(room)}</span>` : ""}
        </div>
        <div class="mc-line">${def.time}</div>
        ${(subj.prof || subj.profEmail) ? `<div class="mc-prof">
          ${subj.prof ? `<span>${esc(subj.prof)}</span>` : ""}
          ${subj.profEmail ? `<span class="mc-email" data-email="${esc(subj.profEmail)}" role="button" title="Copiar e-mail">${esc(subj.profEmail)}</span>` : ""}
        </div>` : ""}`;
      block.appendChild(card);
    }
    wrap.appendChild(block);
  }
  if (!any) wrap.innerHTML = `<p class="muted small" style="padding:4px 2px 14px">Nenhuma matéria com horário cadastrado neste semestre. Adicione abaixo.</p>`;
}

/* Config / conta */
function renderSettings() { renderAccount(); }

function renderAccount() {
  const card = $("#accountCard");
  if (!card) return;
  if (cloudUserId) {
    card.hidden = false;
    const initial = (cloudUsername || "U").charAt(0).toUpperCase();
    $("#accountAvatar").textContent = initial;
    $("#accountName").textContent = cloudUsername || "Conta";
    $("#accountAvatarLg").textContent = initial;
    $("#accountNameLg").textContent = cloudUsername || "Conta";
    $("#accountEmail").textContent = cloudEmail || "";
  } else {
    card.hidden = true; // modo local não tem conta
  }
}

function openAccountModal() { showModal("#accountModal"); }

async function deleteAccount() {
  const ok = await uiConfirm("Excluir a conta apaga TODOS os seus dados da nuvem. Não pode ser desfeito.", { danger: true, yesLabel: "Excluir conta" });
  if (!ok) return;
  try { if (cloudUserId) await M87Cloud.deleteData(cloudUserId); } catch (e) { console.error(e); }
  try { await M87Cloud.signOut(); } catch (e) { console.error(e); }
  cloudUserId = null;
  data = emptyData();
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  closeModals();
  showAuth();
}

function renderSubjectList() {
  const list = $("#subjectList");
  list.innerHTML = "";
  const subs = activeSem()?.subjects || [];
  if (!subs.length) { list.innerHTML = `<p class="muted small">Nenhuma matéria ainda.</p>`; return; }
  for (const s of subs) {
    const row = document.createElement("div");
    row.className = "subject-row";
    row.innerHTML = `
      <span class="sr-color" style="background:${s.color}"></span>
      <div class="sr-info">
        <div class="sr-name">${esc(s.name || "(sem nome)")}</div>
        <div class="sr-meta">${s.credits} créditos · máx ${maxFor(s)} · ${meetingsText(s)}</div>
      </div>
      <button class="icon-btn" aria-label="Editar">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>
      </button>`;
    row.querySelector("button").onclick = () => openSubjectEditor(s.id);
    list.appendChild(row);
  }
}

function renderSemesterList() {
  const list = $("#semesterList");
  list.innerHTML = "";
  for (const [key, sem] of Object.entries(data.semesters)) {
    const row = document.createElement("div");
    row.className = "semester-row" + (key === data.activeSemester ? " active-sem" : "");
    row.innerHTML = `
      <div style="flex:1; min-width:0">
        <div class="sr-name">${esc(sem.label)}</div>
        <div class="sr-meta muted small">${sem.subjects.length} matérias</div>
      </div>
      <div class="sem-actions">
        <button class="btn btn-sm btn-ghost sem-activate">${key === data.activeSemester ? "Ativo" : "Ativar"}</button>
        <button class="icon-btn icon-btn-sm sem-edit" aria-label="Editar semestre">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>
        </button>
        <button class="icon-btn icon-btn-sm sem-del" aria-label="Excluir semestre">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Zm3-3h6l1 2h4v2H4V6h4l1-2Z"/></svg>
        </button>
      </div>`;
    row.querySelector(".sem-activate").onclick = () => selectSemester(key);
    row.querySelector(".sem-edit").onclick = () => openSemesterEditor(key);
    row.querySelector(".sem-del").onclick = () => deleteSemester(key);
    list.appendChild(row);
  }
}

/* ---- Editor de matéria ---- */
let editingSubjectId = null;
let editingColor = PALETTE[0];

function openSubjectEditor(id) {
  const sem0 = activeSem();
  if (!sem0) { toast("Crie um semestre primeiro."); return; }
  if (!id && sem0.subjects.length >= 14) { toast("Limite de 14 matérias por semestre."); return; }
  editingSubjectId = id;
  const s = id ? activeSem().subjects.find(x => x.id === id) : null;
  $("#subjectModalTitle").textContent = s ? "Editar matéria" : "Nova matéria";
  $("#subjName").value = s?.name || "";
  $("#subjProf").value = s?.prof || "";
  $("#subjEmail").value = s?.profEmail || "";
  $("#subjCredits").value = String(s?.credits || 4);
  editingColor = s?.color || PALETTE[activeSem().subjects.length % PALETTE.length];
  renderColorPalette(editingColor);
  $("#deleteSubjectBtn").style.display = s ? "" : "none";
  renderMeetingEditor(s?.meetings || []);
  showModal("#subjectModal");
}

function renderColorPalette(selected) {
  const wrap = $("#colorPalette");
  wrap.innerHTML = "";
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (c === selected ? " selected" : "");
    b.style.background = c;
    b.onclick = () => { editingColor = c; renderColorPalette(c); };
    wrap.appendChild(b);
  }
}

function renderMeetingEditor(meetings) {
  const list = $("#meetingList");
  list.innerHTML = "";
  meetings.forEach(m => list.appendChild(meetingRow(m)));
}

function meetingRow(m) {
  const row = document.createElement("div");
  row.className = "meeting-row";
  const isCustom = typeof m.slot === "string" && m.slot.startsWith("c:");
  const wdOpts = [1, 2, 3, 4, 5, 6].map(w =>
    `<option value="${w}" ${m.weekday === w ? "selected" : ""}>${WEEKDAYS[w]}</option>`).join("");
  let slotOpts = "", curShift = "";
  for (const sd of SLOT_DEFS) {
    if (sd.shift !== curShift) { if (curShift) slotOpts += "</optgroup>"; slotOpts += `<optgroup label="${sd.shift}">`; curShift = sd.shift; }
    slotOpts += `<option value="${sd.id}" ${m.slot === sd.id ? "selected" : ""}>${sd.label} (${sd.time})</option>`;
  }
  slotOpts += `</optgroup><option value="custom" ${isCustom ? "selected" : ""}>Personalizado…</option>`;
  let cStart = "08:00", cEnd = "09:40";
  if (isCustom) { const p = m.slot.slice(2).split("-"); cStart = p[0] || cStart; cEnd = p[1] || cEnd; }
  row.innerHTML = `
    <div class="meet-line">
      <select class="meet-wd">${wdOpts}</select>
      <select class="meet-slot">${slotOpts}</select>
      <button class="icon-btn del-meet" type="button" aria-label="Remover">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Zm3-3h6l1 2h4v2H4V6h4l1-2Z"/></svg>
      </button>
    </div>
    <div class="meet-custom" ${isCustom ? "" : "hidden"}>
      <input type="time" class="meet-start" value="${cStart}" />
      <span>–</span>
      <input type="time" class="meet-end" value="${cEnd}" />
    </div>
    <input type="text" class="meet-room" placeholder="Sala (ex: 01-B2, LEIA 1)" value="${m.room ? esc(m.room) : ""}" />`;
  const slotSel = row.querySelector(".meet-slot");
  const custom = row.querySelector(".meet-custom");
  slotSel.onchange = () => { custom.hidden = slotSel.value !== "custom"; };
  row.querySelector(".del-meet").onclick = () => row.remove();
  return row;
}

function collectMeetings() {
  return $$("#meetingList .meeting-row").map(r => {
    let slot = $(".meet-slot", r).value;
    if (slot === "custom") {
      const s = $(".meet-start", r).value || "08:00";
      const e = $(".meet-end", r).value || "09:40";
      slot = `c:${s}-${e}`;
      data.lastCustomTime = slot; // memoriza o último horário personalizado
    }
    return { weekday: Number($(".meet-wd", r).value), slot, room: $(".meet-room", r).value.trim() };
  });
}

function saveSubject() {
  const name = $("#subjName").value.trim();
  if (!name) { toast("Dê um nome à matéria."); return; }
  const sem = activeSem();
  const payload = {
    name,
    prof: $("#subjProf").value.trim(),
    profEmail: $("#subjEmail").value.trim(),
    credits: Number($("#subjCredits").value),
    color: editingColor,
    meetings: collectMeetings(),
  };
  if (editingSubjectId) {
    Object.assign(sem.subjects.find(s => s.id === editingSubjectId), payload);
  } else {
    sem.subjects.push({ id: "s_" + Date.now().toString(36), ...payload });
  }
  saveData();
  closeModals(); renderAll();
  toast("Matéria salva ✓");
  showBackupReminder();
}

async function deleteSubject() {
  if (!editingSubjectId) return;
  const ok = await uiConfirm("Excluir esta matéria? As faltas dela serão desconsideradas.", { danger: true, yesLabel: "Excluir" });
  if (!ok) return;
  const sem = activeSem();
  sem.subjects = sem.subjects.filter(s => s.id !== editingSubjectId);
  saveData();
  closeModals(); renderAll();
  showBackupReminder();
}

/* ---- Editor de semestre (modal customizado) ---- */
let editingSemesterKey = null;
function semNumberFromLabel(label) { return parseInt(label, 10) || 1; }

function openSemesterEditor(key, welcome) {
  if (!key && Object.keys(data.semesters).length >= 18) { toast("Limite de 18 semestres."); return; }
  editingSemesterKey = key;
  const sem = key ? data.semesters[key] : null;
  $("#semEditTitle").textContent = welcome
    ? `Olá, ${cloudUsername || "bem-vindo"}! Qual seu semestre?`
    : (sem ? "Editar semestre" : "Novo semestre");

  $("#semNumber").innerHTML = Array.from({ length: 18 }, (_, i) => `<option value="${i + 1}">${i + 1}º Semestre</option>`).join("");
  const yNow = new Date().getFullYear();
  const ySel = $("#semYear"); ySel.innerHTML = "";
  for (let y = yNow - 2; y <= yNow + 5; y++) ySel.innerHTML += `<option value="${y}">${y}</option>`;

  if (sem) {
    $("#semNumber").value = String(semNumberFromLabel(sem.label));
    $("#semPeriod").value = (sem.start && Number(sem.start.slice(5, 7)) <= 7) ? "fev" : "ago";
    ySel.value = sem.start ? sem.start.slice(0, 4) : String(yNow);
    $("#semDeleteBtn").hidden = false;
  } else {
    const nums = Object.values(data.semesters).map(s => semNumberFromLabel(s.label));
    $("#semNumber").value = String(nums.length ? Math.min(18, Math.max(...nums) + 1) : 1);
    $("#semPeriod").value = "fev";
    ySel.value = String(yNow);
    $("#semDeleteBtn").hidden = true;
  }
  showModal("#semEditModal");
}

function periodDates(period, year) {
  return period === "ago"
    ? { start: `${year}-08-01`, end: `${year}-12-20` }
    : { start: `${year}-02-01`, end: `${year}-06-30` };
}

function saveSemesterFromModal() {
  const num = Number($("#semNumber").value);
  const period = $("#semPeriod").value;
  const year = Number($("#semYear").value);
  const { start, end } = periodDates(period, year);
  const label = `${num}º Semestre (${period === "ago" ? "Ago - Dez" : "Fev - Jun"} ${year})`;
  if (editingSemesterKey) {
    Object.assign(data.semesters[editingSemesterKey], { label, start, end });
  } else {
    let key = `${year}.${period === "fev" ? 1 : 2}`;
    while (data.semesters[key]) key += "x";
    data.semesters[key] = { label, start, end, subjects: [] };
    data.occ[key] = {}; data.marks[key] = {}; data.notes[key] = {};
    data.activeSemester = key;
  }
  saveData();
  updateSemesterButton();
  calRef = null;
  closeModals();
  renderAll();
  toast(editingSemesterKey ? "Semestre atualizado ✓" : "Semestre criado ✓");
  showBackupReminder();
}

async function deleteSemester(key) {
  const ok = await uiConfirm(`Excluir "${data.semesters[key].label}" e todas as faltas dele? Não pode ser desfeito.`, { danger: true, yesLabel: "Excluir" });
  if (!ok) return;
  delete data.semesters[key];
  delete data.occ[key]; delete data.marks[key]; delete data.notes[key];
  if (data.activeSemester === key) data.activeSemester = Object.keys(data.semesters)[0] || null;
  saveData();
  updateSemesterButton();
  calRef = null; renderAll();
  toast("Semestre excluído");
  showBackupReminder();
}

/* ---- Diálogos personalizados (substituem alert/confirm/prompt do SO) ---- */
let _confirmCb = null, _confirmIsPrompt = false;
function _openConfirm({ title = "Confirmar", message, yesLabel = "Confirmar", danger = false, prompt = false, placeholder = "" }) {
  return new Promise(resolve => {
    _confirmCb = resolve; _confirmIsPrompt = prompt;
    $("#confirmTitle").textContent = title;
    $("#confirmMsg").textContent = message;
    const inp = $("#confirmInput");
    inp.hidden = !prompt; inp.value = ""; inp.placeholder = placeholder;
    const yes = $("#confirmYes");
    yes.textContent = yesLabel;
    yes.classList.toggle("btn-danger-fill", danger);
    showModal("#confirmModal");
    if (prompt) setTimeout(() => inp.focus(), 60);
  });
}
function uiConfirm(message, opts = {}) { return _openConfirm({ message, ...opts }); }
function uiPrompt(message, opts = {}) { return _openConfirm({ message, prompt: true, ...opts }); }
function resolveConfirm(val) {
  $("#confirmModal").hidden = true;
  const cb = _confirmCb; _confirmCb = null;
  if (cb) cb(val);
}

/* ---- Backup ---- */
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "m87-backup.json"; // nome fixo: substitui o backup anterior em vez de acumular
  a.click();
  URL.revokeObjectURL(url);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.semesters) throw new Error("arquivo inválido");
      const ok = await uiConfirm("Importar vai substituir TODOS os dados atuais. Continuar?", { danger: true, yesLabel: "Importar" });
      if (!ok) return;
      data = migrate(imported);
      saveData();
      updateSemesterButton();
      calRef = null; closeModals(); renderAll();
      toast("Dados importados ✓");
    } catch (e) { toast("Arquivo inválido."); }
  };
  reader.readAsText(file);
}

async function wipeAllData() {
  const ok = await uiConfirm("Apagar TODOS os dados (matérias, faltas, semestres)? Não pode ser desfeito.", { danger: true, yesLabel: "Apagar tudo" });
  if (!ok) return;
  data = emptyData();
  saveData();
  updateSemesterButton();
  calRef = null;
  closeModals();
  renderAll();
  renderSettings();
  toast("Dados apagados.");
  if (cloudUserId) openSemesterEditor(null, true);
}

function openAbout() {
  $("#aboutVersion").textContent = "v" + APP_VERSION;
  showModal("#aboutModal");
}

/* ============================================================
   LEMBRETE DE BACKUP
   ============================================================ */
function showBackupReminder() {
  const el = $("#backupReminder");
  if (el) el.hidden = false;
}
function hideBackupReminder() {
  const el = $("#backupReminder");
  if (el) el.hidden = true;
}

/* ============================================================
   MODAIS / NAV
   ============================================================ */
function showModal(sel) { $(sel).hidden = false; }
function closeModals() {
  $$(".modal-overlay").forEach(m => (m.hidden = true));
  if (_confirmCb) { const cb = _confirmCb; _confirmCb = null; cb(_confirmIsPrompt ? null : false); }
}

function shortSemLabel(label) { return (label || "").split(" (")[0] || label; }

function updateSemesterButton() {
  const el = $("#semesterBtnLabel");
  if (!el) return;
  const sem = activeSem();
  el.textContent = sem ? shortSemLabel(sem.label) : "Sem semestre";
}

function openSemesterPicker() {
  const list = $("#semesterPickerList");
  list.innerHTML = "";
  for (const [key, sem] of Object.entries(data.semesters)) {
    const detail = sem.label.includes("(")
      ? sem.label.slice(sem.label.indexOf("(") + 1).replace(")", "").trim() : "";
    const b = document.createElement("button");
    b.className = "picker-item" + (key === data.activeSemester ? " active" : "");
    b.innerHTML = `<span class="pi-name">${esc(shortSemLabel(sem.label))}</span>` +
                  (detail ? `<span class="pi-detail">${esc(detail)}</span>` : "");
    b.onclick = () => { selectSemester(key); closeModals(); };
    list.appendChild(b);
  }
  const create = document.createElement("button");
  create.className = "btn btn-sm btn-ghost";
  create.style.marginTop = "4px";
  create.textContent = "+ Novo semestre";
  create.onclick = () => { closeModals(); openSemesterEditor(null); };
  list.appendChild(create);
  showModal("#semesterModal");
}

function selectSemester(key) {
  data.activeSemester = key;
  autoSwitched = false;
  saveData();
  calRef = null;
  updateSemesterButton();
  renderAll();
}

function switchView(view) {
  // retorno de segurança: ao sair do calendário (que pode ter trocado de semestre
  // sozinho ao navegar), volta para o semestre de hoje, evitando confusão
  if (view !== "calendar" && autoSwitched) {
    autoSwitched = false;
    data.activeSemester = currentSemesterKey();
    updateSemesterButton();
    calRef = null;
  }
  activeView = view;
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${view}`).classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "dashboard") renderDashboard();
  if (view === "subjects") renderSubjectsTab();
  if (view === "calendar") renderCalendar();
  if (view === "settings") renderSettings();
  $("#fab").hidden = (view === "settings" || view === "subjects"); // FAB só no Painel/Calendário
  if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
}

function renderAll() { renderDashboard(); renderCalendar(); renderSubjectsTab(); }

/* ============================================================
   EVENTOS
   ============================================================ */
function bindEvents() {
  $("#semesterBtn").onclick = openSemesterPicker;
  $$(".nav-btn").forEach(b => b.onclick = () => switchView(b.dataset.view));
  $("#calPrev").onclick = () => calShift(-1);
  $("#calNext").onclick = () => calShift(1);
  $("#calToday").onclick = goToday;

  // deslizar para trocar de mês no calendário
  let _sx = null, _sy = null;
  const cg = $("#calGrid");
  cg.addEventListener("touchstart", e => { _sx = e.changedTouches[0].clientX; _sy = e.changedTouches[0].clientY; }, { passive: true });
  cg.addEventListener("touchend", e => {
    if (_sx === null) return;
    const dx = e.changedTouches[0].clientX - _sx;
    const dy = e.changedTouches[0].clientY - _sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      lastSwipe = Date.now();
      calShift(dx < 0 ? 1 : -1);
    }
    _sx = _sy = null;
  }, { passive: true });

  $("#fab").onclick = () => {
    const today = new Date();
    const sem = activeSem();
    let d = (today >= parseDate(sem.start) && today <= parseDate(sem.end)) ? today : parseDate(sem.start);
    openDayModal(fmtDate(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  $("#dayDate").onchange = e => buildDayModalBody(e.target.value);
  $("#daySaveBtn").onclick = saveDayModal;
  $$("#dayModal .chip[data-mark]").forEach(ch => {
    ch.onclick = () => {
      const m = ch.dataset.mark;
      if (m === "clear") { clearDay(); return; }
      const wasActive = ch.classList.contains("active");
      $$("#dayModal .chip[data-mark]").forEach(c => c.classList.remove("active"));
      if (!wasActive) ch.classList.add("active");
      $$("#daySlots .slot").forEach(s => s.classList.toggle("disabled", !wasActive));
    };
  });

  $("#subjectsByDay").addEventListener("click", e => {
    const el = e.target.closest(".mc-email");
    if (el) copyText(el.dataset.email);
  });

  $("#addSubjectBtn").onclick = () => openSubjectEditor(null);
  $("#subjectSaveBtn").onclick = saveSubject;
  $("#deleteSubjectBtn").onclick = deleteSubject;
  $("#addMeetingBtn").onclick = () => $("#meetingList").appendChild(meetingRow({ weekday: 1, slot: data.lastCustomTime || "n1", room: "" }));
  $("#addSemesterBtn").onclick = () => openSemesterEditor(null);
  $("#semSaveBtn").onclick = saveSemesterFromModal;
  $("#semDeleteBtn").onclick = () => { const k = editingSemesterKey; closeModals(); deleteSemester(k); };

  $("#confirmYes").onclick = () => resolveConfirm(_confirmIsPrompt ? $("#confirmInput").value : true);
  $("#confirmNo").onclick = () => resolveConfirm(_confirmIsPrompt ? null : false);
  $("#confirmInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#confirmYes").click(); });

  $("#exportBtn").onclick = exportData;
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#importFile").onchange = e => e.target.files[0] && importData(e.target.files[0]);
  $("#wipeBtn").onclick = wipeAllData;
  $("#aboutBtn").onclick = openAbout;
  $("#accountCard").onclick = openAccountModal;
  $("#deleteAccountBtn").onclick = deleteAccount;
  $("#creditViwctor").onclick = () => window.open("https://github.com/viwctor/m87", "_blank", "noopener");

  $("#brBackup").onclick = () => { hideBackupReminder(); exportData(); };
  $("#brDismiss").onclick = hideBackupReminder;

  // deslizar em área vazia troca de guia (mobile)
  const order = ["subjects", "dashboard", "calendar", "settings"];
  let _mx = null, _my = null, _mt = null;
  const main = $(".app-main");
  main.addEventListener("touchstart", e => {
    _mx = e.changedTouches[0].clientX; _my = e.changedTouches[0].clientY; _mt = e.target;
  }, { passive: true });
  main.addEventListener("touchend", e => {
    if (_mx === null) return;
    const dx = e.changedTouches[0].clientX - _mx, dy = e.changedTouches[0].clientY - _my;
    const startedInGrid = _mt && _mt.closest && _mt.closest("#calGrid");
    _mx = _my = _mt = null;
    if (startedInGrid) return; // o grid do calendário tem o próprio swipe (troca mês)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      const cur = order.indexOf(activeView);
      const next = Math.max(0, Math.min(order.length - 1, cur + (dx < 0 ? 1 : -1)));
      if (next !== cur) switchView(order[next]);
    }
  }, { passive: true });

  $$("[data-close-modal]").forEach(b => b.onclick = closeModals);
  $$(".modal-overlay").forEach(ov => ov.addEventListener("click", e => { if (e.target === ov) closeModals(); }));

  // atalhos de teclado (desktop)
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches("input, select, textarea")) return;
    const modalOpen = $$(".modal-overlay").some(m => !m.hidden);
    if (e.key === "Escape" && modalOpen) { closeModals(); return; }
    if (modalOpen || !$("#auth").hidden) return;
    const views = { "1": "subjects", "2": "dashboard", "3": "calendar", "4": "settings" };
    if (views[e.key]) { switchView(views[e.key]); return; }
    if (activeView === "calendar") {
      if (e.key === "ArrowLeft") calShift(-1);
      else if (e.key === "ArrowRight") calShift(1);
      else if (e.key.toLowerCase() === "h") goToday();
    }
    if (e.key.toLowerCase() === "n" && !$("#fab").hidden) $("#fab").click();
  });
}

/* ============================================================
   AUTENTICAÇÃO / NUVEM (Supabase) — opcional
   ============================================================ */
let authMode = "login";
function authMsg(t) { $("#authMsg").textContent = t || ""; }

function showAuth() {
  $("#auth").hidden = false;
  setAuthMode("login");
}
function setAuthMode(mode) {
  authMode = mode;
  $("#authUsername").hidden = mode !== "signup";
  $("#authPrimary").textContent = mode === "login" ? "Entrar" : "Criar conta";
  $("#authSecondary").textContent = mode === "login" ? "Criar conta" : "Já tenho conta";
  authMsg("");
}

async function doAuthPrimary() {
  const email = $("#authEmail").value.trim();
  const pw = $("#authPassword").value;
  if (!email || !pw) { authMsg("Preencha e-mail e senha."); return; }
  if (authMode === "signup" && pw.length < 6) { authMsg("A senha precisa ter ao menos 6 caracteres."); return; }
  authMsg("Aguarde…");
  try {
    if (authMode === "login") {
      const res = await M87Cloud.signIn(email, pw);
      await enterApp(res.user);
    } else {
      const username = $("#authUsername").value.trim();
      if (!username) { authMsg("Escolha um nome de usuário."); return; }
      if (!/@usp\.br$/i.test(email)) { authMsg("Use seu e-mail institucional da USP (@usp.br)."); return; }
      const res = await M87Cloud.signUp(email, pw, username);
      if (res.session && res.user) await enterApp(res.user);
      else { setAuthMode("login"); authMsg("Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre."); }
    }
  } catch (e) {
    authMsg("Erro: " + (e.message || e));
  }
}
async function doForgot() {
  const email = $("#authEmail").value.trim();
  if (!email) { authMsg("Digite seu e-mail para recuperar a senha."); return; }
  try { await M87Cloud.resetPassword(email); authMsg("Enviamos um link de recuperação para o seu e-mail."); }
  catch (e) { authMsg("Erro: " + (e.message || e)); }
}
async function doLogout() {
  const ok = await uiConfirm("Sair da conta? Seus dados continuam salvos na nuvem.", { yesLabel: "Sair" });
  if (!ok) return;
  try { await M87Cloud.signOut(); } catch (e) { console.error(e); }
  cloudUserId = null;
  data = seedData();                                  // limpa o cache local (evita vazar dados ao próximo login)
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  closeModals();
  showAuth();
}
async function handlePasswordRecovery() {
  $("#auth").hidden = false;
  const np = await uiPrompt("Defina a nova senha (mínimo 6 caracteres):", { yesLabel: "Salvar", placeholder: "Nova senha" });
  if (!np) return;
  if (np.length < 6) { toast("Senha muito curta."); return; }
  try { await M87Cloud.updatePassword(np); toast("Senha atualizada! Entre com a nova senha."); }
  catch (e) { toast("Erro: " + (e.message || e)); }
}

async function enterApp(user) {
  cloudUserId = user.id;
  cloudUsername = (user.user_metadata && user.user_metadata.username) ||
                  (user.email ? user.email.split("@")[0] : "Usuário");
  cloudEmail = user.email || "";
  try {
    const remote = await M87Cloud.loadData(user.id);
    if (remote && remote.semesters && Object.keys(remote.semesters).length) {
      data = migrate(remote);
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } else {
      data = emptyData();                              // novo usuário começa vazio
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      await M87Cloud.saveData(user.id, data);
    }
  } catch (e) {
    console.error("Falha ao carregar dados da nuvem:", e); // segue com o cache local
  }
  _dataVer++;
  updateSemesterButton();
  calRef = null;
  renderAll();
  renderAccount();
  applyHashView();
  $("#auth").hidden = true;
  hideSplash();
  if (!activeSem()) openSemesterEditor(null, true);    // boas-vindas: escolher o semestre
  try { M87Cloud.subscribe(user.id, handleRealtime); } catch (e) { console.error(e); }
}

/* mudança vinda de outro aparelho (tempo real) */
function handleRealtime(row) {
  if (!row || !row.data || row.data._device === DEVICE_ID) return; // ignora o próprio eco
  try {
    data = migrate(row.data);
    if (!data.semesters[data.activeSemester]) data.activeSemester = Object.keys(data.semesters)[0] || null;
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    _dataVer++;
    updateSemesterButton();
    calRef = null;
    renderAll();
    renderAccount();
    toast("Atualizado de outro aparelho ⟳");
  } catch (e) { console.error("realtime", e); }
}

function bindAuthEvents() {
  if (!$("#authPrimary")) return;
  $("#authPrimary").onclick = doAuthPrimary;
  $("#authSecondary").onclick = () => setAuthMode(authMode === "login" ? "signup" : "login");
  $("#authForgot").onclick = doForgot;
  $("#logoutBtn").onclick = doLogout;
  $("#authPassword").addEventListener("keydown", e => { if (e.key === "Enter") doAuthPrimary(); });
}

/* ============================================================
   INIT
   ============================================================ */
function applyHashView() {
  const hv = location.hash.slice(1);
  if (["subjects", "calendar", "settings"].includes(hv)) switchView(hv);
}
function hideSplash() {
  const sp = $("#splash");
  if (sp) { sp.classList.add("hide"); setTimeout(() => sp.remove(), 450); }
}
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
}

async function cloudInit() {
  M87Cloud.onAuthChange((event) => {
    if (event === "PASSWORD_RECOVERY") handlePasswordRecovery();
    else if (event === "SIGNED_OUT") showAuth();
  });
  let session = null;
  try { session = await M87Cloud.getSession(); } catch (e) { console.error(e); }
  if (session && session.user) await enterApp(session.user);
  else setTimeout(() => { hideSplash(); showAuth(); }, 1100);
}

function init() {
  bindEvents();
  bindAuthEvents();
  registerSW();
  if (window.M87Cloud && M87Cloud.enabled()) {
    cloudInit();                       // tem login: tela de conta + dados na nuvem
  } else {
    updateSemesterButton();             // modo local (sem login)
    renderAll();
    applyHashView();
    setTimeout(hideSplash, 1100);
  }
}
init();
