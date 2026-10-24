<div align="center">

# 轻图 Qingtu

**把灵感展开，让知识连接。**

本地桌面思维导图 · 富媒体内容卡片 · Windows x64

[下载 v0.1.18](https://github.com/pxyfcywl/qingtu/releases/tag/v0.1.18) · [观看宣传片](https://github.com/pxyfcywl/qingtu/releases/download/v0.1.18/qingtu-0.1.18-promo.mp4) · [反馈问题](https://github.com/pxyfcywl/qingtu/issues)

[![轻图 0.1.18 宣传片：把灵感展开，让知识连接](docs/media/promo-preview.gif)](https://github.com/pxyfcywl/qingtu/releases/download/v0.1.18/qingtu-0.1.18-promo.mp4)

上方为自动播放的精华预览，点击观看 43 秒的完整宣传片（含配乐）。

</div>

轻图把思维导图和内容笔记放在同一张画布上。用节点梳理结构，用卡片写下推导、代码和详细笔记，把图片、公式与本地视频连接到你的思路里。

**0.1.18 是本项目首次公开发布的版本。** 本地资料保存在你选择的文件夹中，日常使用无需登录账号。

## 你可以用轻图做什么

| 功能 | 用法 |
| --- | --- |
| 思维导图 | Tab 添加子节点，Enter 添加同级节点，自动整理布局或自由拖动 |
| 内容卡片 | 富文本、Markdown 粘贴、列表、公式、代码高亮和表格 |
| 图片与视频 | 插入图片和本地 MP4；原图预览支持按鼠标位置缩放、拖动查看 |
| 多级列表 | 正文 Tab / Shift+Tab 调整层级，显示 `1.`、`1.1`、`1.1.1` |
| 灵活组织 | 正文与后代分别折叠；更换父节点，或让一个节点连接多个父节点 |
| 资料管理 | 首页文件夹、名称搜索、多导图标签与重启后恢复 |
| 保存与分享 | 自动保存、撤销重做、`.qmap` 项目导入导出、PNG 图片导出 |

![轻图的导图、公式、图片与视频节点](docs/media/overview.png)

## 下载与安装

前往 [v0.1.18 发布页](https://github.com/pxyfcywl/qingtu/releases/tag/v0.1.18)，下载 `轻图-0.1.18-Windows-x64-安装.exe`，按向导完成安装。首次启动时选择资料库存储位置。普通使用无需安装 Node.js、Rust 或 Python。

需要 Windows x64 和 WebView2。安装器在缺少 WebView2 时需要联网下载运行时。应用尚未进行商业代码签名。

已有旧版的用户可下载 `轻图-0.1.18-覆盖更新包.zip`，解压后运行 `覆盖更新.cmd`，选择原程序目录。更新前保存编辑并备份重要资料；程序目录与资料库分开存放。[详细安装与更新说明](docs/release/0.1.18-install.md)。

## 从第一张导图开始

1. 在首页点击“创建新的思维导图”。
2. 选中节点，按 Tab 新增子节点，按 Enter 新增同级节点。
3. 双击标题或卡片正文编辑，按 Esc 完成正文编辑。
4. 在内容卡片中插入公式、代码、表格、图片或视频；正文里的 Tab 用于列表缩进。
5. 用顶部“布局”整理画布，通过“导出”保存 `.qmap` 项目或 PNG 图片。

![内容卡片中的代码与表格](docs/media/code-table.png)

## 从源码运行

技术栈：Tauri 2、Rust、SQLite、React、TypeScript、React Flow、Tiptap、KaTeX、Vite。

准备 Node.js 22 LTS（或满足 Vite 7 要求的版本）、npm、Rust stable、Visual Studio C++ Build Tools、Windows SDK 和 WebView2。依赖版本由 `package-lock.json` 与 `src-tauri/Cargo.lock` 固定。

```powershell
npm ci
npm run tauri -- dev
```

前端开发预览：`npm run dev`。浏览器预览使用独立的开发数据，桌面保存、项目文件和 PNG 导出需在桌面版使用。

```powershell
npm test
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri -- build
```

`scripts/toolchain.ps1` 和 `tauri.tools.conf.json` 用于原开发机的便携工具链；其他电脑使用自己安装的标准工具链即可。

## 发布与验证

本次源码以封存的 0.1.18 为基准，生产源码指纹为 `5fa6fe4baa280e9c4f445b21bc44795b8a98e257e9d4caf63049b863b6551cb9`，与现有安装包的构建记录对应。首发整理补充了文档、宣传素材和运行测试所需样本。

封版记录包括 58 项前端单元测试、74 项浏览器界面测试，以及使用独立资料库的桌面功能验证。[版本验证记录](docs/release/0.1.18-verification.json)与[源码指纹](docs/release/source-fingerprint.json)可供核对。这些检查覆盖对应功能与回归；完整性能、长期内存和干净系统安装验收尚未全部完成。

宣传素材来自 0.1.18 的独立浏览器开发预览，使用演示资料，未读取个人资料库。

## 第三方组件

第三方依赖的许可与声明见 [third-party-notices.txt](public/third-party-notices.txt)。本仓库暂未指定项目自身的开源许可证。
