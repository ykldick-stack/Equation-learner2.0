/**
 * DragonBox leaderboard storage + Excel-compatible CSV export.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "dragonboxLeaderboard";
  const MAX_ENTRIES = 500;
  const EXCEL_FILENAME = "DragonBox-Leaderboard.csv";

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("Could not load leaderboard", err);
      return [];
    }
  }

  function saveAll(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch (err) {
      console.warn("Could not save leaderboard", err);
      return false;
    }
  }

  function sortEntries(entries) {
    return [...entries].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
      return b.timestamp - a.timestamp;
    });
  }

  function formatDate(timestamp) {
    try {
      return new Date(timestamp).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      return String(timestamp);
    }
  }

  function escapeCsvCell(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function buildCsv(entries) {
    const rows = [["Rank", "Player", "Score", "Puzzles Solved", "Date", "Session Details"]];
    sortEntries(entries).forEach((entry, index) => {
      rows.push([
        index + 1,
        entry.player,
        entry.score,
        entry.solvedCount,
        formatDate(entry.timestamp),
        entry.details || "",
      ]);
    });
    return `\ufeff${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  }

  function downloadCsv(entries, filename) {
    const blob = new Blob([buildCsv(entries || loadAll())], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || EXCEL_FILENAME;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function addSession(session) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      player: session.player || "Anonymous",
      score: Number(session.score) || 0,
      solvedCount: Number(session.solvedCount) || 0,
      details: session.details || "",
      timestamp: session.timestamp || Date.now(),
    };

    const entries = loadAll();
    entries.push(entry);
    const trimmed = sortEntries(entries).slice(0, MAX_ENTRIES);
    saveAll(trimmed);
    return entry;
  }

  function getLeaderboard(limit) {
    const cap = Number.isInteger(limit) && limit > 0 ? limit : 20;
    return sortEntries(loadAll()).slice(0, cap);
  }

  function getRankForEntry(entryId) {
    const sorted = sortEntries(loadAll());
    const index = sorted.findIndex((row) => row.id === entryId);
    return index === -1 ? null : index + 1;
  }

  window.DragonBoxResults = {
    EXCEL_FILENAME,
    loadAll,
    addSession,
    getLeaderboard,
    getRankForEntry,
    downloadCsv,
    formatDate,
  };
})();
