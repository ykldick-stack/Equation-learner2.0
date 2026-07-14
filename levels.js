/**
 * Eight HKDSE-style levels, each with three question variants.
 */
window.LEVELS = [
    {
      id: 1,
      title: "Fundamental one-step Addition & Subtraction",
      pattern: "x + b = c",
      questions: [
        {
          label: "x + 3 = 8",
          left: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 3 }],
          right: [{ kind: "constant", value: 8 }],
        },
        {
          label: "x + 7 = 15",
          left: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 7 }],
          right: [{ kind: "constant", value: 15 }],
        },
        {
          label: "x − 4 = 6",
          left: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -4 }],
          right: [{ kind: "constant", value: 6 }],
        },
      ],
    },
    {
      id: 2,
      title: "Multiplicative one-step equations",
      pattern: "ax = b",
      questions: [
        {
          label: "3x = 12",
          left: [{ kind: "variable", coeff: 3, variable: "x" }],
          right: [{ kind: "constant", value: 12 }],
        },
        {
          label: "5x = 35",
          left: [{ kind: "variable", coeff: 5, variable: "x" }],
          right: [{ kind: "constant", value: 35 }],
        },
        {
          label: "2x = −10",
          left: [{ kind: "variable", coeff: 2, variable: "x" }],
          right: [{ kind: "constant", value: -10 }],
        },
      ],
    },
    {
      id: 3,
      title: "Two-step standard equations",
      pattern: "ax + b = c",
      questions: [
        {
          label: "2x + 3 = 11",
          left: [{ kind: "variable", coeff: 2, variable: "x" }, { kind: "constant", value: 3 }],
          right: [{ kind: "constant", value: 11 }],
        },
        {
          label: "4x − 5 = 15",
          left: [{ kind: "variable", coeff: 4, variable: "x" }, { kind: "constant", value: -5 }],
          right: [{ kind: "constant", value: 15 }],
        },
        {
          label: "3x + 7 = 22",
          left: [{ kind: "variable", coeff: 3, variable: "x" }, { kind: "constant", value: 7 }],
          right: [{ kind: "constant", value: 22 }],
        },
      ],
    },
    {
      id: 4,
      title: "Combining like terms (both sides)",
      pattern: "ax + b = cx + d",
      questions: [
        {
          label: "2x + 3 = x + 8",
          left: [{ kind: "variable", coeff: 2, variable: "x" }, { kind: "constant", value: 3 }],
          right: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 8 }],
        },
        {
          label: "5x − 2 = 3x + 10",
          left: [{ kind: "variable", coeff: 5, variable: "x" }, { kind: "constant", value: -2 }],
          right: [{ kind: "variable", coeff: 3, variable: "x" }, { kind: "constant", value: 10 }],
        },
        {
          label: "4x + 1 = 2x + 9",
          left: [{ kind: "variable", coeff: 4, variable: "x" }, { kind: "constant", value: 1 }],
          right: [{ kind: "variable", coeff: 2, variable: "x" }, { kind: "constant", value: 9 }],
        },
      ],
    },
    {
      id: 5,
      title: "Removing brackets",
      pattern: "a(x + b) = c",
      questions: [
        {
          label: "2(x + 3) = 14",
          left: [{
            kind: "group",
            coeff: 2,
            inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 3 }],
          }],
          right: [{ kind: "constant", value: 14 }],
        },
        {
          label: "3(x − 2) = 12",
          left: [{
            kind: "group",
            coeff: 3,
            inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -2 }],
          }],
          right: [{ kind: "constant", value: 12 }],
        },
        {
          label: "4(x + 1) = 20",
          left: [{
            kind: "group",
            coeff: 4,
            inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 1 }],
          }],
          right: [{ kind: "constant", value: 20 }],
        },
      ],
    },
    {
      id: 6,
      title: "Eliminating denominators",
      pattern: "(x + a) / b = c",
      questions: [
        {
          label: "(x + 2) / 3 = 4",
          left: [{
            kind: "fraction",
            numTerms: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 2 }],
            denom: 3,
          }],
          right: [{ kind: "constant", value: 4 }],
        },
        {
          label: "(x − 1) / 4 = 2",
          left: [{
            kind: "fraction",
            numTerms: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -1 }],
            denom: 4,
          }],
          right: [{ kind: "constant", value: 2 }],
        },
        {
          label: "(x + 5) / 2 = 7",
          left: [{
            kind: "fraction",
            numTerms: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 5 }],
            denom: 2,
          }],
          right: [{ kind: "constant", value: 7 }],
        },
      ],
    },
    {
      id: 7,
      title: "Bracket & denominator combo",
      pattern: "a(x + b) / c = d",
      questions: [
        {
          label: "2(x + 1) / 3 = 4",
          left: [{
            kind: "fraction",
            numTerms: [{
              kind: "group",
              coeff: 2,
              inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 1 }],
            }],
            denom: 3,
          }],
          right: [{ kind: "constant", value: 4 }],
        },
        {
          label: "3(x − 2) / 4 = 6",
          left: [{
            kind: "fraction",
            numTerms: [{
              kind: "group",
              coeff: 3,
              inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -2 }],
            }],
            denom: 4,
          }],
          right: [{ kind: "constant", value: 6 }],
        },
        {
          label: "4(x + 3) / 5 = 8",
          left: [{
            kind: "fraction",
            numTerms: [{
              kind: "group",
              coeff: 4,
              inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 3 }],
            }],
            denom: 5,
          }],
          right: [{ kind: "constant", value: 8 }],
        },
      ],
    },
    {
      id: 8,
      title: "Ultimate synthesis",
      pattern: "a(x−b)/c − (x+d)/e = f",
      questions: [
        {
          label: "2(x − 1) / 3 − (x + 2) / 4 = 0",
          left: [
            {
              kind: "fraction",
              numTerms: [{
                kind: "group",
                coeff: 2,
                inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -1 }],
              }],
              denom: 3,
            },
            {
              kind: "fraction",
              sign: -1,
              numTerms: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 2 }],
              denom: 4,
            },
          ],
          right: [{ kind: "constant", value: 0 }],
        },
        {
          label: "3(x − 2) / 2 − (x + 1) / 5 = 2",
          left: [
            {
              kind: "fraction",
              numTerms: [{
                kind: "group",
                coeff: 3,
                inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -2 }],
              }],
              denom: 2,
            },
            {
              kind: "fraction",
              sign: -1,
              numTerms: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 1 }],
              denom: 5,
            },
          ],
          right: [{ kind: "constant", value: 2 }],
        },
        {
          label: "2(x − 3) / 5 − (x + 4) / 3 = 1",
          left: [
            {
              kind: "fraction",
              numTerms: [{
                kind: "group",
                coeff: 2,
                inner: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: -3 }],
              }],
              denom: 5,
            },
            {
              kind: "fraction",
              sign: -1,
              numTerms: [{ kind: "variable", coeff: 1, variable: "x" }, { kind: "constant", value: 4 }],
              denom: 3,
            },
          ],
          right: [{ kind: "constant", value: 1 }],
        },
      ],
    },
  ];
