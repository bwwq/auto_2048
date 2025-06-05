// ==UserScript==
// @name         2048 AI auto (Linux.do)
// @namespace    http://tampermonkey.net/
// @version      0.9 CN Optimized
// @description  在 2048.linux.do 网站上使用本地AI自动玩2048。自动开始，卡住时自动刷新页面。中文注释和优化。
// @author       wm
// @match        https://2048.linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置常量 ---
    const AI_THINK_INTERVAL = 50;      // AI 在未移动时思考的间隔时间 (毫秒)
    const AI_DELAY_AFTER_MOVE = 100;   // AI 成功移动后到下一次思考的延迟 (毫秒)
    const STUCK_TIMEOUT_DURATION = 10000; // 10秒：如果AI激活状态下棋盘长时间无变化，则刷新页面

    // --- 全局变量 ---
    let gameInstance = null;              // 游戏实例
    let aiPlaying = false;                // AI 是否正在运行
    let lastBoardStateString = "";        // 上一个棋盘状态的字符串表示，用于比较变化
    let aiTimer = null;                   // AI 的定时器
    let isWaitingForAI = false;           // 标志位：是否正在等待AI计算结果，防止重复计算
    let lastBoardChangeTime = 0;          // 上次棋盘发生变化的时间戳，用于检测卡死

    // --- 棋盘操作工具函数 ---

    /**
     * 深拷贝棋盘数组
     * @param {number[][]} board - 要拷贝的棋盘
     * @returns {number[][]} 新的棋盘数组
     */
    function copyBoard(board) {
        return board.map(row => [...row]);
    }

    /**
     * 比较两个棋盘是否相同
     * @param {number[][]} board1
     * @param {number[][]} board2
     * @returns {boolean} 是否相同
     */
    function boardsAreEqual(board1, board2) {
        if (!board1 || !board2 || board1.length !== 4 || board2.length !== 4) return false;
        for (let i = 0; i < 4; i++) {
            if (board1[i].length !== 4 || board2[i].length !== 4) return false; // 确保行也是4个元素
            for (let j = 0; j < 4; j++) {
                if (board1[i][j] !== board2[i][j]) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * 将棋盘转换为字符串表示，方便比较
     * @param {number[][]} board
     * @returns {string}
     */
    function boardToString(board) {
        if (!board || board.length === 0) return "";
        return board.map(row => row.join(',')).join(';');
    }

    // --- 核心AI逻辑 ---

    /**
     * (优化版) 处理单行/列的移动和合并逻辑 (向左移动)
     * @param {number[]} line - 输入的行/列 (长度为4)
     * @returns {{newLine: number[], merges: number, scoreChange: number}}
     *           newLine: 处理后的新行/列
     *           merges: 发生的合并次数
     *           scoreChange: 因合并产生的得分变化
     */
    function processLine(line) {
        let tempLine = line.filter(cell => cell !== 0); // 1. 移除所有0，得到紧凑的数字序列
        let newLine = [];
        let merges = 0;
        let scoreChange = 0;

        for (let i = 0; i < tempLine.length; i++) {
            if (i + 1 < tempLine.length && tempLine[i] === tempLine[i+1]) {
                // 2. 如果当前数字和下一个数字相同，则合并
                const mergedValue = tempLine[i] * 2;
                newLine.push(mergedValue);
                scoreChange += mergedValue;
                merges++;
                i++; // 跳过下一个数字，因为它已经被合并了
            } else {
                // 3. 否则，直接将当前数字放入新行
                newLine.push(tempLine[i]);
            }
        }

        // 4. 用0填充剩余位置，使长度为4
        while (newLine.length < 4) {
            newLine.push(0);
        }
        return { newLine, merges, scoreChange };
    }


    /**
     * 模拟在给定棋盘上执行一个方向的移动
     * @param {number[][]} board - 当前棋盘状态
     * @param {string} direction - 移动方向 ('up', 'down', 'left', 'right')
     * @returns {{newBoard: number[][], merges: number, scoreChange: number, moved: boolean}}
     *           newBoard: 模拟移动后的新棋盘
     *           merges: 发生的合并次数
     *           scoreChange: 因合并产生的得分变化
     *           moved: 棋盘是否实际发生了变化
     */
    function simulateMove(board, direction) {
        let simBoard = copyBoard(board); // 操作副本，不修改原始棋盘
        let totalMerges = 0;
        let totalScoreChange = 0;
        let moved = false;

        // 辅助函数：转置棋盘 (行变列，列变行)
        const transpose = (b) => {
            let N = b.length;
            let result = Array.from({ length: N }, () => Array(N).fill(0));
            for(let r=0; r<N; ++r) {
                for(let c=0; c<N; ++c) {
                    result[c][r] = b[r][c];
                }
            }
            return result;
        };

        // 统一将 'up', 'down', 'right' 操作转换为 'left' 操作处理
        if (direction === 'up' || direction === 'down') {
            simBoard = transpose(simBoard); // 上下移动前先转置
        }
        if (direction === 'right' || direction === 'down') { // 对于 'right'；对于 'down'，转置后相当于 'right'
            simBoard = simBoard.map(row => row.slice().reverse()); // 行内反转
        }

        // 对每一行（或转置/反转后的等效行）执行 'left' 操作
        for (let i = 0; i < 4; i++) {
            const originalLine = [...simBoard[i]]; // 记录原始行用于比较是否移动
            const { newLine, merges, scoreChange } = processLine(simBoard[i]);
            simBoard[i] = newLine;
            totalMerges += merges;
            totalScoreChange += scoreChange;
            if (!originalLine.every((val, index) => val === newLine[index])) {
                moved = true; // 只要有一行发生变化，就标记为已移动
            }
        }

        // 将棋盘转换回去
        if (direction === 'right' || direction === 'down') {
            simBoard = simBoard.map(row => row.slice().reverse()); // 再次行内反转
        }
        if (direction === 'up' || direction === 'down') {
            simBoard = transpose(simBoard); // 再次转置
        }
        return { newBoard: simBoard, merges: totalMerges, scoreChange: totalScoreChange, moved };
    }

    /**
     * 启发式评分函数：评估一个棋盘状态的好坏程度
     * @param {number[][]} board - 要评估的棋盘
     * @param {number} mergesMade - 在得到此棋盘状态的过程中发生的合并次数
     * @param {number[][]} previousBoard - (可选) 之前的棋盘状态，用于判断是否为无效移动
     * @returns {number} 棋盘的评分，越高越好
     */
    function scoreBoardState(board, mergesMade, previousBoard) {
        let emptyCells = 0;      // 空格数量 (越多越好)
        let monotonicity = 0;    // 单调性 (衡量棋盘是否有序，例如数值是否向某个角落递增/递减)
        let smoothness = 0;      // 平滑度 (衡量相邻数字的差异，差异小则平滑度高)
        let maxValue = 0;        // 棋盘上的最大数字

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const cellValue = board[i][j];
                if (cellValue === 0) {
                    emptyCells++;
                }
                maxValue = Math.max(maxValue, cellValue);

                if (cellValue > 0) {
                    // 单调性: 一个简单的策略是让数值倾向于某个角落。
                    // 例如，权重 (3-i) + j 会使得越靠右下角(i=0,j=3)的格子权重越高。
                    // 权重矩阵:
                    // i=0: 3  4  5  6
                    // i=1: 2  3  4  5
                    // i=2: 1  2  3  4
                    // i=3: 0  1  2  3
                    // 目标是高数值 * 高权重。
                    monotonicity += cellValue * ((3 - i) + j); // 简单权重，鼓励向右下角集中大数

                    // 平滑度: 计算与右边和下边格子的对数值差异的负值。差异越小，平滑度得分越高。
                    // 使用log2可以使得 (2,4) 和 (1024,2048) 之间的差异被同等看待。
                    if (j < 3 && board[i][j+1] > 0) { // 水平方向
                        smoothness -= Math.abs(Math.log2(cellValue) - Math.log2(board[i][j+1]));
                    }
                    if (i < 3 && board[i+1][j] > 0) { // 垂直方向
                        smoothness -= Math.abs(Math.log2(cellValue) - Math.log2(board[i+1][j]));
                    }
                }
            }
        }

        // 各项指标的权重 (这些权重可以通过实验调整以获得更好的AI性能)
        const emptyCellWeight = 250;     // 空格权重
        const mergeWeight = 300;         // 合并权重
        const monotonicityWeight = 15;   // 单调性权重
        const smoothnessWeight = 10;     // 平滑度权重
        const maxValueWeight = 100;      // 最大数字权重 (鼓励获得更大的数字)

        // 如果移动后棋盘未发生变化 (与previousBoard相同)，则这是一个无效的移动，给予极低分
        if (previousBoard && boardsAreEqual(board, previousBoard)) {
            return -Infinity;
        }

        let score = (emptyCells * emptyCellWeight) +
               (mergesMade * mergeWeight) +
               (monotonicity * monotonicityWeight) +
               (smoothness * smoothnessWeight) +
               (Math.log2(maxValue > 0 ? maxValue : 1) * maxValueWeight); // 使用最大值的log，收益递减

        // 对空格过少的情况进行惩罚 (特别是当最大值还不大时，避免过早锁死)
        if (maxValue < 2048 && emptyCells < 2) score -= 500;
        if (maxValue < 2048 && emptyCells === 0) score -= 1000; // 0个空格非常危险

        return score;
    }

    /**
     * 本地AI决策函数：尝试所有可能的移动，选择最优的一个
     * @param {number[][]} currentBoard - 当前棋盘状态
     * @returns {Promise<string|null>} 返回最佳移动方向的字符 ('u', 'd', 'l', 'r')，如果无有效移动则返回 null
     */
    async function getLocalAIMove(currentBoard) {
        isWaitingForAI = true; // 开始计算，设置标志
        // console.log("本地AI开始计算最佳移动，当前棋盘:", boardToString(currentBoard));

        const directions = ['up', 'down', 'left', 'right']; // 可能的移动方向
        let bestMove = null;        // 记录最佳移动方向
        let bestScore = -Infinity;  // 记录最佳得分

        for (const dir of directions) {
            // 模拟移动
            const { newBoard, merges, moved } = simulateMove(currentBoard, dir);

            if (moved) { // 只考虑实际改变了棋盘的移动
                const currentScore = scoreBoardState(newBoard, merges, currentBoard);
                // console.log(`模拟移动 ${dir}: 得分=${currentScore.toFixed(0)}, 合并=${merges}, 空格=${newBoard.flat().filter(x=>x===0).length}`);

                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestMove = dir[0]; // 'u', 'd', 'l', 'r'
                }
            }
        }
        isWaitingForAI = false; // 计算结束，清除标志

        if (bestMove) {
            // console.log(`本地AI选择移动: ${bestMove} (得分: ${bestScore.toFixed(0)})`);
        } else {
            // console.warn("本地AI：未找到有效移动。游戏可能结束或卡住。");
        }
        return bestMove;
    }

    // --- 游戏交互与控制 ---

    /**
     * 查找页面上的游戏实例
     * @returns {object|null} 游戏实例对象，或 null (如果未找到)
     */
    function findGameInstance() {
        // 优先尝试 Vue 实例 (针对 2048.linux.do 的特定结构)
        const canvas = document.getElementById('game-canvas');
        if (canvas && canvas.__vue__ && canvas.__vue__.game) {
            console.log("通过 Vue 实例找到游戏对象。");
            return canvas.__vue__.game;
        }
        // 尝试通用的 window.canvasGame (一些老式或简单的实现可能会用)
        if (window.canvasGame && typeof window.canvasGame.board !== 'undefined') {
            console.log("通过 window.canvasGame 找到游戏对象。");
            return window.canvasGame;
        }
        // 遍历 window 对象查找可能的实例 (作为后备方案)
        for (const key in window) {
             try {
                 if (window[key] && typeof window[key].board !== 'undefined' && typeof window[key].handleMove === 'function') {
                     console.log(`在 window.${key} 中找到游戏对象。`);
                     return window[key];
                 }
             } catch (e) { /* 忽略访问错误 */ }
        }
        console.warn("未能找到游戏实例。");
        return null;
    }

    /**
     * 执行AI选择的移动
     * @param {string} moveChar - 移动方向字符 ('u', 'd', 'l', 'r')
     */
    function executeMove(moveChar) {
        if (!gameInstance) {
            console.error("游戏实例未找到，无法执行移动！");
            return;
        }
        const directionMap = { 'u': 'up', 'd': 'down', 'l': 'left', 'r': 'right' };
        const direction = directionMap[moveChar];

        if (!direction) {
            console.warn(`未知的AI移动字符: ${moveChar}`);
            return;
        }
        // console.log(`执行移动: ${direction}`);

        // 优先使用游戏实例提供的 handleMove 方法
        if (typeof gameInstance.handleMove === 'function') {
             gameInstance.handleMove(direction);
        } else {
            // 后备方案：模拟键盘事件 (可靠性较低)
            console.warn("游戏实例没有 handleMove 方法！尝试模拟键盘事件。");
            let key;
            switch (direction) {
                case 'up': key = 'ArrowUp'; break;
                case 'down': key = 'ArrowDown'; break;
                case 'left': key = 'ArrowLeft'; break;
                case 'right': key = 'ArrowRight'; break;
            }
            if (key) {
                document.dispatchEvent(new KeyboardEvent('keydown', { 'key': key, bubbles: true, cancelable: true }));
            }
        }
    }

    /**
     * AI自动运行的主循环
     */
    async function autoPlayAI() {
        if (!aiPlaying || !gameInstance) { // AI未启动或游戏实例丢失
            return;
        }

        // 检查游戏是否结束或胜利
        if (gameInstance.gameOver || gameInstance.victory) {
            console.log("游戏结束或胜利，AI停止。");
            stopAI();
            // 可选：游戏结束后自动重新开始
            // if (gameInstance.gameOver && typeof gameInstance.restart === 'function') {
            //     console.log("游戏结束。5秒后尝试自动重新开始...");
            //     setTimeout(() => {
            //         if (typeof gameInstance.restart === 'function') gameInstance.restart();
            //         setTimeout(startAI, 1000); // 游戏重启后1秒再启动AI
            //     }, 5000);
            // }
            return;
        }

        if (isWaitingForAI) { // 如果AI正在计算中，则等待下次循环
            scheduleNextAIMove(AI_THINK_INTERVAL);
            return;
        }
        if (gameInstance.isAnimating) { // 如果游戏正在播放动画，则等待动画结束
            // console.log("游戏动画播放中，等待...");
            scheduleNextAIMove(AI_DELAY_AFTER_MOVE);
            return;
        }

        const currentBoard = gameInstance.board;
        const currentBoardStr = boardToString(currentBoard);

        // 检查棋盘状态是否发生变化
        if (currentBoardStr === lastBoardStateString) { // 棋盘状态未变
            // 检查是否卡死
            if (aiPlaying && (Date.now() - lastBoardChangeTime > STUCK_TIMEOUT_DURATION)) {
                console.warn(`游戏似乎卡住了超过 ${STUCK_TIMEOUT_DURATION / 1000} 秒 (棋盘无变化)。正在刷新页面...`);
                window.location.reload();
                return; // 刷新前停止后续执行
            }
            // console.log("棋盘状态未变，但未超时，继续等待...");
            scheduleNextAIMove(AI_THINK_INTERVAL / 2); // 棋盘静止时，更频繁地检查
            return;
        }

        // 棋盘已发生变化
        lastBoardStateString = currentBoardStr;
        lastBoardChangeTime = Date.now(); // 更新最后变化时间

        // console.log("请求本地AI决策，当前棋盘:", currentBoardStr);
        const move = await getLocalAIMove(currentBoard);

        if (move) {
            executeMove(move);
            scheduleNextAIMove(AI_DELAY_AFTER_MOVE); // 移动后等待一段时间
        } else {
            // console.warn("本地AI未返回有效移动。游戏可能真的卡住或结束了。");
            // 如果AI返回null，意味着所有模拟移动都不能改变棋盘或提高分数。
            // stuck timer 会处理这种情况 (如果 gameInstance.gameOver 未被设置)。
            scheduleNextAIMove(AI_THINK_INTERVAL * 2); // 稍微慢一点重试
        }
    }

    /**
     * 安排下一次AI的执行
     * @param {number} delay - 延迟时间 (毫秒)
     */
    function scheduleNextAIMove(delay = AI_THINK_INTERVAL) {
        clearTimeout(aiTimer); // 清除之前的定时器
        aiTimer = setTimeout(autoPlayAI, delay);
    }

    /**
     * 启动AI
     */
    function startAI() {
        if (!aiPlaying) {
            gameInstance = findGameInstance(); // 再次尝试获取游戏实例
            if (!gameInstance) {
                console.error("无法启动AI：未找到游戏实例。");
                const button = document.getElementById('ai-toggle-button');
                if (button) {
                    button.textContent = '游戏未就绪';
                    button.style.backgroundColor = '#e74c3c'; // 红色背景提示
                }
                return;
            }

            aiPlaying = true;
            console.log("2048 本地AI已启动");
            lastBoardStateString = ""; // 重置棋盘状态，强制首次检查
            lastBoardChangeTime = Date.now(); // 重置卡死检测的基准时间
            const button = document.getElementById('ai-toggle-button');
            if (button) {
                button.textContent = '停止AI';
                button.style.backgroundColor = '#ee5a24'; // 橙色背景表示运行中
            }
            scheduleNextAIMove(100); // 初始延迟后开始第一次移动决策
        }
    }

    /**
     * 停止AI
     */
    function stopAI() {
        if (aiPlaying) {
            aiPlaying = false;
            clearTimeout(aiTimer);
            isWaitingForAI = false; // 清除等待标志
            console.log("2048 本地AI已停止");
            const button = document.getElementById('ai-toggle-button');
            if (button) {
                button.textContent = '启动AI';
                button.style.backgroundColor = '#8f7a66'; // 默认颜色
            }
        }
    }

    /**
     * 在页面上添加一个切换AI状态的按钮
     */
    function addToggleButton() {
        const existingButton = document.getElementById('ai-toggle-button');
        if (existingButton) return; // 按钮已存在

        const container = document.querySelector('.game-container') || document.body; // 游戏容器或body
        const button = document.createElement('button');
        button.id = 'ai-toggle-button';
        button.textContent = '启动AI'; // 初始文本
        button.style.cssText = `
            display: block; margin: 10px auto; padding: 10px 20px;
            font-size: 16px; cursor: pointer; background-color: #8f7a66;
            color: #f9f6f2; border: none; border-radius: 4px; z-index: 10000; /*确保在最上层*/
        `;
        button.addEventListener('click', () => {
            if (aiPlaying) {
                stopAI();
            } else {
                startAI(); // startAI内部会再次检查gameInstance
            }
        });

        // 尝试将按钮插入到游戏容器之后，如果找不到特定容器则插入到body开头
        if (container.firstChild && container.id === 'game-container' && container.parentNode) {
             container.parentNode.insertBefore(button, container.nextSibling);
        } else {
            container.insertBefore(button, container.firstChild);
        }
    }

    /**
     * 初始化脚本
     */
    function initialize() {
        console.log("2048 本地AI脚本 (自动开始/刷新/中文版) 尝试初始化...");
        addToggleButton(); // 首先添加按钮

        gameInstance = findGameInstance(); // 尝试获取游戏实例
        if (gameInstance) {
            console.log("成功找到2048游戏实例。AI将自动启动。");
            startAI(); // AI默认启动
        } else {
            console.log("未能找到2048游戏实例。AI不会自动启动。请在游戏加载完成后点击按钮。");
            // 按钮已添加，用户可以手动点击。startAI()会再次尝试获取游戏实例。
        }
    }

    // 等待文档加载完成后执行初始化
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }

})();
