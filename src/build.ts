/**
 * `src/build.ts` — Markdown + Options 组装成两块内容（M5）。
 *
 * 契约 §3：`css` 来自 `renderCss(loadTheme(options.theme), options)`，
 * `html` 来自 `renderMarkdown`。这里**不**注入 `<style>`：把两份产物合成一个
 * 自包含片段（或落成 HTML + CSS 两个文件）是 `cli.ts` 的事。
 */

import { renderCss } from "./css.ts";
import { renderMarkdown } from "./render.ts";
import { loadTheme } from "./theme.ts";
import type { Options } from "./types.ts";

/** 一次构建的两份产物：文章块 HTML（不含样式）与样式表文本。 */
export interface BuildOutput {
  html: string;
  css: string;
}

/** 用同一份 `options` 渲染 Markdown：主题只加载一次，HTML 与 CSS 严格同源。 */
export async function build(markdown: string, options: Options): Promise<BuildOutput> {
  const theme = loadTheme(options.theme);
  const html = await renderMarkdown(markdown, theme, options);
  return { html, css: renderCss(theme, options) };
}
