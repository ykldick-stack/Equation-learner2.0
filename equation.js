(function () {
  "use strict";

  const canvas = document.getElementById("equation-canvas");
  const row = document.getElementById("equation-row");
  const trace = document.getElementById("step-trace");
  const modal = document.getElementById("op-modal");
  const modalContext = document.getElementById("op-modal-context");
  const modalChoices = document.getElementById("op-modal-choices");
  const modalCancel = document.getElementById("op-modal-cancel");
  const toastStack = document.getElementById("toast-stack");
  const distSvg = document.getElementById("distribution-svg");
  const levelPicker = document.getElementById("level-picker");
  const levelInfo = document.getElementById("level-info");
  const shuffleBtn = document.getElementById("shuffle-btn");
  const dragonboxBtn = document.getElementById("dragonbox-btn");

  let pendingAction = null;
  let distributionState = null;

  /* ── Render from AppStore ─────────────────────────────────── */
  function renderEquation() {
    const equationState = AppStore.getEquationState();
    clearDistribution();
    row.innerHTML = "";

    const leftSide = document.createElement("div");
    leftSide.className = "equation-side";
    leftSide.dataset.side = "left";
    equationState.left.terms.forEach((term, i) => {
      if (i > 0) leftSide.appendChild(makeOperator(term.sign === -1 ? "−" : "+"));
      leftSide.appendChild(makeTermElement(term, "left", i === 0));
    });

    const equals = document.createElement("span");
    equals.className = "math-term math-term--operator math-term--equals";
    equals.dataset.type = "equals";
    equals.textContent = "=";

    const rightSide = document.createElement("div");
    rightSide.className = "equation-side";
    rightSide.dataset.side = "right";
    equationState.right.terms.forEach((term, i) => {
      if (i > 0) rightSide.appendChild(makeOperator(term.sign === -1 ? "−" : "+"));
      rightSide.appendChild(makeTermElement(term, "right", i === 0));
    });

    row.appendChild(leftSide);
    row.appendChild(equals);
    row.appendChild(rightSide);
    requestAnimationFrame(() => requestAnimationFrame(fitEquationToCanvas));
  }

  function fitEquationToCanvas() {
    if (!canvas || !row) return;

    row.style.transform = "";
    row.style.width = "";

    const meta = window.AppStore?.getMeta?.();
    if (!meta || meta.level !== 8) return;

    row.style.width = "max-content";
    const available = canvas.clientWidth - 12;
    const needed = row.scrollWidth;
    if (needed > available && available > 0) {
      const scale = Math.max(0.55, available / needed);
      row.style.transform = `scale(${scale})`;
      row.style.width = `${needed}px`;
    }
  }

  function makeOperator(op) {
    const el = document.createElement("span");
    el.className = "math-term math-term--operator";
    el.dataset.type = "operator";
    el.textContent = op;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function markMovable(el, term, side) {
    el.classList.add("math-term--movable");
    el.draggable = true;
    el.dataset.termId = term.id;
    el.dataset.side = side;
    el.dataset.kind = term.kind;
    el.title = "Double-click to select, then drag across =";
  }

  function makeTermElement(term, side, isFirst = false) {
    if (term.kind === "fraction") {
      const frac = document.createElement("span");
      frac.className = "math-term math-term--fraction";

      if (isFirst && term.sign === -1) {
        const signEl = document.createElement("span");
        signEl.className = "math-term__leading-sign";
        signEl.textContent = "−";
        frac.appendChild(signEl);
      }

      const numWrap = document.createElement("span");
      numWrap.className = "math-term__numerator";
      term.numTerms.forEach((inner, i) => {
        if (i > 0) {
          const op = document.createElement("span");
          op.className = "math-term__inner-op";
          op.textContent = "+";
          numWrap.appendChild(op);
        }
        if (inner.kind === "group") {
          const gOutside = Number(inner.coeff);
          const unitOutside =
            !Number.isFinite(gOutside) || Math.abs(Math.abs(gOutside) - 1) < 1e-9;

          if (!unitOutside) {
            const gCoeff = document.createElement("span");
            gCoeff.className = "math-term__coeff math-term--coeff-tap";
            gCoeff.dataset.coeff = inner.coeff;
            gCoeff.dataset.groupId = inner.id;
            gCoeff.textContent = String(inner.coeff);
            gCoeff.title = "Double-click ÷ to divide this numerator coefficient from both sides";
            numWrap.appendChild(gCoeff);
            numWrap.appendChild(document.createTextNode("("));
          }

          const innerWrap = document.createElement("span");
          innerWrap.className = "math-term__group-inner";
          const factor =
            unitOutside
              ? (Number.isFinite(gOutside) ? gOutside : 1) * (inner.sign === -1 ? -1 : 1)
              : 1;
          (inner.inner || []).forEach((t, j) => {
            if (j > 0) {
              const plus = document.createElement("span");
              plus.className = "math-term__inner-op";
              plus.textContent = "+";
              innerWrap.appendChild(plus);
            }
            const scaled =
              factor === 1
                ? t
                : t.kind === "variable"
                  ? { ...t, coeff: t.coeff * factor }
                  : t.kind === "constant"
                    ? { ...t, value: t.value * factor }
                    : t;
            innerWrap.appendChild(makeTermElement(scaled, side, j === 0));
          });
          innerWrap.querySelectorAll(".math-term--movable").forEach((el) => {
            el.classList.remove("math-term--movable");
            el.removeAttribute("draggable");
          });
          numWrap.appendChild(innerWrap);
          if (!unitOutside) {
            numWrap.appendChild(document.createTextNode(")"));
          }
        } else {
          const innerEl = makeTermElement(inner, side, i === 0);
          innerEl.classList.remove("math-term--movable");
          innerEl.removeAttribute("draggable");
          numWrap.appendChild(innerEl);
        }
      });

      const bar = document.createElement("span");
      bar.className = "math-term__frac-bar";
      bar.setAttribute("aria-hidden", "true");

      const denomEl = document.createElement("span");
      denomEl.className = "math-term__denom math-term--denom-tap";
      denomEl.dataset.denom = term.denom;
      denomEl.dataset.fractionId = term.id;
      denomEl.textContent = String(term.denom);
      denomEl.title = "Double-click to × or ÷ both sides";

      frac.append(numWrap, bar, denomEl);
      markMovable(frac, term, side);
      return frac;
    }

    if (term.kind === "group") {
      const outside = Number(term.coeff);
      const unitOutside =
        !Number.isFinite(outside) || Math.abs(Math.abs(outside) - 1) < 1e-9;

      // 1(x + 3) or −1(x + 3) → show inner terms without brackets
      if (unitOutside) {
        const factor = (Number.isFinite(outside) ? outside : 1) * (term.sign === -1 ? -1 : 1);
        const wrap = document.createElement("span");
        wrap.className = "math-term math-term--group-unwrapped";
        wrap.dataset.termId = term.id;
        wrap.dataset.side = side;
        (term.inner || []).forEach((inner, i) => {
          const scaled =
            factor === 1
              ? inner
              : inner.kind === "variable"
                ? { ...inner, coeff: inner.coeff * factor }
                : inner.kind === "constant"
                  ? { ...inner, value: inner.value * factor }
                  : inner;
          if (i > 0) {
            const plus = document.createElement("span");
            plus.className = "math-term math-term--operator";
            const needsMinus =
              (scaled.kind === "variable" && scaled.coeff < 0) ||
              (scaled.kind === "constant" && scaled.value < 0);
            plus.textContent = needsMinus ? "−" : "+";
            wrap.appendChild(plus);
            if (scaled.kind === "variable" && scaled.coeff < 0) {
              scaled.coeff = Math.abs(scaled.coeff);
            } else if (scaled.kind === "constant" && scaled.value < 0) {
              scaled.value = Math.abs(scaled.value);
            }
          }
          const innerEl = makeTermElement(scaled, side);
          wrap.appendChild(innerEl);
        });
        return wrap;
      }

      const group = document.createElement("span");
      group.className = "math-term math-term--group";

      const coeff = document.createElement("span");
      coeff.className = "math-term__coeff math-term--coeff-tap";
      coeff.dataset.coeff = term.coeff;
      coeff.dataset.groupId = term.id;
      coeff.textContent = String(term.coeff);
      coeff.title = "Click to distribute · Double-click to × or ÷ both sides";

      const open = document.createElement("span");
      open.className = "math-term__paren";
      open.textContent = "(";

      const innerWrap = document.createElement("span");
      innerWrap.className = "math-term__group-inner";
      term.inner.forEach((inner, i) => {
        if (i > 0) {
          const plus = document.createElement("span");
          plus.className = "math-term__inner-op";
          plus.textContent = "+";
          innerWrap.appendChild(plus);
        }
        const innerEl = makeTermElement(inner, side);
        innerEl.classList.remove("math-term--movable");
        innerEl.removeAttribute("draggable");
        innerWrap.appendChild(innerEl);
      });

      const close = document.createElement("span");
      close.className = "math-term__paren";
      close.textContent = ")";

      group.append(coeff, open, innerWrap, close);
      markMovable(group, term, side);
      return group;
    }

    const el = document.createElement("span");
    el.className = "math-term";

    if (term.kind === "variable") {
      el.classList.add("math-term--variable");
      el.dataset.coeff = term.coeff;
      el.dataset.variable = term.variable;

      const coeffEl = document.createElement("span");
      coeffEl.className = "math-term__coeff math-term--coeff-tap";
      coeffEl.dataset.coeff = term.coeff;
      coeffEl.dataset.termId = term.id;
      coeffEl.title = "Double-click to × or ÷ both sides";
      coeffEl.textContent = term.coeff === 1 ? "" : String(Math.abs(term.coeff));
      if (term.coeff < 0) {
        coeffEl.textContent = "−" + (Math.abs(term.coeff) === 1 ? "" : Math.abs(term.coeff));
      }

      const varEl = document.createElement("span");
      varEl.className = "math-term__var";
      varEl.textContent = term.variable;

      el.append(coeffEl, varEl);
    } else {
      el.classList.add("math-term--constant");
      el.dataset.value = term.value;
      el.textContent = String(term.value);
    }

    markMovable(el, term, side);
    return el;
  }

  function renderTrace() {
    trace.innerHTML = "";
    AppStore.getHistoryTrace().forEach((step) => {
      const li = document.createElement("li");
      li.className = "notebook-line";
      if (step.action?.type === "uneven_constant") li.classList.add("notebook-line--error");
      if (step.action?.type === "level_complete") li.classList.add("notebook-line--success");
      li.innerHTML = `<span class="step-equation">${step.equation}</span><span class="step-explanation">${step.note}</span>`;
      trace.appendChild(li);
    });
    trace.scrollTop = trace.scrollHeight;
  }

  function onStateChange() {
    updateLevelUI();
    if (!window.AppStore || !AppStore.isReady()) return;
    renderEquation();
    renderTrace();
  }

  function updateDragonboxButton() {
    if (!dragonboxBtn || !window.AppStore) return;
    const unlocked = AppStore.isLevelCompleted(8);
    dragonboxBtn.hidden = !unlocked;
  }

  function updateLevelUI() {
    if (!levelInfo || !levelPicker) return;
    updateDragonboxButton();
    if (!window.AppStore || !AppStore.isReady()) {
      levelInfo.textContent = "Tap a level to start (L1–L8)";
      canvas?.classList.remove("equation-canvas--compact");
      levelPicker.querySelectorAll(".level-btn").forEach((btn) => {
        const levelId = Number(btn.dataset.level);
        const unlocked = AppStore.isLevelUnlocked(levelId);
        btn.classList.toggle("is-locked", !unlocked);
        btn.classList.toggle("is-completed", AppStore.isLevelCompleted(levelId));
        btn.disabled = !unlocked;
      });
      return;
    }
    const meta = AppStore.getMeta();
    levelInfo.textContent = `Level ${meta.level}: ${meta.levelTitle} — ${meta.questionLabel}`;
    if (canvas) {
      canvas.dataset.equationLevel = String(meta.level);
      canvas.classList.toggle("equation-canvas--compact", meta.level === 8);
    }
    levelPicker.querySelectorAll(".level-btn").forEach((btn) => {
      const levelId = Number(btn.dataset.level);
      const unlocked = AppStore.isLevelUnlocked(levelId);
      const completed = AppStore.isLevelCompleted(levelId);
      btn.classList.toggle("is-active", levelId === meta.level);
      btn.classList.toggle("is-locked", !unlocked);
      btn.classList.toggle("is-completed", completed);
      btn.disabled = !unlocked;
      btn.setAttribute("aria-disabled", unlocked ? "false" : "true");
    });

    if (meta.lastCompletedLevel) {
      const finished = meta.lastCompletedLevel;
      if (finished < 8) {
        showToast(`Level ${finished} complete! Level ${finished + 1} unlocked.`);
        AppStore.ackLevelCompletion();
      } else {
        showToast("All 8 levels complete! Opening DragonBox Adventure…");
        AppStore.ackLevelCompletion();
        window.setTimeout(() => {
          window.location.href = "dragonbox.html";
        }, 2200);
      }
      return;
    }
  }

  function buildLevelPicker() {
    if (!levelPicker) return;
    levelPicker.addEventListener("click", (e) => {
      const btn = e.target.closest(".level-btn");
      if (!btn || !window.AppStore) return;

      const levelId = Number(btn.dataset.level);
      if (!AppStore.isLevelUnlocked(levelId)) {
        showToast(`Complete Level ${levelId - 1} first to unlock.`);
        return;
      }

      const ok = AppStore.loadLevel(levelId);
      if (!ok) {
        showToast("Could not load this level.");
        return;
      }
      closeOperationModal(true);
    });
  }

  /* ── Toast ───────────────────────────────────────────────── */
  function showToast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toastStack.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    window.setTimeout(() => {
      el.classList.remove("is-visible");
      window.setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  /* ── Operation modal ─────────────────────────────────────── */
  const ALL_OPS = (valueLabel) => [
    { op: "add", label: `+ ${valueLabel}` },
    { op: "subtract", label: `− ${valueLabel}` },
    { op: "multiply", label: `× ${valueLabel}` },
    { op: "divide", label: `÷ ${valueLabel}` },
  ];

  const SCALE_OPS = (valueLabel) => [
    { op: "multiply", label: `× ${valueLabel}` },
    { op: "divide", label: `÷ ${valueLabel}` },
  ];

  function openOperationModal(context, valueLabel, config) {
    const ops = config.ops === "all" ? ALL_OPS(valueLabel) : config.ops;
    pendingAction = {
      correctOp: config.correctOp,
      onSuccess: config.onSuccess,
      onCancel: config.onCancel,
      valueLabel,
    };

    modalContext.textContent = context;
    modalChoices.innerHTML = "";

    ops.forEach(({ op, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "op-modal__choice";
      btn.dataset.op = op;
      btn.textContent = label;
      btn.addEventListener("click", () => handleModalChoice(op));
      modalChoices.appendChild(btn);
    });

    modal.hidden = false;
    modal.querySelector(".op-modal__choice")?.focus();
  }

  function closeOperationModal(wasCancelled = false) {
    if (wasCancelled && pendingAction?.onCancel) {
      pendingAction.onCancel();
    }
    modal.hidden = true;
    pendingAction = null;
  }

  function handleModalChoice(op) {
    if (!pendingAction) return;

    const buttons = modalChoices.querySelectorAll(".op-modal__choice");
    buttons.forEach((b) => { b.disabled = true; });

    if (op === pendingAction.correctOp) {
      modalChoices.querySelector(`[data-op="${op}"]`)?.classList.add("is-correct");
      window.setTimeout(() => {
        const action = pendingAction;
        modal.hidden = true;
        pendingAction = null;
        action.onSuccess(op);
      }, 350);
    } else {
      modalChoices.querySelector(`[data-op="${op}"]`)?.classList.add("is-wrong");
      showToast("Try the inverse operation on BOTH sides.");
      window.setTimeout(() => {
        buttons.forEach((b) => {
          b.disabled = false;
          b.classList.remove("is-wrong");
        });
      }, 700);
    }
  }

  /* ── Drag & Map / Like Terms (grabbable math) ─────────────── */
  const DRAG_THRESHOLD = 10;

  let dragTerm = null;
  let dragGhost = null;
  let dragPlaceholder = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartSide = null;
  let dragStartRect = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragMoved = false;

  function disarmTerms() {
    row.querySelectorAll(".math-term--movable.is-armed").forEach((el) => {
      el.classList.remove("is-armed");
    });
  }

  function armTerm(term) {
    disarmTerms();
    term.classList.add("is-armed");
  }

  function clearDragHighlights() {
    row.querySelector(".math-term--equals")?.classList.remove("is-active");
    row.querySelectorAll(".equation-side").forEach((sideEl) => {
      sideEl.classList.remove("is-drop-highlight");
    });
    row.querySelectorAll(".math-term--merge-target").forEach((el) => {
      el.classList.remove("math-term--merge-target");
    });
  }

  function startDragVisuals() {
    if (!dragTerm || dragGhost) return;

    dragMoved = true;
    dragStartRect = dragTerm.getBoundingClientRect();

    dragPlaceholder = document.createElement("span");
    dragPlaceholder.className = "math-term__placeholder";
    dragPlaceholder.style.width = `${dragStartRect.width}px`;
    dragPlaceholder.style.height = `${dragStartRect.height}px`;
    dragTerm.parentNode.insertBefore(dragPlaceholder, dragTerm);

    dragTerm.classList.add("is-dragging");

    dragGhost = dragTerm.cloneNode(true);
    dragGhost.classList.add("math-term--ghost", "math-term--lifted");
    dragGhost.style.cssText = [
      "position:fixed",
      "z-index:1001",
      "pointer-events:none",
      `left:${dragStartRect.left}px`,
      `top:${dragStartRect.top}px`,
      `width:${dragStartRect.width}px`,
      `min-height:${dragStartRect.height}px`,
    ].join(";");
    document.body.appendChild(dragGhost);
  }

  function updateDragFeedback(clientX, clientY) {
    if (!dragGhost || !dragStartSide) return;

    const equalsEl = row.querySelector(".math-term--equals");
    const equalsRect = equalsEl.getBoundingClientRect();
    const crossedEquals =
      dragStartSide === "left"
        ? clientX > equalsRect.left + equalsRect.width / 2
        : clientX < equalsRect.left + equalsRect.width / 2;

    equalsEl.classList.toggle("is-active", crossedEquals);

    const destSide = dragStartSide === "left" ? "right" : "left";
    row.querySelectorAll(".equation-side").forEach((sideEl) => {
      sideEl.classList.toggle("is-drop-highlight", sideEl.dataset.side === destSide && crossedEquals);
    });

    dragGhost.classList.toggle("math-term--flip-preview", crossedEquals);

    const dropTarget = document.elementFromPoint(clientX, clientY);
    const targetTerm = dropTarget?.closest(".math-term--movable");
    row.querySelectorAll(".math-term--merge-target").forEach((el) => {
      el.classList.remove("math-term--merge-target");
    });
    if (
      targetTerm &&
      targetTerm !== dragTerm &&
      targetTerm.dataset.side === dragStartSide &&
      !crossedEquals
    ) {
      targetTerm.classList.add("math-term--merge-target");
    }
  }

  function cleanupDragVisuals() {
    clearDragHighlights();
    dragGhost?.remove();
    dragGhost = null;
    dragPlaceholder?.remove();
    dragPlaceholder = null;
    if (dragTerm) {
      dragTerm.classList.remove("is-dragging");
      dragTerm.style.visibility = "";
    }
  }

  function animateGhostToDestination(ghost, destSideEl, onComplete) {
    const destRect = destSideEl.getBoundingClientRect();
    const ghostRect = ghost.getBoundingClientRect();
    const targetX = destRect.right - ghostRect.width * 0.5 - 12;
    const targetY = destRect.top + destRect.height / 2 - ghostRect.height / 2;
    const tx = targetX - ghostRect.left;
    const ty = targetY - ghostRect.top;

    ghost.style.transition = "transform 0.38s cubic-bezier(0.34, 1.25, 0.64, 1), opacity 0.38s";
    ghost.classList.add("math-term--flip-preview");
    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${tx}px, ${ty}px) scale(0.96)`;
      ghost.style.opacity = "0.9";
    });
    window.setTimeout(onComplete, 390);
  }

  function parkGhostAtDestination(fromSide) {
    if (!dragGhost) return;
    const toSide = fromSide === "left" ? "right" : "left";
    const destSideEl = row.querySelector(`.equation-side[data-side="${toSide}"]`);
    if (!destSideEl) return;

    const destRect = destSideEl.getBoundingClientRect();
    const ghostWidth = dragGhost.offsetWidth || dragStartRect?.width || 48;
    const ghostHeight = dragGhost.offsetHeight || dragStartRect?.height || 32;

    dragGhost.style.transition = "left 0.25s ease, top 0.25s ease";
    dragGhost.style.left = `${destRect.left + destRect.width / 2 - ghostWidth / 2}px`;
    dragGhost.style.top = `${destRect.top + destRect.height / 2 - ghostHeight / 2}px`;
    dragGhost.classList.add("math-term--flip-preview");

    row.querySelector(".math-term--equals")?.classList.add("is-active");
    destSideEl.classList.add("is-drop-highlight");
  }

  function correctOpForMove(term) {
    if (term.kind === "constant") return term.value < 0 ? "add" : "subtract";
    if (term.kind === "variable") return term.coeff < 0 ? "add" : "subtract";
    if (term.kind === "group") return term.coeff < 0 ? "add" : "subtract";
    if (term.kind === "fraction") return term.sign === -1 ? "add" : "subtract";
    return "subtract";
  }

  function completeMoveAfterModal(termId, fromSide) {
    const toSide = fromSide === "left" ? "right" : "left";
    const destSideEl = row.querySelector(`.equation-side[data-side="${toSide}"]`);
    const ghost = dragGhost;

    if (!ghost || !destSideEl) {
      cleanupDragVisuals();
      return;
    }

    animateGhostToDestination(ghost, destSideEl, () => {
      ghost.remove();
      dragGhost = null;
      dragPlaceholder?.remove();
      dragPlaceholder = null;
      clearDragHighlights();
      const moved = AppStore.moveTermToOtherSide(termId);
      if (moved) {
        window.setTimeout(() => AppStore.simplifySide(toSide), 50);
      }
      if (dragTerm) {
        dragTerm.classList.remove("is-dragging");
        dragTerm.style.visibility = "";
        dragTerm = null;
      }
      dragStartSide = null;
      disarmTerms();
    });
  }

  function promptMoveTermOperation(termEl, fromSide) {
    const info = AppStore.findTermById(termEl.dataset.termId);
    if (!info || info.group || info.fraction) {
      cleanupDragVisuals();
      bounceTerm(termEl);
      dragTerm = null;
      dragStartSide = null;
      return;
    }

    termEl.style.visibility = "hidden";
    parkGhostAtDestination(fromSide);

    const label = AppStore.termLabel(info.term);
    const termId = info.term.id;

    openOperationModal(
      `What must we do to BOTH sides to move ${label} to the other side?`,
      label,
      {
        ops: "all",
        correctOp: correctOpForMove(info.term),
        onSuccess: () => completeMoveAfterModal(termId, fromSide),
        onCancel: () => {
          cleanupDragVisuals();
          bounceTerm(termEl);
          dragTerm = null;
          dragStartSide = null;
          disarmTerms();
        },
      }
    );
  }

  row.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".math-term--coeff-tap") || e.target.closest(".math-term--denom-tap")) {
      return;
    }

    const term = e.target.closest(".math-term--movable");
    if (!term) return;

    if (!term.classList.contains("is-armed")) {
      showToast("Double-click a term first, then drag it.");
      return;
    }

    dragTerm = term;
    dragStartSide = term.dataset.side;
    dragStartRect = term.getBoundingClientRect();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragMoved = false;
    dragOffsetX = e.clientX - dragStartRect.left;
    dragOffsetY = e.clientY - dragStartRect.top;
    dragTerm.setPointerCapture(e.pointerId);
  });

  row.addEventListener("pointermove", (e) => {
    if (!dragTerm) return;

    if (!dragGhost) {
      const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
      if (dist < DRAG_THRESHOLD) return;
      startDragVisuals();
    }

    dragGhost.style.left = `${e.clientX - dragOffsetX}px`;
    dragGhost.style.top = `${e.clientY - dragOffsetY}px`;

    const tilt = Math.max(-12, Math.min(12, (e.clientX - dragStartX) * 0.05));
    dragGhost.style.setProperty("--drag-tilt", `${tilt}deg`);

    updateDragFeedback(e.clientX, e.clientY);
  });

  function endDrag(e) {
    if (!dragTerm) return;

    if (dragTerm.hasPointerCapture?.(e.pointerId)) {
      dragTerm.releasePointerCapture(e.pointerId);
    }

    if (!dragMoved) {
      dragTerm = null;
      dragStartSide = null;
      return;
    }

    const equalsEl = row.querySelector(".math-term--equals");
    const equalsRect = equalsEl.getBoundingClientRect();
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const targetTerm = dropTarget?.closest(".math-term--movable");

    const crossedEquals =
      dragStartSide === "left"
        ? e.clientX > equalsRect.left + equalsRect.width / 2
        : e.clientX < equalsRect.left + equalsRect.width / 2;

    const termEl = dragTerm;
    const fromSide = dragStartSide;

    if (targetTerm && targetTerm !== termEl && targetTerm.dataset.side === fromSide && !crossedEquals) {
      cleanupDragVisuals();
      const merged = AppStore.mergeLikeTerms(termEl.dataset.termId, targetTerm.dataset.termId);
      disarmTerms();
      if (!merged) {
        bounceTerm(termEl);
        showToast("Can only combine like terms.");
      }
    } else if (crossedEquals) {
      promptMoveTermOperation(termEl, fromSide);
      return;
    } else {
      bounceTerm(termEl);
      cleanupDragVisuals();
    }

    dragTerm = null;
    dragStartSide = null;
    disarmTerms();
  }

  function bounceTerm(el) {
    if (!el.isConnected) return;
    el.classList.add("math-term--bounce");
    window.setTimeout(() => el.classList.remove("math-term--bounce"), 450);
  }

  function openScaleOpModal(context, value, correctOp, onSuccess) {
    const label = String(value);
    openOperationModal(context, label, {
      ops: SCALE_OPS(label),
      correctOp,
      onSuccess: (op) => onSuccess(op),
    });
  }

  let coeffClickTimer = null;
  let skipCoeffSingleClick = false;

  function handleCoefficientDoubleClick(coeffEl) {
    skipCoeffSingleClick = true;
    window.setTimeout(() => {
      skipCoeffSingleClick = false;
    }, 300);

    const magnitude = Math.abs(Number(coeffEl.dataset.coeff));
    if (!magnitude) return;

    openScaleOpModal(
      `Choose × or ÷ to apply to BOTH sides using ${magnitude}.`,
      magnitude,
      "divide",
      (op) => {
        const groupId = coeffEl.dataset.groupId;
        if (groupId) {
          AppStore.applyInverseOperation(op, magnitude, "x", "constant");
          return;
        }

        const info = AppStore.findTermById(coeffEl.dataset.termId);
        if (!info || info.term.kind !== "variable") return;
        AppStore.applyInverseOperation(op, magnitude, info.term.variable, "variable");
      }
    );
  }

  function handleDenominatorDoubleClick(denomEl) {
    const denom = Number(denomEl.dataset.denom);
    if (!denom) return;

    openScaleOpModal(
      `Choose × or ÷ to apply to BOTH sides using ${denom}.`,
      denom,
      "multiply",
      (op) => AppStore.applyInverseOperation(op, denom, "x", "constant")
    );
  }

  row.addEventListener("click", (e) => {
    const coeff = e.target.closest(".math-term--coeff-tap");
    if (!coeff?.dataset.groupId) return;

    window.clearTimeout(coeffClickTimer);
    coeffClickTimer = window.setTimeout(() => {
      if (skipCoeffSingleClick) return;
      startDistribution(coeff.dataset.groupId, Number(coeff.dataset.coeff));
    }, 280);
  });

  row.addEventListener("dblclick", (e) => {
    window.clearTimeout(coeffClickTimer);

    const coeff = e.target.closest(".math-term--coeff-tap");
    if (coeff) {
      e.preventDefault();
      handleCoefficientDoubleClick(coeff);
      return;
    }

    const denom = e.target.closest(".math-term--denom-tap");
    if (denom) {
      e.preventDefault();
      handleDenominatorDoubleClick(denom);
      return;
    }

    const term = e.target.closest(".math-term--movable");
    if (term) {
      e.preventDefault();
      armTerm(term);
      showToast("Term selected — now drag it across = or onto a like term.");
    }
  });

  row.addEventListener("pointerup", endDrag);
  row.addEventListener("pointercancel", endDrag);

  modalCancel.addEventListener("click", () => closeOperationModal(true));
  modal.querySelector(".op-modal__backdrop")?.addEventListener("click", () => closeOperationModal(true));

  /* ── Distribution arcs ───────────────────────────────────── */
  function startDistribution(groupId, coeff) {
    clearDistribution();
    const coeffEl = row.querySelector(`.math-term--coeff-tap[data-group-id="${groupId}"]`);
    const container = row.querySelector(`[data-term-id="${groupId}"]`) || coeffEl?.closest(".math-term--fraction, .math-term--group");
    if (!container) return;

    const anchorEl = coeffEl || container;
    const innerTerms = container.querySelectorAll(".math-term__group-inner .math-term");
    if (!anchorEl || innerTerms.length === 0) return;

    distributionState = { groupId, coeff, confirmed: new Set(), total: innerTerms.length };

    const canvasRect = canvas.getBoundingClientRect();
    distSvg.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);
    distSvg.style.width = `${canvasRect.width}px`;
    distSvg.style.height = `${canvasRect.height}px`;

    innerTerms.forEach((termEl, index) => {
      const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arc.setAttribute("class", "distribution-arc");
      arc.dataset.targetId = termEl.dataset.termId;
      arc.setAttribute("d", buildArcPath(anchorEl, termEl, canvasRect, index));
      arc.addEventListener("click", () => confirmDistributionArc(arc));
      distSvg.appendChild(arc);
    });

    showToast(`Tap each arc to distribute ×${coeff}`);
  }

  function buildArcPath(fromEl, toEl, canvasRect, index) {
    const from = centerOf(fromEl, canvasRect);
    const to = centerOf(toEl, canvasRect);
    const lift = 30 + index * 18;
    const midX = (from.x + to.x) / 2;
    const midY = Math.min(from.y, to.y) - lift;
    return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
  }

  function centerOf(el, canvasRect) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - canvasRect.left,
      y: r.top + r.height / 2 - canvasRect.top,
    };
  }

  function confirmDistributionArc(arc) {
    if (!distributionState || arc.classList.contains("is-confirmed")) return;

    arc.classList.add("is-confirmed");
    distributionState.confirmed.add(arc.dataset.targetId);

    if (distributionState.confirmed.size >= distributionState.total) {
      window.setTimeout(() => {
        AppStore.distributeGroup(distributionState.groupId);
        clearDistribution();
      }, 400);
    }
  }

  function clearDistribution() {
    distSvg.innerHTML = "";
    distributionState = null;
  }

  function bootEquationUI() {
    buildLevelPicker();
    updateLevelUI();

    shuffleBtn?.addEventListener("click", () => {
      if (!window.AppStore?.isReady()) return;
      AppStore.shuffleQuestion();
      closeOperationModal(true);
    });

    window.addEventListener("resize", () => fitEquationToCanvas(), { passive: true });

    if (window.AppStore) {
      AppStore.subscribe(onStateChange);
      if (AppStore.isReady()) {
        onStateChange();
      } else {
        updateLevelUI();
      }
    } else {
      if (levelInfo) levelInfo.textContent = "Scripts failed to load. Refresh the page.";
    }
  }

  window.EquationEngine = {
    render: renderEquation,
    fit: fitEquationToCanvas,
    formatEquation: () => (window.AppStore?.isReady() ? AppStore.formatEquation() : ""),
    getState: () => (window.AppStore?.getState() ?? null),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootEquationUI);
  } else {
    bootEquationUI();
  }
})();
