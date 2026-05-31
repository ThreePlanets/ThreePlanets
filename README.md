# AI Chat Frontend

一个支持 **OpenAI API** 和 **Ollama API** 的轻量级 AI 聊天前端，无需构建工具，纯 HTML/CSS/JavaScript 实现。

## ✨ 功能

- 🤖 支持 OpenAI API（GPT-4o、GPT-4、GPT-3.5-turbo 等）
- 🦙 支持 Ollama 本地模型（Llama3、Mistral、CodeLlama 等）
- 🔄 流式响应（Streaming），实时显示 AI 回复
- ⚙️ 可配置的设置面板（API Key、Base URL、模型选择、Temperature、System Prompt）
- 💾 设置自动保存到 localStorage
- 📱 响应式设计，支持移动端
- 🎨 暗色主题 UI

## 🚀 快速开始

### 方法一：直接打开

用浏览器直接打开 `index.html` 文件即可使用（注意：使用 Ollama 时可能需要通过 HTTP 服务器访问）。

### 方法二：使用本地服务器

```bash
# 使用 Python
python3 -m http.server 8080

# 或使用 Node.js
npx serve .
```

然后访问 `http://localhost:8080`。

## 📖 使用说明

### 使用 OpenAI API

1. 点击左上角的 ⚙️ 打开设置面板
2. 选择 **OpenAI** 作为 API Provider
3. 输入你的 OpenAI API Key
4. 选择或输入模型名称
5. 开始聊天！

### 使用 Ollama

1. 确保 Ollama 已安装并运行（默认端口 11434）
2. 点击 ⚙️ 打开设置面板
3. 选择 **Ollama** 作为 API Provider
4. 输入 Ollama 服务器地址（默认 `http://localhost:11434`）
5. 输入要使用的模型名称（如 `llama3`、`mistral`）
6. 开始聊天！

## 📁 项目结构

```
├── index.html        # 主页面
├── css/
│   └── style.css     # 样式文件
├── js/
│   ├── api.js        # API 抽象层（OpenAI / Ollama）
│   └── app.js        # 应用逻辑
└── README.md
```

## ⌨️ 快捷键

- `Enter` — 发送消息
- `Shift + Enter` — 换行
