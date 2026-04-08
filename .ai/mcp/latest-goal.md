将 folder-graphy 封装为 Claude Code Skill，实现以下能力：

**目标**: 用户可以在任意项目使用 `/graphify` 命令构建代码图谱，使用 `/graphify-query` 查询代码结构

**需要完成**:
1. 创建 skill 目录结构：`/Users/xin/.config/mms/claude-gateway/s/85648/.claude/skills/folder-graphy/`
2. 创建 SKILL.md：定义 skill 元数据、触发词、执行规范
3. 创建入口脚本：处理用户输入，调用 folder-graphy CLI
4. 创建安装脚本：自动安装 scip-typescript/scip-go 依赖
5. 测试验证：在 agent-im 项目测试完整流程

**Skill 功能**:
- `/graphify` - 检测项目类型，构建 SCIP 索引，导入 SQLite
- `/graphify-query <symbol>` - 查询符号定义位置
- `/graphify-callers <symbol>` - 查询谁调用了该符号
- `/graphify-refs <symbol>` - 查询所有引用

**技术栈**: TypeScript + Node.js，复用已有 folder-graphy 代码