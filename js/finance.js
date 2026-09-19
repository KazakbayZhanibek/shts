/* finance.js — все расчеты. Чистые функции, без зависимости от DOM/storage.
   Формулы (по ТЗ):
   Чистый доход   = Доходы − Расходы
   Доступные деньги = Доходы − Расходы − переводы в накопления
   Общий капитал  = доступные + накопления = Доходы − Расходы
   Перевод в накопления/депозит НЕ уменьшает общий капитал.
*/
const Fin = (() => {
  const pad = (n) => String(n).padStart(2, "0");
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayISO = () => toISODate(new Date());

  function formatMoney(n) {
    n = Math.round(Number(n) || 0);
    const sign = n < 0 ? "−" : "";
    const abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${sign}${abs} ₸`;
  }
  function formatSigned(n) {
    n = Math.round(Number(n) || 0);
    if (n > 0) return "+" + formatMoney(n);
    if (n < 0) return formatMoney(n);
    return formatMoney(0);
  }

  function startOfWeek(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // понедельник = 0
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  const sumBy = (arr, fn) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
  const byType = (txs, t) => txs.filter((t2) => t2.type === t);

  function inDay(txDate, ref = new Date()) {
    return txDate === toISODate(ref);
  }
  function inWeek(txDate, ref = new Date()) {
    const d = parseDate(txDate);
    if (!d) return false;
    const s = startOfWeek(ref);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    return d >= s && d < e;
  }
  function inMonth(txDate, ref = new Date()) {
    const d = parseDate(txDate);
    if (!d) return false;
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  }

  function sums(txs) {
    const inc = sumBy(byType(txs, "income"), (t) => t.amount);
    const exp = sumBy(byType(txs, "expense"), (t) => t.amount);
    const sav = sumBy(byType(txs, "saving"), (t) => t.amount);
    return { inc, exp, sav };
  }

  // Главная сводка
  function dashboard(txs, ref = new Date()) {
    const g = sums(txs);
    const available = g.inc - g.exp - g.sav;
    const total = g.inc - g.exp; // = available + sav
    const t = txs.filter((x) => inDay(x.date, ref));
    const w = txs.filter((x) => inWeek(x.date, ref));
    const m = txs.filter((x) => inMonth(x.date, ref));
    const ts = sums(t), ws = sums(w), ms = sums(m);
    const tripsToday = t.filter((x) => x.type === "expense" && x.category === "Транспорт")
      .reduce((s, x) => s + Math.round(Number(x.amount) / CONFIG.TRANSPORT_FARE), 0);
    return {
      available, totalCapital: total, savedTotal: g.sav,
      today: { earned: ts.inc, spent: ts.exp, saved: ts.sav, net: ts.inc - ts.exp, count: t.length, trips: tripsToday },
      week: { earned: ws.inc, spent: ws.exp, saved: ws.sav, net: ws.inc - ws.exp },
      month: { earned: ms.inc, spent: ms.exp, saved: ms.sav, free: ms.inc - ms.exp - ms.sav, net: ms.inc - ms.exp,
               saveRate: ms.inc > 0 ? Math.round((ms.sav / ms.inc) * 100) : 0 },
    };
  }

  function groupByDate(txs) {
    const map = {};
    [...txs].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((t) => {
      (map[t.date] = map[t.date] || []).push(t);
    });
    return Object.entries(map).map(([date, items]) => {
      const s = sums(items);
      return { date, items, dayNet: s.inc - s.exp, ...s };
    });
  }

  function filterTx(txs, { period = "all", from = null, to = null, type = "all", category = "all" } = {}, ref = new Date()) {
    let out = [...txs];
    if (period === "today") out = out.filter((t) => inDay(t.date, ref));
    else if (period === "week") out = out.filter((t) => inWeek(t.date, ref));
    else if (period === "month") out = out.filter((t) => inMonth(t.date, ref));
    else if (period === "custom" && (from || to)) {
      out = out.filter((t) => (!from || t.date >= from) && (!to || t.date <= to));
    }
    if (type !== "all") out = out.filter((t) => t.type === type);
    if (category !== "all") out = out.filter((t) => (t.category || "") === category);
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || "").localeCompare(a.createdAt || "")));
  }

  // Аналитика за окно (последние N дней или всё)
  function analytics(txs, mode = "30") {
    const now = new Date();
    let list = [...txs];
    let days = [];
    if (mode === "month") {
      list = list.filter((t) => inMonth(t.date, now));
      const start = startOfMonth(now);
      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) days.push(toISODate(d));
    } else if (mode === "all") {
      days = [...new Set(list.map((t) => t.date))].sort().slice(-30);
      if (!days.length) days = [todayISO()];
    } else {
      const n = Number(mode) || 30;
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        days.push(toISODate(d));
      }
      const min = days[0];
      list = list.filter((t) => t.date >= min);
    }
    const s = sums(list);
    const daily = days.map((d) => {
      const day = list.filter((t) => t.date === d);
      const ds = sums(day);
      return { date: d, label: d.slice(5), ...ds, net: ds.inc - ds.exp };
    });
    // по неделям (доход)
    const wmap = {};
    list.filter((t) => t.type === "income").forEach((t) => {
      const w = toISODate(startOfWeek(parseDate(t.date)));
      wmap[w] = (wmap[w] || 0) + Number(t.amount);
    });
    const weekly = Object.entries(wmap).sort().slice(-8).map(([w, v]) => ({ week: w.slice(5), amount: v }));
    // по категориям расходов
    const cmap = {};
    list.filter((t) => t.type === "expense").forEach((t) => {
      const c = t.category || "Другое";
      cmap[c] = (cmap[c] || 0) + Number(t.amount);
    });
    const byCat = Object.entries(cmap).sort((a, b) => b[1] - a[1]);
    const catTotal = byCat.reduce((a, [, v]) => a + v, 0);

    const workDays = new Set(list.filter((t) => t.type === "income" && Number(t.amount) > 0).map((t) => t.date)).size;
    const avgWorkday = workDays ? Math.round(s.inc / workDays) : 0;
    const activeDays = new Set(list.map((t) => t.date)).size || 1;
    const avgSpend = Math.round(s.exp / activeDays);
    const biggest = list.filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount)[0] || null;
    const saveRate = s.inc > 0 ? Math.round((s.sav / s.inc) * 100) : 0;
    return { scope: list, sums: s, daily, weekly, byCat, catTotal, workDays, avgWorkday, avgSpend, biggest, saveRate,
             netFlow: s.inc - s.exp, free: s.inc - s.exp - s.sav };
  }

  function goalCalc(goal, ref = new Date()) {
    const target = Number(goal.targetAmount) || 0;
    const cur = Number(goal.currentAmount) || 0;
    const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0;
    const left = Math.max(0, target - cur);
    let daysLeft = null, perDay = null, perWeek = null;
    if (goal.deadline) {
      const dl = parseDate(goal.deadline);
      if (dl) {
        const r = new Date(ref); r.setHours(0, 0, 0, 0);
        daysLeft = Math.ceil((dl - r) / 86400000);
        if (daysLeft > 0 && left > 0) {
          perDay = Math.ceil(left / daysLeft);
          perWeek = Math.ceil((left / daysLeft) * 7);
        }
      }
    }
    return { pct, left, daysLeft, perDay, perWeek };
  }

  // Простой сложный процент помесячно: balance*(1+r/12)^k
  function depositProjection(balance, annualRate, monthsList = [1, 3, 6, 12]) {
    const b = Number(balance) || 0, r = Number(annualRate) || 0;
    const m = r / 12 / 100;
    return monthsList.map((k) => {
      const future = m === 0 ? b : Math.round(b * Math.pow(1 + m, k));
      return { months: k, future, profit: future - b };
    });
  }

  return { toISODate, parseDate, todayISO, formatMoney, formatSigned, dashboard, groupByDate, filterTx, analytics, goalCalc, depositProjection, sums, inDay, inWeek, inMonth };
})();
