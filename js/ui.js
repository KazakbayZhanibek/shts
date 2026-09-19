/* ui.js — отрисовка всех страниц. Зависит от Fin и Store. */
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const Icon = (name, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;

  const TYPE_META = {
    income: { icon: Icon("i-trend-up"), cls: "tx-income green" },
    expense: { icon: Icon("i-trend-down"), cls: "tx-expense red" },
    saving: { icon: Icon("i-coins"), cls: "tx-saving" },
  };
  const TYPE_NAME = { income: "Доход", expense: "Расход", saving: "Накопление" };

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg; el.classList.remove("hidden");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  function txRow(t, showActions = true) {
    const m = TYPE_META[t.type] || TYPE_META.expense;
    return `<div class="tx ${m.cls.split(" ")[0]}" data-id="${t.id}">
      <div class="tx-ico">${t.type === "expense" && t.category === "Транспорт" ? Icon("i-bus") : m.icon}</div>
      <div class="tx-main"><strong>${esc(t.category || TYPE_NAME[t.type])}${t.description ? " · " + esc(t.description) : ""}</strong>
      <small>${esc(t.date)} · ${TYPE_NAME[t.type]}</small></div>
      <div class="tx-amt ${t.type === "income" ? "green" : t.type === "expense" ? "red" : ""}">${t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}${Fin.formatMoney(t.amount)}</div>
      ${showActions ? `<button class="icon-btn tx-edit" data-edit="${t.id}" title="Редактировать" aria-label="Редактировать">${Icon("i-edit", "ic ic-sm")}</button>` : ""}
    </div>`;
  }

  function renderHome() {
    const { transactions, goals } = Store.get();
    const d = Fin.dashboard(transactions);
    $("heroAvailable").textContent = Fin.formatMoney(d.available);
    $("heroTotal").textContent = Fin.formatMoney(d.totalCapital);
    $("heroSaved").textContent = Fin.formatMoney(d.savedTotal);
    $("todayDate").textContent = "· " + Fin.todayISO().split("-").reverse().join(".");
    $("todayEarned").textContent = Fin.formatMoney(d.today.earned);
    $("todaySpent").textContent = Fin.formatMoney(d.today.spent);
    $("todayNet").textContent = Fin.formatSigned(d.today.earned - d.today.spent);
    $("todaySaved").textContent = Fin.formatMoney(d.today.saved);
    $("todayTrips").textContent = d.today.trips;
    $("todayCount").textContent = d.today.count;
    $("weekEarned").textContent = Fin.formatMoney(d.week.earned);
    $("weekSpent").textContent = Fin.formatMoney(d.week.spent);
    $("weekNet").textContent = Fin.formatSigned(d.week.net);
    $("monthEarned").textContent = Fin.formatMoney(d.month.earned);
    $("monthSpent").textContent = Fin.formatMoney(d.month.spent);
    $("monthSaved").textContent = Fin.formatMoney(d.month.saved);
    $("monthFree").textContent = Fin.formatMoney(d.month.free);
    $("monthSaveRate").textContent = `Доля накоплений: ${d.month.saveRate}% · Чистыми: ${Fin.formatMoney(d.month.net)}`;
    $("monthSaveBar").style.width = Math.min(100, d.month.saveRate) + "%";

    const recent = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
    $("recentList").innerHTML = recent.length ? recent.map((t) => txRow(t)).join("")
      : `<div class="empty">${Icon("i-wallet", "ic empty-ic")}<span>Пока пусто. Нажмите «Добавить запись»</span><br><button class="link" id="seedBtn">Загрузить демо-данные</button></div>`;
    const sb = $("seedBtn");
    if (sb) sb.onclick = () => { Store.seedDemo(); refreshAll(); toast("Демо-данные загружены"); };

    $("homeGoals").innerHTML = goals.length ? goals.slice(0, 3).map(goalCard).join("")
      : `<div class="empty">${Icon("i-target", "ic empty-ic")}<span>Целей пока нет — создайте первую</span></div>`;
  }

  function goalCard(g) {
    const c = Fin.goalCalc(g);
    return `<div class="goal">
      <div class="goal-top"><strong>${Icon("i-target", "ic ic-sm")} ${esc(g.name)}</strong>
        <span><button class="link" data-goal-edit="${g.id}">Изм.</button> · <button class="link" data-goal-add="${g.id}">+ Внести</button></span></div>
      <div class="goal-amt">${Fin.formatMoney(g.currentAmount)} / ${Fin.formatMoney(g.targetAmount)}</div>
      <div class="progress"><div class="progress-fill" style="width:${c.pct}%"></div></div>
      <div class="muted small mt">${c.pct}% · Осталось ${Fin.formatMoney(c.left)}${c.daysLeft !== null ? ` · ${c.daysLeft} дн.` : ""}${c.perDay ? ` · по ${Fin.formatMoney(c.perDay)}/день (${Fin.formatMoney(c.perWeek)}/нед)` : ""}${g.deadline ? ` · до ${esc(g.deadline)}` : ""}</div>
    </div>`;
  }

  const filters = { period: "today", from: "", to: "", type: "all", category: "all" };
  const getFilters = () => ({ ...filters });

  function renderHistory() {
    const { transactions } = Store.get();
    const cats = [...new Set(transactions.map((t) => t.category).filter(Boolean))];
    const sel = $("filterCategory");
    const cur = filters.category;
    sel.innerHTML = `<option value="all">Все категории</option>` + cats.map((c) => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("");
    const list = Fin.filterTx(transactions, filters);
    const s = Fin.sums(list);
    const box = $("historySummary");
    if (filters.period !== "all" || filters.type !== "all" || list.length !== transactions.length) {
      box.classList.remove("hidden");
      box.innerHTML = `<div class="stat-grid-3">
        <div class="stat"><span>Доход</span><strong class="green">${Fin.formatMoney(s.inc)}</strong></div>
        <div class="stat"><span>Расход</span><strong class="red">${Fin.formatMoney(s.exp)}</strong></div>
        <div class="stat"><span>Итог дня/периода</span><strong>${Fin.formatSigned(s.inc - s.exp)}</strong></div>
      </div><div class="muted small mt">Операций: ${list.length} · Отложено: ${Fin.formatMoney(s.sav)}</div>`;
    } else box.classList.add("hidden");

    const groups = Fin.groupByDate(list);
    $("historyList").innerHTML = groups.length ? groups.map((g) => `
      <div class="day-group">
        <div class="day-head"><span>${esc(g.date.split("-").reverse().join("."))}</span>
        <span class="day-total ${g.dayNet >= 0 ? "pos" : "neg"}">Итог дня: ${Fin.formatSigned(g.dayNet)}</span></div>
        <div class="tx-list">${g.items.map((t) => txRow(t)).join("")}</div>
      </div>`).join("")
      : `<div class="empty">Ничего не найдено. Измените фильтры.</div>`;
  }

  let analyticsMode = "30";
  function renderAnalytics() {
    const { transactions } = Store.get();
    const a = Fin.analytics(transactions, analyticsMode);
    $("analyticsSummary").innerHTML = `
      <div class="card"><div class="card-title">Доход</div><div class="big-number green">${Fin.formatMoney(a.sums.inc)}</div></div>
      <div class="card"><div class="card-title">Расходы</div><div class="big-number red">${Fin.formatMoney(a.sums.exp)}</div></div>
      <div class="card"><div class="card-title">Отложено</div><div class="big-number">${Fin.formatMoney(a.sums.sav)}</div></div>
      <div class="card"><div class="card-title">Свободный остаток</div><div class="big-number">${Fin.formatMoney(a.free)}</div>
      <div class="muted small">Доля накоплений: ${a.saveRate}%</div></div>`;

    const maxV = Math.max(1, ...a.daily.map((d) => Math.max(d.inc, d.exp)));
    $("chartDaily").innerHTML = a.daily.length ? a.daily.map((d) => `
      <div class="bar-group" title="${d.date}: +${d.inc} / −${d.exp}">
        <div class="bar inc" style="height:${Math.round((d.inc / maxV) * 55)}px"></div>
        <div class="bar exp" style="height:${Math.round((d.exp / maxV) * 55)}px"></div>
        <div class="bar-label">${esc(d.label.slice(3))}</div>
      </div>`).join("") : `<div class="empty">Нет данных</div>`;

    const wmax = Math.max(1, ...a.weekly.map((w) => w.amount));
    $("chartWeekly").innerHTML = a.weekly.length ? a.weekly.map((w) => `
      <div class="bar-group" title="${w.week}: ${w.amount}"><div class="bar inc" style="height:${Math.round((w.amount / wmax) * 100)}px"></div>
      <div class="bar-label">${esc(w.week.slice(3))}</div></div>`).join("") : `<div class="empty">Нет данных</div>`;

    $("chartCats").innerHTML = a.byCat.length ? a.byCat.map(([c, v]) => {
      const p = a.catTotal ? Math.round((v / a.catTotal) * 100) : 0;
      return `<div class="cat-row"><span style="width:110px">${esc(c)}</span>
        <div class="cat-bar" style="width:${p}%"></div><strong>${Fin.formatMoney(v)}</strong><span class="muted small">${p}%</span></div>`;
    }).join("") : `<div class="empty">Нет расходов</div>`;

    $("metricsList").innerHTML = `
      <div class="metric"><span>Средний заработок за рабочий день</span><strong>${Fin.formatMoney(a.avgWorkday)}</strong></div>
      <div class="metric"><span>Рабочих дней в выборке</span><strong>${a.workDays}</strong></div>
      <div class="metric"><span>Средние траты за день</span><strong>${Fin.formatMoney(a.avgSpend)}</strong></div>
      <div class="metric"><span>Самая большая трата</span><strong>${a.biggest ? Fin.formatMoney(a.biggest.amount) + " · " + esc(a.biggest.category || "") + " (" + esc(a.biggest.date) + ")" : "—"}</strong></div>
      <div class="metric"><span>Сохраняю от дохода</span><strong>${a.saveRate}%</strong></div>
      <div class="metric"><span>Чистый денежный поток</span><strong>${Fin.formatMoney(a.netFlow)}</strong></div>`;
  }

  function renderGoals() {
    const { goals, deposits, transactions } = Store.get();
    $("goalsList").innerHTML = goals.length ? goals.map(goalCard).join("") : `<div class="empty">Целей пока нет</div>`;
    // «Первый миллион» = общий капитал (доходы − расходы): растут от заработка,
    // не меняются от переводов в накопления/депозит, уменьшаются от трат.
    // Так прогресс двигается от любых добавленных денег и не задваивает депозитные пополнения.
    const sums = Fin.sums(transactions);
    const capital = Math.max(0, sums.inc - sums.exp);
    const pct = Math.min(100, Math.round((capital / CONFIG.MILLION_GOAL) * 100));
    $("millionText").textContent = `${Fin.formatMoney(capital)} / ${Fin.formatMoney(CONFIG.MILLION_GOAL)}`;
    $("millionBar").style.width = pct + "%";
    $("millionSub").textContent = `${pct}% · осталось ${Fin.formatMoney(Math.max(0, CONFIG.MILLION_GOAL - capital))} · в накоплениях ${Fin.formatMoney(sums.sav)}`;

    $("depositsList").innerHTML = deposits.length ? deposits.map((d) => {
      const proj = Fin.depositProjection(d.balance, d.interestRate);
      const labels = { 1: "мес", 3: "3 мес", 6: "6 мес", 12: "год" };
      return `<div class="goal"><div class="goal-top"><strong>${Icon("i-bank", "ic ic-sm")} ${esc(d.name)}</strong>
        <span><button class="link" data-dep-edit="${d.id}">Изм.</button></span></div>
        <div class="goal-amt">${Fin.formatMoney(d.balance)} · ${esc(String(d.interestRate))}% годовых</div>
        <div class="muted small">Открыт: ${esc(d.startDate || "—")} · Срок: ${esc(String(d.term || "—"))} мес.</div>
        <div class="dep-proj">${proj.map((p) => `<div>Через ${labels[p.month] || p.month + "м"}<br><strong>+${Fin.formatMoney(p.profit)}</strong><br><span class="muted">${Fin.formatMoney(p.future)}</span></div>`).join("")}</div>
        <button class="btn btn-ghost btn-block" data-dep-topup="${d.id}">${Icon("i-plus", "ic ic-sm")} Пополнить (создаст операцию «Накопление»)</button>
      </div>`;
    }).join("") : `<div class="empty">Депозитов пока нет</div>`;
  }

  function refreshAll() {
    renderHome(); renderHistory(); renderAnalytics(); renderGoals();
    const online = Store.isOnline();
    const el = document.getElementById("syncStatus");
    if (el) {
      el.textContent = online ? "● sheets ✓" : (CONFIG.GOOGLE_SCRIPT_URL ? "● офлайн" : "● локально");
      el.className = "sync " + (online ? "sync-online" : "sync-local");
    }
  }

  return { toast, txRow, renderHome, renderHistory, renderAnalytics, renderGoals, refreshAll, filters, getFilters, setAnalyticsMode: (m) => (analyticsMode = m), getAnalyticsMode: () => analyticsMode };
})();
