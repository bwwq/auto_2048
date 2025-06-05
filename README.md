# 2048 AI 玩家 (Linux.do) - 本地AI 油猴脚本

[![版本](https://img.shields.io/badge/Version-0.9%20CN%20Optimized-blue.svg)](https://github.com/您的用户名/您的仓库名) <!-- 替换为您实际的GitHub链接 -->
[![语言](https://img.shields.io/badge/Language-JavaScript-yellow.svg)](https://www.javascript.com/)
[![许可证](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) <!-- 如果您添加了LICENSE文件 -->

一个油猴（Tampermonkey）脚本，用于在 `https://2048.linux.do/` 网站上自动进行 2048 游戏。此脚本使用本地实现的AI算法进行决策，无需依赖外部服务器。

## ✨ 功能特性

-   **本地AI决策**：所有游戏决策均在浏览器本地通过JavaScript计算完成，无需网络请求外部AI服务器。
-   **自动开始**：脚本加载后，若检测到游戏实例，AI将自动开始运行。
-   **卡死自动刷新**：如果AI在运行过程中，游戏界面长时间（默认为10秒）没有变化，脚本会自动刷新页面以尝试解决卡顿问题。
-   **手动控制**：提供“启动AI”/“停止AI”按钮，方便用户随时接管或暂停AI。
-   **启发式AI算法**：
    -   评估空格数量
    -   评估合并潜力
    -   评估棋盘单调性（数字是否朝特定方向有序排列）
    -   评估棋盘平滑度（相邻数字的差异）
    -   评估当前最大数字
-   **中文界面与注释**：最新版本提供完整的中文日志输出和代码注释，方便理解和二次开发。
-   **可配置参数**：AI思考间隔、移动后延迟等参数可在脚本内调整。

## 🚀 安装

1.  **安装油猴（Tampermonkey）扩展程序**：
    *   [Chrome 用户](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    *   [Firefox 用户](https://addons.mozilla.org/firefox/addon/tampermonkey/)
    *   [Edge 用户](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
    *   其他浏览器请查找对应的 Tampermonkey 或类似用户脚本管理器。
2.  **安装此脚本**：
    *   打开提供的 `.user.js` 脚本文件链接（例如，如果托管在 GreasyFork 或 GitHub Raw）。
    *   或者，在 Tampermonkey 管理面板中选择“新建脚本”，然后将脚本代码完整复制粘贴进去。
    *   保存脚本。
3.  **访问游戏页面**：
    *   打开 [https://2048.linux.do/](https://2048.linux.do/)
    *   脚本应该会自动运行。

## 🛠️ 使用说明

-   脚本安装并启用后，访问游戏页面，AI会自动开始游戏。
-   页面上会出现一个 **“停止AI”** 按钮（如果AI已自动启动）或 **“启动AI”** 按钮。您可以点击此按钮来切换AI的运行状态。
-   如果AI运行时游戏卡住不动超过10秒，页面会自动刷新。

## ⚙️ 配置与优化 (可选)

脚本内部包含一些可配置的常量，您可以根据需要进行调整：

-   `AI_THINK_INTERVAL`: AI在未成功移动时，两次决策之间的思考间隔时间 (毫秒)。
-   `AI_DELAY_AFTER_MOVE`: AI成功执行一次移动后，到下一次决策的延迟时间 (毫SA秒)。
-   `STUCK_TIMEOUT_DURATION`: 判定游戏卡住并触发自动刷新的超时时长 (毫秒)。
-   **启发式函数权重**：在 `scoreBoardState` 函数内部，有多个 `Weight` 后缀的常量（如 `emptyCellWeight`, `monotonicityWeight` 等）。调整这些权重可以显著改变AI的行为和“智能”程度。这是AI优化的核心部分，需要通过实验来找到最佳组合。

## 🧠 AI 核心逻辑

AI 的核心决策基于一个启发式评分函数 (`scoreBoardState`)，该函数评估当前棋盘状态的“好坏程度”。AI 会模拟执行所有四个方向（上、下、左、右）的移动，然后选择那个能使模拟后的棋盘获得最高启发式评分的移动。

主要的启发式评估指标包括：

1.  **空格数量**：更多的空格通常意味着更大的操作空间。
2.  **合并次数**：一次移动中产生的合并越多越好。
3.  **单调性**：鼓励数字向棋盘的某个角落或边缘有序排列。
4.  **平滑度**：鼓励相邻的数字尽可能接近，以便于合并。
5.  **最大数字**：鼓励产生更大的数字。

## 🤝 贡献

欢迎提出问题、报告BUG或提交改进建议！

1.  Fork 本仓库 (如果项目托管在GitHub)。
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  推送到分支 (`git push origin feature/AmazingFeature`)。
5.  打开一个 Pull Request。

## 📜 许可证

该项目采用 [MIT许可证](LICENSE)授权。 <!-- 如果您添加了LICENSE文件 -->

---

*祝您游戏愉快！*
