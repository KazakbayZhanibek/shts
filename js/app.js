/* app.js — роутинг, модалки, обработчики. */
(() => {
  const $ = (id) => document.getElementById(id);
  let txType = "income";
  let editingTxId = null;

  function goto(page) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    $("page-" + page).classList.add("active");
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.goto === page));
    window.scrollTo({ top: 0 });
  }

  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }

  function setTxType(t) {
    txType = t;
    document.querySelectorAll(".type-btn").forEach((b) => b.classList.toggle("active", b.dataset.ttype === t));
    const cat = $("txCategory"), label = $("txCatLabel"), quick = $("quickCats");
    $("tripHint").classList.toggle("hidden", !(t === "expense"));
    if (t === "income") {
      label.firstChild.textContent = "Источник ";
      cat.placeholder = "Работа";
      cat.setAttribute("list", "catList");
      $("catList").innerHTML = CONFIG.INCOME_SOURCES.map((c) => `<option value="${c}">`).join("");
      quick.innerHTML = CONFIG.INCOME_SOURCES.map((c) => `<button type="button" class="chip" data-q="${c}">${c}</button>`).join("");
    } else if (t === "expense") {
      label.firstChild.textContent = "Категория ";
      cat.placeholder = "Еда";
      $("catList").innerHTML = CONFIG.EXPENSE_CATEGORIES.map((c) => `<option value="${c}">`).join("");
      quick.innerHTML = CONFIG.EXPENSE_CATEGORIES.map((c) => `<button type="button" class="chip" data-q="${c}">${c}</button>`).join("");
    } else {
      label.firstChild.textContent = "Куда отложено ";
      cat.placeholder = "Депозит";
      $("catList").innerHTML = CONFIG.SAVING_PLACES.map((c) => `<option value="${c}">`).join("");
      quick.innerHTML = CONFIG.SAVING_PLACES.map((c) => `<button type="button" class="chip" data-q="${c}">${c}</button>`).join("");
    }
    quick.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { $("txCategory").value = b.dataset.q; }));
  }

  function openTxModal(type = "income", existing = null) {
    editingTxId = existing?.id || null;
    $("txModalTitle").textContent = existing ? "Редактировать запись" : "Новая запись";
    $("txId").value = existing?.id || "";
    $("txDelete").classList.toggle("hidden", !existing);
    setTxType(existing?.type || type);
    $("txDate").value = existing?.date || Fin.todayISO();
    $("txAmount").value = existing?.amount || "";
    $("txCategory").value = existing?.category || "";
    $("txDesc").value = existing?.description || "";
    openModal("modalTx");
    setTimeout(() => $("txAmount").focus(), 100);
  }

  function setThemeIcon(theme) {
    const use = $("themeUse");
    if (use) use.setAttribute("href", theme === "light" ? "#i-moon" : "#i-sun");
  }

  async function boot() {
    // тема
    const theme = localStorage.getItem("tt_theme") || "light";
    document.documentElement.dataset.theme = theme;
    setThemeIcon(theme);
    $("themeToggle").onclick = () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("tt_theme", next);
      setThemeIcon(next);
    };

    UI.refreshAll(); // мгновенный первый рендер из локального кэша, не ждём сеть
    const syncEl = $("syncStatus");
    if (CONFIG.GOOGLE_SCRIPT_URL && syncEl) {
      syncEl.textContent = "● синхронизация…";
      syncEl.className = "sync";
    }
    Store.init().then(({ auth }) => {
      UI.refreshAll(); // сверка с таблицей фоном
      if (auth === "forbidden" && !sessionStorage.getItem("tt_token_dismissed")) {
        UI.openTokenModal(Store.hasToken()); // был код и он неверный -> показать ошибку
      } else if (auth === "unconfigured") {
        UI.toast("На сервере не задан APP_TOKEN");
      }
    });

    // Код доступа к таблице
    $("tokenForm").onsubmit = (e) => {
      e.preventDefault();
      const v = $("tokenInput").value.trim();
      if (!v) return;
      Store.setToken(v);
      sessionStorage.removeItem("tt_token_dismissed");
      closeModal("modalToken");
      if (syncEl) { syncEl.textContent = "● синхронизация…"; syncEl.className = "sync"; }
      Store.init().then(({ auth }) => {
        UI.refreshAll();
        if (auth === "forbidden") UI.openTokenModal(true);
        else if (auth === "ok") UI.toast("Синхронизация включена ✓");
      });
    };
    $("tokenSkip").onclick = () => {
      sessionStorage.setItem("tt_token_dismissed", "1");
      closeModal("modalToken");
    };

    // навигация
    document.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => goto(b.dataset.goto)));
    $("btnAddMain").onclick = () => openTxModal("income");
    $("navAdd").onclick = () => openTxModal("income");
    $("btnTrip").onclick = () => {
      Store.addTrip(1);
      UI.refreshAll();
      UI.toast("Поездка записана: −120 ₸");
    };
    document.querySelectorAll(".type-btn").forEach((b) => (b.onclick = () => setTxType(b.dataset.ttype)));
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => closeModal(b.dataset.close)));
    document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));

    // форма транзакции
    $("txForm").onsubmit = (e) => {
      e.preventDefault();
      const data = { date: $("txDate").value || Fin.todayISO(), type: txType,
        amount: Number($("txAmount").value), category: $("txCategory").value.trim(), description: $("txDesc").value.trim() };
      if (!(data.amount > 0)) return UI.toast("Введите сумму больше 0");
      if (editingTxId) { Store.updateTx(editingTxId, data); UI.toast("Запись обновлена ✓"); }
      else { Store.addTx(data); UI.toast("Записано ✓"); }
      closeModal("modalTx"); UI.refreshAll();
    };
    $("txDelete").onclick = () => {
      if (!editingTxId) return;
      if (confirm("Удалить эту запись?")) { Store.deleteTx(editingTxId); closeModal("modalTx"); UI.refreshAll(); UI.toast("Удалено"); }
    };

    // редактирование из списков (делегирование)
    document.body.addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit]");
      if (ed) {
        const t = Store.get().transactions.find((x) => x.id === ed.dataset.edit);
        if (t) openTxModal(t.type, t);
        return;
      }
      const ge = e.target.closest("[data-goal-edit]");
      if (ge) { openGoalModal(Store.get().goals.find((x) => x.id === ge.dataset.goalEdit)); return; }
      const ga = e.target.closest("[data-goal-add]");
      if (ga) {
        const g = Store.get().goals.find((x) => x.id === ga.dataset.goalAdd);
        const v = prompt(`Внести на цель «${g.name}» (сейчас ${g.currentAmount} ₸):`, "5000");
        if (v !== null && Number(v) > 0) {
          Store.upsertGoal({ ...g, currentAmount: Number(g.currentAmount) + Number(v) });
          UI.refreshAll(); UI.toast("Цель пополнена ✓");
        }
        return;
      }
      const de = e.target.closest("[data-dep-edit]");
      if (de) { openDepModal(Store.get().deposits.find((x) => x.id === de.dataset.depEdit)); return; }
      const dt = e.target.closest("[data-dep-topup]");
      if (dt) {
        const v = prompt("Сумма пополнения (₸):", "10000");
        if (v !== null && Number(v) > 0) {
          Store.topupDeposit(dt.dataset.depTopup, Number(v));
          UI.refreshAll(); UI.toast("Депозит пополнен ✓ (операция «Накопление» создана)");
        }
      }
    });

    // фильтры истории
    $("periodChips").querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
      $("periodChips").querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      UI.filters.period = c.dataset.period;
      $("customPeriod").classList.toggle("hidden", UI.filters.period !== "custom");
      UI.renderHistory();
    }));
    $("typeChips").querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
      $("typeChips").querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      UI.filters.type = c.dataset.type;
      UI.renderHistory();
    }));
    $("filterCategory").onchange = (e) => { UI.filters.category = e.target.value; UI.renderHistory(); };
    $("filterFrom").onchange = (e) => { UI.filters.from = e.target.value; UI.renderHistory(); };
    $("filterTo").onchange = (e) => { UI.filters.to = e.target.value; UI.renderHistory(); };

    // аналитика
    $("analyticsPeriod").querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
      $("analyticsPeriod").querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      UI.setAnalyticsMode(c.dataset.aperiod); UI.renderAnalytics();
    }));

    // табы цели/депозит
    document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      $("tab-goals").classList.toggle("hidden", t.dataset.tab !== "goals");
      $("tab-deposits").classList.toggle("hidden", t.dataset.tab !== "deposits");
    }));

    // цели
    $("btnAddGoal").onclick = () => openGoalModal(null);
    $("goalForm").onsubmit = (e) => {
      e.preventDefault();
      Store.upsertGoal({ id: $("goalId").value || undefined, name: $("goalName").value.trim(),
        targetAmount: Number($("goalTarget").value), currentAmount: Number($("goalCurrent").value) || 0,
        deadline: $("goalDeadline").value });
      closeModal("modalGoal"); UI.refreshAll(); UI.toast("Цель сохранена ✓");
    };
    $("goalDelete").onclick = () => {
      if ($("goalId").value && confirm("Удалить цель?")) {
        Store.deleteGoal($("goalId").value); closeModal("modalGoal"); UI.refreshAll();
      }
    };

    // депозиты
    $("btnAddDeposit").onclick = () => openDepModal(null);
    $("depForm").onsubmit = (e) => {
      e.preventDefault();
      Store.upsertDeposit({ id: $("depId").value || undefined, name: $("depName").value.trim(),
        balance: Number($("depBalance").value), interestRate: Number($("depRate").value),
        startDate: $("depStart").value || Fin.todayISO(), term: Number($("depTerm").value) || 12 });
      closeModal("modalDeposit"); UI.refreshAll(); UI.toast("Депозит сохранён ✓");
    };
    $("depDelete").onclick = () => {
      if ($("depId").value && confirm("Удалить депозит? (операции сохранятся)")) {
        Store.deleteDeposit($("depId").value); closeModal("modalDeposit"); UI.refreshAll();
      }
    };
    $("depTopup").onclick = () => {
      const v = prompt("Сумма пополнения (₸):", "10000");
      if (v !== null && Number(v) > 0) {
        Store.topupDeposit($("depId").value, Number(v));
        closeModal("modalDeposit"); UI.refreshAll(); UI.toast("Пополнено ✓");
      }
    };
  }

  function openGoalModal(g) {
    $("goalModalTitle").textContent = g ? "Редактировать цель" : "Новая цель";
    $("goalId").value = g?.id || "";
    $("goalName").value = g?.name || "";
    $("goalTarget").value = g?.targetAmount || "";
    $("goalCurrent").value = g?.currentAmount || 0;
    $("goalDeadline").value = g?.deadline || "";
    $("goalDelete").classList.toggle("hidden", !g);
    openModal("modalGoal");
  }
  function openDepModal(d) {
    $("depModalTitle").textContent = d ? "Редактировать депозит" : "Новый депозит";
    $("depId").value = d?.id || "";
    $("depName").value = d?.name || "";
    $("depBalance").value = d?.balance ?? "";
    $("depRate").value = d?.interestRate ?? "";
    $("depStart").value = d?.startDate || Fin.todayISO();
    $("depTerm").value = d?.term || 12;
    $("depDelete").classList.toggle("hidden", !d);
    $("depTopup").classList.toggle("hidden", !d);
    openModal("modalDeposit");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
