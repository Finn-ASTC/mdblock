# mdblock 演示文档

这是一段普通正文，里面有**加粗**、*斜体*、`行内代码`、~~删除线~~，以及一个裸链接
https://example.com/autolink 和一个 [普通链接](https://example.com/)。

## 列表

- 无序项一
- 无序项二
  - 嵌套项 A
  - 嵌套项 B
    - 再深一层

1. 有序项一
2. 有序项二
   1. 嵌套有序

### 任务列表

- [x] 已完成的事
- [ ] 还没做的事

## 引用

> 引用块第一段。
>
> 引用块第二段，里面还有 `代码`。

## 表格

| 列 A | 列 B | 列 C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |

## 代码

```ts
export function add(a: number, b: number): number {
  // 注释
  const label = "sum";
  return a + b;
}
```

```bash
echo "hello" | wc -l
```

```notalang
这不是已知语言，应该降级为纯文本。
```

```
没有标语言的围栏块。
```

## 其它

缩进式代码块（4 空格，没有围栏 —— 也必须走同一条代码块管线）：

    indented code line 1
    indented code line 2

---

图片：![占位图](https://example.invalid/img.png)

按键：<kbd>Ctrl</kbd> + <kbd>C</kbd>，下标 H~2~O 之类不在范围内。

<https://example.com/angle-link>
