const { v4: uuidv4 } = require('uuid');

class MCPToolsHandler {
  constructor(socket, sessionManager) {
    this.socket = socket;
    this.sessionManager = sessionManager;
    this.activeRequests = new Map();
    
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // Listen for agent tool requests through the session manager
    this.sessionManager.on('tool-request', (request) => {
      this.handleToolRequest(request);
    });
  }

  handleToolRequest(request) {
    console.log('Handling tool request:', request);

    switch (request.tool) {
      case 'request-question':
        this.handleQuestionRequest(request);
        break;
      
      case 'answer-question':
        this.handleAnswerReceived(request);
        break;
        
      default:
        console.log('Unknown tool request:', request.tool);
    }
  }

  handleQuestionRequest(request) {
    const requestId = uuidv4();
    const questionData = {
      id: requestId,
      question: request.params.question,
      context: request.params.context || '',
      timestamp: new Date().toISOString(),
      agentId: request.agentId,
      threadId: request.threadId
    };

    // Store the request for later reference
    this.activeRequests.set(requestId, {
      ...questionData,
      originalRequest: request
    });

    // Send to frontend
    this.socket.emit('agent-question', questionData);

    console.log('Sent question to frontend:', questionData);
  }

  handleAnswerReceived(request) {
    const { questionId, answer } = request.params;
    
    if (this.activeRequests.has(questionId)) {
      const originalRequest = this.activeRequests.get(questionId);
      
      // Send response back to agent through session manager
      this.sessionManager.sendToolResponse(originalRequest.originalRequest.id, {
        success: true,
        result: answer
      });

      // Clean up
      this.activeRequests.delete(questionId);
      
      console.log('Processed user answer:', { questionId, answer });
    } else {
      console.error('No active request found for questionId:', questionId);
    }
  }

  // Method for frontend to send user responses
  respondToQuestion(questionId, answer) {
    if (this.activeRequests.has(questionId)) {
      const request = this.activeRequests.get(questionId);
      
      // Send tool response back to the agent
      this.sessionManager.sendToolResponse(request.originalRequest.id, {
        success: true,
        result: answer
      });

      // Clean up
      this.activeRequests.delete(questionId);
      
      // Notify frontend that response was sent
      this.socket.emit('response-sent', { questionId, answer });
      
      console.log('User response sent to agent:', { questionId, answer });
    } else {
      console.error('No active request found for questionId:', questionId);
      this.socket.emit('error', { 
        message: 'Invalid question ID',
        questionId 
      });
    }
  }

  // Get all active requests
  getActiveRequests() {
    return Array.from(this.activeRequests.values()).map(req => ({
      id: req.id,
      question: req.question,
      context: req.context,
      timestamp: req.timestamp,
      agentId: req.agentId,
      threadId: req.threadId
    }));
  }

  // Clear all active requests
  clearRequests() {
    this.activeRequests.clear();
  }
}

module.exports = MCPToolsHandler;