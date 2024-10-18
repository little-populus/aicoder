import axios from 'axios';
import * as vscode from 'vscode';

// 定义消息类型
type Message = {
  role: 'assistant'|'user'|'system'; content: string;
};

// 全局的 messages 数组，用来维护上下文
let messages: Message[] =
    [{role: 'system', content: 'You are a helpful AI agent.'}];

// 捕获代码到光标位置的函数
async function getCodeToCursor(): Promise<string|undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const document = editor.document;
  const position = editor.selection.active;
  const range = new vscode.Range(new vscode.Position(0, 0), position);
  const code = document.getText(range);
  return code;
}

// 向 AI 接口发送请求的函数
async function fetchCodeSuggestion(code: string): Promise<string|undefined> {
  try {
    const url = 'http://localhost:11434/api/generate';

    // 准备请求体数据
    const data = {
      model: 'starcoder',
      prompt: code,
      stream: false,
    };


    // 使用 fetch 发送 POST 请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    // 检查响应状态码是否为 200
    if (response.status === 200) {
      // 解析 JSON 响应，并添加类型断言
      const jsonData = (await response.json()) as {response?: string};

      // 打印调试信息
      console.log('API 返回的数据:', jsonData);

      // 检查并返回 response 字段内容
      if (jsonData.response) {
        return jsonData.response;  // 返回 response 字段的内容
      } else {
        console.error('response 字段不存在。');
        return undefined;
      }
    } else {
      console.error(`请求失败，状态码: ${response.status}`);
      console.error(await response.text());  // 打印错误信息
      return undefined;
    }
  } catch (error) {
    console.error(`请求过程中出现错误: ${error}`);
    return undefined;
  }
}



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

            // 流式生成 AI 回复
            let aiReply = '';
            await chatWithAI(messages, (partialData) => {
              aiReply += partialData;  // 累积 AI 回复

              // 显示所有历史对话，并逐步更新当前对话
              panel.webview.postMessage({
                command: 'aiResponse',
                text: formatMessages(messages, aiReply)  // 更新显示所有对话
              });
            });

            // 将 AI 回复推送到全局 messages 数组中
            messages.push({role: 'assistant', content: aiReply});
          } else if (message.command === 'resetConversation') {
            // 重置 messages 数组，回到初始状态
            messages =
                [{role: 'system', content: 'You are a helpful AI agent.'}];
          }
        });
      });

  context.subscriptions.push(disposable);

  // 注册插入 AI 代码建议的命令
  let insertAIDisposable = vscode.commands.registerCommand(
      'extension.insertAICompletion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const codeToCursor = await getCodeToCursor();
        if (!codeToCursor) {
          vscode.window.showErrorMessage('Failed to get code.');
          return;
        }

        vscode.window.showInformationMessage('Fetching AI suggestion...');

        try {
          const aiSuggestion = await fetchCodeSuggestion(codeToCursor);
          if (aiSuggestion) {
            // 获取当前光标位置
            const position = editor.selection.active;

            // 在光标位置插入 AI 建议的代码
            editor.edit(editBuilder => {
              editBuilder.insert(position, `\n${aiSuggestion}`);
            });

            vscode.window.showInformationMessage('Code suggestion inserted!');
          } else {
            vscode.window.showErrorMessage('No suggestion received.');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Error: ${error}`);
        }
      });

  context.subscriptions.push(insertAIDisposable);
}

// 格式化对话内容，将所有历史对话显示出来
function formatMessages(
    messages: Message[], currentAIResponse: string): string {
  let formatted = '';

  messages.forEach(msg => {
    if (msg.role === 'user') {
      formatted +=
          `<div style="margin-bottom: 8px;"><strong>User:</strong><div style="margin-left: 10px; margin-top: 12px;">${
              msg.content}</div></div>`;
    } else if (msg.role === 'assistant') {
      formatted +=
          `<div style="margin-bottom: 8px;"><strong>AI:</strong><div style="margin-left: 10px; margin-top: 12px;">${
              msg.content}</div></div>`;
    }
  });

  // 加上当前生成的 AI 回复（流式部分）
  formatted +=
      `<div style="margin-bottom: 8px;"><strong>AI:</strong><div style="margin-left: 10px; margin-top: 12px;">${
          currentAIResponse}</div></div>`;

  return formatted;
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
    #message-list div {
      margin-bottom: 15px; /* 增加每条消息之间的间距 */
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
        messageList.innerHTML += '<div><strong>User:</strong><div style="margin-left: 10px; margin-top: 5px;">' + userMessageHTML + '</div></div>';
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
        messageList.innerHTML = aiMessageHTML;  // 更新整个对话内容
        messageList.scrollTop = messageList.scrollHeight;  // 确保滚动条在最底部
      }
    });
  </script>
    </body>
    </html>`;
}

// 流式处理 AI 聊天请求
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
    let buffer = '';              // 用来累积完整的生成回复
    let lastDisplayedLength = 0;  // 保存已显示内容的长度

    while (!done) {
      const {value, done: readerDone} = await reader.read();
      done = readerDone;

      if (value) {
        const partialData = decoder.decode(value, {stream: true});

        // 将流式数据按行解析
        const chunks =
            partialData.split('\n').filter(line => line.trim() !== '');

        // 处理每一块数据
        chunks.forEach(chunk => {
          try {
            const parsed = JSON.parse(chunk);
            if (parsed.message && parsed.message.content) {
              buffer += parsed.message.content;  // 累积部分内容

              // 获取尚未显示的新内容
              const newContent = buffer.slice(lastDisplayedLength);
              if (newContent.length > 0) {
                onData(newContent);  // 只显示新生成的内容
                lastDisplayedLength = buffer.length;  // 更新已显示内容的长度
              }
            }

            // 当 done 为 true 时，表示该次回复结束，可以完成整个过程
            if (parsed.done) {
              onData(buffer.slice(
                  lastDisplayedLength));  // 确保完整内容已经传输完毕
              buffer = '';  // 重置缓冲区以便处理新的对话
              lastDisplayedLength = 0;  // 重置显示长度
            }
          } catch (err) {
            console.error('Error parsing chunk:', chunk);
          }
        });
      }
    }
  } catch (error) {
    let errorMessage = 'An unknown error occurred';

    if (error instanceof Error) {
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
