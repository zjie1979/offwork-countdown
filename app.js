const STORAGE_KEY = "offwork-countdown.v1.settings";
const FISH_STORAGE_KEY = "offwork-countdown.v1.fishRecords";

const DEFAULT_SETTINGS = {
  noonTime: "12:00",
  eveningTime: "18:00",
  fishAllowance: 30,
  activeDays: [0, 1, 2, 3, 4, 5, 6],
};

const DAY_OPTIONS = [
  ["日", 0],
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
];

const els = {
  todayLabel: document.querySelector("#today-label"),
  stageLabel: document.querySelector("#stage-label"),
  countdown: document.querySelector("#countdown"),
  targetLine: document.querySelector("#target-line"),
  progressBar: document.querySelector("#progress-bar"),
  fishElapsed: document.querySelector("#fish-elapsed"),
  fishStatus: document.querySelector("#fish-status"),
  fishToggle: document.querySelector("#fish-toggle"),
  fishReset: document.querySelector("#fish-reset"),
  noonCard: document.querySelector("#noon-card"),
  eveningCard: document.querySelector("#evening-card"),
  noonTimeLabel: document.querySelector("#noon-time-label"),
  eveningTimeLabel: document.querySelector("#evening-time-label"),
  noonStatus: document.querySelector("#noon-status"),
  eveningStatus: document.querySelector("#evening-status"),
  activeDaysLabel: document.querySelector("#active-days-label"),
  nextTargetLabel: document.querySelector("#next-target-label"),
  dialog: document.querySelector("#settings-dialog"),
  openSettings: document.querySelector("#open-settings"),
  closeSettings: document.querySelector("#close-settings"),
  form: document.querySelector("#settings-form"),
  noonInput: document.querySelector("#noon-time"),
  eveningInput: document.querySelector("#evening-time"),
  fishAllowanceInput: document.querySelector("#fish-allowance"),
  dayOptions: document.querySelector("#day-options"),
  resetSettings: document.querySelector("#reset-settings"),
  formError: document.querySelector("#form-error"),
};

let settings = loadSettings();
let fishRecords = loadFishRecords();
let timerId;

init();

function init() {
  renderDayOptions();
  hydrateSettingsForm();
  bindEvents();
  tick();
  timerId = window.setInterval(tick, 1000);
  registerServiceWorker();
}

function bindEvents() {
  els.openSettings.addEventListener("click", () => {
    hydrateSettingsForm();
    els.dialog.showModal();
  });

  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) {
      els.dialog.close();
    }
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextSettings = readSettingsForm();
    const error = validateSettings(nextSettings);
    if (error) {
      els.formError.textContent = error;
      return;
    }
    settings = nextSettings;
    saveSettings(settings);
    els.formError.textContent = "";
    els.dialog.close();
    tick();
  });

  els.resetSettings.addEventListener("click", () => {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings(settings);
    hydrateSettingsForm();
    tick();
  });

  els.fishToggle.addEventListener("click", () => {
    toggleFishTimer();
  });

  els.fishReset.addEventListener("click", () => {
    resetTodayFishTimer();
  });

  window.addEventListener("beforeunload", () => {
    if (timerId) {
      window.clearInterval(timerId);
    }
  });
}

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      noonTime: isTime(parsed.noonTime) ? parsed.noonTime : DEFAULT_SETTINGS.noonTime,
      eveningTime: isTime(parsed.eveningTime) ? parsed.eveningTime : DEFAULT_SETTINGS.eveningTime,
      fishAllowance: normalizeFishAllowance(parsed.fishAllowance),
      activeDays: normalizeActiveDays(parsed.activeDays),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function loadFishRecords() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FISH_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveFishRecords() {
  window.localStorage.setItem(FISH_STORAGE_KEY, JSON.stringify(fishRecords));
}

function saveSettings(nextSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
}

function renderDayOptions() {
  els.dayOptions.innerHTML = DAY_OPTIONS.map(([label, value]) => {
    return `
      <label class="day-toggle">
        <input type="checkbox" name="activeDays" value="${value}">
        <span>周${label}</span>
      </label>
    `;
  }).join("");
}

function hydrateSettingsForm() {
  els.noonInput.value = settings.noonTime;
  els.eveningInput.value = settings.eveningTime;
  els.fishAllowanceInput.value = String(settings.fishAllowance);
  els.formError.textContent = "";
  const selected = new Set(settings.activeDays.map(Number));
  els.form.querySelectorAll('input[name="activeDays"]').forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
}

function readSettingsForm() {
  const checkedDays = [...els.form.querySelectorAll('input[name="activeDays"]:checked')]
    .map((input) => Number(input.value));
  return {
    noonTime: els.noonInput.value,
    eveningTime: els.eveningInput.value,
    fishAllowance: normalizeFishAllowance(els.fishAllowanceInput.value),
    activeDays: normalizeActiveDays(checkedDays),
  };
}

function validateSettings(candidate) {
  if (!isTime(candidate.noonTime) || !isTime(candidate.eveningTime)) {
    return "请填写完整的下班时间。";
  }
  if (timeToMinutes(candidate.noonTime) >= timeToMinutes(candidate.eveningTime)) {
    return "中午下班时间要早于下午下班时间。";
  }
  if (!Number.isInteger(candidate.fishAllowance) || candidate.fishAllowance < 0 || candidate.fishAllowance > 240) {
    return "每日摸鱼额度请填写 0 到 240 分钟。";
  }
  if (!candidate.activeDays.length) {
    return "至少选择一个计时日期。";
  }
  return "";
}

function tick() {
  const now = new Date();
  const state = getCountdownState(now, settings);
  renderState(now, state);
}

function getCountdownState(now, currentSettings) {
  const noon = dateAtTime(now, currentSettings.noonTime);
  const evening = dateAtTime(now, currentSettings.eveningTime);
  const todayIsActive = currentSettings.activeDays.includes(now.getDay());

  if (todayIsActive && now < noon) {
    return {
      mode: "counting",
      phase: "noon",
      label: "距离中午下班",
      target: noon,
      periodStart: startOfDay(now),
      periodEnd: noon,
    };
  }

  if (todayIsActive && now < evening) {
    return {
      mode: "counting",
      phase: "evening",
      label: "距离下午下班",
      target: evening,
      periodStart: noon,
      periodEnd: evening,
    };
  }

  const nextNoon = findNextActiveDateAtTime(now, currentSettings.noonTime, currentSettings.activeDays);
  return {
    mode: todayIsActive ? "done" : "rest",
    phase: "next",
    label: todayIsActive ? "今天两段下班已完成" : "今天不计时",
    target: nextNoon,
    periodStart: now,
    periodEnd: nextNoon,
  };
}

function renderState(now, state) {
  const todayText = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  els.todayLabel.textContent = todayText;

  els.stageLabel.textContent = state.label;
  els.countdown.textContent = formatDuration(state.target - now);
  els.targetLine.textContent = formatTargetLine(state.target, state.phase);
  els.noonTimeLabel.textContent = settings.noonTime;
  els.eveningTimeLabel.textContent = settings.eveningTime;
  els.activeDaysLabel.textContent = formatActiveDays(settings.activeDays);
  els.nextTargetLabel.textContent = state.phase === "evening" ? "下午" : "中午";

  renderFishPanel(now);
  renderPhaseCards(now, state);
  renderProgress(now, state);
}

function renderFishPanel(now) {
  const allowance = settings.fishAllowance;
  const record = getTodayFishRecord(now);
  const elapsedSeconds = getFishElapsedSeconds(record, now);
  const remainingSeconds = allowance * 60 - elapsedSeconds;
  els.fishElapsed.textContent = formatFishClock(elapsedSeconds);
  els.fishToggle.textContent = record.startedAt ? "暂停" : "开始";
  els.fishToggle.classList.toggle("is-running", Boolean(record.startedAt));

  if (allowance === 0) {
    els.fishStatus.textContent = record.startedAt ? "正计时中，未设置每日额度。" : "未设置额度，也可以单独计时。";
    return;
  }

  if (elapsedSeconds === 0) {
    els.fishStatus.textContent = `今天额度 ${allowance} 分钟，点开始自动计时。`;
    return;
  }

  if (remainingSeconds < 0) {
    els.fishStatus.textContent = `已超过额度 ${formatCompactSeconds(Math.abs(remainingSeconds))}。`;
    return;
  }

  const prefix = record.startedAt ? "正计时中" : "已暂停";
  els.fishStatus.textContent = `${prefix}，剩余 ${formatCompactSeconds(remainingSeconds)}。`;
}

function renderPhaseCards(now, state) {
  const noon = dateAtTime(now, settings.noonTime);
  const evening = dateAtTime(now, settings.eveningTime);
  const activeToday = settings.activeDays.includes(now.getDay());

  els.noonCard.classList.toggle("is-active", state.phase === "noon");
  els.eveningCard.classList.toggle("is-active", state.phase === "evening");
  els.noonCard.classList.toggle("is-done", activeToday && now >= noon);
  els.eveningCard.classList.toggle("is-done", activeToday && now >= evening);

  if (!activeToday) {
    els.noonStatus.textContent = "今天不计时";
    els.eveningStatus.textContent = "今天不计时";
    return;
  }

  els.noonStatus.textContent = now < noon
    ? `还剩 ${formatShortDuration(noon - now)}`
    : "已到点";

  els.eveningStatus.textContent = now < evening
    ? `还剩 ${formatShortDuration(evening - now)}`
    : "已到点";
}

function renderProgress(now, state) {
  const total = state.periodEnd - state.periodStart;
  const passed = now - state.periodStart;
  const ratio = total > 0 ? Math.max(0, Math.min(1, passed / total)) : 1;
  els.progressBar.style.width = `${Math.round(ratio * 100)}%`;
}

function dateAtTime(baseDate, timeValue) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function startOfDay(baseDate) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  return date;
}

function findNextActiveDateAtTime(now, timeValue, activeDays) {
  for (let offset = 1; offset <= 8; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    if (activeDays.includes(candidate.getDay())) {
      return dateAtTime(candidate, timeValue);
    }
  }
  return dateAtTime(now, timeValue);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatShortDuration(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}分钟`;
  if (minutes === 0) return `${hours}小时`;
  return `${hours}小时${minutes}分钟`;
}

function formatTargetLine(target, phase) {
  const dayText = isSameDate(target, new Date()) ? "今天" : new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(target);
  const label = phase === "evening" ? "下午下班" : "中午下班";
  return `${dayText} ${formatClock(target)} ${label}`;
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatActiveDays(activeDays) {
  if (activeDays.length === 7) return "每天";
  const ordered = DAY_OPTIONS.filter(([, value]) => activeDays.includes(value)).map(([label]) => `周${label}`);
  return ordered.join("、");
}

function toggleFishTimer(date = new Date()) {
  const key = todayKey(date);
  const record = getTodayFishRecord(date);
  if (record.startedAt) {
    record.accumulatedSeconds = getFishElapsedSeconds(record, date);
    record.startedAt = null;
  } else {
    record.startedAt = date.getTime();
  }
  fishRecords[key] = record;
  saveFishRecords();
  tick();
}

function resetTodayFishTimer(date = new Date()) {
  fishRecords[todayKey(date)] = {
    accumulatedSeconds: 0,
    startedAt: null,
  };
  saveFishRecords();
  tick();
}

function getTodayFishRecord(date) {
  const key = todayKey(date);
  const record = normalizeFishRecord(fishRecords[key]);
  fishRecords[key] = record;
  return record;
}

function getFishElapsedSeconds(record, date) {
  const accumulated = normalizeSeconds(record.accumulatedSeconds);
  if (!record.startedAt) return accumulated;
  const sessionSeconds = Math.max(0, Math.floor((date.getTime() - record.startedAt) / 1000));
  return accumulated + sessionSeconds;
}

function todayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeActiveDays(value) {
  const source = Array.isArray(value) ? value : DEFAULT_SETTINGS.activeDays;
  const clean = [...new Set(source.map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  return clean.length ? clean : [...DEFAULT_SETTINGS.activeDays];
}

function normalizeFishAllowance(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return DEFAULT_SETTINGS.fishAllowance;
  return Math.max(0, Math.min(240, Math.round(numberValue)));
}

function normalizeFishRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      accumulatedSeconds: normalizeSeconds(value.accumulatedSeconds),
      startedAt: normalizeStartedAt(value.startedAt),
    };
  }
  return {
    accumulatedSeconds: normalizeFishRecordValue(value) * 60,
    startedAt: null,
  };
}

function normalizeSeconds(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.round(numberValue));
}

function normalizeFishRecordValue(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.round(numberValue));
}

function normalizeStartedAt(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return numberValue;
}

function formatFishClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatCompactSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}小时${minutes}分`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
  }
  return `${seconds}秒`;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
