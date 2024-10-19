# VSCode AI 助手扩展文档

本文档记载了AI助手的开发流程。

---

## **1. 项目概述**

此扩展的目标是在 VSCode 中集成 AI 驱动的代码建议和交互式聊天功能，主要包含两个核心功能：

1. **AI 聊天侧边栏**：提供与 AI 交互的聊天界面。
2. **代码建议**：根据当前光标位置的代码上下文获取 AI 建议并插入代码。

---

## **2. 开发流程**

### **2.1 前置条件**

1. **VSCode 扩展开发环境配置**：
   - 安装 [Node.js](https://nodejs.org/) 和 `npm`。
   - 运行 `npm install` 以初始化开发环境。

2. **AI 模型配置**：
   - 将 AI 模型本地部署在 `http://localhost:11434`。
   - 通过 REST API 访问模型，支持聊天和代码建议。

### **2.2 项目结构**

- **`extension.ts`**：核心逻辑代码，包括命令注册和与 AI 的交互。
- **`package.json`**：描述扩展的配置，并定义触发命令。
- **Webview HTML**：嵌入代码，用于呈现侧边栏界面。

---

## **3. 扩展功能与实现**

### **3.1 命令与上下文**

- **命令 1：`extension.openSidebar`**  
  打开 AI 聊天侧边栏。

- **命令 2：`extension.insertAICompletion`**  
  捕获光标位置的代码并获取 AI 建议，将生成的代码插入到光标位置。

这些命令在 `activate` 函数中注册，以确保扩展在 VSCode 生命周期内正常运行。

---

## **4. 详细实现**

### **4.1 捕获光标位置的代码**

```typescript
async function getCodeToCursor(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const document = editor.document;
  const position = editor.selection.active;
  const range = new vscode.Range(new vscode.Position(0, 0), position);
  return document.getText(range);
}
```

- **功能**：从文档开头到光标位置提取代码。

---

### **4.2 获取 AI 代码建议**

```typescript
async function fetchCodeSuggestion(code: string): Promise<string | undefined> {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'starcoder', prompt: code, stream: false }),
    });

    if (!response.ok) {
      console.error(`请求失败，状态码: ${response.status}`);
      return undefined;
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('请求过程中出现错误:', error);
    return undefined;
  }
}
```

- **设计考虑**：通过 `fetch` 将代码作为提示发送给 AI API，并返回生成的代码建议。

---

### **4.3 聊天侧边栏**

#### Webview HTML 内容
HTML 结构定义了聊天界面：

```html
<div id="chat-container">
  <div id="message-list"></div>
  <div id="user-input-container">
    <input type="text" id="user-input" placeholder="Ask a question...">
    <button id="ask-button">Send</button>
    <button id="clear-button">Clear</button>
  </div>
</div>
```

- **发送按钮**：将用户输入发送给 AI。
- **清除按钮**：重置聊天历史。

---

#### 处理侧边栏消息

```typescript
panel.webview.onDidReceiveMessage(async (message) => {
  if (message.command === 'askQuestion') {
    const user_input = message.text;
    messages.push({ role: 'user', content: user_input });

    let aiReply = '';
    await chatWithAI(messages, (partialData) => {
      aiReply += partialData;
      panel.webview.postMessage({
        command: 'aiResponse',
        text: formatMessages(messages, aiReply),
      });
    });

    messages.push({ role: 'assistant', content: aiReply });
  } else if (message.command === 'resetConversation') {
    messages = [{ role: 'system', content: 'You are a helpful AI agent.' }];
  }
});
```

---

### **4.4 插入代码建议**

```typescript
let insertAIDisposable = vscode.commands.registerCommand(
  'extension.insertAICompletion', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const codeToCursor = await getCodeToCursor();
    if (!codeToCursor) {
      vscode.window.showErrorMessage('无法获取代码。');
      return;
    }

    const aiSuggestion = await fetchCodeSuggestion(codeToCursor);
    if (aiSuggestion) {
      editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, `\n${aiSuggestion}`);
      });
      vscode.window.showInformationMessage('代码建议已插入！');
    } else {
      vscode.window.showErrorMessage('未收到代码建议。');
    }
  }
);
```

- **功能**：此命令捕获光标位置的代码，并将 AI 生成的代码建议插入光标位置。

---

### **4.5 处理流式 AI 回复**

```typescript
async function chatWithAI(messages: Message[], onData: (data: string) => void) {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen2.5-coder:1.5b', messages }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    const chunk = decoder.decode(value, { stream: true });
    onData(chunk);
  }
}
```

- **设计**：该函数逐步读取 AI 回复流，并实时更新侧边栏内容。

---

## **5. 错误处理**

- **代码捕获失败**：若无法获取光标位置的代码，会显示错误提示。
- **API 请求失败**：若请求失败，会记录错误并在界面中显示错误信息。
- **Webview 消息处理**：若消息解析失败，错误会被捕获并记录。

---

## **6. 结论**

此扩展通过集成 AI 助手，提高了开发者的编码效率。其核心功能包括：

1. **交互式侧边栏**：与 AI 进行聊天和问题解答。
2. **代码建议**：根据光标上下文智能生成代码。

未来改进方向：
- **流式代码建议**：提升用户体验。
- **自定义模型支持**：支持更多 AI API。

---

## **7. 参考文献**

- [VSCode API 文档](https://code.visualstudio.com/api)
- [Node.js Fetch API](https://nodejs.org/api/globals.html#fetch)

---

此文档详细介绍了 AI 助手扩展的设计思路、开发过程和实现细节，并提供了未来改进的建议。