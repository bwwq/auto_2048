// ==UserScript==
// @name         2048 AI 玩家 (Linux.do) - 本地AI - 自动开始/刷新/新局 - 中文优化版
// @namespace    http://tampermonkey.net/
// @version      1.0 CN AutoNewGame
// @description  在 2048.linux.do 网站上使用本地AI自动玩2048。自动开始，卡住时自动刷新，结束后自动开始新局。中文注释和优化。
// @author       ChatGPT & 您
// @match        https://2048.linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置常量 ---
    const AI_THINK_INTERVAL = 0;
    const AI_DELAY_AFTER_MOVE = 0;
    const STUCK_TIMEOUT_DURATION = 3000;
    const DELAY_BEFORE_NEW_GAME = 2000; // 游戏结束后等待2秒再开始新游戏 (毫秒)

    // ... (其他全局变量和函数定义保持不变，直到 autoPlayAI) ...
    // --- 全局变量 ---
    let gameInstance = null;              // 游戏实例
    let aiPlaying = false;                // AI 是否正在运行
    let lastBoardStateString = "";        // 上一个棋盘状态的字符串表示，用于比较变化
    let aiTimer = null;                   // AI 的定时器
    let isWaitingForAI = false;           // 标志位：是否正在等待AI计算结果，防止重复计算
    let lastBoardChangeTime = 0;          // 上次棋盘发生变化的时间戳，用于检测卡死

    // --- 棋盘操作工具函数 ---
    function copyBoard(board) {
        return board.map(row => [...row]);
    }

    function boardsAreEqual(board1, board2) {
        if (!board1 || !board2 || board1.length !== 4 || board2.length !== 4) return false;
        for (let i = 0; i < 4; i++) {
            if (board1[i].length !== 4 || board2[i].length !== 4) return false;
            for (let j = 0; j < 4; j++) {
                if (board1[i][j] !== board2[i][j]) {
                    return false;
                }
            }
        }
        return true;
    }

    function boardToString(board) {
        if (!board || board.length === 0) return "";
        return board.map(row => row.join(',')).join(';');
    }

    // --- 核心AI逻辑 ---
    function processLine(line) {
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
        while (newLine.length < 4) {
            newLine.push(0);
        }
        return { newLine, merges, scoreChange };
    }

    function simulateMove(board, direction) {
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

    function scoreBoardState(board, mergesMade, previousBoard) {
        let emptyCells = 0, monotonicity = 0, smoothness = 0, maxValue = 0;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const cellValue = board[i][j];
                if (cellValue === 0) emptyCells++;
                maxValue = Math.max(maxValue, cellValue);
                if (cellValue > 0) {
                    monotonicity += cellValue * ((3 - i) + j);
                    if (j < 3 && board[i][j+1] > 0) smoothness -= Math.abs(Math.log2(cellValue) - Math.log2(board[i][j+1]));
                    if (i < 3 && board[i+1][j] > 0) smoothness -= Math.abs(Math.log2(cellValue) - Math.log2(board[i+1][j]));
                }
            }
        }
        const emptyCellWeight = 250, mergeWeight = 300, monotonicityWeight = 15, smoothnessWeight = 10, maxValueWeight = 100;
        if (previousBoard && boardsAreEqual(board, previousBoard)) return -Infinity;
        let score = (emptyCells * emptyCellWeight) + (mergesMade * mergeWeight) + (monotonicity * monotonicityWeight) + (smoothness * smoothnessWeight) + (Math.log2(maxValue > 0 ? maxValue : 1) * maxValueWeight);
        if (maxValue < 2048 && emptyCells < 2) score -= 500;
        if (maxValue < 2048 && emptyCells === 0) score -= 1000;
        return score;
    }

    async function getLocalAIMove(currentBoard) {
        isWaitingForAI = true;
        const directions = ['up', 'down', 'left', 'right'];
        let bestMove = null, bestScore = -Infinity;
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
    function findGameInstance() {
        const canvas = document.getElementById('game-canvas');
        if (canvas && canvas.__vue__ && canvas.__vue__.game) { console.log("通过 Vue 实例找到游戏对象。"); return canvas.__vue__.game; }
        if (window.canvasGame && typeof window.canvasGame.board !== 'undefined') { console.log("通过 window.canvasGame 找到游戏对象。"); return window.canvasGame; }
        for (const key in window) {
             try { if (window[key] && typeof window[key].board !== 'undefined' && typeof window[key].handleMove === 'function') { console.log(`在 window.${key} 中找到游戏对象。`); return window[key]; }}
             catch (e) { /* 忽略 */ }
        }
        console.warn("未能找到游戏实例。"); return null;
    }

    function executeMove(moveChar) {
        if (!gameInstance) { console.error("游戏实例未找到，无法执行移动！"); return; }
        const directionMap = { 'u': 'up', 'd': 'down', 'l': 'left', 'r': 'right' };
        const direction = directionMap[moveChar];
        if (!direction) { console.warn(`未知的AI移动字符: ${moveChar}`); return; }
        if (typeof gameInstance.handleMove === 'function') { gameInstance.handleMove(direction); }
        else { console.warn("游戏实例没有 handleMove 方法！尝试模拟键盘事件。"); /* ... fallback ... */ }
    }

    /**
     * 查找并点击 "New Game" 按钮
     */
    function clickNewGameButton() {
        // 尝试多种选择器来定位 "New Game" 按钮
        // 优先使用ID (如果知道的话)
        // let newGameButton = document.getElementById('id-of-new-game-button');

        // 按类名查找 (常见的类名)
        let newGameButton = document.querySelector('.restart-button') ||
                            document.querySelector('.new-game-button') ||
                            document.querySelector('button.game-button-restart'); // 根据实际情况调整

        // 按文本内容查找 (作为后备)
        if (!newGameButton) {
            const buttons = document.querySelectorAll('button, a'); // 查找所有按钮和链接
            for (let btn of buttons) {
                if (btn.textContent.trim().toLowerCase() === 'new game' ||
                    btn.textContent.trim().toLowerCase() === '新游戏' || // 考虑中文界面
                    btn.textContent.trim().toLowerCase() === '重新开始') {
                    newGameButton = btn;
                    break;
                }
            }
        }

        // 针对 2048.linux.do 的特定按钮
        // 检查页面发现 "New Game" 按钮是 <button class="game-button game-button-restart">New Game</button>
        if (!newGameButton) {
            newGameButton = document.querySelector('button.game-button-restart');
        }


        if (newGameButton) {
            console.log("找到 'New Game' 按钮，尝试点击。");
            newGameButton.click();
            // 点击后，AI应该在下一次循环或短暂延迟后重新评估并开始游戏
            // lastBoardStateString 需要重置，startAI会做这个
        } else {
            console.warn("未能找到 'New Game' 按钮。请检查按钮的选择器。");
        }
    }

    /**
     * AI自动运行的主循环
     */
    async function autoPlayAI() {
        if (!aiPlaying || !gameInstance) {
            return;
        }

        // 检查游戏是否结束或胜利
        if (gameInstance.gameOver || gameInstance.victory) {
            if (gameInstance.gameOver) {
                console.log("游戏结束。将在 " + (DELAY_BEFORE_NEW_GAME / 1000) + " 秒后尝试开始新游戏...");
            } else if (gameInstance.victory) {
                console.log("游戏胜利！将在 " + (DELAY_BEFORE_NEW_GAME / 1000) + " 秒后尝试开始新游戏...");
            }

            stopAI(); // 先停止当前AI循环

            setTimeout(() => {
                clickNewGameButton(); // 点击新游戏按钮
                // 等待游戏状态真正重置后再启动AI
                setTimeout(() => {
                    console.log("尝试重新启动AI开始新的一局。");
                    gameInstance = findGameInstance(); // 确保获取最新的实例
                    if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) { // 确保游戏已重置
                        startAI();
                    } else {
                        console.warn("点击 'New Game' 后游戏状态未正确重置，或未能找到新实例。AI未重新启动。");
                        // 可以在这里再尝试一次，或者让用户手动启动
                        const button = document.getElementById('ai-toggle-button');
                        if (button) {
                            button.textContent = '启动AI (新局)';
                            button.style.backgroundColor = '#8f7a66';
                        }
                    }
                }, 500); // 给游戏一点时间重置状态

            }, DELAY_BEFORE_NEW_GAME);
            return;
        }

        if (isWaitingForAI) {
            scheduleNextAIMove(AI_THINK_INTERVAL);
            return;
        }
        if (gameInstance.isAnimating) {
            scheduleNextAIMove(AI_DELAY_AFTER_MOVE);
            return;
        }

        const currentBoard = gameInstance.board;
        const currentBoardStr = boardToString(currentBoard);

        if (currentBoardStr === lastBoardStateString) {
            if (aiPlaying && (Date.now() - lastBoardChangeTime > STUCK_TIMEOUT_DURATION)) {
                console.warn(`游戏似乎卡住了超过 ${STUCK_TIMEOUT_DURATION / 1000} 秒。正在刷新页面...`);
                window.location.reload();
                return;
            }
            scheduleNextAIMove(AI_THINK_INTERVAL / 2);
            return;
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

    function startAI() {
        if (!aiPlaying) {
            gameInstance = findGameInstance();
            if (!gameInstance || gameInstance.gameOver || gameInstance.victory) { // 也检查游戏是否已结束
                console.warn("无法启动AI：未找到游戏实例，或游戏已结束/胜利。请先开始新游戏。");
                const button = document.getElementById('ai-toggle-button');
                if (button) {
                    button.textContent = '游戏未就绪/结束';
                    button.style.backgroundColor = '#e74c3c';
                }
                // 如果游戏已结束，可以尝试自动点击新游戏
                if (gameInstance && (gameInstance.gameOver || gameInstance.victory)) {
                     console.log("检测到游戏已结束，尝试自动开始新局。");
                     setTimeout(() => {
                        clickNewGameButton();
                        setTimeout(() => { // 给点时间重置
                            gameInstance = findGameInstance();
                            if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) startAI();
                        }, 500);
                     }, DELAY_BEFORE_NEW_GAME / 2); // 稍快一点尝试
                }
                return;
            }

            aiPlaying = true;
            console.log("2048 本地AI已启动");
            lastBoardStateString = ""; // 确保首次运行时会获取棋盘
            lastBoardChangeTime = Date.now();
            const button = document.getElementById('ai-toggle-button');
            if (button) {
                button.textContent = '停止AI';
                button.style.backgroundColor = '#ee5a24';
            }
            scheduleNextAIMove(100);
        }
    }

    function stopAI() {
        if (aiPlaying) {
            aiPlaying = false;
            clearTimeout(aiTimer);
            isWaitingForAI = false;
            console.log("2048 本地AI已停止");
            // 不改变按钮文本，除非是明确的手动停止
            // const button = document.getElementById('ai-toggle-button');
            // if (button) {
            //     button.textContent = '启动AI';
            //     button.style.backgroundColor = '#8f7a66';
            // }
        }
    }

    function addToggleButton() {
        const existingButton = document.getElementById('ai-toggle-button');
        if (existingButton) return;
        const container = document.querySelector('.game-container') || document.body;
        const button = document.createElement('button');
        button.id = 'ai-toggle-button';
        button.textContent = '启动AI';
        button.style.cssText = `
            display: block; margin: 10px auto; padding: 10px 20px;
            font-size: 16px; cursor: pointer; background-color: #8f7a66;
            color: #f9f6f2; border: none; border-radius: 4px; z-index: 10000;
        `;
        button.addEventListener('click', () => {
            if (aiPlaying) {
                stopAI(); // 手动停止时，更新按钮状态
                const btn = document.getElementById('ai-toggle-button');
                if(btn) {
                    btn.textContent = '启动AI';
                    btn.style.backgroundColor = '#8f7a66';
                }
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

    function initialize() {
        console.log("2048 本地AI脚本 (自动开始/刷新/新局/中文版) 尝试初始化...");
        addToggleButton();
        gameInstance = findGameInstance();
        if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) { // 增加判断，如果游戏已经结束则不自动开始
            console.log("成功找到2048游戏实例且游戏未结束。AI将自动启动。");
            startAI();
        } else if (gameInstance && (gameInstance.gameOver || gameInstance.victory)) {
            console.log("找到游戏实例，但游戏已结束/胜利。AI不会自动启动。将尝试自动开始新局。");
             setTimeout(() => {
                clickNewGameButton();
                setTimeout(() => { // 给点时间重置
                    gameInstance = findGameInstance();
                    if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) startAI();
                    else {
                         const button = document.getElementById('ai-toggle-button');
                         if (button) button.textContent = '启动AI (新局)';
                    }
                }, 500);
             }, DELAY_BEFORE_NEW_GAME / 2); // 稍快一点尝试
        }
        else {
            console.log("未能找到2048游戏实例，或游戏已结束。AI不会自动启动。请在游戏加载/新局开始后点击按钮。");
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }

})();
