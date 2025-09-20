const WebSocket = require('ws');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');

class SessionManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.sessionId = null;
    this.agentId = null;
    this.ws = null;
    this.connected = false;
    this.agents = [];
    this.threads = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async createSession() {
    try {
      const sessionData = {
        applicationId: this.config.applicationId,
        privacyKey: this.config.privacyKey,
        sessionId: `session-${uuidv4()}`,
        agentGraphRequest: {
          agents: [
            {
              id: {
                name: "interface-agent",
                version: "1.0.0"
              },
              name: "interface",
              description: "User interface agent for interaction",
              options: {
                DEEPSEEK_API_KEY: {
                  type: "string",
                  value: "sk-bdea435884bd4d59b5dec3a3062b59d4"
                }
              },
              systemPrompt: "You are a helpful interface agent that facilitates user interactions.",
              blocking: true,
              customToolAccess: [],
              coralPlugins: [],
              provider: {
                type: "local",
                runtime: "docker"
              }
            },
            {
              id: {
                name: "unified-debug-agent",
                version: "1.0.0"
              },
              name: "debugger",
              description: "Unified debugging agent for code analysis and fixes",
              options: {
                DEEPSEEK_API_KEY: {
                  type: "string",
                  value: "sk-bdea435884bd4d59b5dec3a3062b59d4"
                },
                QDRANT_API_KEY: {
                  type: "string",
                  value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.0CO_Owpp0ljObcXPQkiyDP3JiVoyd4fraS8-eM4NWyI"
                },
                QDRANT_URL: {
                  type: "string",
                  value: "https://d8539721-041b-41e6-bc3c-213922fbcc29.us-west-1-0.aws.cloud.qdrant.io:6333"
                },
                CODESTRAL_API_KEY: {
                  type: "string", 
                  value: "TTFxbNOJlCsbI0VGRZdZHTlrrGJSHRmu"
                }
              },
              systemPrompt: "You are a unified debugging agent that handles complete debugging workflows.",
              blocking: true,
              customToolAccess: [],
              coralPlugins: [],
              provider: {
                type: "local",
                runtime: "docker"
              }
            }
          ],
          groups: [
            ["interface", "debugger"]
          ],
          customTools: {}
        }
      };

      console.log('Creating session with data:', JSON.stringify(sessionData, null, 2));

      const result = await this.makeHttpRequest({
        hostname: this.config.host,
        port: this.config.port,
        path: '/api/v1/sessions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(JSON.stringify(sessionData))
        }
      }, JSON.stringify(sessionData));

      this.sessionId = result.sessionId;
      console.log('Session created successfully:', this.sessionId);
      
      return this.sessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  makeHttpRequest(options, data) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const result = JSON.parse(responseData);
              resolve(result);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      if (data) {
        req.write(data);
      }
      
      req.end();
    });
  }

  async connect(sessionId) {
    if (sessionId) {
      this.sessionId = sessionId;
    }

    // Use correct WebSocket endpoint from coral-studio
    const wsUrl = `ws://${this.config.host}:${this.config.port}/ws/v1/debug/${this.config.applicationId}/${this.config.privacyKey}/${this.sessionId}/?timeout=10000`;
    console.log('Connecting to WebSocket:', wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('WebSocket connected successfully');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connection-status', { connected: true });
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('connection-status', { connected: false, error: error.message });
    });

    this.ws.on('close', () => {
      console.log('WebSocket connection closed');
      this.connected = false;
      this.emit('connection-status', { connected: false });
      
      // Attempt reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => this.connect(), 5000);
      }
    });
  }

  handleMessage(message) {
    console.log('Received WebSocket message:', message);

    switch (message.type) {
      case 'debug_agent_registered':
        this.agentId = message.id;
        console.log('Agent registered:', this.agentId);
        break;

      case 'agent_list':
        this.agents = message.sessionAgents || [];
        this.emit('agents-updated', this.agents);
        break;

      case 'thread_list':
        this.threads = message.threads || [];
        this.emit('threads-updated', this.threads);
        break;

      case 'session':
        this.handleSessionEvent(message.event);
        break;

      case 'tool_request':
        this.emit('tool-request', {
          id: message.id,
          tool: message.tool,
          params: message.params,
          agentId: message.agentId,
          threadId: message.threadId
        });
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  handleSessionEvent(event) {
    console.log('Session event:', event);

    switch (event.type) {
      case 'agent_ready':
        console.log('Agent ready:', event.agent);
        break;

      case 'agent_registered':
        this.agents.push(event.agent);
        this.emit('agents-updated', this.agents);
        break;

      case 'agent_state_updated':
        const agentIndex = this.agents.findIndex(a => a.id === event.agentId);
        if (agentIndex >= 0) {
          this.agents[agentIndex].state = event.state;
          this.emit('agents-updated', this.agents);
        }
        break;

      case 'message_sent':
        this.emit('message-received', {
          threadId: event.threadId,
          message: event.message
        });
        break;

      case 'thread_created':
        this.threads.push({
          id: event.id,
          name: event.name,
          creatorId: event.creatorId,
          participants: event.participants,
          summary: event.summary
        });
        this.emit('threads-updated', this.threads);
        break;
    }
  }

  createThread(name, participants) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'create_thread',
      name: name,
      participants: participants
    };

    console.log('Creating thread:', message);
    this.ws.send(JSON.stringify(message));
  }

  sendMessage(threadId, content) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'send_message',
      threadId: threadId,
      content: content,
      role: 'user'
    };

    this.ws.send(JSON.stringify(message));
  }

  sendUserResponse(requestId, response) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'user_response',
      requestId: requestId,
      response: response
    };

    this.ws.send(JSON.stringify(message));
  }

  sendToolResponse(requestId, result) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'tool_response',
      requestId: requestId,
      result: result
    };

    this.ws.send(JSON.stringify(message));
  }

  sendDirectMessage(content) {
    if (!this.connected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    // Try sending a direct message that might trigger thread creation
    const message = {
      type: 'user_message',
      content: content,
      role: 'user'
    };

    console.log('Sending direct message:', message);
    this.ws.send(JSON.stringify(message));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = SessionManager;