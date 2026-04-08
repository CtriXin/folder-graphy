# Map

[English](#english) | [中文](#中文)

---

## 中文

轻量级代码索引工具，为 TypeScript/Go 项目提供符号查询能力。

### 为什么做这个项目

现有代码索引工具（LSP、gopls）太重了：
- 需要完整 AST 解析
- 内存占用高
- 启动慢

**Map 只做一件事**：快速告诉你「符号在哪定义、谁调用了它」。

### 特点

| 特性 | 说明 |
|------|------|
| **轻量** | 无 AST，纯正则匹配，2秒索引 5万文件项目 |
| **够用** | Agent 场景：定位符号 → 读取文件 → 回答用户 |
| **自动** | Session hook 自动维护索引 |
| **结构化** | 支持 JSON 输出，方便 Agent 消费 |
| **自愈** | 查询前自动检查 stale index，必要时重建 |
| **Monorepo-aware** | 优先当前 app/package、支持 scope 与 changed 邻域查询 |

### 快速开始

#### 一键安装

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/CtriXin/folder-graphy/main/bin/install.sh | bash

# 固定到指定 release / 分支
curl -fsSL https://raw.githubusercontent.com/CtriXin/folder-graphy/main/bin/install.sh | bash -s -- --ref v0.3.1
curl -fsSL https://raw.githubusercontent.com/CtriXin/folder-graphy/main/bin/install.sh | bash -s -- --main

# 或手动 clone
git clone https://github.com/CtriXin/folder-graphy.git
cd folder-graphy
npm install && npm run build
```

#### 使用

```bash
# 构建索引
map /path/to/project

# 查看索引状态
map status --cwd /path/to/project

# 查询定义
map-find handleMessage

# 查询调用者
map-callers getAgentBrand

# 查询引用
map-refs loadConfig

# 只查指定 scope
map-find handleMessage --scope src/adapter

# 围绕 git 变更附近查 refs/callers
map-refs loadConfig --changed

# JSON 输出（Agent 用）
map-find handleMessage --json
```

#### Claude Code / Agent 集成

添加到 `~/.claude/hooks/session-start.sh`：

```bash
# 自动为新项目构建索引
map . 2>/dev/null || true
```

Agent 可以直接调用：

```typescript
const result = await exec(`map-find ${symbol} --json --cwd ${projectPath}`);
const locations = JSON.parse(result);
// locations[0].file → "src/adapter.ts"
// locations[0].line → 225
```

### 技术设计：为什么这样就够了

| Agent 需要的 | Map 提供的 | 为什么不需要更多 |
|-------------|-----------|----------------|
| 快速定位符号 | ✅ file:line | Agent 可直接 `Read` 文件看代码 |
| 了解调用关系 | ✅ callers/refs | 知道"谁用"就够了，不需要完整 call graph |
| 机器消费 | ✅ JSON 输出 | 结构化即可 |
| 轻量快速 | ✅ 2秒索引，30ms查询 | 不阻塞 Agent 工作流 |

**不做的（太重了）**：
- 完整 AST 解析 → 用 LSP 如果真有需要
- 类型推导 → Agent 直接读代码上下文
- 语义分析 → 重构场景才需要

简单说：**只有"目录页"，没有"全书内容"**——知道有什么，但具体内容 Agent 自己读。

### 架构

```
源文件扫描
    ↓
过滤（node_modules/, dist/, *.d.ts...）
    ↓
正则匹配定义（函数/类/接口/类型）
    ↓
SQLite 存储：symbol → file:line:column
```

### 过滤规则

默认排除：
- `node_modules/`, `dist/`, `build/`, `.git/`, `vendor/`
- `*.d.ts`, `*.map`, `*.min.js`

可扩展：通过 `FileFilter` 接口自定义（为增量索引预留），也支持项目根 `map.config.json`：

```json
{
  "ignore": ["public/assets/**", "ios/App/App/public/assets/**"],
  "workspaceRoots": ["apps", "packages"],
  "priorityRoots": ["src", "app", "server"]
}
```

### 性能

| 项目规模 | 原始文件 | 过滤后 | 索引时间 | 查询时间 |
|---------|---------|--------|---------|---------|
| agent-im | ~100 | 19 | <1s | ~30ms |
| hive | ~50,000 | 145 | ~2.3s | ~30ms |

### Roadmap

- [x] 基础索引与查询
- [x] 噪音过滤
- [x] JSON 输出
- [x] 自动 hook 集成
- [x] stale 检测与按需重建
- [x] 结果排序（src/ 优先）
- [x] monorepo-aware ranking / scope / changed 邻域查询
- [x] 项目级 ignore 配置
- [ ] 增量索引（大项目场景）
- [ ] 模糊匹配

### License

MIT

---

## English

<a name="english"></a>

Lightweight code indexing tool for TypeScript/Go projects.

### Why Map

Existing tools (LSP, gopls) are too heavy:
- Full AST parsing required
- High memory usage
- Slow startup

**Map does one thing**: quickly tell you "where is the symbol defined, who calls it".

### Features

| Feature | Description |
|---------|-------------|
| **Lightweight** | No AST, regex-based, index 50k files in 2s |
| **Good Enough** | Agent workflow: locate symbol → read file → answer |
| **Automatic** | Session hook auto-maintains index |
| **Structured** | JSON output for Agent consumption |
| **Self-healing** | Query checks stale index and rebuilds when needed |
| **Monorepo-aware** | Prefers nearby app/package results and supports scope/changed queries |

### Quick Start

#### One-line Install

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/CtriXin/folder-graphy/main/bin/install.sh | bash

# Pin to a release / branch
curl -fsSL https://raw.githubusercontent.com/CtriXin/folder-graphy/main/bin/install.sh | bash -s -- --ref v0.3.1
curl -fsSL https://raw.githubusercontent.com/CtriXin/folder-graphy/main/bin/install.sh | bash -s -- --main

# Or manual clone
git clone https://github.com/CtriXin/folder-graphy.git
cd folder-graphy
npm install && npm run build
```

#### Usage

```bash
# Build index
map /path/to/project

# Check index status
map status --cwd /path/to/project

# Find definition
map-find handleMessage

# Find callers
map-callers getAgentBrand

# Find references
map-refs loadConfig

# Limit to a scope
map-find handleMessage --scope src/adapter

# Focus around git changes
map-refs loadConfig --changed

# JSON output (for Agents)
map-find handleMessage --json
```

#### Claude Code / Agent Integration

Add to `~/.claude/hooks/session-start.sh`:

```bash
# Auto-index new projects
map . 2>/dev/null || true
```

Agent can call directly:

```typescript
const result = await exec(`map-find ${symbol} --json --cwd ${projectPath}`);
const locations = JSON.parse(result);
// locations[0].file → "src/adapter.ts"
// locations[0].line → 225
```

### Design: Why This Is Enough

| What Agent Needs | What Map Provides | Why Not More |
|-----------------|-------------------|--------------|
| Fast symbol location | ✅ file:line | Agent can `Read` file directly |
| Call relationships | ✅ callers/refs | "Who uses" is enough, no full call graph needed |
| Machine-readable | ✅ JSON output | Structured is enough |
| Lightweight | ✅ 2s index, 30ms query | Don't block Agent workflow |

**Intentionally NOT doing**:
- Full AST parsing → Use LSP if really needed
- Type inference → Agent reads code context directly
- Semantic analysis → Only needed for refactoring

Simple: **"Table of contents", not "full book"**—know what exists, Agent reads content.

### Architecture

```
Source file scanning
    ↓
Filter (node_modules/, dist/, *.d.ts...)
    ↓
Regex match definitions (functions/classes/interfaces/types)
    ↓
SQLite storage: symbol → file:line:column
```

### Filtering Rules

Default exclusions:
- `node_modules/`, `dist/`, `build/`, `.git/`, `vendor/`
- `*.d.ts`, `*.map`, `*.min.js`

Extensible: via `FileFilter` and project-level `map.config.json`:

```json
{
  "ignore": ["public/assets/**", "ios/App/App/public/assets/**"],
  "workspaceRoots": ["apps", "packages"],
  "priorityRoots": ["src", "app", "server"]
}
```

### Performance

| Project Size | Raw Files | After Filter | Index Time | Query Time |
|-------------|-----------|--------------|-----------|------------|
| agent-im | ~100 | 19 | <1s | ~30ms |
| hive | ~50,000 | 145 | ~2.3s | ~30ms |

### Roadmap

- [x] Basic indexing & query
- [x] Noise filtering
- [x] JSON output
- [x] Auto hook integration
- [x] Stale detection with rebuild-on-demand
- [x] Result ranking (prefer src/)
- [x] Monorepo-aware ranking / scope / changed-neighborhood query
- [x] Project-level ignore configuration
- [ ] Incremental indexing (large projects)
- [ ] Fuzzy matching

### License

MIT

---

**Map** — Know where, read what.
