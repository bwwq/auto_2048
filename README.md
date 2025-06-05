# Auto 2048 AI - 2048 自动化玩家 (Linux.do) - 带一键部署脚本

![Version](https://img.shields.io/badge/version-auto--updated-blue)
![Language](https://img.shields.io/badge/language-JavaScript%20%7C%20Shell-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

一个油猴（Tampermonkey）脚本 (`auto2048ai.js`)，用于在 [https://2048.linux.do/](https://2048.linux.do/) 网站上自动进行 2048 游戏。此脚本使用本地实现的AI算法进行决策。

**最新更新：引入 `2048ai.sh` 一键部署脚本，简化 AI 油猴脚本的获取和更新过程！**

## 📝 项目概述

本项目包含两个主要部分：

1.  **`auto2048ai.js`**：核心的油猴（Tampermonkey）AI 脚本，负责在浏览器中自动玩 2048 游戏。
2.  **`2048ai.sh`**：一个 Shell 脚本，旨在帮助用户快速、便捷地从 GitHub 获取最新版本的 `auto2048ai.js` 并指导安装。

## ✨ 功能特性

### `auto2048ai.js` (AI 油猴脚本)
*   **本地AI决策**：所有游戏决策均在浏览器本地通过JavaScript计算完成，无需网络请求外部AI服务器。
*   **自动开始**：脚本加载后，若检测到游戏实例，AI将自动开始运行。
*   **卡死自动刷新**：如果AI在运行过程中，游戏界面长时间（默认为10秒）没有变化，脚本会自动刷新页面以尝试解决卡顿问题。
*   **手动控制**：提供“启动AI”/“停止AI”按钮，方便用户随时接管或暂停AI。
*   **启发式AI算法**：
    *   评估空格数量
    *   评估合并潜力
    *   评估棋盘单调性（数字是否朝特定方向有序排列）
    *   评估棋盘平滑度（相邻数字的差异）
    *   评估当前最大数字
*   **中文界面与注释**：完整的中文日志输出和代码注释，方便理解和二次开发。
*   **可配置参数**：AI思考间隔、移动后延迟等参数可在脚本内调整。

### `2048ai.sh` (一键部署脚本)
*   **简化获取**：自动从 GitHub 克隆或更新本仓库。
*   **便捷准备**：将最新的 `auto2048ai.js` 脚本文件复制到易于访问的位置（例如用户主目录下的 `2048_AI_Script` 文件夹）。
*   **清晰指引**：在终端输出如何将 `auto2048ai.js` 安装到油猴的说明。

## 🚀 安装指南

### 步骤 1: 安装油猴 (Tampermonkey) 扩展

如果您尚未安装油猴，请为您的浏览器安装：
*   [Chrome 用户](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
*   [Firefox 用户](https://addons.mozilla.org/firefox/addon/tampermonkey/)
*   [Edge 用户](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
*   其他浏览器请查找对应的 Tampermonkey 或类似用户脚本管理器。

### 步骤 2: 使用 `2048ai.sh` 一键部署 AI 脚本

1.  打开您的 Linux / macOS 终端。
2.  下载并执行 `2048ai.sh` 脚本：
    ```bash
    # 下载脚本
    curl -o 2048ai.sh https://raw.githubusercontent.com/bwwq/auto_2048/main/2048ai.sh
    # 或者使用 wget
    # wget https://raw.githubusercontent.com/bwwq/auto_2048/main/2048ai.sh

    # 赋予执行权限
    chmod +x 2048ai.sh

    # 运行脚本
    ./2048ai.sh
    ```
    *脚本会自动处理仓库的克隆或更新，并将 `auto2048ai.js` 文件准备好。*

3.  **按照脚本提示安装到油猴**：
    *   `2048ai.sh` 脚本执行完毕后，会提示 `auto2048ai.js` 文件的路径。
    *   打开油猴 (Tampermonkey) 的管理面板。
    *   选择 “实用工具” (Utilities) 标签页，在 “从文件导入” (Import from file) 处点击 “选择文件” (Choose File)，然后选择由 `2048ai.sh` 准备好的 `auto2048ai.js` 文件。
    *   或者，您可以选择“新建脚本”，然后将 `auto2048ai.js` 文件的全部内容复制粘贴进去。
    *   点击 “安装” (Install) 或 “保存” (Save)。

### 步骤 3: 访问游戏页面

*   打开 [https://2048.linux.do/](https://2048.linux.do/)
*   AI 油猴脚本 (`auto2048ai.js`) 应该会自动运行。

---

### (备选) 手动安装 `auto2048ai.js` 脚本 (不使用 `2048ai.sh`)

1.  确保已安装油猴扩展 (见步骤 1)。
2.  获取 `auto2048ai.js` 文件：
    *   直接访问 [auto2048ai.js raw 文件链接](https://raw.githubusercontent.com/bwwq/auto_2048/main/auto2048ai.js)。
    *   浏览器可能会直接显示代码，您可以全选复制，或者右键另存为 `.js` 文件。
3.  安装到油猴：
    *   打开油猴 (Tampermonkey) 管理面板。
    *   选择“新建脚本”。
    *   将 `auto2048ai.js` 文件的内容完整复制粘贴进去。
    *   保存脚本。
4.  访问游戏页面 (见步骤 3)。

## 🛠️ AI 脚本使用说明

*   脚本安装并启用后，访问游戏页面，AI会自动开始游戏。
*   页面上会出现一个 “停止AI” 按钮（如果AI已自动启动）或 “启动AI” 按钮。您可以点击此按钮来切换AI的运行状态。
*   如果AI运行时游戏卡住不动超过配置的超时时间（默认为10秒），页面会自动刷新。

## ⚙️ AI 脚本配置与优化 (可选)

`auto2048ai.js` 脚本内部包含一些可配置的常量，您可以根据需要进行调整（编辑已安装的脚本）：

*   `AI_THINK_INTERVAL`: AI在未成功移动时，两次决策之间的思考间隔时间 (毫秒)。
*   `AI_DELAY_AFTER_MOVE`: AI成功执行一次移动后，到下一次决策的延迟时间 (毫秒)。
*   `STUCK_TIMEOUT_DURATION`: 判定游戏卡住并触发自动刷新的超时时长 (毫秒)。
*   **启发式函数权重**：在 `scoreBoardState` 函数内部，有多个 `Weight` 后缀的常量（如 `emptyCellWeight`, `monotonicityWeight` 等）。调整这些权重可以显著改变AI的行为和“智能”程度。这是AI优化的核心部分，需要通过实验来找到最佳组合。

## 🧠 AI 核心逻辑

AI 的核心决策基于一个启发式评分函数 (`scoreBoardState`)，该函数评估当前棋盘状态的“好坏程度”。AI 会模拟执行所有四个方向（上、下、左、右）的移动，然后选择那个能使模拟后的棋盘获得最高启发式评分的移动。

主要的启发式评估指标包括：

*   **空格数量**：更多的空格通常意味着更大的操作空间。
*   **合并次数**：一次移动中产生的合并越多越好。
*   **单调性**：鼓励数字向棋盘的某个角落或边缘有序排列。
*   **平滑度**：鼓励相邻的数字尽可能接近，以便于合并。
*   **最大数字**：鼓励产生更大的数字。

## 🤝 贡献

欢迎提出问题、报告BUG或提交改进建议！

1.  Fork 本仓库。
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  推送到分支 (`git push origin feature/AmazingFeature`)。
5.  打开一个 Pull Request。

## 📜 许可证

该项目采用 [MIT许可证](LICENSE) 授权。

---

**关于 (About)**

用于 [2048.linux.do](https://2048.linux.do/) 的自动 2048 AI 玩家。包含油猴脚本和一键部署 Shell 脚本。

祝您游戏愉快！
