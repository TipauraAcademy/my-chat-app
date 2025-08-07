const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (replace with database for production)
let users = new Map();
let messages = [];
let friendRequests = [];
let onlineUsers = new Set();

// Admin credentials
const ADMIN_USERS = {
  'ADMIN': 'admin123',
  'ADITYA': 'aditya123'
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authentication endpoint
app.post('/api/auth', (req, res) => {
  const { username, password } = req.body;
  
  if (ADMIN_USERS[username] && ADMIN_USERS[username] === password) {
    res.json({ 
      success: true, 
      user: { username, isAdmin: true },
      token: `${username}_${Date.now()}`
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Get messages
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

// Get friend requests (admin only)
app.get('/api/friend-requests', (req, res) => {
  res.json(friendRequests);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle user authentication
  socket.on('authenticate', (userData) => {
    if (userData && userData.username) {
      socket.username = userData.username;
      socket.isAdmin = userData.isAdmin || false;
      onlineUsers.add(userData.username);
      
      // Broadcast updated online users
      io.emit('onlineUsers', Array.from(onlineUsers));
      
      console.log(`${userData.username} authenticated`);
    }
  });
  
  // Handle new messages
  socket.on('newMessage', (messageData) => {
    if (!socket.username) return;
    
    const message = {
      id: Date.now(),
      username: socket.username,
      text: messageData.text,
      timestamp: new Date().toISOString(),
      isAdmin: socket.isAdmin
    };
    
    messages.push(message);
    
    // Keep only last 100 messages
    if (messages.length > 100) {
      messages = messages.slice(-100);
    }
    
    // Broadcast to all clients
    io.emit('messageReceived', message);
  });
  
  // Handle friend requests
  socket.on('sendFriendRequest', (requestData) => {
    if (!socket.username) return;
    
    const friendRequest = {
      id: Date.now(),
      from: socket.username,
      to: requestData.to,
      message: requestData.message,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    friendRequests.push(friendRequest);
    
    // Notify admins
    io.emit('newFriendRequest', friendRequest);
  });
  
  // Handle friend request responses (admin only)
  socket.on('respondFriendRequest', (responseData) => {
    if (!socket.isAdmin) return;
    
    const request = friendRequests.find(req => req.id === responseData.requestId);
    if (request) {
      request.status = responseData.action; // 'accepted' or 'rejected'
      request.respondedBy = socket.username;
      request.responseTime = new Date().toISOString();
      
      // Broadcast updated friend requests
      io.emit('friendRequestUpdated', request);
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    if (!socket.username) return;
    
    socket.broadcast.emit('userTyping', {
      username: socket.username,
      isTyping: data.isTyping
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('onlineUsers', Array.from(onlineUsers));
      console.log(`${socket.username} disconnected`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Access from any device: http://YOUR_IP_ADDRESS:${PORT}`);
  console.log(`💻 Local access: http://localhost:${PORT}`);
});