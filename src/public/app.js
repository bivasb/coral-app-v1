class CoralApp {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.connected = false;
        this.currentThread = null;
        this.agents = [];
        this.threads = [];
        this.activeQuestions = new Map();
        
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.connectionStatus = document.getElementById('connection-status');
        this.connectBtn = document.getElementById('connect-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.createThreadBtn = document.getElementById('create-thread-btn');
        this.agentsList = document.getElementById('agents-list');
        this.threadsList = document.getElementById('threads-list');
        this.messagesContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.questionsContainer = document.getElementById('questions-container');
        this.activityLog = document.getElementById('activity-log');
        this.agentCount = document.getElementById('agent-count');
        this.threadCount = document.getElementById('thread-count');
        this.currentThreadDisplay = document.getElementById('current-thread');
        
        // Modal elements
        this.threadModal = document.getElementById('thread-modal');
        this.threadNameInput = document.getElementById('thread-name-input');
        this.threadModalCancel = document.getElementById('thread-modal-cancel');
        this.threadModalCreate = document.getElementById('thread-modal-create');
    }

    setupEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.createThreadBtn.addEventListener('click', () => this.showCreateThreadModal());
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Modal event listeners
        this.threadModalCancel.addEventListener('click', () => this.hideCreateThreadModal());
        this.threadModalCreate.addEventListener('click', () => this.handleCreateThread());
        
        this.threadNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleCreateThread();
            }
        });

        // Close modal when clicking outside
        this.threadModal.addEventListener('click', (e) => {
            if (e.target === this.threadModal) {
                this.hideCreateThreadModal();
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
        });

        this.socket.on('threads-updated', (threads) => {
            this.threads = threads;
            this.updateThreadsList();
            this.log(`Threads updated: ${threads.length} threads`, 'info');
        });

        this.socket.on('message-received', (data) => {
            this.addMessage(data.message, 'agent');
            this.log('Message received from agent', 'info');
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
        this.createThreadBtn.disabled = !connected;
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

    updateThreadsList() {
        this.threadCount.textContent = this.threads.length;
        
        if (this.threads.length === 0) {
            this.threadsList.innerHTML = `
                <p>No threads available.</p>
                <div style="margin-top: 15px; text-align: center;">
                    <button class="btn" onclick="app.startNewConversation()" style="width: 100%; padding: 12px; font-size: 14px; font-weight: 600;">
                        🚀 Start New Conversation
                    </button>
                    <p style="font-size: 11px; color: #666; margin-top: 8px;">
                        Click to begin chatting with agents
                    </p>
                </div>
            `;
            return;
        }

        this.threadsList.innerHTML = this.threads.map(thread => `
            <div class="thread-item ${this.currentThread?.id === thread.id ? 'active' : ''}" 
                 data-thread-id="${thread.id}">
                <strong>${thread.name}</strong>
                <div style="font-size: 12px; color: #666;">
                    Creator: ${thread.creatorId}
                </div>
                ${thread.summary ? `<div style="font-size: 12px; margin-top: 5px;">${thread.summary}</div>` : ''}
            </div>
        `).join('');

        // Add click listeners to thread items
        this.threadsList.querySelectorAll('.thread-item').forEach(item => {
            item.addEventListener('click', () => {
                const threadId = item.dataset.threadId;
                this.selectThread(threadId);
            });
        });
    }

    showCreateThreadModal() {
        if (!this.connected || !this.socket) {
            this.log('Not connected to server', 'error');
            return;
        }

        this.threadModal.classList.add('show');
        this.threadNameInput.focus();
        this.threadNameInput.select();
    }

    hideCreateThreadModal() {
        this.threadModal.classList.remove('show');
    }

    handleCreateThread() {
        const threadName = this.threadNameInput.value.trim();
        if (!threadName) {
            this.threadNameInput.focus();
            return;
        }

        this.socket.emit('create-thread', {
            name: threadName,
            participants: ['user', 'interface', 'debugger']
        });

        this.log(`Creating thread: ${threadName}`, 'info');
        this.hideCreateThreadModal();
        
        // Reset the input for next time
        this.threadNameInput.value = 'New Conversation';
    }

    startNewConversation() {
        // Enable chat without waiting for thread creation
        this.currentThread = { id: 'new', name: 'New Conversation' };
        this.currentThreadDisplay.textContent = '- New Conversation';
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
        
        // Update messages container
        this.messagesContainer.innerHTML = `
            <p class="message system">Start typing your message below. A thread will be created automatically when you send your first message.</p>
        `;
        
        this.messageInput.focus();
        this.log('Ready to start new conversation', 'info');
    }

    selectThread(threadId) {
        this.currentThread = this.threads.find(t => t.id === threadId);
        if (this.currentThread) {
            this.currentThreadDisplay.textContent = `- ${this.currentThread.name}`;
            this.messageInput.disabled = false;
            this.sendBtn.disabled = false;
            this.updateThreadsList(); // Refresh to show active state
            this.log(`Selected thread: ${this.currentThread.name}`, 'info');
        }
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

    reset() {
        this.agents = [];
        this.threads = [];
        this.currentThread = null;
        this.activeQuestions.clear();
        
        this.updateAgentsList();
        this.updateThreadsList();
        this.messagesContainer.innerHTML = '<p class="message system">Select a thread to start chatting</p>';
        this.questionsContainer.innerHTML = '';
        this.currentThreadDisplay.textContent = '';
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
    }
}

// Initialize the app
const app = new CoralApp();