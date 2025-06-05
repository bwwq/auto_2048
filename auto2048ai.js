// ==UserScript==
// @name         2048 AI 助手 (Linux.do) - 自动开启/快速/自动重启
// @namespace    http://tampermonkey.net/
// @version      0.8-CN
// @description  默认自动开启AI，在 2048.linux.do 上使用AI服务器自动玩2048。速度更快，卡顿时自动刷新，游戏结束后自动开始新游戏。
// @author       ChatGPT & 您
// @match        https://2048.linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const AI_SERVER_URL = 'https://你的域名反代到2048/move?board=';
    const AUTO_PLAY_INTERVAL = 500;    // AI移动尝试之间的间隔（毫秒）- 非常快
    const AI_DELAY_AFTER_MOVE = 300;   // 执行一次移动后，在再次请求AI之前的额外延迟（毫秒）- 非常短
    const STUCK_TIMEOUT = 3000;       // 如果这么长时间（毫秒）没有活动，则刷新页面
    const STUCK_CHECK_INTERVAL = 1000;// 检查卡顿的频率（毫秒）
    const INITIAL_START_DELAY = 1500; // 初始自动启动AI的延迟（毫秒）
    const RETRY_INTERVAL_MS = 1500;   // 查找游戏实例的重试间隔（毫秒）
    const MAX_RETRIES = 10;            // 最大重试次数
    const DELAY_BEFORE_NEW_GAME = 500; // 游戏结束后等待时间 (来自您的脚本)
    const DELAY_AFTER_NEW_GAME_CLICK = 500; // 点击新游戏按钮后等待AI启动的时间

    let gameInstance = null;
    let aiPlaying = false;
    let lastBoardState = ""; // 使用十六进制棋盘状态
    let aiTimer = null;
    let isWaitingForAI = false;
    let lastActivityTime = Date.now(); // 用于卡顿检测
    let stuckCheckTimer = null;
    // --- 卡顿检测与自动刷新 ---
    function resetActivityTimer() {
        lastActivityTime = Date.now();
    }
    function checkStuckAndRefresh() {
        if (aiPlaying && (Date.now() - lastActivityTime > STUCK_TIMEOUT)) {
            console.warn(`AI似乎卡顿超过 ${STUCK_TIMEOUT / 1000}秒。正在刷新页面。`);
            stopAI();
            location.reload();
        }
    }
    // --- 游戏交互 ---
    function findGameInstance() {
        const canvas = document.getElementById('game-canvas');
        if (canvas && canvas.__vue__ && canvas.__vue__.game) { console.log("通过 Vue 实例找到游戏对象。"); return canvas.__vue__.game; }
        if (window.canvasGame && typeof window.canvasGame.board !== 'undefined') { console.log("通过 window.canvasGame 找到游戏对象。"); return window.canvasGame; }
        for (const key in window) {
             try { if (window[key] && typeof window[key].board !== 'undefined' && typeof window[key].handleMove === 'function' && typeof window[key].restart === 'function') { console.log(`在 window.${key} 中找到游戏对象。`); return window[key]; }}
             catch (e) { /* 忽略 */ }
        }
        console.warn("未能找到游戏实例。"); return null;
    }
    function boardToHexExponent(board) {
        let hexString = "";
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const value = board[row][col];
                hexString += (value === 0) ? '0' : Math.round(Math.log2(value)).toString(16).toUpperCase();
            }
        }
        return hexString;
    }
    async function getAIMoveFromServer(boardHex) { // Renamed from getAIMove to avoid confusion if you integrate local AI later
        const url = `${AI_SERVER_URL}${boardHex}`;
        try {
            const response = await fetch(url);
            resetActivityTimer();
            if (!response.ok) throw new Error(`HTTP错误! 状态: ${response.status}`);
            const move = await response.text();
            return move;
        } catch (error) {
            console.error("获取AI移动时出错:", error);
            return null;
        }
    }
    function executeMove(moveChar) {
        if (!gameInstance) { console.error("游戏实例未找到，无法执行移动！"); return false; } // Return false on failure
        const directionMap = { 'u': 'up', 'd': 'down', 'l': 'left', 'r': 'right' };
        const direction = directionMap[moveChar];
        if (!direction) {
            if (moveChar === 'g') { // AI Server signals game over
                console.log("AI服务器指示游戏结束 ('g')。");
                // The main loop will detect gameInstance.gameOver and trigger new game.
                return true; // Considered a successful "move" in terms of AI response
            }
            console.warn(`未知的AI移动字符: ${moveChar}`);
            return false; // Return false on failure
        }
        if (typeof gameInstance.handleMove === 'function') {
            gameInstance.handleMove(direction);
            resetActivityTimer();
            return true; // Return true on success
        }
        console.error("游戏实例没有 handleMove 方法！");
        return false; // Return false on failure
    }
    // --- 新游戏逻辑 (采纳您脚本的方式) ---
    function clickNewGameButton() {
        let newGameButton = document.querySelector('button.game-button-restart');
        if (!newGameButton) {
            const buttons = document.querySelectorAll('button, a');
            for (let btn of buttons) {
                const text = btn.textContent.trim().toLowerCase();
                if (text === 'new game' || text === '新游戏' || text === '重新开始') {
                    newGameButton = btn; break;
                }
            }
        }
        if (newGameButton) {
            console.log("找到 'New Game' 按钮，尝试点击。");
            newGameButton.click();
            return true;
        } else {
            console.warn("未能找到 'New Game' 按钮。请检查按钮的选择器。");
            return false;
        }
    }
    function handleGameOverOrVictory() {
        const reason = gameInstance.gameOver ? "游戏结束" : "游戏胜利";
        console.log(`${reason}。将在 ${DELAY_BEFORE_NEW_GAME / 1000} 秒后尝试开始新游戏...`);
        stopAI(false); // 停止当前AI循环，但不立即更新按钮为“启动AI”
        setTimeout(() => {
            if (clickNewGameButton()) {
                setTimeout(() => {
                    console.log("尝试重新启动AI开始新的一局。");
                    gameInstance = findGameInstance(); // 重新获取实例
                    if (gameInstance && !gameInstance.gameOver && !gameInstance.victory) {
                        startAI(true); // 传入一个标记表示是自动重启
                    } else {
                        console.warn("点击 'New Game' 后游戏状态未正确重置或实例丢失。AI未重新启动。");
                        const btn = document.getElementById('ai-toggle-button');
                        if (btn) {
                            btn.textContent = '启动AI (新局)';
                            btn.style.backgroundColor = '#8f7a66';
                        }
                        aiPlaying = false; // 确保AI状态正确
                    }
                }, DELAY_AFTER_NEW_GAME_CLICK); // 给游戏一点时间重置
            } else {
                // 如果找不到新游戏按钮，则无法自动开始新局
                console.error("无法自动开始新局，因为找不到'New Game'按钮。");
                const btn = document.getElementById('ai-toggle-button');
                if (btn) { // 确保按钮恢复到可启动状态
                     btn.textContent = '启动 AI';
                     btn.style.backgroundColor = '#8f7a66';
                }
                aiPlaying = false; // 确保AI状态正确
            }
        }, DELAY_BEFORE_NEW_GAME);
    }
    // --- AI主循环 ---
    async function autoPlayAI() {
        if (!aiPlaying || !gameInstance) return;
        if (isWaitingForAI) {
            scheduleNextAIMove(AUTO_PLAY_INTERVAL);
            return;
        }
        // 优先处理游戏结束/胜利
        if (gameInstance.gameOver || gameInstance.victory) {
            handleGameOverOrVictory();
            return; // 由 handleGameOverOrVictory 处理后续
        }
        const currentBoard = gameInstance.board;
        if (!currentBoard) {
            console.warn("无法从 gameInstance 获取棋盘。");
            scheduleNextAIMove(AUTO_PLAY_INTERVAL * 5);
            return;
        }
        const currentBoardHex = boardToHexExponent(currentBoard); // 使用十六进制棋盘
        if (gameInstance.isAnimating) {
            scheduleNextAIMove(AI_DELAY_AFTER_MOVE / 2);
            return;
        }
        // 如果棋盘状态未改变 (并且不是因为AI服务器返回'g'导致的游戏结束)
        if (currentBoardHex === lastBoardState) {
            scheduleNextAIMove(AUTO_PLAY_INTERVAL);
            return;
        }
        resetActivityTimer(); // 棋盘状态已改变或即将请求AI
        lastBoardState = currentBoardHex;
        isWaitingForAI = true;
        const move = await getAIMoveFromServer(currentBoardHex); // 调用服务器AI
        isWaitingForAI = false;
        if (move) {
            if (executeMove(move)) { // executeMove 现在也处理 'g'
                // 如果是 'g'，下一个循环的 gameOver 检查会处理新游戏
                // 如果是有效移动，则正常调度
                scheduleNextAIMove(AI_DELAY_AFTER_MOVE);
            } else {
                console.warn("执行AI移动失败或未知移动，稍后重试...");
                scheduleNextAIMove(AUTO_PLAY_INTERVAL * 2);
            }
        } else {
            console.warn("获取AI移动失败，稍后重试...");
            scheduleNextAIMove(AUTO_PLAY_INTERVAL * 5);
        }
    }
    function scheduleNextAIMove(delay = AUTO_PLAY_INTERVAL) {
        clearTimeout(aiTimer);
        if (aiPlaying) {
            aiTimer = setTimeout(autoPlayAI, delay);
        }
    }
    // --- AI启停与UI ---
    function startAI(isAutoRestart = false) { // 添加参数以区分用户点击启动和自动重启
        const button = document.getElementById('ai-toggle-button');
        if (aiPlaying && !isAutoRestart) { // 如果是自动重启，即使aiPlaying为true也继续（因为它在stopAI时可能未完全重置）
            console.log("AI已经在运行。");
            return;
        }
        console.log("尝试启动 2048 AI 玩家...");
        if (!isAutoRestart) gameInstance = findGameInstance(); // 重新获取实例，除非是自动重启（此时实例已在handleGameOver中获取）
        if (!gameInstance) {
            console.error("无法启动AI：未找到游戏实例。");
            if (button) {
                button.textContent = '游戏未就绪';
                button.style.backgroundColor = '#e74c3c';
            }
            aiPlaying = false; // 确保状态正确
            return;
        }
        // 如果是手动点击启动，但游戏已结束
        if (!isAutoRestart && (gameInstance.gameOver || gameInstance.victory)) {
            console.log("游戏已结束。将尝试开始新的一局，然后启动AI。");
            handleGameOverOrVictory(); // 这会处理新游戏并最终调用 startAI(true)
            return;
        }
        aiPlaying = true;
        lastBoardState = ""; // 重置棋盘状态，以便首次运行时获取AI移动
        isWaitingForAI = false;
        resetActivityTimer();
        if (stuckCheckTimer) clearInterval(stuckCheckTimer);
        stuckCheckTimer = setInterval(checkStuckAndRefresh, STUCK_CHECK_INTERVAL);
        console.log("2048 AI 玩家已启动");
        if (button) {
            button.textContent = '停止 AI';
            button.style.backgroundColor = '#ee5a24';
        }
        scheduleNextAIMove(100);
    }
    function stopAI(updateButton = true) { // 添加参数控制是否更新按钮
        if (aiPlaying || updateButton) { // 即使aiPlaying为false，如果需要更新按钮也执行
            aiPlaying = false;
            clearTimeout(aiTimer);
            clearInterval(stuckCheckTimer);
            stuckCheckTimer = null;
            isWaitingForAI = false;
            console.log("2048 AI 玩家已停止");
            if (updateButton) {
                const button = document.getElementById('ai-toggle-button');
                if (button) {
                    button.textContent = '启动 AI';
                    button.style.backgroundColor = '#8f7a66';
                }
            }
        }
    }
    function addToggleButton() {
        if (document.getElementById('ai-toggle-button')) return;
        const button = document.createElement('button');
        button.id = 'ai-toggle-button';
        button.textContent = '启动 AI';
        button.style.cssText = `
            position: fixed; bottom: 10px; left: 10px;
            padding: 10px 20px; font-size: 16px; cursor: pointer;
            background-color: #8f7a66; color: #f9f6f2;
            border: none; border-radius: 4px; z-index: 10000;`;
        button.addEventListener('click', () => {
            if (aiPlaying) {
                stopAI();
            } else {
                startAI(); // 用户点击启动
            }
        });
        const container = document.querySelector('.game-container');
        if (container && container.parentNode) {
             button.style.position = 'static';
             button.style.display = 'block';
             button.style.margin = '10px auto';
             container.parentNode.insertBefore(button, container.nextSibling);
             console.log("AI切换按钮已添加到游戏容器后。");
        } else {
            document.body.appendChild(button);
            console.warn("未能找到游戏容器，AI切换按钮已添加到 body (后备方案)。");
        }
    }
    function initialize() {
        console.log(`2048 AI 助手 (v0.8.1-CN) 初始化...`);
        addToggleButton();
        let attempts = 0;
        const tryAutoStart = () => {
            attempts++;
            console.log(`尝试自动启动AI (第 ${attempts} 次)`);
            gameInstance = findGameInstance();
            if (gameInstance) {
                if (gameInstance.gameOver || gameInstance.victory) {
                    console.log("游戏实例已找到，但游戏已结束。将尝试自动开始新局。");
                    handleGameOverOrVictory(); // 这会处理新游戏并最终调用 startAI(true)
                } else {
                    console.log("游戏实例已找到且游戏未结束。将自动启动 AI。");
                    startAI(true); // 自动启动
                }
                return;
            }
            if (attempts < MAX_RETRIES) {
                console.log(`未找到游戏实例，将在 ${RETRY_INTERVAL_MS / 1000} 秒后重试...`);
                setTimeout(tryAutoStart, RETRY_INTERVAL_MS);
            } else {
                console.warn(`已达到最大重试次数 (${MAX_RETRIES})。未能自动启动AI。请手动点击按钮。`);
                const button = document.getElementById('ai-toggle-button');
                if (button && button.textContent === '启动 AI') {
                    button.textContent = '游戏未就绪';
                    button.style.backgroundColor = '#e74c3c';
                }
            }
        };
        setTimeout(tryAutoStart, INITIAL_START_DELAY);
    }
    initialize();
})();
