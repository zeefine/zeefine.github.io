# 个人博客

Astro + TypeScript（严格模式）+ Markdown + Tailwind CSS。
文章和代码保存在同一个仓库，默认生成静态网站。

## 本地开发

使用 Node.js 22.23.3（见 `.nvmrc`）。如果安装了 nvm，先运行 `nvm install` 和 `nvm use`。

```bash
npm ci
npm run dev
```

打开终端显示的地址，通常是 http://localhost:4321。

### 手动启动和关闭后台服务

在项目目录运行：

```bash
./start.sh
./stop.sh
```

`start.sh` 启动开发服务，默认地址为 http://127.0.0.1:4321/，支持保存后自动更新；关闭终端后服务仍运行。重复启动会显示已有服务，不创建第二个实例。端口被占用时 Astro 会选择可用端口，以终端输出的地址为准。

`stop.sh` 停止当前项目由 Astro 管理的开发和预览服务；未启动时重复执行也安全。它不会按端口批量结束其他项目的进程。

两个脚本均可通过绝对路径从任意目录运行，也可使用 `bash start.sh` / `bash stop.sh`。脚本会在检测到 nvm 时自动切换到 `.nvmrc` 指定的 Node 版本；缺少 Node 或依赖时会提示安装，不自动下载。

后台开发日志保存在 `.astro/dev.log`。需要以前台方式启动时仍可使用 `npm run dev`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器，保存文件后自动更新 |
| `npm run check` | 检查 Astro 和 TypeScript 类型 |
| `npm run build` | 先检查类型，再生成 `dist/` 静态网站 |
| `npm run preview` | 本地预览已构建的网站 |

## 写文章

在 `src/content/blog/` 下添加 `.md` 文件，例如 `my-first-post.md`：

```markdown
---
title: 我的第一篇文章
description: 用一句话介绍这篇文章。
pubDate: 2026-09-24
---

## 开始记录

在这里写正文。
```

文章会自动出现在 `/blog/` 归档，按日期倒序排列；首页显示最新三篇。文章访问地址为 `/blog/my-first-post/`。
文件开头的标题、简介和日期由 `src/content.config.ts` 校验。阅读页顶部提供“上一篇文章 / 下一篇文章”，沿用列表从新到旧的顺序；首篇仅显示下一篇，末篇仅显示上一篇。

## 中英文切换

顶部使用单个 44px 圆形语言按钮：中文页面显示 `EN`，英文页面显示 `中`，点击切换到另一种语言；手机端打开导航菜单后切换。中文地址保持 `/`、`/blog/`、`/archive/`，英文对应 `/en/`、`/en/blog/`、`/en/archive/`。站内导航沿用地址中的语言，不自动按浏览器语言跳转。

界面文案集中在 `src/i18n/ui.ts`。首页英文介绍为 `Happiness comes first...`，两行英文 slogan 和两行表情保留。主题、页面动效暂停设置跨语言共用；归档切换语言时携带搜索词和当前视图。

现有 Markdown 默认是中文，不需要修改。暂无译文时英文列表和书架继续显示原文，标识为 `Chinese original`，阅读页显示说明并保留中文正文。

添加英文译文时，在 `src/content/blog/en/` 新建独立 Markdown，例如 `hello-world.md`：

```markdown
---
title: Starting here
description: A first note about AI, technology, and making things.
pubDate: 2026-09-24
locale: en
translationOf: hello-world
---

Write the English article here.
```

`translationOf` 指向中文文章的集合 ID（通常是文件名去掉 `.md`，子目录文章需包含目录名）。英文译文自动替换英文列表、时间线、书架及正文中的对应文章，访问地址仍为 `/en/blog/hello-world/`，不会新增一篇重复文章。两种语言的展示日期、排序和年份分组统一使用中文原文的发布日期；译文的 `pubDate` 建议与原文一致。缺失原文或同一文章有多份英文译文时，构建会报告错误。

当前仓库未新增正式文章译文，可按需逐篇维护。

## 目录

```text
src/
  content/blog/          Markdown 文章
  content.config.ts      文章字段定义
  i18n/                 中英文文案、语言路径和文章对应逻辑
  lib/posts.ts           本地化文章读取
  components/pages/     两种语言共用的四类页面
  layouts/BaseLayout.astro
  pages/index.astro      首页
  pages/blog/index.astro  文章归档
  pages/blog/[...id].astro
  pages/en/             对应的英文静态路由
  scripts/navigation.ts  共用手机导航
  scripts/home.ts        柔光与文字动效控制
  scripts/theme.ts       外观切换与偏好保存
  styles/home.css        首页布局与动效
  styles/global.css      Tailwind 与全局样式
```

Tailwind 使用 Vite 插件和 CSS 配置，正文通过 Typography 插件的 `prose` 类排版。
TypeScript 固定在 Astro 检查工具支持的主版本；依赖的准确版本保存在 `package-lock.json`。

## 视觉配置

首页采用「晨光庭院」风格：雾白底色、鼠尾草绿柔光、左对齐标题与文章预览。
背景为原生 CSS 径向渐变，使用 transform 缓慢漂移，不加载外部视频、Three.js 或图片。
在 `src/i18n/ui.ts` 修改中英文文案，在 `src/components/pages/HomePage.astro` 修改首页内容结构，在 `src/styles/home.css` 修改首页布局；背景流动路径和周期位于 `src/scripts/softlight.ts`。
`src/styles/global.css` 内的语义颜色变量控制首页、归档、阅读页的统一配色。
本地字体为 Manrope / Space Grotesk；中文使用系统字体。

- 外观初次跟随系统，可通过顶部按钮切换浅色、深色；手动选择保存到 localStorage。
- 首页柔光可暂停，暂停选择在当前浏览会话中保留；后台和系统减少动态效果时停止运动。
- 桌面鼠标移动时，三层柔光以不同幅度平滑跟随；停留时按 18 / 23 / 29 秒的周期沿连续曲线流动，以小角度摆动和轻微呼吸交融，离开后回中。固定模糊柔化边缘，原有配色与透明度不变。触屏保留自动流动，跟随与流动共用暂停设置。
- JavaScript 不可用时，背景保持静止，正文和导航仍可使用。

具体设计约定见 `SPEC.md`。

## 部署

构建产物位于 `dist/`，可发布到静态托管服务。
确定域名后，在 `astro.config.mjs` 中设置 `site`。
如果部署到带仓库子路径的 GitHub Pages，还需配置 `base` 并调整站内链接。

## 官方文档

- [Astro 安装](https://docs.astro.build/en/install-and-setup/)
- [Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Tailwind 集成](https://docs.astro.build/en/guides/styling/#tailwind)
