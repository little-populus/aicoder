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

            // 流式生成AI回复
            let aiReply = '';
            await chatWithAI(messages, (partialData) => {
              aiReply += partialData;  // 累积AI回复
              panel.webview.postMessage({command: 'aiResponse', text: aiReply});
            });

            // 将AI回复推送到全局 messages 数组中
            messages.push({role: 'assistant', content: aiReply});
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

    askButton.addEventListener('click', () => {
      const userText = userInput.value;
      if (userText.trim()) {
        const userMessageHTML = marked.parse(userText);
        messageList.innerHTML += '<div><strong>User:</strong> ' + userMessageHTML + '</div>';
        messageList.scrollTop = messageList.scrollHeight;
        vscode.postMessage({ command: 'askQuestion', text: userText });
        userInput.value = ''; // 清空输入框
      }
    });

    clearButton.addEventListener('click', () => {
      messageList.innerHTML = '';
      vscode.postMessage({ command: 'resetConversation' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'aiResponse') {
        const aiMessageHTML = marked.parse(message.text);
        const aiMessageElement = document.querySelector('#ai-message');

        // 如果AI消息已经存在，则更新内容
        if (aiMessageElement) {
          aiMessageElement.innerHTML = '<strong>AI:</strong> ' + aiMessageHTML;
        } else {
          messageList.innerHTML += '<div id="ai-message"><strong>AI:</strong> ' + aiMessageHTML + '</div>';
        }
        messageList.scrollTop = messageList.scrollHeight;
      }
    });
  </script>
    </body>
    </html>`;
}

// 流式处理AI聊天请求
async function chatWithAI(
    messages: Message[], onData: (data: string) => void): Promise<void> {
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model: 'qwen2.5-coder:1.5b', messages: messages})
    });

    if (!response.body) {
      throw new Error('No response body received');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = '';

    while (!done) {
      const {value, done: readerDone} = await reader.read();
      done = readerDone;
      if (value) {
        buffer += decoder.decode(value, {stream: true});

        // 按照字符处理流式数据
        onData(buffer);
        buffer = '';  // 每次处理后清空缓冲区
      }
    }
  } catch (error) {
    let errorMessage = 'An unknown error occurred';

    if (error instanceof Error) {
      // 确保 error 是 Error 类型，才能访问 message 属性
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = JSON.stringify(error);
    }

    console.error('Error fetching AI completion:', errorMessage);
    onData(`Error: ${errorMessage}`);
  }
}
