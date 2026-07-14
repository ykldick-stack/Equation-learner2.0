/**
 * Persist learner progress — in-memory cache + cookie + localStorage fallback.
 */
(function () {
  "use strict";

  const COOKIE_NAME = "equationLearnerProgress";
  const COOKIE_MAX_AGE_DAYS = 365;

  let cachedProgress = null;

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    const maxAge = Math.floor(days * 24 * 60 * 60);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }

  function normalizeProgress(data) {
    if (!data || typeof data !== "object") return null;
    const completedLevels = Array.isArray(data.completedLevels)
      ? [...new Set(data.completedLevels.filter((n) => Number.isInteger(n) && n >= 1 && n <= 8))].sort(
          (a, b) => a - b
        )
      : [];
    const currentLevel =
      Number.isInteger(data.currentLevel) && data.currentLevel >= 1 && data.currentLevel <= 8
        ? data.currentLevel
        : 1;
    return { completedLevels, currentLevel };
  }

  function readStoredProgress() {
    const sources = [];

    try {
      const fromCookie = getCookie(COOKIE_NAME);
      if (fromCookie) sources.push(JSON.parse(fromCookie));
    } catch (err) {
      console.warn("Could not read progress cookie", err);
    }

    try {
      const fromStorage = localStorage.getItem(COOKIE_NAME);
      if (fromStorage) sources.push(JSON.parse(fromStorage));
    } catch (err) {
      console.warn("Could not read progress from localStorage", err);
    }

    if (!sources.length) return null;

    const merged = { completedLevels: [], currentLevel: 1 };
    sources.forEach((raw) => {
      const parsed = normalizeProgress(raw);
      if (!parsed) return;
      merged.completedLevels = [...new Set([...merged.completedLevels, ...parsed.completedLevels])].sort(
        (a, b) => a - b
      );
      merged.currentLevel = parsed.currentLevel;
    });
    return normalizeProgress(merged);
  }

  function loadProgress() {
    if (cachedProgress) {
      return {
        completedLevels: [...cachedProgress.completedLevels],
        currentLevel: cachedProgress.currentLevel,
      };
    }

    cachedProgress = readStoredProgress() || { completedLevels: [], currentLevel: 1 };
    return {
      completedLevels: [...cachedProgress.completedLevels],
      currentLevel: cachedProgress.currentLevel,
    };
  }

  function saveProgress(progress) {
    const normalized = normalizeProgress(progress);
    if (!normalized) return false;

    cachedProgress = normalized;
    const json = JSON.stringify(normalized);

    try {
      setCookie(COOKIE_NAME, json, COOKIE_MAX_AGE_DAYS);
    } catch (err) {
      console.warn("Could not save progress cookie", err);
    }

    try {
      localStorage.setItem(COOKIE_NAME, json);
    } catch (err) {
      console.warn("Could not save progress to localStorage", err);
    }

    return true;
  }

  window.EquationProgress = {
    COOKIE_NAME,
    load: loadProgress,
    save: saveProgress,
  };
})();
