/**
 * `markdown-it-task-lists` 不随包提供类型声明（package.json 无 `types`，也没有
 * `@types/markdown-it-task-lists`），这里补一份最小声明，只覆盖本项目用到的入口。
 */
declare module "markdown-it-task-lists" {
  import type { MarkdownIt } from "markdown-it";

  interface TaskListOptions {
    /** `false`（默认）时复选框带 `disabled`；文章块无运行时 JS，用不到可点击的复选框。 */
    enabled?: boolean;
    /** 用 `<label>` 包住复选框。 */
    label?: boolean;
    labelAfter?: boolean;
  }

  const plugin: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default plugin;
}
