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
文件开头的标题、简介和日期由 `src/content.config.ts` 校验。

## 目录

```text
src/
  content/blog/          Markdown 文章
  content.config.ts      文章字段定义
  layouts/BaseLayout.astro
  pages/index.astro      首页
  pages/blog/index.astro  文章归档
  pages/blog/[...id].astro
  scripts/home.ts        菜单和柔光动效控制
  scripts/theme.ts       外观切换与偏好保存
  styles/home.css        首页布局与动效
  styles/global.css      Tailwind 与全局样式
```

Tailwind 使用 Vite 插件和 CSS 配置，正文通过 Typography 插件的 `prose` 类排版。
TypeScript 固定在 Astro 检查工具支持的主版本；依赖的准确版本保存在 `package-lock.json`。

## 视觉配置

首页采用「晨光庭院」风格：雾白底色、鼠尾草绿柔光、左对齐标题与文章预览。
背景为原生 CSS 径向渐变，使用 transform 缓慢漂移，不加载外部视频、Three.js 或图片。
在 `src/pages/index.astro` 修改文案，在 `src/styles/home.css` 修改首页布局；背景流动路径和周期位于 `src/scripts/softlight.ts`。
`src/styles/global.css` 内的语义颜色变量控制首页、归档、阅读页的统一配色。
本地字体为 Manrope / Space Grotesk；中文使用系统字体。

- 外观初次跟随系统，可通过顶部按钮切换浅色、深色；手动选择保存到 localStorage。
- 首页柔光可暂停，暂停选择在当前浏览会话中保留；后台和系统减少动态效果时停止运动。
- 桌面鼠标移动时，三层柔光以不同幅度平滑跟随；停留时按 18 / 23 / 29 秒的周期沿连续曲线流动，以小角度摆动和轻微呼吸交融，离开后回中。固定模糊柔化边缘，原有配色与透明度不变。触屏保留自动流动，跟随与流动共用暂停设置。
- JavaScript 不可用时，背景保持静止，正文和导航仍可使用。
- 旧的 `public/images/smoke.png` 保留在仓库，但当前页面不再引用。

具体设计约定见 `SPEC.md`。

## 部署

构建产物位于 `dist/`，可发布到静态托管服务。
确定域名后，在 `astro.config.mjs` 中设置 `site`。
如果部署到带仓库子路径的 GitHub Pages，还需配置 `base` 并调整站内链接。

## 官方文档

- [Astro 安装](https://docs.astro.build/en/install-and-setup/)
- [Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Tailwind 集成](https://docs.astro.build/en/guides/styling/#tailwind)
