// ===== Конфигурация =====
// Вставьте сюда URL веб-приложения Google Apps Script после настройки (SETUP_GOOGLE_SHEETS.md).
// Пока пусто — приложение работает в локальном режиме (LocalStorage), все кнопки функциональны.
const CONFIG = {
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw6bug8jWYlt76D603aGB6a3r5djcU0HhDX8qbaOtB062K-OnvNdc40sGF8xGbhC6Ss/exec",
  TRANSPORT_FARE: 120,
  CURRENCY: "₸",
  EXPENSE_CATEGORIES: ["Транспорт", "Еда", "Учеба", "Покупки", "Развлечения", "Подписки", "Другое"],
  INCOME_SOURCES: ["Работа", "Подработка", "Перевод", "Другое"],
  SAVING_PLACES: ["Депозит", "Наличные", "Карта", "Другое"],
  MILLION_GOAL: 1000000,
};
