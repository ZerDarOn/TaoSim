# 大千修仙界 — TaoSim

高自由度沙盒文字 RPG + 六边形战棋 + 鬼谷式大世界演化 + MOD/AI 扩展

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vue 3 + TypeScript + TailwindCSS |
| 构建 | Vite |
| 桌面壳 | Tauri（待接入） |
| 持久化 | SQLite（Tauri）/ IndexedDB（Web 降级） |
| 测试 | Vitest |
| AI 管线 | LLM API（OpenAI 兼容协议，含降级容错） |

## 目录结构

```
TaoSim/
├── apps/
│   └── taosim-ui/          # Vue3 前端应用
│       └── src/
│           ├── components/ # 通用组件
│           ├── pages/      # 页面组件
│           ├── router/     # 路由配置
│           ├── stores/     # Pinia 状态管理
│           └── styles/     # 全局样式
│
├── packages/
│   ├── contracts/          # 核心 TypeScript 类型契约
│   ├── engine/             # 游戏引擎（世界/战棋/生命/AI/经济）
│   └── persistence/        # 持久化抽象层
│
├── tsconfig.base.json      # 共享 TS 配置
├── package.json            # npm workspaces 根配置
└── vitest.workspace.ts     # Vitest workspace
```

## 快速开始

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev

# 全量构建
npm run build

# 类型检查 + 测试
npm run check
```

## 架构分层

```
┌─────────────────────────────────────────────┐
│  UI Layer    Vue3 / Hex Canvas / Router      │
├─────────────────────────────────────────────┤
│  Engine      WorldEngine / CombatEngine       │
│  Layer       LifecycleManager / EconomyEngine │
├─────────────────────────────────────────────┤
│  Data Layer  SQLite / IndexedDB / Migration   │
└─────────────────────────────────────────────┘
```

## 核心系统

- **天道创世**：点数分配 + 家世选择 + 赌气运词条创角
- **六边形战棋**：轴向坐标 HexGrid + ATB 行动条 + 境界飞行 + 神识迷雾
- **大世界演化**：月度 Tick 推进 + NPC 种群平衡 + 闭关过载过滤
- **生死轮回**：4 阶死亡状态机（存活 / 元神出窍 / 残魂 / 湮灭）
- **宗门势力**：灵脉占领 + 外交矩阵 + 宗门战军团抽象
- **渡劫系统**：天雷/心魔/空间撕裂 原子化组合，JSON 可配置
- **AI 扩展**：二元分工（代码引擎 + AI 解释器）+ 3s 超时降级

详细架构设计见 [《大千修仙界》架构设计规范 (v3.2 Final)](./《大千修仙界》架构设计规范%20(v3.2%20Final).md)。

## 开发命令

```bash
npm run dev              # 启动 UI 开发服务器 (localhost:5173)
npm run build            # 构建所有包
npm test                 # 运行所有测试
npm run typecheck        # 类型检查
npm run build -w @taosim/contracts   # 单独构建 contracts
npm run test -w @taosim/contracts    # 单独测试 contracts
```

## 研发路线图

- [x] 阶段一：规范定稿与工程搭建
- [ ] 阶段二：MVP 0.1 闭环 Demo（创角 → Hex 战棋 → ATB → 渡劫）
- [ ] 阶段三：大世界演化 + 创世编辑器 + AI 管线
