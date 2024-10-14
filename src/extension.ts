import * as path from 'path';
import * as vscode from 'vscode';

type Message = {
  role: 'assistant'|'user'|'system'; content: string;
};

// 全局的 messages 数组，用来维护上下文
let messages: Message[] =
    [{role: 'system', content: 'You are a helpful AI agent.'}];

export function activate(context: vscode.ExtensionContext) {
  // 注册打开侧边栏的命令
  let disposable =
      vscode.commands.registerCommand('extension.openSidebar', () => {
        const panel = vscode.window.createWebviewPanel(
            'aiAssistantSidebar', 'AI Assistant', vscode.ViewColumn.One,
            {
              enableScripts: true,  // 启用 Webview 的 JavaScript
            });

        // 将 HTML 内容传递给 Webview
        panel.webview.html = getWebviewContent();

        // 监听 Webview 传递的消息
        panel.webview.onDidReceiveMessage(async (message) => {
          if (message.command === 'askQuestion') {
            const user_input = message.text;

            // 将用户输入推送到全局的 messages 数组中
            messages.push({role: 'user', content: user_input});

            // 模拟发送请求并接收消息（可以替换为真实的 API 调用）
            const aiResponse = await chatWithAI(messages);

            // 将 AI 回复也推送到全局 messages 数组中
            messages.push(aiResponse);

            // 将 AI 的回复发送回 Webview
            panel.webview.postMessage(
                {command: 'aiResponse', text: aiResponse.content});
          } else if (message.command === 'resetConversation') {
            // 重置 messages 数组，回到初始状态
            messages =
                [{role: 'system', content: 'You are a helpful AI agent.'}];
          }
        });
      });

  context.subscriptions.push(disposable);
}

// 获取 Webview 的 HTML 内容
function getWebviewContent() {
  return `<html>
    <head>
    <style>
    body {
      font-family: Arial, sans-serif;
      padding: 10px;
      margin: 0;
    }
    #chat-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    #message-list {
      flex-grow: 1;
      padding: 10px;
      border: 1px solid var(--vscode-editorWidget-border);
      overflow-y: auto;
      height: 300px;
      background-color: var(--vscode-editor-background);
    }
    #user-input-container {
      display: flex;
      margin-top: 10px;
    }
    #user-input {
      flex-grow: 1;
      padding: 10px;
      font-size: 16px;
      background-color: transparent;
      color: var(--vscode-editor-foreground);
      border: 1px solid var(--vscode-editorWidget-border);
    }
    #ask-button {
      padding: 10px;
      margin-left: 10px;
      font-size: 16px;
      cursor: pointer;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
    }
    #ask-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    #clear-button {
      padding: 10px;
      margin-left: 10px;
      font-size: 16px;
      cursor: pointer;
      background-color: var(--vscode-errorForeground);
      color: var(--vscode-button-foreground);
      border: none;
    }
    </style>
    <!-- 引入 marked.js 库 -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    </head>
    <body>
  <div id="chat-container">
    <div id="message-list"></div>
    <div id="user-input-container">
      <input type="text" id="user-input" placeholder="Ask a question...">
      <button id="ask-button">Send</button>
      <button id="clear-button">Clear</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const askButton = document.getElementById('ask-button');
    const clearButton = document.getElementById('clear-button');
    const userInput = document.getElementById('user-input');
    const messageList = document.getElementById('message-list');

    // 发送消息并清除输入框
    askButton.addEventListener('click', () => {
      const userText = userInput.value;
      if (userText.trim()) {
        // 使用 marked.js 渲染用户输入的消息为 Markdown 格式
        const userMessageHTML = marked.parse(userText);

        // 在消息框显示用户输入的消息
        messageList.innerHTML += '<div><strong>User:</strong> ' + userMessageHTML + '</div>';
        messageList.scrollTop = messageList.scrollHeight;  // 保持滚动条在最底部
        vscode.postMessage({ command: 'askQuestion', text: userText });
        userInput.value = ''; // 清空输入框
      }
    });

    // 清除所有聊天记录并重置对话
    clearButton.addEventListener('click', () => {
      messageList.innerHTML = ''; // 清空消息列表
      vscode.postMessage({ command: 'resetConversation' }); // 重置对话状态
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'aiResponse') {
        // 使用 marked.js 渲染 AI 的回复为 Markdown 格式
        const aiMessageHTML = marked.parse(message.text);

        // 在消息框显示 AI 的回复
        messageList.innerHTML += '<div><strong>AI:</strong> ' + aiMessageHTML + '</div>';
        messageList.scrollTop = messageList.scrollHeight;  // 保持滚动条在最底部
      }
    });
  </script>
    </body>
    </html>`;
}

// 模拟 AI 的聊天请求，可以替换为真实的 API 调用
async function chatWithAI(messages: Message[]): Promise<Message> {
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({model: 'qwen2.5-coder:1.5b', messages})
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const textData = await response.text();  // 获取响应的纯文本数据

    // 按行拆分每个 JSON 数据（确保每行是一个 JSON 对象）
    const jsonObjects = textData.split('\n').filter(line => line.trim() !== '');

    // 提取每个 JSON 中的 message.content 并拼接
    let combinedContent = '';
    for (const jsonObject of jsonObjects) {
      try {
        const parsed = JSON.parse(jsonObject);
        if (parsed.message && parsed.message.content) {
          combinedContent += parsed.message.content;
        }
      } catch (err) {
        console.error('Failed to parse JSON:', jsonObject);
      }
    }

    // 返回拼接的消息内容
    return {role: 'assistant', content: combinedContent.trim()};
  } catch (error) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = JSON.stringify(error);
    }

    // 返回错误消息
    return {role: 'assistant', content: `Error: ${errorMessage}`};
  }
}
