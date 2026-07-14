(function () {
  "use strict";

  const app = document.querySelector(".app");
  const plateLeft = document.getElementById("plate-left");
  const plateRight = document.getElementById("plate-right");
  const plateSurfaces = document.querySelectorAll(".plate-surface");
  const balanceScale = document.querySelector(".balance-scale");
  const balanceBeam = document.querySelector(".balance-scale__beam");

  const ZERO_PAIR_MS = 650;

  function formatFillAmount(fill) {
    if (Math.abs(fill - 1) < 0.001) return "1";
    if (Math.abs(fill - 0.5) < 0.001) return "½";
    if (Math.abs(fill - 0.25) < 0.001) return "¼";
    if (Math.abs(fill - 0.75) < 0.001) return "¾";
    if (Math.abs(fill - 0.333) < 0.02) return "⅓";
    if (Math.abs(fill - 0.667) < 0.02) return "⅔";
    return String(Math.round(fill * 100) / 100);
  }

  function manipulativeLabel(kind, sign, fill) {
    const amount = formatFillAmount(fill);
    const prefix = sign === "positive" ? "+" : "−";
    if (kind === "variable") {
      if (fill === 1) return sign === "positive" ? "+x" : "−x";
      return `${prefix}${amount}x`;
    }
    if (fill === 1) return sign === "positive" ? "+1 unit" : "−1 unit";
    return `${prefix}${amount} unit`;
  }

  /* ── Zone 1: glass fill-level manipulatives ──────────────── */
  function createManipulative(kind, sign, fill = 1) {
    const el = document.createElement("div");
    el.className = `manipulative manipulative--${kind} manipulative--${sign} manipulative--glass`;
    el.dataset.kind = kind;
    el.dataset.sign = sign;
    el.dataset.fill = String(fill);

    const fillPct = Math.round(fill * 1000) / 10;
    el.style.setProperty("--fill-level", `${fillPct}%`);
    el.style.setProperty("--fill-numer", String(Math.round(fill * 100)));

    if (fill < 0.999) {
      el.classList.add("manipulative--partial");
    }

    const label = manipulativeLabel(kind, sign, fill);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
    el.title = label;

    const glass = document.createElement("div");
    glass.className = "manipulative__glass";

    const fillWrap = document.createElement("div");
    fillWrap.className = "manipulative__fill-wrap";

    const liquid = document.createElement("span");
    liquid.className = kind === "variable" ? "manipulative__shape manipulative__fill" : "manipulative__fill manipulative__fill--cube";
    liquid.setAttribute("aria-hidden", "true");

    const outline = document.createElement("span");
    outline.className = kind === "variable" ? "manipulative__shape manipulative__outline" : "manipulative__outline manipulative__outline--cube";
    outline.setAttribute("aria-hidden", "true");

    fillWrap.appendChild(liquid);
    glass.appendChild(fillWrap);
    glass.appendChild(outline);
    el.appendChild(glass);

    return el;
  }

  function clearPlate(container) {
    container.innerHTML = "";
  }

  function appendFilledTiles(container, kind, sign, tiles) {
    tiles.forEach(({ fill }) => {
      container.appendChild(createManipulative(kind, sign, fill));
    });
  }

  function fillPlate(container, counts) {
    appendFilledTiles(container, "variable", "positive", counts.variables.positive);
    appendFilledTiles(container, "variable", "negative", counts.variables.negative);
    appendFilledTiles(container, "integer", "positive", counts.units.positive);
    appendFilledTiles(container, "integer", "negative", counts.units.negative);
  }

  function scaleStateToTileCounts(sideState) {
    return {
      units: {
        positive: sideState.unitSign === "positive" ? sideState.unitTiles : [],
        negative: sideState.unitSign === "negative" ? sideState.unitTiles : [],
      },
      variables: {
        positive: sideState.variableTiles.positive,
        negative: sideState.variableTiles.negative,
      },
    };
  }

  function syncPlatesFromState(scaleState) {
    clearPlate(plateLeft);
    clearPlate(plateRight);
    fillPlate(plateLeft, scaleStateToTileCounts(scaleState.left));
    fillPlate(plateRight, scaleStateToTileCounts(scaleState.right));
    window.setTimeout(() => {
      resolveZeroPairs(plateLeft);
      resolveZeroPairs(plateRight);
    }, 50);
  }

  function syncScaleTilt(scaleState) {
    if (!balanceBeam || !balanceScale) return;

    const tilt = scaleState.tiltDeg;
    balanceBeam.style.setProperty("--scale-tilt", `${tilt}deg`);
    balanceScale.dataset.balance = scaleState.status;
    balanceScale.dataset.balanced = scaleState.isBalanced ? "true" : "false";

    if (scaleState.error) {
      balanceScale.dataset.error = scaleState.error.type;
      balanceScale.title = scaleState.error.message;
    } else {
      balanceScale.removeAttribute("data-error");
      balanceScale.title = scaleState.isBalanced
        ? "Scale is balanced"
        : `Scale tilt: ${scaleState.delta > 0 ? "right heavier" : "left heavier"}`;
    }
  }

  function onAppStateChange(state) {
    if (!state) return;
    app.dataset.difficulty = AppStore.anchorModeForLevel(state.meta.level);
    syncPlatesFromState(state.scaleState);
    syncScaleTilt(state.scaleState);
  }

  function fillsMatch(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.02;
  }

  /* ── Zero-pair detection & animation ─────────────────────── */
  function resolveZeroPairs(plateContents) {
    const items = [...plateContents.querySelectorAll(".manipulative:not(.is-merging)")];
    const used = new Set();

    for (const pos of items.filter((el) => el.dataset.sign === "positive")) {
      if (used.has(pos)) continue;

      const neg = items.find(
        (el) =>
          el.dataset.sign === "negative" &&
          el.dataset.kind === pos.dataset.kind &&
          fillsMatch(el.dataset.fill, pos.dataset.fill) &&
          !used.has(el) &&
          !el.classList.contains("is-merging")
      );

      if (neg) {
        used.add(pos);
        used.add(neg);
        animateZeroPair(pos, neg);
      }
    }
  }

  function animateZeroPair(positive, negative) {
    const posRect = positive.getBoundingClientRect();
    const negRect = negative.getBoundingClientRect();
    const midX = (posRect.left + posRect.width / 2 + negRect.left + negRect.width / 2) / 2;
    const midY = (posRect.top + posRect.height / 2 + negRect.top + negRect.height / 2) / 2;

    [positive, negative].forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      el.style.setProperty("--snap-x", `${midX - cx}px`);
      el.style.setProperty("--snap-y", `${midY - cy}px`);
      el.classList.add("is-merging");
    });

    window.setTimeout(() => {
      positive.remove();
      negative.remove();
    }, ZERO_PAIR_MS);
  }

  /* ── Manipulative drag between plates ────────────────────── */
  let dragTile = null;
  let tileGhost = null;
  let tileOffsetX = 0;
  let tileOffsetY = 0;
  let originPlate = null;

  function getPlateContentsFromPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest(".plate-contents") ?? null;
  }

  function highlightDropTarget(plateContents) {
    plateSurfaces.forEach((surface) => {
      const contents = surface.querySelector(".plate-contents");
      surface.classList.toggle("is-drop-target", contents === plateContents);
    });
  }

  document.addEventListener("pointerdown", (e) => {
    const tile = e.target.closest(".manipulative");
    if (!tile || tile.classList.contains("is-merging")) return;

    dragTile = tile;
    originPlate = tile.closest(".plate-contents");
    dragTile.classList.add("is-dragging");
    dragTile.setPointerCapture(e.pointerId);

    const rect = tile.getBoundingClientRect();
    tileOffsetX = e.clientX - rect.left;
    tileOffsetY = e.clientY - rect.top;
  });

  document.addEventListener("pointermove", (e) => {
    if (!dragTile) return;

    if (!tileGhost) {
      tileGhost = dragTile.cloneNode(true);
      tileGhost.classList.add("manipulative--ghost");
      tileGhost.style.cssText = "position:fixed;z-index:1000;pointer-events:none;opacity:0.9;";
      tileGhost.style.width = `${dragTile.offsetWidth}px`;
      tileGhost.style.height = `${dragTile.offsetHeight}px`;
      document.body.appendChild(tileGhost);
    }

    tileGhost.style.left = `${e.clientX - tileOffsetX}px`;
    tileGhost.style.top = `${e.clientY - tileOffsetY}px`;
    highlightDropTarget(getPlateContentsFromPoint(e.clientX, e.clientY));
  });

  function endTileDrag(e) {
    if (!dragTile) return;

    dragTile.classList.remove("is-dragging");
    if (dragTile.hasPointerCapture?.(e.pointerId)) {
      dragTile.releasePointerCapture(e.pointerId);
    }

    const dropPlate = getPlateContentsFromPoint(e.clientX, e.clientY);
    highlightDropTarget(null);

    if (dropPlate) {
      dropPlate.appendChild(dragTile);
      resolveZeroPairs(dropPlate);
    } else if (originPlate) {
      originPlate.appendChild(dragTile);
    }

    tileGhost?.remove();
    tileGhost = null;
    dragTile = null;
    originPlate = null;
  }

  document.addEventListener("pointerup", endTileDrag);
  document.addEventListener("pointercancel", endTileDrag);

  /* ── Viewport bucket ─────────────────────────────────────── */
  const BREAKPOINTS = [
    { name: "xs", min: 0 },
    { name: "sm", min: 361 },
    { name: "md", min: 481 },
    { name: "lg", min: 768 },
    { name: "xl", min: 1024 },
    { name: "2xl", min: 1280 },
  ];

  function updateViewportBucket() {
    let bucket = BREAKPOINTS[0].name;
    for (const bp of BREAKPOINTS) {
      if (window.innerWidth >= bp.min) bucket = bp.name;
    }
    app.dataset.viewport = bucket;
    app.dataset.orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  }

  if (window.AppStore) {
    AppStore.subscribe(onAppStateChange);
    const initial = AppStore.getState();
    if (initial) onAppStateChange(initial);
  }

  updateViewportBucket();
  window.addEventListener("resize", updateViewportBucket, { passive: true });

  window.ScaleView = {
    sync: () => onAppStateChange(AppStore.getState()),
    simulateUnevenOp: (side, delta) => AppStore.applyUnevenConstantDelta(side, delta),
  };
})();
