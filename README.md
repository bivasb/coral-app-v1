# coral-app-v1

A Node.js/Express frontend application for interacting with Coral Protocol agents through WebSocket connections and custom MCP tools.

## Features

- **Real-time WebSocket Communication**: Connect to Coral Server agents
- **Session Management**: Create and manage agent sessions
- **Custom MCP Tools**: Handle bidirectional agent-user interactions
- **Interactive UI**: Web-based interface for chatting with agents
- **Agent Questions**: Handle agent requests for user input
- **Thread Management**: Organize conversations in threads
- **Activity Logging**: Monitor connection status and events

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start development server
npm run dev

# Access the application
open http://localhost:3000
```

## Usage

1. **Connect**: Click "Connect to Session" to establish a connection with Coral Server
2. **View Agents**: See available agents in the left panel
3. **Select Thread**: Click on a thread to start chatting
4. **Send Messages**: Type messages in the chat input
5. **Respond to Agent Questions**: When agents ask questions, response prompts will appear

## Architecture

- **Backend**: Node.js/Express server with Socket.IO for real-time communication
- **Session Manager**: Handles WebSocket connections to Coral Server
- **MCP Tools**: Manages custom MCP tool interactions
- **Frontend**: Interactive web interface with real-time updates

## License

MIT License