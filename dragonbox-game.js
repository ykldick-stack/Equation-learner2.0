(function () {
  "use strict";

  const START_SECONDS = 30;
  const BONUS_SECONDS = 5;
  const PLAYER_NAME_KEY = "dragonboxPlayerName";
  const LEADERBOARD_LIMIT = 20;

  const lockedEl = document.getElementById("db-locked");
  const appEl = document.getElementById("db-app");
  const timerEl = document.getElementById("db-timer");
  const scoreEl = document.getElementById("db-score");
  const solvedEl = document.getElementById("db-solved");
  const puzzleLabelEl = document.getElementById("db-puzzle-label");
  const pointsLabelEl = document.getElementById("db-points-label");
  const dragonEl = document.getElementById("db-dragon");
  const gameoverEl = document.getElementById("db-gameover");
  const finalScoreEl = document.getElementById("db-final-score");
  const finalDetailEl = document.getElementById("db-final-detail");
  const finalRankEl = document.getElementById("db-final-rank");
  const resultsBodyEl = document.getElementById("db-results-body");
  const resultsEmptyEl = document.getElementById("db-results-empty");
  const leaderboardBodyEl = document.getElementById("db-leaderboard-body");
  const leaderboardEmptyEl = document.getElementById("db-leaderboard-empty");
  const playerNameEl = document.getElementById("db-player-name");
  const startEl = document.getElementById("db-start");
  const startBtn = document.getElementById("db-start-btn");
  const startErrorEl = document.getElementById("db-start-error");
  const saveStatusEl = document.getElementById("db-save-status");
  const downloadExcelBtn = document.getElementById("db-download-excel-btn");
  const canvas = document.getElementById("equation-canvas");
  const restartBtn = document.getElementById("db-restart-btn");
  const playAgainBtn = document.getElementById("db-play-again-btn");

  let puzzleQueue = [];
  let queueIndex = 0;
  let timeLeft = START_SECONDS;
  let score = 0;
  let solvedCount = 0;
  let timerId = null;
  let gameActive = false;
  let solvingLock = false;
  let currentPuzzle = null;
  let solveLog = [];
  let lastSessionId = null;

  function hasBeatenLevel8() {
    if (!window.EquationProgress) return false;
    const data = window.EquationProgress.load();
    return Array.isArray(data.completedLevels) && data.completedLevels.includes(8);
  }

  function buildPuzzleQueue() {
    const levels = window.LEVELS || [];
    const queue = [];
    levels.forEach((level) => {
      level.questions.forEach((question, questionIndex) => {
        queue.push({
          levelId: level.id,
          questionIndex,
          label: question.label,
          points: AppStore.scoreForLevel(level.id),
        });
      });
    });
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  function updateHud() {
    timerEl.textContent = String(Math.max(0, timeLeft));
    scoreEl.textContent = String(score);
    solvedEl.textContent = String(solvedCount);
    timerEl.classList.toggle("is-low", timeLeft <= 10 && timeLeft > 0);
    timerEl.classList.toggle("is-critical", timeLeft <= 5 && timeLeft > 0);
  }

  function setCompactEquation(levelId) {
    if (!canvas) return;
    canvas.classList.toggle("equation-canvas--compact", levelId === 8);
    canvas.dataset.equationLevel = String(levelId);
  }

  function loadCurrentPuzzle() {
    if (queueIndex >= puzzleQueue.length) {
      puzzleQueue = buildPuzzleQueue();
      queueIndex = 0;
    }

    currentPuzzle = puzzleQueue[queueIndex];
    solvingLock = false;

    const ok = AppStore.loadGameQuestion(currentPuzzle.levelId, currentPuzzle.questionIndex);
    if (!ok) {
      puzzleLabelEl.textContent = "Could not load puzzle.";
      return;
    }

    setCompactEquation(currentPuzzle.levelId);
    puzzleLabelEl.textContent = `L${currentPuzzle.levelId}: ${currentPuzzle.label}`;
    pointsLabelEl.textContent = `Worth ${currentPuzzle.points} points · +${BONUS_SECONDS}s on solve`;

    window.setTimeout(() => {
      window.EquationEngine?.fit?.();
    }, 80);
  }

  function stopTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    timerId = window.setInterval(() => {
      if (!gameActive) return;
      timeLeft -= 1;
      updateHud();
      if (timeLeft <= 0) {
        endGame();
      }
    }, 1000);
  }

  function getPlayerName() {
    const raw = (playerNameEl?.value || "").trim();
    return raw;
  }

  function rememberPlayerName() {
    try {
      const name = getPlayerName();
      if (name) {
        localStorage.setItem(PLAYER_NAME_KEY, name);
      }
    } catch (err) {
      console.warn("Could not remember player name", err);
    }
  }

  function restorePlayerName() {
    try {
      const saved = localStorage.getItem(PLAYER_NAME_KEY);
      if (saved && playerNameEl) playerNameEl.value = saved;
    } catch (err) {
      console.warn("Could not restore player name", err);
    }
  }

  function showNamePrompt() {
    gameActive = false;
    stopTimer();
    gameoverEl.hidden = true;
    if (startEl) startEl.hidden = false;
    if (startErrorEl) startErrorEl.hidden = true;
    restorePlayerName();
    window.setTimeout(() => playerNameEl?.focus(), 80);
  }

  function hideNamePrompt() {
    if (startEl) startEl.hidden = true;
    if (startErrorEl) startErrorEl.hidden = true;
  }

  function tryStartFromNamePrompt() {
    const name = getPlayerName();
    if (!name) {
      if (startErrorEl) startErrorEl.hidden = false;
      playerNameEl?.focus();
      return;
    }
    rememberPlayerName();
    hideNamePrompt();
    startGame();
  }

  function formatSessionDetails() {
    if (!solveLog.length) return "No puzzles solved";
    return solveLog
      .map((row, index) => `${index + 1}. L${row.levelId} ${row.label} (+${row.points})`)
      .join(" | ");
  }

  function rankLabel(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return String(rank);
  }

  function renderResultsTable() {
    if (!resultsBodyEl || !resultsEmptyEl) return;

    resultsBodyEl.innerHTML = "";
    const hasRows = solveLog.length > 0;
    resultsEmptyEl.hidden = hasRows;

    solveLog.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>L${row.levelId}</td>
        <td>${row.label}</td>
        <td>+${row.points}</td>
      `;
      resultsBodyEl.appendChild(tr);
    });
  }

  function renderLeaderboard(currentSessionId) {
    if (!leaderboardBodyEl || !leaderboardEmptyEl || !window.DragonBoxResults) return;

    const rows = DragonBoxResults.getLeaderboard(LEADERBOARD_LIMIT);
    leaderboardBodyEl.innerHTML = "";
    leaderboardEmptyEl.hidden = rows.length > 0;

    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      if (row.id === currentSessionId) {
        tr.classList.add("is-you");
      }
      tr.innerHTML = `
        <td>${rankLabel(index + 1)}</td>
        <td>${row.player}</td>
        <td>${row.score}</td>
        <td>${row.solvedCount}</td>
        <td>${DragonBoxResults.formatDate(row.timestamp)}</td>
      `;
      leaderboardBodyEl.appendChild(tr);
    });
  }

  function setSaveStatus(message, kind) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = message;
    saveStatusEl.classList.remove("is-ok", "is-error");
    if (kind) saveStatusEl.classList.add(kind === "ok" ? "is-ok" : "is-error");
  }

  function saveSessionAndExport() {
    if (!window.DragonBoxResults) {
      setSaveStatus("Results module failed to load. Refresh the page.", "error");
      return null;
    }

    rememberPlayerName();

    const session = DragonBoxResults.addSession({
      player: getPlayerName() || "Anonymous",
      score,
      solvedCount,
      details: formatSessionDetails(),
      timestamp: Date.now(),
    });

    lastSessionId = session.id;
    renderLeaderboard(session.id);

    const rank = DragonBoxResults.getRankForEntry(session.id);
    if (finalRankEl && rank) {
      finalRankEl.hidden = false;
      finalRankEl.textContent = `Your rank: #${rank} on the leaderboard`;
    }

    try {
      DragonBoxResults.downloadCsv();
      setSaveStatus(
        `Score saved! ${DragonBoxResults.EXCEL_FILENAME} downloaded — open it in Excel.`,
        "ok"
      );
    } catch (err) {
      console.warn("Excel download failed", err);
      setSaveStatus("Score saved to leaderboard. Click Download Excel to export.", "ok");
    }

    return session;
  }

  function showGameOver() {
    gameActive = false;
    stopTimer();
    gameoverEl.hidden = false;
    finalScoreEl.textContent = String(score);
    finalDetailEl.textContent = `You solved ${solvedCount} puzzle${solvedCount === 1 ? "" : "s"} in ${START_SECONDS}s mode.`;
    if (finalRankEl) finalRankEl.hidden = true;
    dragonEl.classList.remove("is-free");
    renderResultsTable();
    setSaveStatus("Saving your score…");

    window.setTimeout(() => {
      saveSessionAndExport();
    }, 300);
  }

  function endGame() {
    showGameOver();
  }

  function onPuzzleSolved() {
    if (!gameActive || solvingLock || !currentPuzzle) return;
    if (!AppStore.isEquationSolved()) return;

    solvingLock = true;
    const pts = currentPuzzle.points;
    score += pts;
    solvedCount += 1;
    timeLeft += BONUS_SECONDS;

    solveLog.push({
      levelId: currentPuzzle.levelId,
      label: currentPuzzle.label,
      points: pts,
      solvedAt: Date.now(),
    });

    dragonEl.classList.add("is-free");
    updateHud();

    const toastStack = document.getElementById("toast-stack");
    if (toastStack) {
      const t = document.createElement("div");
      t.className = "toast is-visible";
      t.textContent = `+${pts} pts · +${BONUS_SECONDS} seconds!`;
      toastStack.appendChild(t);
      window.setTimeout(() => t.remove(), 2200);
    }

    window.setTimeout(() => {
      dragonEl.classList.remove("is-free");
      queueIndex += 1;
      if (gameActive && timeLeft > 0) {
        loadCurrentPuzzle();
      }
    }, 700);
  }

  function startGame() {
    gameoverEl.hidden = true;
    puzzleQueue = buildPuzzleQueue();
    queueIndex = 0;
    timeLeft = START_SECONDS;
    score = 0;
    solvedCount = 0;
    solveLog = [];
    lastSessionId = null;
    gameActive = true;
    solvingLock = false;

    updateHud();
    loadCurrentPuzzle();
    startTimer();
    setSaveStatus("");
  }

  function boot() {
    restorePlayerName();

    if (!hasBeatenLevel8()) {
      lockedEl.hidden = false;
      appEl.hidden = true;
      return;
    }

    if (!window.AppStore || !window.LEVELS?.length) {
      lockedEl.hidden = false;
      lockedEl.querySelector("p").textContent = "Game data failed to load. Refresh the page.";
      return;
    }

    lockedEl.hidden = true;
    appEl.hidden = false;

    AppStore.subscribe(() => {
      onPuzzleSolved();
    });

    restartBtn?.addEventListener("click", showNamePrompt);
    playAgainBtn?.addEventListener("click", showNamePrompt);
    startBtn?.addEventListener("click", tryStartFromNamePrompt);
    playerNameEl?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        tryStartFromNamePrompt();
      }
    });
    playerNameEl?.addEventListener("input", () => {
      if (startErrorEl && getPlayerName()) startErrorEl.hidden = true;
    });
    downloadExcelBtn?.addEventListener("click", () => {
      if (window.DragonBoxResults) {
        DragonBoxResults.downloadCsv();
        setSaveStatus(`Downloaded ${DragonBoxResults.EXCEL_FILENAME}.`, "ok");
      }
    });

    showNamePrompt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
