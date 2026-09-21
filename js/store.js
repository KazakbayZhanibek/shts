/* store.js — хранилище: LocalStorage (MVP) + синхронизация с Google Sheets через Apps Script.
   Таблицы: Transactions(ID,Date,Type,Amount,Category,Description,CreatedAt),
            Goals(ID,Name,TargetAmount,CurrentAmount,Deadline,CreatedAt),
            Deposits(ID,Name,Balance,InterestRate,StartDate,Term,CreatedAt)
*/
const Store = (() => {
  const LS_KEY = "tenge_tracker_v1";
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  let state = { transactions: [], goals: [], deposits: [] };
  let online = false;
  // Кодовое слово для таблицы (проверяется скриптом, в репозиторий НЕ попадает).
  // Хранится только в браузере пользователя.
  const TOKEN_KEY = "tt_api_token";
  let apiToken = "";
  try { apiToken = localStorage.getItem(TOKEN_KEY) || ""; } catch { /* ignore */ }
  // ok | forbidden | unconfigured | offline | local
  let authState = "local";
  const getAuthState = () => authState;
  function setToken(t) {
    apiToken = String(t || "").trim();
    try {
      if (apiToken) localStorage.setItem(TOKEN_KEY, apiToken);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
  }
  const hasToken = () => apiToken.length > 0;

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) state = { transactions: [], goals: [], deposits: [], ...JSON.parse(raw) };
    } catch { /* ignore */ }
  }
  function saveLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
  const get = () => state;

  // Объединение по ID: записи из таблицы — основа, локальных без пары — добавляем.
  // Затем недостающее на сервере догружаем туда (миграция + офлайн-записи).
  // Ограничение MVP: удаление, сделанное офлайн, при слиянии может «воскреснуть» — удаляйте при включённой синхронизации.
  function mergeById(local, remote) {
    const map = new Map();
    remote.forEach((r) => map.set(r.id, r));
    const missing = [];
    local.forEach((l) => {
      if (!map.has(l.id)) { map.set(l.id, l); missing.push(l); }
    });
    return { merged: [...map.values()], missing };
  }

  async function init() {
    loadLocal();
    if (!CONFIG.GOOGLE_SCRIPT_URL) { authState = "local"; return { state, online, auth: authState }; }
    // Таймаут: висящий запрос не должен тормозить приложение
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
    try {
      const res = await fetch(CONFIG.GOOGLE_SCRIPT_URL + "?action=list&token=" + encodeURIComponent(apiToken), ctrl ? { signal: ctrl.signal } : undefined);
      const data = await res.json();
      if (data && (data.error === "forbidden" || data.error === "token_not_configured")) {
        // Локальные данные НЕ трогаем — просто работаем офлайн до ввода кода
        authState = data.error === "forbidden" ? "forbidden" : "unconfigured";
        online = false;
      } else if (data && Array.isArray(data.transactions)) {
          const rt = mergeById(state.transactions, data.transactions.map(normalizeTx));
          const rg = mergeById(state.goals, (data.goals || []).map(normalizeGoal));
          const rd = mergeById(state.deposits, (data.deposits || []).map(normalizeDep));
          state = { transactions: rt.merged, goals: rg.merged, deposits: rd.merged };
          saveLocal();
          // Догружаем на сервер то, чего там нет (первое подключение увозит локальные данные в таблицу)
          rt.missing.forEach((t) => push("upsert", "Transactions", toTxRow(t)));
          rg.missing.forEach((g) => push("upsert", "Goals", toGoalRow(g)));
          rd.missing.forEach((d) => push("upsert", "Deposits", toDepRow(d)));
          authState = "ok";
        } else {
          authState = "offline";
        }
        online = authState === "ok";
      } catch (e) {
        console.warn("Sheets sync failed, offline mode:", e);
        online = false;
        authState = "offline";
      } finally {
        if (timer) clearTimeout(timer);
      }
    return { state, online, auth: authState };
  }
  const isOnline = () => online;

  // Нормализация (числа — числами, не строками с ₸)
  // Дату приводим к YYYY-MM-DD при любом формате с сервера (ISO, длинная строка даты, объект Date)
  function isoDate(v, fallback = "") {
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
    }
    const s = String(v ?? "");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    if (s) {
      const d = new Date(s);
      if (!isNaN(d)) return isoDate(d);
    }
    return fallback;
  }
  function normalizeTx(r) {
    return { id: String(r.ID ?? r.id ?? uid()), date: isoDate(r.Date ?? r.date, Fin.todayISO()),
      type: String(r.Type ?? r.type ?? "expense"), amount: Number(r.Amount ?? r.amount ?? 0),
      category: String(r.Category ?? r.category ?? ""), description: String(r.Description ?? r.description ?? ""),
      createdAt: String(r.CreatedAt ?? r.createdAt ?? new Date().toISOString()) };
  }
  function normalizeGoal(r) {
    return { id: String(r.ID ?? r.id ?? uid()), name: String(r.Name ?? r.name ?? ""),
      targetAmount: Number(r.TargetAmount ?? r.targetAmount ?? 0),
      currentAmount: Number(r.CurrentAmount ?? r.currentAmount ?? 0),
      deadline: isoDate(r.Deadline ?? r.deadline, ""), createdAt: String(r.CreatedAt ?? r.createdAt ?? new Date().toISOString()) };
  }
  function normalizeDep(r) {
    return { id: String(r.ID ?? r.id ?? uid()), name: String(r.Name ?? r.name ?? ""),
      balance: Number(r.Balance ?? r.balance ?? 0), interestRate: Number(r.InterestRate ?? r.interestRate ?? 0),
      startDate: isoDate(r.StartDate ?? r.startDate, ""), term: Number(r.Term ?? r.term ?? 12),
      createdAt: String(r.CreatedAt ?? r.createdAt ?? new Date().toISOString()) };
  }

  async function push(action, sheet, row) {
    if (!CONFIG.GOOGLE_SCRIPT_URL) return;
    try {
      await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, sheet, row, token: apiToken }),
      });
    } catch (e) { console.warn("push failed", e); }
  }
  const toTxRow = (t) => ({ ID: t.id, Date: t.date, Type: t.type, Amount: t.amount, Category: t.category, Description: t.description, CreatedAt: t.createdAt });
  const toGoalRow = (g) => ({ ID: g.id, Name: g.name, TargetAmount: g.targetAmount, CurrentAmount: g.currentAmount, Deadline: g.deadline, CreatedAt: g.createdAt });
  const toDepRow = (d) => ({ ID: d.id, Name: d.name, Balance: d.balance, InterestRate: d.interestRate, StartDate: d.startDate, Term: d.term, CreatedAt: d.createdAt });

  // --- Transactions ---
  function addTx({ date, type, amount, category, description }) {
    const t = { id: uid(), date, type, amount: Number(amount), category: category || "", description: description || "", createdAt: new Date().toISOString() };
    state.transactions.push(t); saveLocal(); push("upsert", "Transactions", toTxRow(t));
    return t;
  }
  function updateTx(id, patch) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { amount: patch.amount !== undefined ? Number(patch.amount) : t.amount });
    saveLocal(); push("upsert", "Transactions", toTxRow(t));
    return t;
  }
  function deleteTx(id) {
    state.transactions = state.transactions.filter((x) => x.id !== id);
    saveLocal(); push("delete", "Transactions", { ID: id });
  }
  function addTrip(count = 1, date = Fin.todayISO()) {
    return addTx({ date, type: "expense", amount: CONFIG.TRANSPORT_FARE * count, category: "Транспорт", description: `Поездки × ${count}` });
  }

  // --- Goals ---
  function upsertGoal(g) {
    if (g.id) {
      const ex = state.goals.find((x) => x.id === g.id);
      if (ex) { Object.assign(ex, g); saveLocal(); push("upsert", "Goals", toGoalRow(ex)); return ex; }
    }
    const ng = { id: uid(), createdAt: new Date().toISOString(), currentAmount: 0, deadline: "", ...g };
    state.goals.push(ng); saveLocal(); push("upsert", "Goals", toGoalRow(ng));
    return ng;
  }
  function deleteGoal(id) {
    state.goals = state.goals.filter((x) => x.id !== id);
    saveLocal(); push("delete", "Goals", { ID: id });
  }

  // --- Deposits ---
  function upsertDeposit(d) {
    if (d.id) {
      const ex = state.deposits.find((x) => x.id === d.id);
      if (ex) { Object.assign(ex, d); saveLocal(); push("upsert", "Deposits", toDepRow(ex)); return ex; }
    }
    const nd = { id: uid(), createdAt: new Date().toISOString(), startDate: Fin.todayISO(), term: 12, ...d };
    state.deposits.push(nd); saveLocal(); push("upsert", "Deposits", toDepRow(nd));
    return nd;
  }
  function deleteDeposit(id) {
    state.deposits = state.deposits.filter((x) => x.id !== id);
    saveLocal(); push("delete", "Deposits", { ID: id });
  }
  // Пополнение депозита = операция "Накопление" + рост баланса депозита
  function topupDeposit(depId, amount, date = Fin.todayISO()) {
    const dep = state.deposits.find((x) => x.id === depId);
    if (!dep) return null;
    amount = Number(amount);
    if (!(amount > 0)) return null;
    dep.balance = Number(dep.balance) + amount;
    saveLocal(); push("upsert", "Deposits", toDepRow(dep));
    return addTx({ date, type: "saving", amount, category: dep.name || "Депозит", description: `Пополнение: ${dep.name}` });
  }

  function seedDemo() {
    if (state.transactions.length) return;
    const t = Fin.todayISO();
    const d = (offset) => { const x = new Date(); x.setDate(x.getDate() - offset); return Fin.toISODate(x); };
    state.transactions = [
      { id: uid(), date: d(0), type: "income", amount: 17000, category: "Работа", description: "", createdAt: new Date().toISOString() },
      { id: uid(), date: d(0), type: "expense", amount: 360, category: "Транспорт", description: "Поездки × 3", createdAt: new Date().toISOString() },
      { id: uid(), date: d(0), type: "expense", amount: 2500, category: "Еда", description: "Обед", createdAt: new Date().toISOString() },
      { id: uid(), date: d(0), type: "expense", amount: 1200, category: "Другое", description: "", createdAt: new Date().toISOString() },
      { id: uid(), date: d(1), type: "income", amount: 16000, category: "Работа", description: "", createdAt: new Date().toISOString() },
      { id: uid(), date: d(1), type: "saving", amount: 5000, category: "Депозит", description: "Отложил", createdAt: new Date().toISOString() },
      { id: uid(), date: d(2), type: "income", amount: 15000, category: "Работа", description: "", createdAt: new Date().toISOString() },
    ];
    state.goals = [
      { id: uid(), name: "Оплата университета", targetAmount: 114000, currentAmount: 78000, deadline: "2026-10-15", createdAt: new Date().toISOString() },
      { id: uid(), name: "Первый миллион", targetAmount: 1000000, currentAmount: 150000, deadline: "", createdAt: new Date().toISOString() },
    ];
    state.deposits = [
      { id: uid(), name: "Депозит Freedom", balance: 150000, interestRate: 14, startDate: t, term: 12, createdAt: new Date().toISOString() },
    ];
    saveLocal();
  }
  function clearAll() {
    state = { transactions: [], goals: [], deposits: [] };
    saveLocal();
  }

  return { get, init, isOnline, getAuthState, setToken, hasToken, addTx, updateTx, deleteTx, addTrip, upsertGoal, deleteGoal, upsertDeposit, deleteDeposit, topupDeposit, seedDemo, clearAll };
})();
