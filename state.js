/**
 * Central application state: equation AST, history trace, and scale balance.
 */
(function () {
  "use strict";

  const MAX_TILT = 14;

  let termIdCounter = 0;
  let listeners = [];
  let appState = null;

  function loadProgress() {
    if (window.EquationProgress) return window.EquationProgress.load();
    return { completedLevels: [], currentLevel: 1 };
  }

  function saveProgress(progress) {
    if (window.EquationProgress) window.EquationProgress.save(progress);
  }

  function isLevelCompleted(levelId) {
    return loadProgress().completedLevels.includes(levelId);
  }

  function isLevelUnlocked(levelId) {
    if (levelId <= 1) return true;
    return isLevelCompleted(levelId - 1);
  }

  function markLevelComplete(levelId) {
    const progress = loadProgress();
    if (progress.completedLevels.includes(levelId)) return false;
    progress.completedLevels.push(levelId);
    progress.completedLevels.sort((a, b) => a - b);
    progress.currentLevel = levelId;
    saveProgress(progress);
    return true;
  }

  function getProgress() {
    return loadProgress();
  }

  function ackLevelCompletion() {
    if (appState?.meta) appState.meta.lastCompletedLevel = null;
  }

  function sideIsIsolatedVariable(terms) {
    if (terms.length !== 1) return false;
    const term = terms[0];
    return (
      term.kind === "variable" &&
      Math.abs(term.coeff) === 1 &&
      term.variable === "x"
    );
  }

  function sideIsSingleConstant(terms) {
    if (terms.length !== 1) return false;
    return terms[0].kind === "constant";
  }

  function sideHasComplexTerms(terms) {
    return terms.some((t) => t.kind === "group" || t.kind === "fraction");
  }

  function isEquationSolved(equationState) {
    const left = normalizeSide(cloneTerms(equationState.left.terms));
    const right = normalizeSide(cloneTerms(equationState.right.terms));

    if (sideHasComplexTerms(left) || sideHasComplexTerms(right)) return false;

    if (sideIsIsolatedVariable(left) && sideIsSingleConstant(right)) return true;
    if (sideIsIsolatedVariable(right) && sideIsSingleConstant(left)) return true;
    return false;
  }

  function getSolutionFromNormalized(left, right) {
    const varTerms = sideIsIsolatedVariable(left) ? left : right;
    const constTerms = sideIsSingleConstant(left) ? left : right;
    return constTerms[0].value / varTerms[0].coeff;
  }

  function checkLevelCompletion() {
    if (!appState?.equationState || !isEquationSolved(appState.equationState)) return;
    if (appState.meta.dragonboxGame) return;

    const levelId = appState.meta.level;
    if (markLevelComplete(levelId)) {
      appState.meta.lastCompletedLevel = levelId;
      const left = normalizeSide(cloneTerms(appState.equationState.left.terms));
      const right = normalizeSide(cloneTerms(appState.equationState.right.terms));
      const solution = getSolutionFromNormalized(left, right);
      appState.historyTrace.push({
        id: `step-${appState.historyTrace.length}`,
        equation: formatEquation(appState.equationState),
        note: `✓ Solved! x = ${solution}. Level ${levelId} complete.`,
        action: { type: "level_complete", level: levelId, solution },
        timestamp: Date.now(),
      });
    }
  }

  function ensureLevels() {
    if (window.LEVELS && window.LEVELS.length) return true;
    return false;
  }

  function bootstrap() {
    if (!ensureLevels()) {
      console.error("Equation Learner: LEVELS data not found. Ensure levels.js loads before state.js.");
      return false;
    }
    try {
      const saved = loadProgress();
      const startLevel =
        saved.currentLevel && isLevelUnlocked(saved.currentLevel) ? saved.currentLevel : 1;
      appState = createInitialState(startLevel);
      return true;
    } catch (err) {
      console.error("Equation Learner: failed to initialize", err);
      return false;
    }
  }

  function pickRandomIndex(count) {
    return Math.floor(Math.random() * count);
  }

  function getLevel(levelId) {
    const levels = window.LEVELS || [];
    return levels.find((l) => l.id === levelId) || levels[0] || null;
  }

  function createInitialState(levelId, questionIndex) {
    termIdCounter = 0;
    const level = getLevel(levelId);
    if (!level || !level.questions || !level.questions.length) {
      throw new Error("No level data available for level " + levelId);
    }
    const qIndex = questionIndex ?? pickRandomIndex(level.questions.length);
    const question = level.questions[qIndex];

    const equationState = {
      type: "equation",
      left: { type: "side", side: "left", terms: normalizeSide(cloneTerms(question.left)) },
      right: { type: "side", side: "right", terms: normalizeSide(cloneTerms(question.right)) },
    };
    assignIds(equationState);

    const historyTrace = [{
      id: "step-0",
      equation: formatEquation(equationState),
      note: `Level ${level.id}: ${question.label}`,
      action: { type: "init", level: level.id, questionIndex: qIndex, label: question.label },
      timestamp: Date.now(),
    }];

    const scaleState = computeScaleState(equationState);

    return {
      equationState,
      historyTrace,
      scaleState,
      meta: {
        level: level.id,
        levelTitle: level.title,
        pattern: level.pattern,
        questionIndex: qIndex,
        questionLabel: question.label,
        probeVariable: "x",
        probeValue: 1,
        lastCompletedLevel: null,
        dragonboxGame: false,
      },
    };
  }

  function cloneTerms(terms) {
    return JSON.parse(JSON.stringify(terms));
  }

  function deepCloneState() {
    return JSON.parse(JSON.stringify(appState));
  }

  function nextId() {
    termIdCounter += 1;
    return `t${termIdCounter}`;
  }

  function assignIds(equationState) {
    ["left", "right"].forEach((key) => {
      equationState[key].terms.forEach((term) => assignTermId(term));
    });
  }

  function assignTermId(term) {
    if (!term.id) term.id = nextId();
    if (term.kind === "group") term.inner.forEach((inner) => assignTermId(inner));
    if (term.kind === "fraction") term.numTerms.forEach((inner) => assignTermId(inner));
  }

  /* ── AST analysis ─────────────────────────────────────────── */

  function flattenSide(terms, multiplier = 1) {
    const summary = { constants: 0, variables: {} };

    terms.forEach((term) => {
      const sign = term.sign === -1 ? -1 : 1;
      const mult = multiplier * sign;

      if (term.kind === "constant") {
        summary.constants += term.value * mult;
      } else if (term.kind === "variable") {
        const v = term.variable;
        summary.variables[v] = (summary.variables[v] || 0) + term.coeff * mult;
      } else if (term.kind === "group") {
        const inner = flattenSide(term.inner, mult * term.coeff);
        summary.constants += inner.constants;
        Object.entries(inner.variables).forEach(([v, c]) => {
          summary.variables[v] = (summary.variables[v] || 0) + c;
        });
      } else if (term.kind === "fraction") {
        const inner = flattenSide(term.numTerms, mult / term.denom);
        summary.constants += inner.constants;
        Object.entries(inner.variables).forEach(([v, c]) => {
          summary.variables[v] = (summary.variables[v] || 0) + c;
        });
      }
    });

    return summary;
  }

  function sideEffectiveWeight(summary, probeValue = 1) {
    let total = summary.constants;
    Object.values(summary.variables).forEach((coeff) => {
      total += coeff * probeValue;
    });
    return total;
  }

  function coeffToFilledTiles(value) {
    if (Math.abs(value) < 0.0001) {
      return { sign: "positive", tiles: [] };
    }

    const sign = value >= 0 ? "positive" : "negative";
    const abs = Math.abs(value);
    const whole = Math.floor(abs + 1e-9);
    const frac = abs - whole;
    const tiles = [];

    for (let i = 0; i < whole; i += 1) {
      tiles.push({ fill: 1 });
    }
    if (frac > 0.001) {
      tiles.push({ fill: Math.round(frac * 1000) / 1000 });
    }

    return { sign, tiles };
  }

  function splitVariableFilledTiles(variables) {
    const positive = [];
    const negative = [];

    Object.values(variables).forEach((coeff) => {
      const { sign, tiles } = coeffToFilledTiles(coeff);
      if (sign === "positive") positive.push(...tiles);
      else negative.push(...tiles);
    });

    return { positive, negative };
  }

  function computeScaleState(equationState, errorInfo = null) {
    const leftSummary = flattenSide(equationState.left.terms);
    const rightSummary = flattenSide(equationState.right.terms);
    const probe = appState?.meta?.probeValue ?? 1;

    const leftWeight = sideEffectiveWeight(leftSummary, probe);
    const rightWeight = sideEffectiveWeight(rightSummary, probe);
    const delta = rightWeight - leftWeight;

    let tiltDeg = 0;
    let status = "balanced";
    let isBalanced = true;

    if (errorInfo) {
      isBalanced = false;
      tiltDeg = clamp(errorInfo.tiltOverride ?? delta * 2.2, -MAX_TILT, MAX_TILT);
      status = tiltDeg > 0 ? "tilted-right" : "tilted-left";
    }

    const leftUnits = coeffToFilledTiles(leftSummary.constants);
    const rightUnits = coeffToFilledTiles(rightSummary.constants);

    return {
      left: {
        summary: leftSummary,
        weight: leftWeight,
        unitTiles: leftUnits.tiles,
        unitSign: leftUnits.sign,
        variableTiles: splitVariableFilledTiles(leftSummary.variables),
      },
      right: {
        summary: rightSummary,
        weight: rightWeight,
        unitTiles: rightUnits.tiles,
        unitSign: rightUnits.sign,
        variableTiles: splitVariableFilledTiles(rightSummary.variables),
      },
      delta,
      tiltDeg,
      isBalanced,
      status,
      error: errorInfo || null,
    };
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /* ── Formatting ───────────────────────────────────────────── */

  function formatVariable(coeff, variable) {
    if (coeff === 1) return variable;
    if (coeff === -1) return `−${variable}`;
    return `${coeff}${variable}`;
  }

  function formatInnerTerms(terms) {
    return terms
      .map((t, i) => {
        if (t.kind === "variable") {
          const v = formatVariable(t.coeff, t.variable);
          return i === 0 ? v : `+ ${v}`.replace("+ −", "− ");
        }
        if (t.kind === "constant") {
          const c = String(t.value);
          return i === 0 ? c : `+ ${c}`.replace("+ −", "− ");
        }
        if (t.kind === "group") return formatGroup(t, i === 0);
        return "";
      })
      .join(" ")
      .replace(/^\+\s/, "");
  }

  function isUnitOutsideCoeff(coeff) {
    if (coeff === undefined || coeff === null || coeff === "") return true;
    const c = Number(coeff);
    if (!Number.isFinite(c)) return true;
    return Math.abs(Math.abs(c) - 1) < 1e-9;
  }

  function formatGroup(term, isFirst) {
    // 1(x + 3) or (x + 3) → drop brackets in the written trace
    if (isUnitOutsideCoeff(term.coeff)) {
      const factor = (Number(term.coeff) || 1) * (term.sign === -1 ? -1 : 1);
      const expanded = (term.inner || []).map((t) => {
        if (t.kind === "variable") {
          return { kind: "variable", coeff: t.coeff * factor, variable: t.variable };
        }
        if (t.kind === "constant") {
          return { kind: "constant", value: t.value * factor };
        }
        return t;
      });
      const text = formatInnerTerms(expanded);
      return isFirst ? text : `+ ${text}`.replace("+ −", "− ");
    }
    const inner = formatInnerTerms(term.inner);
    const wrapped = `(${inner})`;
    const text = `${term.coeff}${wrapped}`;
    return isFirst ? text : `+ ${text}`.replace("+ −", "− ");
  }

  function formatFraction(term, isFirst) {
    const num = formatInnerTerms(term.numTerms);
    const needsParen = term.numTerms.length > 1 || term.numTerms[0]?.kind === "group";
    const numerator = needsParen ? `(${num})` : num;
    const text = `${numerator} / ${term.denom}`;
    return isFirst ? text : `+ ${text}`.replace("+ −", "− ");
  }

  function formatTermPiece(term, index) {
    const isFirst = index === 0;
    const prefix = !isFirst ? (term.sign === -1 ? "− " : "+ ") : (term.sign === -1 ? "−" : "");

    if (term.kind === "variable") {
      const body = formatVariable(term.coeff, term.variable);
      return isFirst && term.sign !== -1 ? body : `${prefix}${term.sign === -1 && isFirst ? " " : ""}${body}`.replace("−  ", "− ");
    }
    if (term.kind === "constant") {
      const body = String(Math.abs(term.value));
      if (term.value < 0) return isFirst ? `−${body}` : `− ${body}`;
      return isFirst ? body : `+ ${body}`;
    }
    if (term.kind === "group") {
      const body = formatGroup(term, true);
      return isFirst ? (term.sign === -1 ? `−${body}` : body) : `${prefix}${body}`;
    }
    if (term.kind === "fraction") {
      const body = formatFraction(term, true);
      return isFirst ? (term.sign === -1 ? `−${body}` : body) : `${prefix}${body}`;
    }
    return "";
  }

  function formatConstant(value) {
    return String(value);
  }

  function formatSideTerms(terms) {
    const parts = terms.map((term, index) => formatTermPiece(term, index));
    return parts.join(" ").replace(/\s+/g, " ").trim() || "0";
  }

  function formatEquation(equationState) {
    return `${formatSideTerms(equationState.left.terms)} = ${formatSideTerms(equationState.right.terms)}`;
  }

  function areLikeTerms(a, b) {
    if (a.kind === "variable" && b.kind === "variable") return a.variable === b.variable;
    if (a.kind === "constant" && b.kind === "constant") return true;
    return false;
  }

  /* ── Mutations ────────────────────────────────────────────── */

  function expandUnitGroup(group) {
    const sign = group.sign === -1 ? -1 : 1;
    const rawCoeff = Number(group.coeff);
    const coeff = Number.isFinite(rawCoeff) ? rawCoeff : 1;
    const factor = coeff * sign;
    return (group.inner || []).map((t) => {
      if (t.kind === "variable") {
        return {
          kind: "variable",
          coeff: t.coeff * factor,
          variable: t.variable,
          id: t.id || nextId(),
        };
      }
      if (t.kind === "constant") {
        return {
          kind: "constant",
          value: t.value * factor,
          id: t.id || nextId(),
        };
      }
      if (t.kind === "group") {
        const nested = Number(t.coeff);
        return {
          ...t,
          coeff: (Number.isFinite(nested) ? nested : 1) * factor,
          id: t.id || nextId(),
        };
      }
      return { ...t, id: t.id || nextId() };
    });
  }

  function unwrapUnitGroupsInList(terms) {
    const out = [];
    terms.forEach((term) => {
      // 1(…) or −1(…) → drop brackets and expand inner terms
      if (term.kind === "group" && isUnitOutsideCoeff(term.coeff)) {
        unwrapUnitGroupsInList(expandUnitGroup(term)).forEach((t) => out.push(t));
        return;
      }
      if (term.kind === "fraction") {
        out.push({
          ...term,
          numTerms: unwrapUnitGroupsInList(term.numTerms || []),
        });
        return;
      }
      out.push(term);
    });
    return out;
  }

  function normalizeSide(terms) {
    const merged = [];
    unwrapUnitGroupsInList(terms).forEach((term) => {
      if (term.kind === "group" || term.kind === "fraction") {
        merged.push(term);
        return;
      }
      const like = merged.find((t) => areLikeTerms(t, term));
      if (like) {
        if (term.kind === "variable") like.coeff += term.coeff;
        else like.value += term.value;
      } else {
        merged.push({ ...term });
      }
    });
    return merged.filter((t) => {
      if (t.kind === "variable") return t.coeff !== 0;
      if (t.kind === "constant") return t.value !== 0;
      return true;
    });
  }

  function applyConstantToSide(terms, delta) {
    const copy = cloneTerms(terms);
    const existing = copy.find((t) => t.kind === "constant");
    if (existing) {
      existing.value += delta;
      if (existing.value === 0) return copy.filter((t) => t.id !== existing.id);
      return copy;
    }
    if (delta !== 0) copy.push({ kind: "constant", value: delta, id: nextId() });
    return copy;
  }

  function applyVariableToSide(terms, coeffDelta, variable) {
    const copy = cloneTerms(terms);
    const existing = copy.find((t) => t.kind === "variable" && t.variable === variable);
    if (existing) {
      existing.coeff += coeffDelta;
      if (existing.coeff === 0) return copy.filter((t) => t.id !== existing.id);
      return copy;
    }
    if (coeffDelta !== 0) copy.push({ kind: "variable", coeff: coeffDelta, variable, id: nextId() });
    return copy;
  }

  function divideNumeratorTerms(numTerms, divisor) {
    return numTerms.map((nt) => {
      if (nt.kind === "variable") return { ...nt, coeff: nt.coeff / divisor };
      if (nt.kind === "constant") return { ...nt, value: nt.value / divisor };
      if (nt.kind === "group") return { ...nt, coeff: nt.coeff / divisor };
      return nt;
    });
  }

  function divideSide(terms, divisor) {
    return terms
      .map((t) => {
        if (t.kind === "variable") return { ...t, coeff: t.coeff / divisor };
        if (t.kind === "constant") return { ...t, value: t.value / divisor };
        if (t.kind === "group") return { ...t, coeff: t.coeff / divisor };
        // e.g. Level 7: 2(x+1)/3 ÷ 2 → 1(x+1)/3 → unwraps to (x+1)/3
        // Divide the numerator (not multiply the denominator) so coeffs cancel cleanly
        if (t.kind === "fraction") {
          return {
            ...t,
            numTerms: divideNumeratorTerms(t.numTerms || [], divisor),
          };
        }
        return t;
      })
      .filter((t) => {
        if (t.kind === "variable") return t.coeff !== 0;
        if (t.kind === "constant") return t.value !== 0;
        return true;
      });
  }

  function findTermById(id) {
    if (!appState?.equationState) return null;

    function searchList(list, sideKey) {
      for (const term of list) {
        if (term.id === id) return { term, side: sideKey, list };
        if (term.kind === "group") {
          const inner = term.inner.find((t) => t.id === id);
          if (inner) return { term: inner, side: sideKey, list: term.inner, group: term };
        }
        if (term.kind === "fraction") {
          const inner = term.numTerms.find((t) => t.id === id);
          if (inner) return { term: inner, side: sideKey, list: term.numTerms, fraction: term };
          for (const nt of term.numTerms) {
            if (nt.kind === "group") {
              const deep = nt.inner.find((t) => t.id === id);
              if (deep) return { term: deep, side: sideKey, list: nt.inner, group: nt, fraction: term };
            }
          }
        }
      }
      return null;
    }

    for (const sideKey of ["left", "right"]) {
      const hit = searchList(appState.equationState[sideKey].terms, sideKey);
      if (hit) return hit;
    }
    return null;
  }

  function commitMove(action, note, mutator) {
    mutator(appState.equationState);
    // Always unwrap 1(…) / −1(…) on both sides after every move
    appState.equationState.left.terms = normalizeSide(appState.equationState.left.terms);
    appState.equationState.right.terms = normalizeSide(appState.equationState.right.terms);
    assignIds(appState.equationState);
    appState.scaleState = computeScaleState(appState.equationState);
    recordTrace(note, action);
    checkLevelCompletion();
    notify();
  }

  function recordTrace(note, action) {
    appState.historyTrace.push({
      id: `step-${appState.historyTrace.length}`,
      equation: formatEquation(appState.equationState),
      note,
      action,
      timestamp: Date.now(),
    });
  }

  function subtractConstantFromBoth(n) {
    commitMove(
      { type: "subtract_constant_both", value: n },
      `Subtract ${n} from both sides`,
      (eq) => {
        eq.left.terms = normalizeSide(applyConstantToSide(eq.left.terms, -n));
        eq.right.terms = normalizeSide(applyConstantToSide(eq.right.terms, -n));
      }
    );
  }

  function addConstantToBoth(n) {
    commitMove(
      { type: "add_constant_both", value: n },
      `Add ${n} to both sides`,
      (eq) => {
        eq.left.terms = normalizeSide(applyConstantToSide(eq.left.terms, n));
        eq.right.terms = normalizeSide(applyConstantToSide(eq.right.terms, n));
      }
    );
  }

  function subtractVariableFromBoth(coeff, variable) {
    const label = formatVariable(Math.abs(coeff), variable);
    commitMove(
      { type: "subtract_variable_both", coeff, variable },
      `Subtract ${label} from both sides`,
      (eq) => {
        eq.left.terms = normalizeSide(applyVariableToSide(eq.left.terms, -coeff, variable));
        eq.right.terms = normalizeSide(applyVariableToSide(eq.right.terms, -coeff, variable));
      }
    );
  }

  function addVariableToBoth(coeff, variable) {
    const label = formatVariable(Math.abs(coeff), variable);
    commitMove(
      { type: "add_variable_both", coeff, variable },
      `Add ${label} to both sides`,
      (eq) => {
        eq.left.terms = normalizeSide(applyVariableToSide(eq.left.terms, coeff, variable));
        eq.right.terms = normalizeSide(applyVariableToSide(eq.right.terms, coeff, variable));
      }
    );
  }

  function divideBothBy(n) {
    commitMove(
      { type: "divide_both", divisor: n },
      `Divide both sides by ${n}`,
      (eq) => {
        eq.left.terms = normalizeSide(divideSide(eq.left.terms, n));
        eq.right.terms = normalizeSide(divideSide(eq.right.terms, n));
      }
    );
  }

  function multiplySideTerms(terms, factor) {
    const result = [];
    terms.forEach((term) => {
      if (term.kind === "fraction") {
        if (factor === term.denom) {
          term.numTerms.forEach((nt) => {
            const signMult = term.sign === -1 ? -1 : 1;
            if (nt.kind === "group") {
              result.push({
                ...nt,
                inner: nt.inner.map((inner) => {
                  if (inner.kind === "variable") return { ...inner, coeff: inner.coeff * signMult };
                  return { ...inner, value: inner.value * signMult };
                }),
              });
            } else if (nt.kind === "variable") {
              result.push({ ...nt, coeff: nt.coeff * signMult });
            } else if (nt.kind === "constant") {
              result.push({ ...nt, value: nt.value * signMult });
            }
          });
        } else {
          const scaled = cloneTerms(term.numTerms).map((nt) => {
            if (nt.kind === "variable") return { ...nt, coeff: nt.coeff * factor };
            if (nt.kind === "constant") return { ...nt, value: nt.value * factor };
            if (nt.kind === "group") {
              return {
                ...nt,
                inner: nt.inner.map((inner) => {
                  if (inner.kind === "variable") return { ...inner, coeff: inner.coeff * factor };
                  return { ...inner, value: inner.value * factor };
                }),
              };
            }
            return nt;
          });
          result.push({ kind: "fraction", numTerms: scaled, denom: term.denom, sign: term.sign, id: nextId() });
        }
      } else if (term.kind === "variable") {
        result.push({ ...term, coeff: term.coeff * factor });
      } else if (term.kind === "constant") {
        result.push({ ...term, value: term.value * factor });
      } else if (term.kind === "group") {
        result.push({
          ...term,
          inner: term.inner.map((inner) => {
            if (inner.kind === "variable") return { ...inner, coeff: inner.coeff * factor };
            return { ...inner, value: inner.value * factor };
          }),
        });
      }
    });
    return result;
  }

  function multiplyBothBy(n) {
    commitMove(
      { type: "multiply_both", factor: n },
      `Multiply both sides by ${n}`,
      (eq) => {
        eq.left.terms = normalizeSide(multiplySideTerms(eq.left.terms, n));
        eq.right.terms = normalizeSide(multiplySideTerms(eq.right.terms, n));
      }
    );
  }

  function mergeLikeTerms(sourceId, targetId) {
    const src = findTermById(sourceId);
    const tgt = findTermById(targetId);
    if (!src || !tgt || src.side !== tgt.side) return false;
    if (!areLikeTerms(src.term, tgt.term)) return false;

    commitMove(
      { type: "combine_like_terms", side: src.side, sourceId, targetId },
      `Combine like terms on the ${src.side} side`,
      (eq) => {
        const sideTerms = eq[src.side].terms;
        if (src.term.kind === "variable") {
          tgt.term.coeff += src.term.coeff;
          src.list.splice(src.list.indexOf(src.term), 1);
        } else {
          tgt.term.value += src.term.value;
          src.list.splice(src.list.indexOf(src.term), 1);
        }
        eq[src.side].terms = normalizeSide(sideTerms);
      }
    );
    return true;
  }

  function distributeGroup(groupId) {
    const found = findTermById(groupId);
    const group = found?.group || (found?.term?.kind === "group" ? found.term : null);
    if (!found || !group) return false;

    const side = found.side;

    commitMove(
      { type: "distribute", groupId: group.id, coeff: group.coeff },
      `Distribute ${group.coeff} across the bracket`,
      (eq) => {
        const expanded = group.inner.map((t) => {
          if (t.kind === "variable") {
            return { kind: "variable", coeff: t.coeff * group.coeff, variable: t.variable, id: nextId() };
          }
          return { kind: "constant", value: t.value * group.coeff, id: nextId() };
        });

        if (found.fraction) {
          const frac = found.fraction;
          const gIdx = frac.numTerms.indexOf(group);
          frac.numTerms.splice(gIdx, 1, ...expanded);
        } else {
          const idx = eq[side].terms.indexOf(group);
          eq[side].terms.splice(idx, 1, ...expanded);
        }
        eq[side].terms = normalizeSide(eq[side].terms);
      }
    );
    return true;
  }

  function applyUnevenConstantDelta(side, delta) {
    const eq = appState.equationState;
    eq[side].terms = normalizeSide(applyConstantToSide(eq[side].terms, delta));
    assignIds(eq);
    appState.scaleState = computeScaleState(eq, {
      type: "uneven_operation",
      side,
      message: `Operation applied to ${side} side only`,
      tiltOverride: side === "left" ? MAX_TILT * 0.6 : -MAX_TILT * 0.6,
    });
    recordTrace(`⚠ Uneven change on ${side} side only`, { type: "uneven_constant", side, delta });
    notify();
  }

  function cloneTermForMove(term) {
    const copy = cloneTerms([term])[0];
    function reassign(t) {
      t.id = nextId();
      if (t.kind === "group") t.inner.forEach(reassign);
      if (t.kind === "fraction") t.numTerms.forEach(reassign);
    }
    reassign(copy);
    return copy;
  }

  function flipTermForTranspose(term) {
    const moved = cloneTermForMove(term);
    if (moved.kind === "constant") {
      moved.value = -term.value;
    } else if (moved.kind === "variable") {
      moved.coeff = -term.coeff;
    } else if (moved.kind === "group") {
      moved.coeff = -term.coeff;
    } else if (moved.kind === "fraction") {
      if (term.sign === -1) delete moved.sign;
      else moved.sign = -1;
    }
    return moved;
  }

  function moveTermToOtherSide(termId) {
    const found = findTermById(termId);
    if (!found || found.group || found.fraction) return false;
    if (
      found.term.kind !== "constant" &&
      found.term.kind !== "variable" &&
      found.term.kind !== "group" &&
      found.term.kind !== "fraction"
    ) {
      return false;
    }

    const term = found.term;
    const srcSide = found.side;
    const destSide = srcSide === "left" ? "right" : "left";
    const label = termLabel(term);
    const flippedTerm = flipTermForTranspose(term);
    const flipped = formatTermPiece(flippedTerm, 0);

    commitMove(
      { type: "move_term", termId, from: srcSide, to: destSide },
      `Move ${label} to the ${destSide} side (becomes ${flipped})`,
      (eq) => {
        const idx = found.list.indexOf(term);
        if (idx !== -1) found.list.splice(idx, 1);

        const destList = destSide === "left" ? eq.left.terms : eq.right.terms;
        destList.push(flippedTerm);

        eq[srcSide].terms = normalizeSide(eq[srcSide].terms);
      }
    );
    return true;
  }

  function simplifySide(side) {
    commitMove(
      { type: "simplify_side", side },
      `Simplify the ${side} side`,
      (eq) => {
        eq[side].terms = normalizeSide(eq[side].terms);
      }
    );
  }

  function applyInverseOperation(op, magnitude, variable, termKind) {
    if (op === "subtract") {
      if (termKind === "variable") subtractVariableFromBoth(magnitude, variable);
      else subtractConstantFromBoth(magnitude);
    } else if (op === "add") {
      if (termKind === "variable") addVariableToBoth(magnitude, variable);
      else addConstantToBoth(magnitude);
    } else if (op === "divide") {
      divideBothBy(magnitude);
    } else if (op === "multiply") {
      multiplyBothBy(magnitude);
    }
  }

  function scoreForLevel(levelId) {
    if (levelId <= 2) return 5;
    if (levelId <= 4) return 10;
    if (levelId <= 7) return 15;
    return 20;
  }

  function loadGameQuestion(levelId, questionIndex) {
    try {
      appState = createInitialState(levelId, questionIndex);
      appState.meta.dragonboxGame = true;
      appState.meta.dragonboxPoints = scoreForLevel(levelId);
      notify();
      return true;
    } catch (err) {
      console.error("loadGameQuestion failed", err);
      return false;
    }
  }

  function loadLevel(levelId, questionIndex) {
    if (!isLevelUnlocked(levelId)) {
      return false;
    }
    try {
      appState = createInitialState(levelId, questionIndex);
      const progress = loadProgress();
      progress.currentLevel = levelId;
      saveProgress(progress);
      notify();
      return true;
    } catch (err) {
      console.error("loadLevel failed", err);
      return false;
    }
  }

  function shuffleQuestion() {
    if (!appState) return;
    loadLevel(appState.meta.level);
  }

  function requireState() {
    if (!appState && !bootstrap()) {
      throw new Error("AppStore is not initialized");
    }
    return appState;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }

  function notify() {
    listeners.forEach((fn) => fn(deepCloneState()));
  }

  function termLabel(term) {
    if (term.kind === "variable") return formatVariable(term.coeff, term.variable);
    if (term.kind === "constant") return String(term.value);
    if (term.kind === "group") return `${term.coeff}(…)`;
    if (term.kind === "fraction") return `${formatInnerTerms(term.numTerms)} / ${term.denom}`;
    return "";
  }

  function termNumericMagnitude(term) {
    if (term.kind === "variable") return Math.abs(term.coeff);
    if (term.kind === "constant") return Math.abs(term.value);
    if (term.kind === "group") return Math.abs(term.coeff);
    if (term.kind === "fraction") return Math.abs(term.denom);
    return 0;
  }

  function anchorModeForLevel(levelId) {
    if (levelId <= 2) return "easy";
    if (levelId <= 4) return "medium";
    return "hard";
  }

  window.AppStore = {
    getState: () => (appState ? deepCloneState() : null),
    getEquationState: () => requireState().equationState,
    getHistoryTrace: () => requireState().historyTrace,
    getScaleState: () => requireState().scaleState,
    getMeta: () => requireState().meta,
    subscribe,
    loadLevel: (levelId, questionIndex) => {
      if (!ensureLevels()) return false;
      return loadLevel(levelId, questionIndex);
    },
    loadGameQuestion,
    scoreForLevel,
    isEquationSolved: () =>
      appState?.equationState ? isEquationSolved(appState.equationState) : false,
    shuffleQuestion,
    formatEquation: () => (appState ? formatEquation(appState.equationState) : ""),
    formatSideTerms,
    findTermById,
    termLabel,
    termNumericMagnitude,
    areLikeTerms,
    applyInverseOperation,
    mergeLikeTerms,
    distributeGroup,
    moveTermToOtherSide,
    simplifySide,
    applyUnevenConstantDelta,
    computeScaleState,
    anchorModeForLevel,
    multiplyBothBy,
    isLevelUnlocked,
    isLevelCompleted,
    getProgress,
    ackLevelCompletion,
    isReady: () => !!appState,
    getLevels: () => window.LEVELS || [],
  };

  bootstrap();
})();
