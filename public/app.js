const chatContainer = document.getElementById('chatContainer');
const promptInput = document.getElementById('promptInput');
const sendButton = document.getElementById('sendButton');
const modelSelect = document.getElementById('modelSelect');
const streamToggle = document.getElementById('streamToggle');

let isProcessing = false;

// Session management - each user/browser tab gets their own session
// Using sessionStorage so each tab has its own session, or localStorage to persist across tabs
const SESSION_STORAGE_KEY = 'copilot_session_id';

function getSessionId() {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
}

function setSessionId(sessionId) {
    if (sessionId) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
        console.log('Session ID saved:', sessionId);
    }
}

function clearSession() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('Session cleared');
}

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
    // Create message div with loading indicator
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'message-label';
    labelDiv.textContent = 'Copilot';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = '<span class="loading"></span>Generating response...';

    messageDiv.appendChild(labelDiv);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

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

        // Replace loading indicator with actual response
        contentDiv.textContent = '';
        contentDiv.textContent = data.response;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        console.error('Error:', error);
        contentDiv.textContent = '';
        contentDiv.textContent = `Error: ${error.message}`;
        chatContainer.scrollTop = chatContainer.scrollHeight;
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
        const sessionId = getSessionId();
        console.log('Current session ID:', sessionId);
        
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, model, sessionId }),
        });

        console.log('Response received, status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';
        let firstChunk = true;
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
                            // Clear loading indicator on first chunk
                            if (firstChunk) {
                                contentDiv.textContent = '';
                                firstChunk = false;
                            }
                            fullResponse += data.chunk;
                            contentDiv.textContent = fullResponse;
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        }

                        if (data.done) {
                            // Save the sessionId for future messages in this conversation
                            if (data.sessionId) {
                                setSessionId(data.sessionId);
                            }
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
        contentDiv.textContent = `Error: ${error.message}`;
        chatContainer.scrollTop = chatContainer.scrollHeight;
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

// Start new chat - clears session and chat history
function startNewChat() {
    clearSession();
    chatContainer.innerHTML = '';
    addMessage('Hello! I\'m GitHub Copilot. How can I help you today?', 'assistant');
    promptInput.focus();
}

// Attach new chat button if it exists
const newChatButton = document.getElementById('newChatButton');
if (newChatButton) {
    newChatButton.addEventListener('click', startNewChat);
}

// Add welcome message
window.addEventListener('load', () => {
    addMessage('Hello! I\'m GitHub Copilot. How can I help you today?', 'assistant');
    // Log session status
    const existingSession = getSessionId();
    if (existingSession) {
        console.log('Existing session found:', existingSession);
    } else {
        console.log('No existing session - will create new one on first message');
    }
});
