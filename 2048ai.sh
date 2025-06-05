#!/bin/bash

# --- 配置 ---
REPO_URL="https://github.com/macroxue/2048-ai.git"
REPO_DIR_NAME="2048-ai-local-server" # 本地克隆的目录名
AI_EXECUTABLE_NAME="2048" # 或 "2048b" (2048b 更强但首次运行生成表非常慢)
SERVER_PORT="2048"
# --- END 配置 ---

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 函数：检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 函数：打印错误并退出
error_exit() {
    echo -e "${RED}错误: $1${NC}" >&2
    exit 1
}

# 函数：打印信息
info() {
    echo -e "${GREEN}$1${NC}"
}

# 函数：打印警告
warn() {
    echo -e "${YELLOW}$1${NC}"
}

# 1. 检查依赖
info "1. 正在检查依赖..."
if ! command_exists git; then
    error_exit "git 未安装。请先安装 git (例如: sudo apt install git)"
fi
if ! command_exists g++; then
    error_exit "g++ 未安装。请先安装 g++ (例如: sudo apt install g++)"
fi
if ! command_exists make; then
    error_exit "make 未安装。请先安装 make (例如: sudo apt install make)"
fi
info "依赖检查完毕。"
echo

# 2. 克隆或更新项目
info "2. 准备克隆/更新项目 '${REPO_DIR_NAME}'..."
if [ -d "$REPO_DIR_NAME" ]; then
    warn "目录 '$REPO_DIR_NAME' 已存在。将尝试更新。"
    cd "$REPO_DIR_NAME" || error_exit "无法进入目录 '$REPO_DIR_NAME'"
    git pull || warn "git pull 失败，可能需要手动解决冲突。"
else
    git clone "$REPO_URL" "$REPO_DIR_NAME" || error_exit "克隆仓库失败。"
    cd "$REPO_DIR_NAME" || error_exit "无法进入新克隆的目录 '$REPO_DIR_NAME'"
fi
info "项目准备完毕。"
echo

# 3. 编译项目
info "3. 正在编译 AI (make)... 这可能需要一些时间。"
make clean # 清理旧的编译产物
make "$AI_EXECUTABLE_NAME" || make # 尝试编译指定AI，如果失败则编译所有
if [ ! -f "$AI_EXECUTABLE_NAME" ]; then
    error_exit "编译失败，未找到可执行文件 '$AI_EXECUTABLE_NAME'。"
fi
info "编译完成。"
echo

# 4. 运行 AI 服务器
info "4. 正在启动 AI 服务器..."
warn "注意：第一次运行 '$AI_EXECUTABLE_NAME' 时，它可能需要几分钟（对于 '$AI_EXECUTABLE_NAME'）"
warn "甚至更长时间（对于 '2048b'）来计算和保存查找表。请耐心等待直到看到 'Server ready'。"
echo -e "${YELLOW}AI 服务器将使用可执行文件: ./${AI_EXECUTABLE_NAME}${NC}"
echo -e "${YELLOW}服务器端口: ${SERVER_PORT}${NC}"
echo -e "${YELLOW}要停止服务器，请按 Ctrl+C。${NC}"
echo

# 启动服务器
# 参数 -S <port> 表示服务器模式和端口
# 参数 -I 表示启用交互模式 (服务器会打印更多信息)
./"$AI_EXECUTABLE_NAME" -S "$SERVER_PORT" -I &
SERVER_PID=$!

# 简单的等待，让服务器有时间启动并显示 "Server ready"
# 你也可以监控服务器日志输出以获得更精确的准备就绪信号
sleep 5 # 等待几秒钟，让用户看到启动信息

# 5. 提供指示
info "5. 配置 Tampermonkey 脚本:"
echo "-------------------------------------------------------------------"
echo "请打开你的 Tampermonkey 用户脚本进行编辑，然后修改 `AI_SERVER_URL`："
echo
echo -e "将原来的："
echo -e "   ${YELLOW}const AI_SERVER_URL = 'https://2048.be-a.dev/move?board=';${NC}"
echo
echo -e "修改为："
echo -e "   ${GREEN}const AI_SERVER_URL = 'http://localhost:${SERVER_PORT}/move?board=';${NC}"
echo
echo "保存脚本后，刷新 2048.linux.do 页面即可使用本地 AI。"
echo "-------------------------------------------------------------------"
echo
info "AI 服务器正在后台运行 (PID: $SERVER_PID)。"
info "如果看到 'Server ready' 或类似消息，说明服务器已准备好。"
info "你可以通过访问 http://localhost:${SERVER_PORT}/ping (如果AI支持) 来测试服务器是否运行。"
warn "要停止 AI 服务器，请回到此终端并按 Ctrl+C (如果它在前台运行)，"
warn "或者使用命令: kill $SERVER_PID"

# 让脚本保持运行，这样用户可以看到输出，直到他们手动停止服务器
# 或者，你可以让脚本在这里退出，服务器会在后台继续运行
wait $SERVER_PID
info "AI 服务器已停止。"
