const chatContainer = document.getElementById('chatContainer');
const promptInput = document.getElementById('promptInput');
const sendButton = document.getElementById('sendButton');
const modelSelect = document.getElementById('modelSelect');
const streamToggle = document.getElementById('streamToggle');

let isProcessing = false;

function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const labelDiv = document.createElement('div');
    labelDiv.className = 'message-label';
    labelDiv.textContent = role === 'user' ? 'You' : 'Copilot';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    messageDiv.appendChild(labelDiv);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);

    chatContainer.scrollTop = chatContainer.scrollHeight;

    return contentDiv;
}

function updateMessage(contentDiv, text) {
    contentDiv.textContent = text;
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendPromptNonStreaming(prompt, model) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, model }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        addMessage(data.response, 'assistant');
    } catch (error) {
        console.error('Error:', error);
        addMessage(`Error: ${error.message}`, 'assistant');
    }
}

async function sendPromptStreaming(prompt, model) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'message-label';
    labelDiv.textContent = 'Copilot';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = '<span class="loading"></span>Thinking...';

    messageDiv.appendChild(labelDiv);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        console.log('Starting stream request...');
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, model }),
        });

        console.log('Response received, status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';
        console.log('Starting to read stream...');

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                console.log('Stream done');
                break;
            }

            // Decode the chunk and add to buffer
            const chunk = decoder.decode(value, { stream: true });
            console.log('Received chunk:', chunk.substring(0, 100));
            buffer += chunk;

            // Split buffer by newlines
            const lines = buffer.split('\n');

            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                // Skip empty lines and comment lines (: prefix)
                if (!line.trim() || line.startsWith(':')) {
                    continue;
                }

                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.processing) {
                            // Ignore processing message, it's just to keep connection alive
                            continue;
                        }

                        if (data.error) {
                            contentDiv.textContent = `Error: ${data.error}`;
                            return;
                        }

                        if (data.chunk) {
                            fullResponse += data.chunk;
                            contentDiv.textContent = fullResponse;
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        }

                        if (data.done) {
                            return;
                        }
                    } catch (parseError) {
                        console.error('Error parsing JSON:', parseError, 'Line:', line);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
        if (contentDiv.textContent.includes('Thinking...')) {
            contentDiv.textContent = `Error: ${error.message}`;
        }
    }
}

async function sendMessage() {
    const prompt = promptInput.value.trim();

    if (!prompt || isProcessing) {
        return;
    }

    const model = modelSelect.value;
    const streaming = streamToggle.checked;

    addMessage(prompt, 'user');
    promptInput.value = '';

    isProcessing = true;
    sendButton.disabled = true;
    sendButton.innerHTML = '<span class="loading"></span>Processing...';

    if (streaming) {
        await sendPromptStreaming(prompt, model);
    } else {
        await sendPromptNonStreaming(prompt, model);
    }

    isProcessing = false;
    sendButton.disabled = false;
    sendButton.textContent = 'Send';
    promptInput.focus();
}

sendButton.addEventListener('click', sendMessage);

promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Add welcome message
window.addEventListener('load', () => {
    addMessage('Hello! I\'m GitHub Copilot. How can I help you today?', 'assistant');
});
