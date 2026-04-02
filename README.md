# openclaw-sessions-analyze

本地查看 [OpenClaw](https://github.com/openclaw) 代理会话目录（`sessions.json` 与 `*.jsonl`）的小型 CLI：启动后在本机打开浏览器，左侧为会话文件列表，右侧为转录内容。

## 要求

- Node.js 18+

## 安装

```bash
npm install -g openclaw-sessions-analyze
```

## 使用

```bash
osa
```

- 默认在 `127.0.0.1` 上监听端口（默认 `47890`；若被占用则顺延）。可通过环境变量 `PORT` 指定起始端口。
- 启动后会尝试用系统默认浏览器打开页面。
- 默认会话目录为当前用户下的 `~/.openclaw/agents/main/sessions`（Windows 即 `%USERPROFILE%\.openclaw\agents\main\sessions`）。可在页面顶部修改路径并「保存」；路径会缓存在浏览器本地（`localStorage`）。

不全局安装时：

```bash
npx openclaw-sessions-analyze
```

### macOS 说明

系统自带名为 `osa` 的工具（AppleScript）。若与全局安装的命令冲突，请使用：

```bash
npx openclaw-sessions-analyze
```

或：

```bash
node $(npm root -g)/openclaw-sessions-analyze/dist/cli.js
```

（路径以本机 npm 全局目录为准。）

### 从源码运行

```bash
npm install
npm run build
node dist/cli.js
```

## 测试

```bash
npm test
```

使用 Vitest，覆盖 `sessions` 模块与 HTTP API 的主要路径。

## API（本地）

| 路径                                      | 说明                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/config`                         | 返回默认会话目录 `defaultRoot`                                         |
| `GET /api/list?root=`                     | 列出会话文件；省略 `root` 时用默认目录                                 |
| `GET /api/session/:sessionId?root=&file=` | 读取转录；`file` 为目录内文件名，用于同一 `sessionId` 多文件时精确选中 |

## 许可证

MIT
