---
name: map
version: "0.3.1"
description: "Map —— 为 TypeScript/Go 项目构建本地代码索引，并提供 definition / callers / refs 查询。"
argument-hint: '<path> | status | <symbol> | find <symbol> | callers <symbol> | refs <symbol>'
allowed-tools: Read, Write, Bash, Grep, Glob
---

# /map — 本地代码地图

这是一个契合本仓库工作流的 `map` skill。

## 支持的能力

- `/map .`：为当前项目构建索引
- `/map /path/to/project`：为指定项目构建索引
- `/map status`：查看索引是否存在 / 是否 stale
- `/map handleMessage`：查 definition
- `/map find handleMessage`：显式查 definition
- `/map callers getAgentBrand`：查 callers
- `/map refs loadConfig`：查 refs
- `/map find handleMessage --scope src/adapter`：限制查询范围
- `/map refs loadConfig --changed`：优先围绕当前 git 变更附近查询

## 实际行为

- 自动检测 `TypeScript` / `Go`
- 运行 `scip-typescript` 或 `scip-go` 生成原始 `SCIP` 文件
- 在项目内写入 `.ai/map/map.db` 和 `.ai/map/manifest.json`
- 查询前会检查索引是否 stale，必要时自动重建
- `definition` 查询走本地 `SQLite` definition index
- `callers` / `refs` 查询走项目源码扫描，不依赖 shell `grep`
- monorepo 下会优先当前 `apps/*` / `packages/*` 邻近结果
- 支持 `--scope`、`--changed`、`--from`、`--to`
- 支持 `map.config.json` 自定义 ignore / workspaceRoots / priorityRoots

## 依赖

```bash
bash ./bin/install-deps.sh
```

## Claude 执行规范

用户输入 `/map <args>` 时执行：

```bash
node ./bin/skill-entry.mjs <args>
```

如果需要 shell 级命令，也可以直接运行：

```bash
map <path>
map status --cwd <dir>
map-find <symbol>
map-callers <symbol>
map-refs <symbol>
```
