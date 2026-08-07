#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《大千修仙界》一键启动脚本
====================================
功能：检查环境 → 安装依赖 → 构建内部包(contracts/engine/persistence) → 启动开发服务器 → 可选打开浏览器

用法：
    python start.py               # 完整启动（检查 + 安装 + 构建 + dev server）
    python start.py --no-build    # 跳过内部包构建（源码未改动时加速启动）
    python start.py --no-install  # 跳过依赖安装检查
    python start.py --open        # 启动后自动打开浏览器
    python start.py --port 8080   # 指定开发服务器端口（默认 5173）

退出：按 Ctrl+C 停止开发服务器。
"""

import argparse
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_PACKAGE = "@taosim/taosim-ui"
BUILD_PACKAGES = ["@taosim/contracts", "@taosim/engine", "@taosim/persistence"]
NODE_MIN_MAJOR = 20


# ---------------- 输出辅助 ----------------

def _ensure_utf8_console() -> None:
    """Windows 下将控制台代码页切到 UTF-8（cp65001）并同步 Python 输出编码，
    避免本脚本及 npm/vite 子进程的中文输出在 GBK 控制台显示乱码。"""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        ctypes.windll.kernel32.SetConsoleCP(65001)
    except Exception:
        pass
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass


def log(msg: str, kind: str = "info") -> None:
    prefix = {
        "step": "[步骤]",
        "ok": "[成功]",
        "warn": "[警告]",
        "err": "[错误]",
        "info": "[信息]",
    }
    print(f"{prefix.get(kind, '[信息]')} {msg}")


def die(msg: str) -> None:
    log(msg, "err")
    sys.exit(1)


# ---------------- 命令执行 ----------------

def _npm_base() -> list[str]:
    """返回可执行的 npm 前缀命令（Windows 下 .cmd 需经 cmd.exe 解析）。"""
    npm = shutil.which("npm")
    if not npm:
        die("未找到 npm，请先安装 Node.js：https://nodejs.org/")
    if sys.platform == "win32":
        return ["cmd.exe", "/c", npm]
    return [npm]


def run(cmd: list[str], cwd: str = ROOT, check: bool = True) -> subprocess.CompletedProcess:
    log("执行: " + " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check)


def run_npm(args: list[str], cwd: str = ROOT, check: bool = True) -> subprocess.CompletedProcess:
    return run(_npm_base() + args, cwd=cwd, check=check)


# ---------------- 各启动步骤 ----------------

def check_tools() -> None:
    """检查 node / npm / python 版本。"""
    log("检查运行环境...")
    node = shutil.which("node")
    if not node:
        die("未找到 node，请先安装 Node.js：https://nodejs.org/")

    try:
        ver = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except subprocess.CalledProcessError:
        die("node --version 执行失败，请检查 Node.js 安装。")
    major = int(ver.lstrip("v").split(".")[0])
    log(f"Node.js {ver}（要求主版本 >= {NODE_MIN_MAJOR}）")
    if major < NODE_MIN_MAJOR:
        log(f"Node.js 版本过低，开发服务器可能无法运行，建议升级到 {NODE_MIN_MAJOR}+", "warn")


def ensure_dependencies(no_install: bool) -> None:
    """node_modules 缺失时安装依赖（lockfile 存在用 npm ci，否则 npm install）。"""
    node_modules = os.path.join(ROOT, "node_modules")
    if no_install:
        log("已指定 --no-install，跳过依赖检查。", "warn")
        if not os.path.isdir(node_modules):
            die("node_modules 不存在，且指定了 --no-install，无法启动。请去掉该参数或手动执行 npm install。")
        return

    if os.path.isdir(node_modules):
        log("依赖已安装，跳过。")
        return

    log("首次运行，安装依赖（可能需要几分钟）...")
    if os.path.exists(os.path.join(ROOT, "package-lock.json")):
        run_npm(["ci"])
    else:
        run_npm(["install"])


def build_packages(no_build: bool) -> None:
    """构建三个内部包，生成 UI 引用的 dist 产物。"""
    if no_build:
        log("已指定 --no-build，跳过内部包构建。")
        return

    log("构建内部包（contracts / engine / persistence）...")
    run_npm(["run", "build", "-w", BUILD_PACKAGES[0], "-w", BUILD_PACKAGES[1], "-w", BUILD_PACKAGES[2]])
    log("内部包构建完成。", "ok")


def start_dev_server(port: int, open_browser: bool) -> None:
    """启动 Vite 开发服务器并阻塞，Ctrl+C 时优雅退出。"""
    log(f"启动开发服务器（端口 {port}）...")
    cmd = _npm_base() + ["run", "dev", "-w", APP_PACKAGE, "--", "--port", str(port)]
    url = f"http://localhost:{port}/"

    proc = subprocess.Popen(cmd, cwd=ROOT)
    try:
        if open_browser:
            import webbrowser  # 延迟导入：仅 --open 时依赖浏览器模块
            time.sleep(2.5)  # 等 dev server 就绪
            log(f"打开浏览器：{url}")
            webbrowser.open(url)
        proc.wait()
    except KeyboardInterrupt:
        log("收到 Ctrl+C，正在停止开发服务器...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        log("已停止。再见！")
        sys.exit(0)


# ---------------- 入口 ----------------

def main() -> None:
    _ensure_utf8_console()
    parser = argparse.ArgumentParser(
        description="《大千修仙界》一键启动脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例：\n"
            "  python start.py               # 完整启动\n"
            "  python start.py --open --port 8080\n"
            "  python start.py --no-build --no-install   # 快速重启"
        ),
    )
    parser.add_argument("--no-build", action="store_true", help="跳过内部包构建")
    parser.add_argument("--no-install", action="store_true", help="跳过依赖安装检查")
    parser.add_argument("--open", action="store_true", help="启动后自动打开浏览器")
    parser.add_argument("--port", type=int, default=5173, help="开发服务器端口（默认 5173）")
    args = parser.parse_args()

    print("=" * 50)
    log("《大千修仙界》启动中...")
    print("=" * 50)

    check_tools()
    ensure_dependencies(args.no_install)
    build_packages(args.no_build)
    start_dev_server(args.port, args.open)


if __name__ == "__main__":
    main()
