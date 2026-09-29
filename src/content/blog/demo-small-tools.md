---
title: Small tools, clear interfaces
description: 一个关于小工具的中英文混排示例，包含 TypeScript 代码、行内标识符与较长代码行。（排版测试）
pubDate: 2026-06-08
---

> 排版测试文章：正文与日期均为示例，代码仅用于展示与排版检查。

Small tools start with a clear boundary. 一个小工具可以只完成一个动作，但它应该让输入、输出与错误状态都容易理解。

## 给数据一个明确形状

下面的 `ArticlePreview` 描述了一条文章摘要。类型名称和中文解释并排出现时，字号、基线和行高应该保持自然。

```typescript
type ArticlePreview = {
  title: string;
  description: string;
  year: number;
};

const article: ArticlePreview = {
  title: 'Small tools, clear interfaces',
  description: 'Keep the next action easy to understand.',
  year: 2026,
};

const label = `${article.year} / ${article.title}`;
console.log(label);
```

## 长代码行

下面一行故意不换行，用于检查手机端代码区域能否独立横向滚动，同时保持整页宽度稳定。

```typescript
const example = { title: 'A deliberately long example for horizontal code scrolling', description: 'This line is intended to stay inside the code block on narrow screens.', status: 'layout-test' };
```

工具可以很小，交互仍然值得认真打磨。This is a sample paragraph, not a production tutorial.
