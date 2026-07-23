const STORAGE_KEY = "offwork-countdown.v1.settings";
const FISH_STORAGE_KEY = "offwork-countdown.v1.fishRecords";
const APP_VERSION = "2026.07.24-7";

const DEFAULT_SETTINGS = {
  wakeUpTime: "07:30",
  leaveTime: "08:50",
  morningStartTime: "09:30",
  noonTime: "12:00",
  afternoonStartTime: "14:00",
  eveningTime: "18:00",
  fishAllowance: 30,
  activeDays: [1, 2, 3, 4, 5],
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
  versionLabel: document.querySelector("#version-label"),
  stageLabel: document.querySelector("#stage-label"),
  countdown: document.querySelector("#countdown"),
  targetLine: document.querySelector("#target-line"),
  progressBar: document.querySelector("#progress-bar"),
  wakeUpPanel: document.querySelector("#wake-up-panel"),
  wakeUpCountdown: document.querySelector("#wake-up-countdown"),
  wakeUpStatus: document.querySelector("#wake-up-status"),
  wakeUpTimeLabel: document.querySelector("#wake-up-time-label"),
  leavePanel: document.querySelector("#leave-panel"),
  leaveCountdown: document.querySelector("#leave-countdown"),
  leaveStatus: document.querySelector("#leave-status"),
  leaveTimeLabel: document.querySelector("#leave-time-label"),
  fishElapsed: document.querySelector("#fish-elapsed"),
  fishStatus: document.querySelector("#fish-status"),
  fishToggle: document.querySelector("#fish-toggle"),
  fishReset: document.querySelector("#fish-reset"),
  wakeLabel: document.querySelector("#wake-label"),
  wakeStatus: document.querySelector("#wake-status"),
  wakeToggle: document.querySelector("#wake-toggle"),
  morningStartCard: document.querySelector("#morning-start-card"),
  noonCard: document.querySelector("#noon-card"),
  afternoonStartCard: document.querySelector("#afternoon-start-card"),
  eveningCard: document.querySelector("#evening-card"),
  morningStartTimeLabel: document.querySelector("#morning-start-time-label"),
  noonTimeLabel: document.querySelector("#noon-time-label"),
  afternoonStartTimeLabel: document.querySelector("#afternoon-start-time-label"),
  eveningTimeLabel: document.querySelector("#evening-time-label"),
  morningStartStatus: document.querySelector("#morning-start-status"),
  noonStatus: document.querySelector("#noon-status"),
  afternoonStartStatus: document.querySelector("#afternoon-start-status"),
  eveningStatus: document.querySelector("#evening-status"),
  activeDaysLabel: document.querySelector("#active-days-label"),
  nextTargetLabel: document.querySelector("#next-target-label"),
  dialog: document.querySelector("#settings-dialog"),
  openSettings: document.querySelector("#open-settings"),
  closeSettings: document.querySelector("#close-settings"),
  form: document.querySelector("#settings-form"),
  wakeUpInput: document.querySelector("#wake-up-time"),
  leaveInput: document.querySelector("#leave-time"),
  morningStartInput: document.querySelector("#morning-start-time"),
  noonInput: document.querySelector("#noon-time"),
  afternoonStartInput: document.querySelector("#afternoon-start-time"),
  eveningInput: document.querySelector("#evening-time"),
  fishAllowanceInput: document.querySelector("#fish-allowance"),
  dayOptions: document.querySelector("#day-options"),
  resetSettings: document.querySelector("#reset-settings"),
  formError: document.querySelector("#form-error"),
};

let settings = loadSettings();
let fishRecords = loadFishRecords();
let timerId;
let wakeLock = null;
let wakeLockWanted = false;
let wakeLockMessage = "";

init();

function init() {
  els.versionLabel.textContent = `版本 ${APP_VERSION}`;
  renderDayOptions();
  hydrateSettingsForm();
  bindEvents();
  initWakeLockUi();
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

  els.wakeToggle.addEventListener("click", () => {
    toggleWakeLock();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wakeLockWanted && !wakeLock) {
      requestWakeLock();
    }
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
    const hasWorkStartTimes = isTime(parsed.morningStartTime) && isTime(parsed.afternoonStartTime);
    return {
      wakeUpTime: isTime(parsed.wakeUpTime) ? parsed.wakeUpTime : DEFAULT_SETTINGS.wakeUpTime,
      leaveTime: isTime(parsed.leaveTime) ? parsed.leaveTime : DEFAULT_SETTINGS.leaveTime,
      morningStartTime: hasWorkStartTimes ? parsed.morningStartTime : DEFAULT_SETTINGS.morningStartTime,
      noonTime: isTime(parsed.noonTime) ? parsed.noonTime : DEFAULT_SETTINGS.noonTime,
      afternoonStartTime: hasWorkStartTimes ? parsed.afternoonStartTime : DEFAULT_SETTINGS.afternoonStartTime,
      eveningTime: isTime(parsed.eveningTime) ? parsed.eveningTime : DEFAULT_SETTINGS.eveningTime,
      fishAllowance: normalizeFishAllowance(parsed.fishAllowance),
      activeDays: hasWorkStartTimes ? normalizeActiveDays(parsed.activeDays) : [...DEFAULT_SETTINGS.activeDays],
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
  els.wakeUpInput.value = settings.wakeUpTime;
  els.leaveInput.value = settings.leaveTime;
  els.morningStartInput.value = settings.morningStartTime;
  els.noonInput.value = settings.noonTime;
  els.afternoonStartInput.value = settings.afternoonStartTime;
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
    wakeUpTime: els.wakeUpInput.value,
    leaveTime: els.leaveInput.value,
    morningStartTime: els.morningStartInput.value,
    noonTime: els.noonInput.value,
    afternoonStartTime: els.afternoonStartInput.value,
    eveningTime: els.eveningInput.value,
    fishAllowance: normalizeFishAllowance(els.fishAllowanceInput.value),
    activeDays: normalizeActiveDays(checkedDays),
  };
}

function validateSettings(candidate) {
  if (!isTime(candidate.wakeUpTime) || !isTime(candidate.leaveTime)
    || !isTime(candidate.morningStartTime) || !isTime(candidate.noonTime)
    || !isTime(candidate.afternoonStartTime) || !isTime(candidate.eveningTime)) {
    return "请填写完整的起床、出门、上班和下班时间。";
  }
  if (timeToMinutes(candidate.wakeUpTime) >= timeToMinutes(candidate.leaveTime)) {
    return "起床时间应早于上班出门时间。";
  }
  if (timeToMinutes(candidate.leaveTime) >= timeToMinutes(candidate.morningStartTime)) {
    return "上班出门时间应早于上午上班时间。";
  }
  if (timeToMinutes(candidate.morningStartTime) >= timeToMinutes(candidate.noonTime)
    || timeToMinutes(candidate.noonTime) >= timeToMinutes(candidate.afternoonStartTime)
    || timeToMinutes(candidate.afternoonStartTime) >= timeToMinutes(candidate.eveningTime)) {
    return "时间顺序应为：上午上班 < 中午下班 < 下午上班 < 下午下班。";
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
  const morningStart = dateAtTime(now, currentSettings.morningStartTime);
  const noon = dateAtTime(now, currentSettings.noonTime);
  const afternoonStart = dateAtTime(now, currentSettings.afternoonStartTime);
  const evening = dateAtTime(now, currentSettings.eveningTime);
  const todayIsActive = currentSettings.activeDays.includes(now.getDay());

  if (todayIsActive && now < morningStart) {
    return {
      mode: "counting",
      phase: "morning-start",
      label: "距离上午上班",
      target: morningStart,
      periodStart: startOfDay(now),
      periodEnd: morningStart,
    };
  }

  if (todayIsActive && now < noon) {
    return {
      mode: "counting",
      phase: "noon",
      label: "距离中午下班",
      target: noon,
      periodStart: morningStart,
      periodEnd: noon,
    };
  }

  if (todayIsActive && now < afternoonStart) {
    return {
      mode: "counting",
      phase: "afternoon-start",
      label: "距离下午上班",
      target: afternoonStart,
      periodStart: noon,
      periodEnd: afternoonStart,
    };
  }

  if (todayIsActive && now < evening) {
    return {
      mode: "counting",
      phase: "evening",
      label: "距离下午下班",
      target: evening,
      periodStart: afternoonStart,
      periodEnd: evening,
    };
  }

  const nextMorningStart = findNextActiveDateAtTime(now, currentSettings.morningStartTime, currentSettings.activeDays);
  return {
    mode: todayIsActive ? "done" : "rest",
    phase: "next",
    label: todayIsActive ? "今天已下班" : "今天不计时",
    target: nextMorningStart,
    periodStart: now,
    periodEnd: nextMorningStart,
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
  els.wakeUpTimeLabel.textContent = settings.wakeUpTime;
  els.leaveTimeLabel.textContent = settings.leaveTime;
  els.morningStartTimeLabel.textContent = settings.morningStartTime;
  els.noonTimeLabel.textContent = settings.noonTime;
  els.afternoonStartTimeLabel.textContent = settings.afternoonStartTime;
  els.eveningTimeLabel.textContent = settings.eveningTime;
  els.activeDaysLabel.textContent = formatActiveDays(settings.activeDays);
  els.nextTargetLabel.textContent = getPhaseLabel(state.phase);

  renderWakeUpPanel(now);
  renderLeavePanel(now);
  renderFishPanel(now);
  renderPhaseCards(now, state);
  renderProgress(now, state);
}

function renderWakeUpPanel(now) {
  const activeToday = settings.activeDays.includes(now.getDay());
  const wakeUpToday = dateAtTime(now, settings.wakeUpTime);
  const leaveToday = dateAtTime(now, settings.leaveTime);
  const beforeWakeUp = activeToday && now < wakeUpToday;
  const overdue = activeToday && now >= wakeUpToday && now < leaveToday;
  const nextWakeUp = beforeWakeUp || overdue
    ? wakeUpToday
    : findCurrentOrNextActiveDateAtTime(now, settings.wakeUpTime, settings.activeDays);

  els.wakeUpPanel.classList.toggle("is-soon", beforeWakeUp && nextWakeUp - now <= 10 * 60000);
  els.wakeUpPanel.classList.toggle("is-late", overdue);

  if (beforeWakeUp) {
    els.wakeUpCountdown.textContent = formatDuration(nextWakeUp - now);
    els.wakeUpStatus.textContent = `${formatRoutineTargetLine(nextWakeUp, now)} 起床，准备 ${settings.leaveTime} 出门。`;
    return;
  }

  if (overdue) {
    els.wakeUpCountdown.textContent = `+${formatDuration(now - nextWakeUp)}`;
    els.wakeUpStatus.textContent = `已经超过 ${formatCompactSeconds(Math.floor((now - nextWakeUp) / 1000))}，起床准备出门。`;
    return;
  }

  els.wakeUpCountdown.textContent = formatDuration(nextWakeUp - now);
  els.wakeUpStatus.textContent = `下次 ${formatRoutineTargetLine(nextWakeUp, now)} 起床。`;
}

function renderLeavePanel(now) {
  const activeToday = settings.activeDays.includes(now.getDay());
  const leaveToday = dateAtTime(now, settings.leaveTime);
  const morningStart = dateAtTime(now, settings.morningStartTime);
  const beforeLeave = activeToday && now < leaveToday;
  const overdue = activeToday && now >= leaveToday && now < morningStart;
  const nextLeave = beforeLeave || overdue
    ? leaveToday
    : findCurrentOrNextActiveDateAtTime(now, settings.leaveTime, settings.activeDays);

  els.leavePanel.classList.toggle("is-soon", beforeLeave && nextLeave - now <= 10 * 60000);
  els.leavePanel.classList.toggle("is-late", overdue);

  if (beforeLeave) {
    els.leaveCountdown.textContent = formatDuration(nextLeave - now);
    els.leaveStatus.textContent = `${formatRoutineTargetLine(nextLeave, now)} 必须出门，否则容易迟到。`;
    return;
  }

  if (overdue) {
    els.leaveCountdown.textContent = `+${formatDuration(now - nextLeave)}`;
    els.leaveStatus.textContent = `已经超过 ${formatCompactSeconds(Math.floor((now - nextLeave) / 1000))}，现在出门更稳。`;
    return;
  }

  els.leaveCountdown.textContent = formatDuration(nextLeave - now);
  els.leaveStatus.textContent = `下次 ${formatRoutineTargetLine(nextLeave, now)} 出门。`;
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
  const morningStart = dateAtTime(now, settings.morningStartTime);
  const noon = dateAtTime(now, settings.noonTime);
  const afternoonStart = dateAtTime(now, settings.afternoonStartTime);
  const evening = dateAtTime(now, settings.eveningTime);
  const activeToday = settings.activeDays.includes(now.getDay());

  els.morningStartCard.classList.toggle("is-active", state.phase === "morning-start");
  els.noonCard.classList.toggle("is-active", state.phase === "noon");
  els.afternoonStartCard.classList.toggle("is-active", state.phase === "afternoon-start");
  els.eveningCard.classList.toggle("is-active", state.phase === "evening");
  els.morningStartCard.classList.toggle("is-done", activeToday && now >= morningStart);
  els.noonCard.classList.toggle("is-done", activeToday && now >= noon);
  els.afternoonStartCard.classList.toggle("is-done", activeToday && now >= afternoonStart);
  els.eveningCard.classList.toggle("is-done", activeToday && now >= evening);

  if (!activeToday) {
    els.morningStartStatus.textContent = "今天不计时";
    els.noonStatus.textContent = "今天不计时";
    els.afternoonStartStatus.textContent = "今天不计时";
    els.eveningStatus.textContent = "今天不计时";
    return;
  }

  els.morningStartStatus.textContent = now < morningStart
    ? `还剩 ${formatShortDuration(morningStart - now)}`
    : "已上班";

  els.noonStatus.textContent = now < noon
    ? `还剩 ${formatShortDuration(noon - now)}`
    : "已下班";

  els.afternoonStartStatus.textContent = now < afternoonStart
    ? `还剩 ${formatShortDuration(afternoonStart - now)}`
    : "已上班";

  els.eveningStatus.textContent = now < evening
    ? `还剩 ${formatShortDuration(evening - now)}`
    : "已下班";
}

function renderProgress(now, state) {
  const total = state.periodEnd - state.periodStart;
  const passed = now - state.periodStart;
  const ratio = total > 0 ? Math.max(0, Math.min(1, passed / total)) : 1;
  els.progressBar.style.width = `${Math.round(ratio * 100)}%`;
}

function initWakeLockUi() {
  if (!isWakeLockSupported()) {
    wakeLockMessage = window.isSecureContext ? "当前浏览器不支持屏幕常亮。" : "需要 HTTPS 才能使用屏幕常亮。";
    renderWakeLock();
    return;
  }
  wakeLockMessage = "打开后，页面可见时保持常亮。";
  renderWakeLock();
}

async function toggleWakeLock() {
  if (!isWakeLockSupported()) {
    wakeLockMessage = window.isSecureContext ? "当前浏览器不支持屏幕常亮。" : "需要 HTTPS 才能使用屏幕常亮。";
    renderWakeLock();
    return;
  }

  if (wakeLock) {
    wakeLockWanted = false;
    await releaseWakeLock();
    wakeLockMessage = "已关闭。";
    renderWakeLock();
    return;
  }

  wakeLockWanted = true;
  await requestWakeLock();
}

async function requestWakeLock() {
  if (!isWakeLockSupported()) {
    renderWakeLock();
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLockMessage = "已开启，页面可见时保持常亮。";
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
      wakeLockMessage = wakeLockWanted ? "已被系统暂停，回到页面后会尝试恢复。" : "已关闭。";
      renderWakeLock();
    });
  } catch (error) {
    wakeLock = null;
    wakeLockWanted = false;
    wakeLockMessage = getWakeLockErrorMessage(error);
  }
  renderWakeLock();
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  const lock = wakeLock;
  wakeLock = null;
  try {
    await lock.release();
  } catch {
    // The system may have already released it.
  }
}

function renderWakeLock() {
  const supported = isWakeLockSupported();
  els.wakeToggle.disabled = !supported;
  els.wakeToggle.classList.toggle("is-active", Boolean(wakeLock));
  els.wakeToggle.setAttribute("aria-pressed", wakeLock ? "true" : "false");
  els.wakeToggle.textContent = wakeLock ? "关闭" : "开启";
  els.wakeLabel.textContent = supported ? (wakeLock ? "已开启" : "未开启") : "不可用";
  els.wakeStatus.textContent = wakeLockMessage;
}

function isWakeLockSupported() {
  return window.isSecureContext && "wakeLock" in navigator;
}

function getWakeLockErrorMessage(error) {
  const name = error && error.name ? error.name : "";
  if (name === "NotAllowedError") return "系统暂不允许开启，可能是低电量或页面未激活。";
  return "开启失败，请稍后再试。";
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

function findCurrentOrNextActiveDateAtTime(now, timeValue, activeDays) {
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    if (activeDays.includes(candidate.getDay())) {
      const target = dateAtTime(candidate, timeValue);
      if (target > now) {
        return target;
      }
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
  const label = getPhaseLabel(phase);
  return `${dayText} ${formatClock(target)} ${label}`;
}

function formatRoutineTargetLine(target, now = new Date()) {
  const dayText = isSameDate(target, now) ? "今天" : new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(target);
  return `${dayText} ${formatClock(target)}`;
}

function getPhaseLabel(phase) {
  if (phase === "morning-start" || phase === "next") return "上午上班";
  if (phase === "noon") return "中午下班";
  if (phase === "afternoon-start") return "下午上班";
  if (phase === "evening") return "下午下班";
  return "上午上班";
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatActiveDays(activeDays) {
  if (activeDays.length === 5 && activeDays.every((day, index) => day === index + 1)) return "周一至周五";
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
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      await registration.update();
    } catch {
      // The app still works online without a service worker.
    }
  });
}
