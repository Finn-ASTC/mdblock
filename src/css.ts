/**
 * `src/css.ts` — `Theme` + `Options` → generated stylesheet text.
 *
 * Contract invariants that live here:
 *   N1  every top-level rule is scoped under `.mdblock`; there is deliberately
 *       no global root selector, so multiple article blocks can coexist.
 *   N3  no `!important`; host piercing is left to `--hard-isolation`.
 *
 * The `--mdblock-*` / `--shiki-*` custom properties are public API: they are
 * defined exactly once, on `.mdblock[data-theme="<theme.id>"]`, so several
 * differently-themed blocks can share one page. Users override them by hand
 * with the same selector (or a higher-specificity one). In-between colours
 * (hover, zebra stripes, hairlines) are derived with
 * `color-mix(in oklab, ...)` instead of adding tokens to the theme.
 */

import {
  SHIKI_BACKGROUND_VAR,
  SHIKI_FOREGROUND_VAR,
  SYNTAX_KEYS,
  shikiVarName,
} from "./syntax-map.ts";
import type { Options, ShadowPreset, Theme } from "./types.ts";

/** Distinct box-shadow values for the built-in presets. */
const SHADOW_PRESETS: Record<ShadowPreset, string> = {
  none: "none",
  soft:
    "0 1px 2px color-mix(in oklab, var(--mdblock-text) 10%, transparent), " +
    "0 10px 30px color-mix(in oklab, var(--mdblock-text) 8%, transparent)",
  hard:
    "0 2px 0 var(--mdblock-border-color), " +
    "0 12px 28px color-mix(in oklab, var(--mdblock-text) 22%, transparent)",
  ring:
    "0 0 0 1px var(--mdblock-border-color), " +
    "0 0 0 5px color-mix(in oklab, var(--mdblock-accent) 22%, transparent)",
};

/** `none` → `none`, preset names → designed shadows, anything else → raw CSS. */
function resolveShadow(shadow: Options["shadow"]): string {
  if (shadow === "none") return "none";
  if (shadow === "soft" || shadow === "hard" || shadow === "ring") {
    return SHADOW_PRESETS[shadow];
  }
  return shadow;
}

/** Monospace stack shared by inline code, fenced code and kbd. */
const MONO_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** Generate the full stylesheet for one theme/options pair. */
export function renderCss(theme: Theme, options: Options): string {
  const colors = theme.colors;
  const bg = options.bg ?? colors.bg;
  const border = options.border === "" ? "none" : options.border;
  const shadow = resolveShadow(options.shadow);
  const isolation = options.hardIsolation ? "  all: revert;\n" : "";

  const highlightVars = SYNTAX_KEYS.map(
    (key) => `  ${shikiVarName(key)}: ${colors.syntax[key]};`,
  ).join("\n");

  return `/*
 * mdblock — generated stylesheet
 * Every rule is scoped under \`.mdblock\`. The theme custom properties below
 * are defined once, on \`.mdblock[data-theme="<theme.id>"]\`, so several
 * differently-themed blocks can share one page. Override them with the same
 * selector or a higher-specificity one.
 */

/* ── shell: frame (theme-independent) ──────────────────────────────── */
.mdblock {
${isolation}  box-sizing: border-box;
  max-width: var(--mdblock-width);
  margin: 0 auto;
  padding: var(--mdblock-padding);
  background: var(--mdblock-bg);
  color: var(--mdblock-text);
  font-family: var(--mdblock-font-family);
  font-size: var(--mdblock-font-size);
  line-height: var(--mdblock-line-height);
  border: var(--mdblock-border);
  border-radius: var(--mdblock-radius);
  box-shadow: var(--mdblock-shadow);
  overflow-wrap: break-word;

  /* do not inherit host typography (spacing, casing, alignment, ...) */
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  font-variant: normal;
  font-style: normal;
  font-weight: normal;
  text-align: start;
  text-indent: 0;
  white-space: normal;
}

/* ── theme custom properties (scoped by data-theme) ────────────────── */
.mdblock[data-theme="${theme.id}"] {
  /* face */
  --mdblock-bg: ${bg};
  --mdblock-surface: ${colors.surface};
  --mdblock-text: ${colors.text};
  --mdblock-heading: ${colors.heading};
  --mdblock-muted: ${colors.muted};

  /* line / accents */
  --mdblock-border-color: ${colors.border};
  --mdblock-accent: ${colors.accent};
  --mdblock-accent-alt: ${colors.accentAlt};

  /* code */
  --mdblock-code-bg: ${colors.codeBg};
  --mdblock-code-text: ${colors.codeText};

  /* layout */
  --mdblock-width: ${options.width};
  --mdblock-padding: ${options.padding};
  --mdblock-radius: ${options.radius};
  --mdblock-font-size: ${options.fontSize};
  --mdblock-line-height: ${options.lineHeight};
  --mdblock-font-family: ${options.fontFamily};

  /* frame */
  --mdblock-border: ${border};
  --mdblock-shadow: ${shadow};

  /* syntax highlighting */
  ${SHIKI_FOREGROUND_VAR}: ${colors.codeText};
  ${SHIKI_BACKGROUND_VAR}: ${colors.codeBg};
${highlightVars}
}

/* ── box model ─────────────────────────────────────────────────────── */
.mdblock *, .mdblock *::before, .mdblock *::after { box-sizing: border-box; }

/* ── text colour belongs to us, not to the host ───────────────────────
   Root colour is not enough: inheritance loses to ANY rule that hits a
   descendant directly, so a host rule like "p { color: … }" (specificity
   0,0,1) would recolour our body text. Pinning "color: inherit" on every
   descendant at specificity 0,1,0 makes the host's bare-element rules
   lose, while our own colour rules (headings, links, code, quotes) are
   more specific and still win. */
.mdblock * { color: inherit; }

/* Same idea one specificity step up: a host rule such as ".prose p" is
   0,1,1 and would beat the catch-all above, so the elements we actually
   emit get their own 0,1,1 rule. Ties are then decided by document order,
   and our stylesheet is inlined inside the block — after the host's.
   Elements that carry their own colour (headings, links, code, quotes,
   deletion marks) are left out so their rules below still win. */
.mdblock p, .mdblock li, .mdblock td, .mdblock th, .mdblock dd, .mdblock dt,
.mdblock span, .mdblock em, .mdblock strong, .mdblock sup, .mdblock sub,
.mdblock label, .mdblock input, .mdblock kbd { color: inherit; }

/* ── flow: paragraphs ──────────────────────────────────────────────── */
.mdblock p { margin: 0.9em 0; }
.mdblock > :first-child { margin-top: 0; }
.mdblock > :last-child { margin-bottom: 0; }

/* ── headings ──────────────────────────────────────────────────────── */
.mdblock h1, .mdblock h2, .mdblock h3, .mdblock h4, .mdblock h5, .mdblock h6 {
  color: var(--mdblock-heading);
  font-weight: 700;
  line-height: 1.25;
  margin: 1.6em 0 0.6em;
}
.mdblock h1 { font-size: 2em; letter-spacing: -0.02em; }
.mdblock h2 { font-size: 1.6em; letter-spacing: -0.015em; }
.mdblock h3 { font-size: 1.34em; }
.mdblock h4 { font-size: 1.16em; }
.mdblock h5 { font-size: 1em; }
.mdblock h6 { font-size: 0.9em; letter-spacing: 0.02em; }

/* ── lists (including nesting and task lists) ──────────────────────── */
.mdblock ul, .mdblock ol {
  margin: 0.9em 0;
  padding-left: 1.6em;
  list-style-position: outside;
}
.mdblock ul {
  list-style-type: disc;
}
.mdblock ol {
  list-style-type: decimal;
}
.mdblock li { margin: 0.3em 0; }
.mdblock li > ul, .mdblock li > ol { margin: 0.3em 0; }
.mdblock li::marker { color: var(--mdblock-accent); }
.mdblock ul.contains-task-list {
  padding-left: 0.2em;
  list-style: none;
}
.mdblock .task-list-item {
  list-style: none;
}
.mdblock .task-list-item-checkbox {
  margin: 0 0.5em 0 0;
  vertical-align: middle;
  accent-color: var(--mdblock-accent);
}

/* ── blockquotes ───────────────────────────────────────────────────── */
.mdblock blockquote {
  margin: 1.1em 0;
  padding: 0.6em 1.1em;
  color: var(--mdblock-muted);
  background: color-mix(in oklab, var(--mdblock-surface) 55%, transparent);
  border-left: 4px solid var(--mdblock-accent-alt);
  border-radius: 0 var(--mdblock-radius) var(--mdblock-radius) 0;
}
.mdblock blockquote > :first-child { margin-top: 0; }
.mdblock blockquote > :last-child { margin-bottom: 0; }

/* ── tables ────────────────────────────────────────────────────────── */
.mdblock table {
  width: 100%;
  margin: 1.1em 0;
  border-collapse: collapse;
  font-size: 0.95em;
}
.mdblock th, .mdblock td {
  padding: 0.5em 0.8em;
  border: 1px solid var(--mdblock-border-color);
  text-align: left;
}
.mdblock thead th {
  background: var(--mdblock-surface);
  color: var(--mdblock-heading);
  font-weight: 600;
}
.mdblock tbody tr:nth-child(even) {
  background: color-mix(in oklab, var(--mdblock-surface) 45%, transparent);
}

/* ── horizontal rules ──────────────────────────────────────────────── */
.mdblock hr {
  height: 0;
  margin: 1.8em 0;
  border: 0;
  border-top: 1px solid color-mix(in oklab, var(--mdblock-border-color) 70%, transparent);
}

/* ── code (inline + fenced) ────────────────────────────────────────── */
.mdblock code {
  padding: 0.15em 0.4em;
  font-family: ${MONO_FONT_STACK};
  font-size: 0.9em;
  color: var(--mdblock-accent);
  background: color-mix(in oklab, var(--mdblock-surface) 75%, transparent);
  border-radius: 6px;
}
.mdblock pre, .mdblock .mdblock-code {
  margin: 1.1em 0;
  padding: 1em 1.25em;
  overflow-x: auto;
  white-space: pre;
  font-family: ${MONO_FONT_STACK};
  font-size: 1em;
  color: var(--mdblock-code-text);
  background: var(--mdblock-code-bg);
  border: 1px solid color-mix(in oklab, var(--mdblock-border-color) 60%, transparent);
  border-radius: var(--mdblock-radius);
  line-height: 1.55;
}
.mdblock .mdblock-code code {
  padding: 0;
  font-size: 0.9em;
  color: inherit;
  background: none;
  border-radius: 0;
}

/* ── links ─────────────────────────────────────────────────────────── */
.mdblock a {
  color: var(--mdblock-accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklab, var(--mdblock-accent) 45%, transparent);
  text-underline-offset: 0.15em;
}
.mdblock a:hover {
  color: var(--mdblock-accent-alt);
  text-decoration-color: currentColor;
}

/* ── media and inline elements ─────────────────────────────────────── */
.mdblock img {
  max-width: 100%;
  height: auto;
  border-radius: calc(var(--mdblock-radius) / 2);
}
.mdblock kbd {
  padding: 0.15em 0.45em;
  font-family: ${MONO_FONT_STACK};
  font-size: 0.85em;
  color: var(--mdblock-text);
  background: var(--mdblock-surface);
  border: 1px solid var(--mdblock-border-color);
  border-bottom-width: 2px;
  border-radius: 6px;
}
.mdblock sub, .mdblock sup { font-size: 0.75em; line-height: 0; }
.mdblock del, .mdblock s { color: var(--mdblock-muted); }
.mdblock strong { font-weight: 700; }
.mdblock em { font-style: italic; }
`;
}
