class CoralApp {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.connected = false;
        this.currentThread = null;
        this.agents = [];
        this.activeQuestions = new Map();
        this.conversationStarted = false;
        
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.connectionStatus = document.getElementById('connection-status');
        this.connectBtn = document.getElementById('connect-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.startConversationBtn = document.getElementById('start-conversation-btn');
        this.agentsList = document.getElementById('agents-list');
        this.messagesContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.questionsContainer = document.getElementById('questions-container');
        this.activityLog = document.getElementById('activity-log');
        this.agentLog = document.getElementById('agent-log');
        this.agentCount = document.getElementById('agent-count');
        this.currentThreadDisplay = document.getElementById('current-thread');
    }

    setupEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.startConversationBtn.addEventListener('click', () => this.startNewConversation());
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    connect() {
        this.log('Connecting to Coral server...', 'info');
        
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.log('Connected to server', 'success');
            this.socket.emit('create-session');
        });

        this.socket.on('session-created', (data) => {
            this.sessionId = data.sessionId;
            this.connected = true;
            this.updateConnectionStatus(true);
            this.log(`Session created: ${this.sessionId}`, 'success');
        });

        this.socket.on('session-manager-ready', (data) => {
            this.sessionManagerReady = true;
            this.log('Session manager ready for direct messaging', 'info');
        });

        this.socket.on('agents-updated', (agents) => {
            this.agents = agents;
            this.updateAgentsList();
            this.log(`Agents updated: ${agents.length} agents`, 'info');
            this.logAgent(`Agents connected: ${agents.map(a => a.id).join(', ')}`);
        });

        this.socket.on('message-received', (data) => {
            this.addMessage(data.message, 'agent');
            this.log('Message received from agent', 'info');
            this.logAgent(`Agent response: ${data.message.content.substring(0, 100)}...`);
        });

        this.socket.on('agent-question', (question) => {
            this.handleAgentQuestion(question);
            this.log(`Agent asked: ${question.question}`, 'info');
        });

        this.socket.on('response-sent', (data) => {
            this.removeQuestion(data.questionId);
            this.log('Response sent to agent', 'success');
        });

        this.socket.on('connection-status', (status) => {
            this.updateConnectionStatus(status.connected);
            if (status.error) {
                this.log(`Connection error: ${status.error}`, 'error');
            }
        });

        this.socket.on('error', (error) => {
            this.log(`Error: ${error.message}`, 'error');
        });

        this.socket.on('disconnect', () => {
            this.connected = false;
            this.updateConnectionStatus(false);
            this.log('Disconnected from server', 'error');
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
        this.sessionId = null;
        this.updateConnectionStatus(false);
        this.reset();
        this.log('Disconnected', 'info');
    }

    updateConnectionStatus(connected) {
        this.connected = connected;
        this.connectionStatus.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
        this.connectBtn.disabled = connected;
        this.disconnectBtn.disabled = !connected;
        this.startConversationBtn.disabled = !connected;
    }

    updateAgentsList() {
        this.agentCount.textContent = this.agents.length;
        
        if (this.agents.length === 0) {
            this.agentsList.innerHTML = '<p>No agents connected</p>';
            return;
        }

        this.agentsList.innerHTML = this.agents.map(agent => `
            <div class="agent-item">
                <div style="display: flex; justify-content: between; align-items: center;">
                    <strong>${agent.name || agent.id}</strong>
                    <span class="agent-state state-${agent.state?.toLowerCase() || 'unknown'}">
                        ${agent.state || 'Unknown'}
                    </span>
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    ${agent.description || 'No description'}
                </div>
            </div>
        `).join('');
    }


    startNewConversation() {
        if (!this.connected) {
            this.log('Not connected to server', 'error');
            return;
        }

        this.conversationStarted = true;
        this.currentThread = { id: 'new', name: 'New Conversation' };
        this.currentThreadDisplay.textContent = '- Active';
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
        this.startConversationBtn.disabled = true;
        
        // Update messages container
        this.messagesContainer.innerHTML = `
            <p class="message system">Conversation started! Type your message below to chat with agents.</p>
        `;
        
        this.messageInput.focus();
        this.log('Conversation started', 'success');
        this.logAgent('Conversation session initiated by user');
    }

    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.currentThread) return;

        this.addMessage({ content, role: 'user' }, 'user');
        
        // Send message to our server which will forward to agents
        this.socket.emit('send-message', {
            threadId: this.currentThread.id,
            content: content,
            createThread: this.currentThread.id === 'new'
        });

        this.messageInput.value = '';
        this.log('Message sent', 'success');
    }

    addMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        messageDiv.innerHTML = `
            <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                ${type === 'user' ? 'You' : 'Agent'} • ${timestamp}
            </div>
            <div>${message.content}</div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    handleAgentQuestion(question) {
        this.activeQuestions.set(question.id, question);
        
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-prompt';
        questionDiv.dataset.questionId = question.id;
        
        questionDiv.innerHTML = `
            <div class="question-text">${question.question}</div>
            ${question.context ? `<div class="context-text">Context: ${question.context}</div>` : ''}
            <input type="text" class="response-input" placeholder="Type your response...">
            <button class="btn btn-success" onclick="app.respondToQuestion('${question.id}')">
                Send Response
            </button>
        `;

        this.questionsContainer.appendChild(questionDiv);
        
        // Focus on the input
        const input = questionDiv.querySelector('.response-input');
        input.focus();
        
        // Allow Enter key to submit
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.respondToQuestion(question.id);
            }
        });
    }

    respondToQuestion(questionId) {
        const questionDiv = document.querySelector(`[data-question-id="${questionId}"]`);
        const input = questionDiv.querySelector('.response-input');
        const response = input.value.trim();
        
        if (!response) return;

        this.socket.emit('user-response', {
            requestId: questionId,
            response: response
        });

        // Disable the input and button
        input.disabled = true;
        questionDiv.querySelector('.btn').disabled = true;
        questionDiv.querySelector('.btn').textContent = 'Response Sent';
        
        this.log(`Responded to question: ${response}`, 'success');
    }

    removeQuestion(questionId) {
        const questionDiv = document.querySelector(`[data-question-id="${questionId}"]`);
        if (questionDiv) {
            questionDiv.remove();
        }
        this.activeQuestions.delete(questionId);
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.activityLog.appendChild(logEntry);
        this.activityLog.scrollTop = this.activityLog.scrollHeight;
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    logAgent(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.agentLog.appendChild(logEntry);
        this.agentLog.scrollTop = this.agentLog.scrollHeight;
        
        console.log(`[AGENT-${type.toUpperCase()}] ${message}`);
    }

    reset() {
        this.agents = [];
        this.currentThread = null;
        this.conversationStarted = false;
        this.activeQuestions.clear();
        
        this.updateAgentsList();
        this.messagesContainer.innerHTML = '<p class="message system">Click "Start New Conversation" to begin chatting</p>';
        this.questionsContainer.innerHTML = '';
        this.currentThreadDisplay.textContent = '';
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.startConversationBtn.disabled = false;
    }
}

// Initialize the app
const app = new CoralApp();