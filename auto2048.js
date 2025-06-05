// ==UserScript==
// @name         2048 AI
// @namespace    http://tampermonkey.net/
// @version      1.1 CN HighScoreAttempt
// @description  在 2048.linux.do 网站上使用本地AI自动玩2048。尝试优化启发式函数以争取更高分。自动开始/刷新/新局。中文注释。
// @author       wm
// @match        https://2048.linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置常量 ---
    const AI_THINK_INTERVAL = 1;       // AI 在未移动时思考的间隔时间 (毫秒) - 极低值将导致高CPU占用!
    const AI_DELAY_AFTER_MOVE = 1;     // AI 成功移动后到下一次思考的延迟 (毫秒) - 极低值将导致高CPU占用!
    const STUCK_TIMEOUT_DURATION = 500; // 3秒：如果AI激活状态下棋盘长时间无变化，则刷新页面
    const DELAY_BEFORE_NEW_GAME = 500;  // 游戏结束后等待1秒再开始新游戏 (毫秒)

    // --- 全局变量 ---
    let gameInstance = null;
    let aiPlaying = false;
    let lastBoardStateString = "";
    let aiTimer = null;
    let isWaitingForAI = false;
    let lastBoardChangeTime = 0;

    // --- 棋盘操作工具函数 ---
    function copyBoard(board) {
        return board.map(row => [...row]);
    }

    function boardsAreEqual(board1, board2) {
        if (!board1 || !board2 || board1.length !== 4 || board2.length !== 4) return false;
        for (let i = 0; i < 4; i++) {
            if (board1[i].length !== 4 || board2[i].length !== 4) return false;
            for (let j = 0; j < 4; j++) {
                if (board1[i][j] !== board2[i][j]) return false;
            }
        }
        return true;
    }

    function boardToString(board) {
        if (!board || board.length === 0) return "";
        return board.map(row => row.join(',')).join(';');
    }

    // --- 核心AI逻辑 ---
    function processLine(line) { // 处理单行/列的移动和合并逻辑 (向左移动)
        let tempLine = line.filter(cell => cell !== 0);
        let newLine = [];
        let merges = 0;
        let scoreChange = 0;
        for (let i = 0; i < tempLine.length; i++) {
            if (i + 1 < tempLine.length && tempLine[i] === tempLine[i+1]) {
                const mergedValue = tempLine[i] * 2;
                newLine.push(mergedValue);
                scoreChange += mergedValue;
                merges++;
                i++;
            } else {
                newLine.push(tempLine[i]);
            }
        }
        while (newLine.length < 4) newLine.push(0);
        return { newLine, merges, scoreChange };
    }

    function simulateMove(board, direction) { // 模拟在给定棋盘上执行一个方向的移动
        let simBoard = copyBoard(board);
        let totalMerges = 0;
        let totalScoreChange = 0;
        let moved = false;
        const transpose = (b) => {
            let N = b.length;
            let result = Array.from({ length: N }, () => Array(N).fill(0));
            for(let r=0; r<N; ++r) for(let c=0; c<N; ++c) result[c][r] = b[r][c];
            return result;
        };
        if (direction === 'up' || direction === 'down') simBoard = transpose(simBoard);
        if (direction === 'right' || direction === 'down') simBoard = simBoard.map(row => row.slice().reverse());
        for (let i = 0; i < 4; i++) {
            const originalLine = [...simBoard[i]];
            const { newLine, merges, scoreChange } = processLine(simBoard[i]);
            simBoard[i] = newLine;
            totalMerges += merges;
            totalScoreChange += scoreChange;
            if (!originalLine.every((val, index) => val === newLine[index])) moved = true;
        }
        if (direction === 'right' || direction === 'down') simBoard = simBoard.map(row => row.slice().reverse());
        if (direction === 'up' || direction === 'down') simBoard = transpose(simBoard);
        return { newBoard: simBoard, merges: totalMerges, scoreChange: totalScoreChange, moved };
    }

    /**
     * (高分优化尝试版) 启发式评分函数：评估一个棋盘状态的好坏程度
     */
    function scoreBoardState(board, mergesMade, previousBoard) {
        let emptyCells = 0;
        let monotonicityScore = 0; // 整体单调性评分
        let smoothnessScore = 0;
        let maxValue = 0;
        let maxValuePos = { r: -1, c: -1 };

        // --- 启发式权重 (关键！需要通过实验调整) ---
        const weights = {
            emptyCells: 270,       // 空格越多越好
            merges: 700,           // 模拟移动时发生的合并是很好的即时收益
            monotonicity: 10,      // 单调性格局的整体权重
            smoothness: 20,        // 相邻格子数值接近的权重
            maxValue: 1000,        // 棋盘上最大数字的权重
            maxValueInCorner: 1200, // 最大值在指定角落的额外奖励 (非常重要!)
            penaltyForNotMaxInCorner: -800, // 当大数不在角落时的惩罚
            sumOfValues: 1,       // 棋盘总值的权重 (鼓励整体数值增长)
            trappedPenalty: -400,  // 对可能被困住的行/列的惩罚 (实验性)
        };

        // --- AI策略核心：指定最大值应该在哪个角落 ---
        // (0,0) 左上角; (0,3) 右上角; (3,0) 左下角; (3,3) 右下角
        const TARGET_CORNER = { r: 0, c: 0 }; // 目标：最大值保持在左上角

        let sumOfValues = 0;

        // 遍历棋盘计算各项指标
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cellValue = board[r][c];
                sumOfValues += cellValue;

                if (cellValue === 0) {
                    emptyCells++;
                } else {
                    // 查找最大值及其位置
                    if (cellValue > maxValue) {
                        maxValue = cellValue;
                        maxValuePos = { r, c };
                    }

                    // 平滑度: 与右边和下边的格子比较，数值越接近越好
                    if (c < 3 && board[r][c+1] > 0) { // 和右边的比较
                        smoothnessScore -= Math.abs(Math.log2(cellValue) - Math.log2(board[r][c+1]));
                    }
                    if (r < 3 && board[r+1][c] > 0) { // 和下边的比较
                        smoothnessScore -= Math.abs(Math.log2(cellValue) - Math.log2(board[r+1][c]));
                    }

                    // 单调性: 鼓励形成从角落开始递减的序列 (蛇形模式的基础)
                    // 这个简单版本主要看相邻格子的值是否符合预期的大小关系
                    // 假设目标是左上角 (TARGET_CORNER), 则希望 board[r][c] > board[r][c+1] และ board[r][c] > board[r+1][c]
                    // 权重可以根据距离角落的远近调整，这里简化处理
                    let monoWeight = 4; // 基础权重
                    if (c < 3 && board[r][c+1] > 0) { // 与右边比较
                        if (cellValue > board[r][c+1]) monotonicityScore += Math.log2(cellValue) * monoWeight; // 符合预期
                        else monotonicityScore -= Math.log2(board[r][c+1]) * monoWeight; // 不符合
                    }
                    if (r < 3 && board[r+1][c] > 0) { // 与下边比较
                        if (cellValue > board[r+1][c]) monotonicityScore += Math.log2(cellValue) * monoWeight; // 符合预期
                        else monotonicityScore -= Math.log2(board[r+1][c]) * monoWeight; // 不符合
                    }
                }
            }
        }

        // 如果移动后棋盘未发生变化 (无效移动)
        if (previousBoard && boardsAreEqual(board, previousBoard)) {
            return -Infinity;
        }

        // --- 计算总分 ---
        let score = 0;
        score += emptyCells * weights.emptyCells;
        score += mergesMade * weights.merges; // mergesMade 是从 simulateMove 传来的
        score += monotonicityScore * weights.monotonicity;
        score += smoothnessScore * weights.smoothness;
        score += Math.log2(maxValue > 0 ? maxValue : 1) * weights.maxValue; // 使用log2使大数值的边际效益递减
        score += sumOfValues * weights.sumOfValues;

        // 核心策略：最大值在角落的奖励/惩罚
        if (maxValue > 0) { // 只有当棋盘非空时才有意义
            if (maxValuePos.r === TARGET_CORNER.r && maxValuePos.c === TARGET_CORNER.c) {
                score += maxValue * weights.maxValueInCorner; // 巨额奖励
            } else {
                // 如果一个比较大的数字不在目标角落，则给予惩罚
                if (maxValue >= 128) { // 例如，当最大值达到128或更高时，此惩罚生效
                    const distToCorner = Math.abs(maxValuePos.r - TARGET_CORNER.r) + Math.abs(maxValuePos.c - TARGET_CORNER.c);
                    score += weights.penaltyForNotMaxInCorner * distToCorner * (Math.log2(maxValue)/2); // 惩罚力度和距离、大小有关
                }
            }
        }

        // 对空格过少的情况进行惩罚 (避免游戏过早锁死)
        if (maxValue < 2048) { // 在达到2048之前
            if (emptyCells <= 2) score -= 350 * (3 - emptyCells) ; // 空格越少，惩罚越大
            if (emptyCells === 0) score -= 1000; // 0个空格，极度危险，重罚
        }

        // 实验性的被困惩罚 (简单版本：检查是否有无法合并的满行/列)
        for(let i=0; i<4; ++i) {
            let rowFullNoMerge = true;
            let colFullNoMerge = true;
            for(let j=0; j<3; ++j) { // 检查行
                if (board[i][j] === 0 || board[i][j+1] === 0 || board[i][j] === board[i][j+1]) rowFullNoMerge = false;
            }
            for(let j=0; j<3; ++j) { // 检查列
                if (board[j][i] === 0 || board[j+1][i] === 0 || board[j][i] === board[j+1][i]) colFullNoMerge = false;
            }
            if (rowFullNoMerge && board[i].every(cell => cell > 0)) score += weights.trappedPenalty;
            if (colFullNoMerge && board.map(row => row[i]).every(cell => cell > 0)) score += weights.trappedPenalty;
        }
        // console.log(`棋盘评分: ${score.toFixed(0)}, 空格: ${emptyCells}, 合并数: ${mergesMade}, 最大值: ${maxValue} at (${maxValuePos.r},${maxValuePos.c})`);
        return score;
    }


    async function getLocalAIMove(currentBoard) { // 本地AI决策函数
        isWaitingForAI = true;
        const directions = ['up', 'down', 'left', 'right'];
        let bestMove = null;
        let bestScore = -Infinity;
        for (const dir of directions) {
            const { newBoard, merges, moved } = simulateMove(currentBoard, dir);
            if (moved) {
                const currentScore = scoreBoardState(newBoard, merges, currentBoard);
                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestMove = dir[0];
                }
            }
        }
        isWaitingForAI = false;
        return bestMove;
    }

    // --- 游戏交互与控制 ---
    function findGameInstance() { // 查找页面上的游戏实例
        const canvas = document.getElementById('game-canvas');
        if (canvas && canvas.__vue__ && canvas.__vue__.game) { console.log("通过 Vue 实例找到游戏对象。"); return canvas.__vue__.game; }
        if (window.canvasGame && typeof window.canvasGame.board !== 'undefined') { console.log("通过 window.canvasGame 找到游戏对象。"); return window.canvasGame; }
        for (const key in window) {
             try { if (window[key] && typeof window[key].board !== 'undefined' && typeof window[key].handleMove === 'function') { console.log(`在 window.${key} 中找到游戏对象。`); return window[key]; }}
             catch (e) { /* 忽略 */ }
        }
        console.warn("未能找到游戏实例。"); return null;
    }

    function executeMove(moveChar) { // 执行AI选择的移动
        if (!gameInstance) { console.error("游戏实例未找到，无法执行移动！"); return; }
        const directionMap = { 'u': 'up', 'd': 'down', 'l': 'left', 'r': 'right' };
        const direction = directionMap[moveChar];
        if (!direction) { console.warn(`未知的AI移动字符: ${moveChar}`); return; }
        if (typeof gameInstance.handleMove === 'function') { gameInstance.handleMove(direction); }
        else { console.warn("游戏实例没有 handleMove 方法！"); }
    }

    function clickNewGameButton() { // 查找并点击 "New Game" 按钮
        let newGameButton = document.querySelector('button.game-button-restart'); // 针对 2048.linux.do
        if (!newGameButton) { // 后备查找方案
            const buttons = document.querySelectorAll('button, a');
            for (let btn of buttons) {
                const text = btn.textContent.trim().toLowerCase();
                if (text === 'new game' || text === '新游戏' || text === '重新开始') {
                    newGameButton = btn; break;
                }
            }
        }
        if (newGameButton) { console.log("找到 'New Game' 按钮，尝试点击。"); newGameButton.click(); }
        else { console.warn("未能找到 'New Game' 按钮。请检查按钮的选择器。"); }
    }

    async function autoPlayAI() { // AI自动运行的主循环
        if (!aiPlaying || !gameInstance) return;

        if (gameInstance.gameOver || gameInstance.victory) {
            const reason = gameInstance.gameOver ? "游戏结束" : "游戏胜利";
            console.log(`${reason}。将在 ${DELAY_BEFORE_NEW_GAME / 1000} 秒后尝试开始新游戏...`);
            stopAI(); // 先停止当前AI
            setTimeout(() => {
                clickNewGameButton();
                setTimeout(() => {
                    console.log("尝试重新启动AI开始新的一局。");
                    gameInstance = findGameInstance();
                    if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) {
                        startAI();
                    } else {
                        console.warn("点击 'New Game' 后游戏状态未正确重置或实例丢失。AI未重新启动。");
                        const btn = document.getElementById('ai-toggle-button');
                        if (btn) { btn.textContent = '启动AI (新局)'; btn.style.backgroundColor = '#8f7a66';}
                    }
                }, 500); // 给游戏一点时间重置
            }, DELAY_BEFORE_NEW_GAME);
            return;
        }

        if (isWaitingForAI || gameInstance.isAnimating) {
            scheduleNextAIMove(isWaitingForAI ? AI_THINK_INTERVAL : AI_DELAY_AFTER_MOVE);
            return;
        }

        const currentBoard = gameInstance.board;
        const currentBoardStr = boardToString(currentBoard);

        if (currentBoardStr === lastBoardStateString) {
            if (aiPlaying && (Date.now() - lastBoardChangeTime > STUCK_TIMEOUT_DURATION)) {
                console.warn(`游戏似乎卡住了超过 ${STUCK_TIMEOUT_DURATION / 1000} 秒。正在刷新页面...`);
                window.location.reload(); return;
            }
            scheduleNextAIMove(AI_THINK_INTERVAL / 2); return;
        }

        lastBoardStateString = currentBoardStr;
        lastBoardChangeTime = Date.now();
        const move = await getLocalAIMove(currentBoard);

        if (move) {
            executeMove(move);
            scheduleNextAIMove(AI_DELAY_AFTER_MOVE);
        } else {
            scheduleNextAIMove(AI_THINK_INTERVAL * 2);
        }
    }

    function scheduleNextAIMove(delay = AI_THINK_INTERVAL) {
        clearTimeout(aiTimer);
        aiTimer = setTimeout(autoPlayAI, delay);
    }

    function startAI() { // 启动AI
        if (!aiPlaying) {
            gameInstance = findGameInstance();
            if (!gameInstance || gameInstance.gameOver || gameInstance.victory) {
                console.warn("无法启动AI：未找到游戏实例，或游戏已结束/胜利。");
                const button = document.getElementById('ai-toggle-button');
                if (button) { button.textContent = '游戏未就绪/结束'; button.style.backgroundColor = '#e74c3c';}
                if (gameInstance && (gameInstance.gameOver || gameInstance.victory)) {
                     console.log("检测到游戏已结束，尝试自动开始新局。");
                     setTimeout(() => {
                        clickNewGameButton();
                        setTimeout(() => {
                            gameInstance = findGameInstance();
                            if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) startAI();
                        }, 500);
                     }, DELAY_BEFORE_NEW_GAME / 2);
                }
                return;
            }
            aiPlaying = true;
            console.log("2048 本地AI已启动 (高分优化尝试版)");
            lastBoardStateString = "";
            lastBoardChangeTime = Date.now();
            const button = document.getElementById('ai-toggle-button');
            if (button) { button.textContent = '停止AI'; button.style.backgroundColor = '#ee5a24';}
            scheduleNextAIMove(100);
        }
    }

    function stopAI() { // 停止AI
        if (aiPlaying) {
            aiPlaying = false;
            clearTimeout(aiTimer);
            isWaitingForAI = false;
            console.log("2048 本地AI已停止");
            // 按钮状态由点击事件或自动新局逻辑处理
        }
    }

    function addToggleButton() { // 在页面上添加一个切换AI状态的按钮
        const existingButton = document.getElementById('ai-toggle-button');
        if (existingButton) return;
        const container = document.querySelector('.game-container') || document.body;
        const button = document.createElement('button');
        button.id = 'ai-toggle-button';
        button.textContent = '启动AI';
        button.style.cssText = `display: block; margin: 10px auto; padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #8f7a66; color: #f9f6f2; border: none; border-radius: 4px; z-index: 10000;`;
        button.addEventListener('click', () => {
            if (aiPlaying) {
                stopAI(); // 手动停止时，更新按钮状态
                const btn = document.getElementById('ai-toggle-button');
                if(btn) { btn.textContent = '启动AI'; btn.style.backgroundColor = '#8f7a66';}
            } else {
                startAI();
            }
        });
        if (container.firstChild && container.id === 'game-container' && container.parentNode) {
             container.parentNode.insertBefore(button, container.nextSibling);
        } else {
            container.insertBefore(button, container.firstChild);
        }
    }

    function initialize() { // 初始化脚本
        console.log("2048 本地AI脚本 (高分优化尝试/自动开始/刷新/新局/中文版) 尝试初始化...");
        addToggleButton();
        gameInstance = findGameInstance();
        if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) {
            console.log("成功找到2048游戏实例且游戏未结束。AI将自动启动。");
            startAI();
        } else if (gameInstance && (gameInstance.gameOver || gameInstance.victory)) {
            console.log("找到游戏实例，但游戏已结束/胜利。AI不会自动启动。将尝试自动开始新局。");
             setTimeout(() => {
                clickNewGameButton();
                setTimeout(() => {
                    gameInstance = findGameInstance();
                    if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) startAI();
                    else {
                         const button = document.getElementById('ai-toggle-button');
                         if (button) button.textContent = '启动AI (新局)';
                    }
                }, 500);
             }, DELAY_BEFORE_NEW_GAME / 2);
        } else {
            console.log("未能找到2048游戏实例，或游戏已结束。AI不会自动启动。请在游戏加载/新局开始后点击按钮。");
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }
})();
