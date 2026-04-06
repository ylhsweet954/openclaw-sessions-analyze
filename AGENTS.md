# Agent 说明

## 项目是什么

- **用途**：本地 HTTP 查看器，浏览 OpenClaw 代理会话目录（`sessions.json` 与 `*.jsonl`）。包提供的 CLI 为 `osa`，启动后在浏览器中查看会话列表与转录。
- **边界**：不是 OpenClaw 运行时本身；不应对「只读浏览本地会话」范围外做无约束扩张。

## 仓库结构（要点）

| 区域                          | 说明                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `src/cli.ts`, `src/server.ts` | CLI 与 HTTP 服务                                     |
| `src/sessions.ts`             | 会话根路径、`sessions.json`、文件列表、JSONL 读取    |
| `public/`                     | 前端静态资源（`index.html`, `app.js`, `styles.css`） |
| `test/`                       | Vitest 测试                                          |

## 开发与验证

```bash
npm install
npm run build   # 输出 dist/
npm test
node dist/cli.js
```

## 修改原则（摘要）

- 最小必要改动；不 Drive-by 重构。
- 保持路径与安全校验；不引入任意文件读写。
- 与用户沟通默认使用**简体中文**。
- sessions-example 目录为示例会话，用于开发的参考
