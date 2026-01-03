// Configuration
const CONFIG_KEY = 'neurallink_config';
const CHAT_HISTORY_KEY = 'neurallink_history';

// State
let config = {
    apiKey: '',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
};

let chatHistory = [];
let isProcessing = false;
let startTime = Date.now();
let tokenCount = 0;

// DOM Elements
const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    configPanel: document.getElementById('configPanel'),
    settingsToggle: document.getElementById('settingsToggle'),
    configClose: document.getElementById('configClose'),
    configSave: document.getElementById('configSave'),
    apiKeyInput: document.getElementById('apiKey'),
    modelInput: document.getElementById('model'),
    apiEndpointInput: document.getElementById('apiEndpoint'),
    statusText: document.querySelector('.status-text'),
    statusDot: document.querySelector('.status-dot'),
    latency: document.getElementById('latency'),
    tokens: document.getElementById('tokens'),
    uptime: document.getElementById('uptime'),
    bootSequence: document.getElementById('bootSequence')
};

// Initialize
function init() {
    loadConfig();
    loadChatHistory();
    setupEventListeners();
    startUptimeCounter();

    // Hide boot sequence after animation
    setTimeout(() => {
        elements.bootSequence.style.display = 'none';
    }, 2500);

    // Auto-open config if no API key
    if (!config.apiKey) {
        setTimeout(() => {
            elements.configPanel.classList.add('active');
        }, 2500);
    }
}

// Config Management
function loadConfig() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
        config = { ...config, ...JSON.parse(saved) };
        
        // Fix invalid models
        const validModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-instruct'];
        const isValidModel = validModels.some(valid => config.model.toLowerCase().includes(valid.toLowerCase()));
        
        if (!isValidModel) {
            config.model = 'gpt-3.5-turbo'; // Reset to valid default
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        }
        
        elements.apiKeyInput.value = config.apiKey;
        elements.modelInput.value = config.model;
        elements.apiEndpointInput.value = config.apiEndpoint;
        updateConnectionStatus();
    }
}

function saveConfig() {
    config.apiKey = elements.apiKeyInput.value.trim();
    config.model = elements.modelInput.value.trim();
    config.apiEndpoint = elements.apiEndpointInput.value.trim() || 'https://api.openai.com/v1/chat/completions';

    if (!config.apiKey) {
        showSystemMessage('Please provide an API key', 'error');
        return;
    }

    if (!config.model) {
        showSystemMessage('Please specify a model (e.g., gpt-3.5-turbo, gpt-4)', 'error');
        return;
    }

    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    updateConnectionStatus();
    elements.configPanel.classList.remove('active');

    showSystemMessage('Configuration saved successfully', 'success');
}

function updateConnectionStatus() {
    if (config.apiKey) {
        elements.statusText.textContent = 'ONLINE';
        elements.statusDot.style.background = 'var(--terminal-green)';
        elements.statusDot.style.boxShadow = '0 0 8px var(--terminal-green)';
    } else {
        elements.statusText.textContent = 'STANDBY';
        elements.statusDot.style.background = 'var(--accent-yellow)';
        elements.statusDot.style.boxShadow = '0 0 8px var(--accent-yellow)';
    }
}

// Chat History
function loadChatHistory() {
    const saved = localStorage.getItem(CHAT_HISTORY_KEY);
    if (saved) {
        chatHistory = JSON.parse(saved);
        chatHistory.forEach(msg => {
            appendMessage(msg.role, msg.content, false);
        });
    }
}

function saveChatHistory() {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
}

// Event Listeners
function setupEventListeners() {
    elements.sendButton.addEventListener('click', handleSendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    elements.settingsToggle.addEventListener('click', () => {
        elements.configPanel.classList.add('active');
    });

    elements.configClose.addEventListener('click', () => {
        elements.configPanel.classList.remove('active');
    });

    elements.configSave.addEventListener('click', saveConfig);

    // Close config panel on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.configPanel.classList.contains('active')) {
            elements.configPanel.classList.remove('active');
        }
    });
}

// Message Handling
async function handleSendMessage() {
    if (isProcessing) return;

    const message = elements.messageInput.value.trim();
    if (!message) return;

    if (!config.apiKey) {
        showSystemMessage('Please configure your API key first', 'error');
        elements.configPanel.classList.add('active');
        return;
    }

    // Clear input and add user message
    elements.messageInput.value = '';
    appendMessage('user', message);
    chatHistory.push({ role: 'user', content: message });
    saveChatHistory();

    // Set processing state
    isProcessing = true;
    updateProcessingState(true);

    // Show typing indicator
    const typingIndicator = showTypingIndicator();

    try {
        const startTime = Date.now();
        const response = await sendToOpenAI(message);
        const latency = Date.now() - startTime;

        // Remove typing indicator
        typingIndicator.remove();

        // Add assistant message
        appendMessage('assistant', response.content);
        chatHistory.push({ role: 'assistant', content: response.content });
        saveChatHistory();

        // Update stats
        tokenCount += response.usage?.total_tokens || 0;
        elements.latency.textContent = `${latency}ms`;
        elements.tokens.textContent = tokenCount;

    } catch (error) {
        typingIndicator.remove();
        showSystemMessage(`Error: ${error.message}`, 'error');
        console.error('Chat error:', error);
    } finally {
        isProcessing = false;
        updateProcessingState(false);
    }
}

async function sendToOpenAI(message) {
    const requestBody = {
        model: config.model,
        messages: [
            { role: 'system', content: 'You are a helpful AI assistant in a cyberpunk neural interface.' },
            ...chatHistory.slice(-10) // Last 10 messages for context
        ],
        temperature: 0.7,
        max_tokens: 1000
    };

    const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
        content: data.choices[0].message.content,
        usage: data.usage
    };
}

// UI Updates
function appendMessage(role, content, scroll = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    elements.messagesContainer.appendChild(messageDiv);

    if (scroll) {
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

function showSystemMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '!';
    avatar.style.background = type === 'error'
        ? 'linear-gradient(135deg, var(--error-red), var(--secondary-magenta))'
        : 'linear-gradient(135deg, var(--terminal-green), var(--primary-cyan))';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = message;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    elements.messagesContainer.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';

    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    indicator.appendChild(avatar);
    indicator.appendChild(typingDiv);
    elements.messagesContainer.appendChild(indicator);
    indicator.scrollIntoView({ behavior: 'smooth', block: 'end' });

    return indicator;
}

function updateProcessingState(processing) {
    elements.sendButton.disabled = processing;
    elements.messageInput.disabled = processing;

    if (processing) {
        elements.statusText.textContent = 'PROCESSING';
        elements.statusDot.style.background = 'var(--secondary-magenta)';
        elements.statusDot.style.boxShadow = '0 0 8px var(--secondary-magenta)';
    } else {
        updateConnectionStatus();
    }
}

// Uptime Counter
function startUptimeCounter() {
    setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        elements.uptime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

// Start application
init();
