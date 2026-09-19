/**
 * Тенге Трекер — backend для Google Sheets.
 * Установка: см. SETUP_GOOGLE_SHEETS.md
 *
 * Листы (создаются автоматически):
 *  Transactions: ID | Date | Type | Amount | Category | Description | CreatedAt
 *  Goals:        ID | Name | TargetAmount | CurrentAmount | Deadline | CreatedAt
 *  Deposits:     ID | Name | Balance | InterestRate | StartDate | Term | CreatedAt
 *
 * ВАЖНО: после вставки/обновления кода сделайте новое развертывание
 * (Развернуть -> Управление развертываниями -> карандаш -> Версия: Новая),
 * иначе URL продолжит отдавать старую версию скрипта.
 */

const SHEETS = {
  Transactions: ["ID", "Date", "Type", "Amount", "Category", "Description", "CreatedAt"],
  Goals: ["ID", "Name", "TargetAmount", "CurrentAmount", "Deadline", "CreatedAt"],
  Deposits: ["ID", "Name", "Balance", "InterestRate", "StartDate", "Term", "CreatedAt"],
};

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Любую дату -> строго YYYY-MM-DD (независимо от локали таблицы)
function fmtDate_(v) {
  if (v === null || v === undefined || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  const d = new Date(s);
  if (!isNaN(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return s;
}

function sheetToObjects(name) {
  const sh = getSheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = row[i]; });
      // Даты -> строго YYYY-MM-DD, числа -> числа (без символа ₸)
      ["Date", "Deadline", "StartDate", "CreatedAt"].forEach((k) => { o[k] = fmtDate_(o[k]); });
      ["Amount", "TargetAmount", "CurrentAmount", "Balance", "InterestRate", "Term"].forEach((k) => {
        if (o[k] !== undefined && o[k] !== "") o[k] = Number(o[k]);
      });
      return o;
    });
}

// GET ?action=list -> {transactions, goals, deposits}
function doGet(e) {
  const out = {
    transactions: sheetToObjects("Transactions"),
    goals: sheetToObjects("Goals"),
    deposits: sheetToObjects("Deposits"),
  };
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST {action:"upsert"|"delete", sheet:"Transactions"|"Goals"|"Deposits", row:{...}}
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {
    return json_({ ok: false, error: "bad json" });
  }
  const { action, sheet, row } = body;
  if (!SHEETS[sheet]) return json_({ ok: false, error: "unknown sheet" });

  const sh = getSheet(sheet);
  const headers = SHEETS[sheet];
  const values = sh.getDataRange().getValues();
  let rowIdx = -1; // 1-based
  if (row && row.ID) {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(row.ID)) { rowIdx = i + 1; break; }
    }
  }
  if (action === "delete") {
    if (rowIdx > 0) sh.deleteRow(rowIdx);
    return json_({ ok: true });
  }
  // upsert
  const arr = headers.map((h) => row[h] ?? "");
  if (rowIdx > 0) {
    sh.getRange(rowIdx, 1, 1, headers.length).setValues([arr]);
  } else {
    sh.appendRow(arr);
  }
  return json_({ ok: true });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
