const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const SessionManager = require('./lib/session-manager');
const MCPToolsHandler = require('./lib/mcp-tools');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global state
const sessions = new Map();
const userConnections = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Store user connection
  userConnections.set(socket.id, socket);
  
  // Handle session creation
  socket.on('create-session', async (data) => {
    try {
      console.log('Creating session with data:', data);
      
      const sessionManager = new SessionManager({
        host: process.env.CORAL_SERVER_HOST,
        port: process.env.CORAL_SERVER_PORT,
        applicationId: process.env.CORAL_APP_ID,
        privacyKey: process.env.CORAL_PRIVACY_KEY
      });
      
      const sessionId = await sessionManager.createSession();
      console.log('Session created:', sessionId);
      
      // Store session
      sessions.set(socket.id, sessionManager);
      
      // Set up MCP tools handler
      const mcpTools = new MCPToolsHandler(socket, sessionManager);
      sessionManager.mcpTools = mcpTools;
      
      // Connect to session WebSocket
      await sessionManager.connect(sessionId);
      
      // Forward session events to client
      sessionManager.on('agents-updated', (agents) => {
        socket.emit('agents-updated', agents);
      });
      
      
      sessionManager.on('message-received', (message) => {
        socket.emit('message-received', message);
      });
      
      sessionManager.on('connection-status', (status) => {
        socket.emit('connection-status', status);
      });
      
      socket.emit('session-created', { sessionId });
      
    } catch (error) {
      console.error('Error creating session:', error);
      socket.emit('error', { message: 'Failed to create session', error: error.message });
    }
  });
  
  // Handle user responses to agent requests
  socket.on('user-response', (data) => {
    const sessionManager = sessions.get(socket.id);
    const mcpTools = sessionManager ? sessionManager.mcpTools : null;
    if (mcpTools) {
      mcpTools.respondToQuestion(data.requestId, data.response);
    }
  });
  

  // Handle direct messages to agents
  socket.on('send-message', (data) => {
    console.log('Received send-message event:', data);
    const sessionManager = sessions.get(socket.id);
    if (sessionManager) {
      console.log('SessionManager found, sending direct message');
      // Send all messages directly to agents
      sessionManager.sendDirectMessage(data.content);
    } else {
      console.log('No SessionManager found for socket:', socket.id);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clean up session
    const sessionManager = sessions.get(socket.id);
    if (sessionManager) {
      sessionManager.disconnect();
      sessions.delete(socket.id);
    }
    
    userConnections.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Coral App Server running on port ${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});