const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // 100MB for file uploads
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Railway-specific fixes
app.use((req, res, next) => {
  // Add CORS headers for Railway
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// In-memory storage (replace with database for production)
let users = new Map();
let messages = [];
let friendRequests = [];
let onlineUsers = new Set();

// Initialize with admin user
users.set('Aditya', { 
  username: 'Aditya', 
  password: '123', 
  isAdmin: true, 
  createdAt: new Date().toISOString() 
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test endpoint to verify API is working
app.get('/test', (req, res) => {
  res.json({ 
    message: 'API is working!', 
    timestamp: new Date(),
    users: users.size,
    messages: messages.length 
  });
});

// Authentication endpoint
app.post('/api/auth', (req, res) => {
  console.log('Login attempt:', req.body);
  const { username, password } = req.body;
  
  const user = users.get(username);
  if (user && user.password === password) {
    console.log('Login successful for:', username);
    res.json({ 
      success: true, 
      user: { 
        username: user.username, 
        isAdmin: user.isAdmin || false 
      },
      token: `${username}_${Date.now()}`
    });
  } else {
    console.log('Login failed for:', username);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Add new user (admin only)
app.post('/api/add-user', (req, res) => {
  const { username, password, adminToken } = req.body;
  
  // Verify admin token (simple check, enhance for production)
  const adminUser = Array.from(users.values()).find(u => u.isAdmin && adminToken.includes(u.username));
  if (!adminUser) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  if (users.has(username)) {
    return res.status(400).json({ success: false, message: 'Username already exists' });
  }
  
  const newUser = {
    username,
    password,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    createdBy: adminUser.username
  };
  
  users.set(username, newUser);
  
  res.json({ 
    success: true, 
    message: 'User added successfully',
    user: { username: newUser.username, isAdmin: false }
  });
});

// Get all users (admin only)
app.get('/api/users', (req, res) => {
  const adminToken = req.headers.authorization;
  if (!adminToken) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  const adminUser = Array.from(users.values()).find(u => u.isAdmin && adminToken.includes(u.username));
  if (!adminUser) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  const userList = Array.from(users.values()).map(u => ({
    username: u.username,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    createdBy: u.createdBy
  }));
  
  res.json(userList);
});

// Delete user (admin only)
app.delete('/api/users/:username', (req, res) => {
  const { username } = req.params;
  const adminToken = req.headers.authorization;
  
  if (!adminToken) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  const adminUser = Array.from(users.values()).find(u => u.isAdmin && adminToken.includes(u.username));
  if (!adminUser) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  if (username === 'Aditya') {
    return res.status(400).json({ success: false, message: 'Cannot delete admin user' });
  }
  
  if (users.delete(username)) {
    // Remove user from online users if connected
    onlineUsers.delete(username);
    io.emit('onlineUsers', Array.from(onlineUsers));
    
    res.json({ success: true, message: 'User deleted successfully' });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ 
    success: true, 
    imageUrl: imageUrl,
    filename: req.file.filename
  });
});

// Get messages
app.get('/api/messages', (req, res) => {
  console.log('Messages requested, returning:', messages.length, 'messages');
  res.json(messages);
});

// Get friend requests (admin only)
app.get('/api/friend-requests', (req, res) => {
  res.json(friendRequests);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    users: users.size,
    onlineUsers: onlineUsers.size,
    messages: messages.length
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle user authentication
  socket.on('authenticate', (userData) => {
    if (userData && userData.username) {
      const user = users.get(userData.username);
      if (user) {
        socket.username = userData.username;
        socket.isAdmin = user.isAdmin || false;
        onlineUsers.add(userData.username);
        
        // Broadcast updated online users
        io.emit('onlineUsers', Array.from(onlineUsers));
        
        console.log(`${userData.username} authenticated`);
      }
    }
  });
  
  // Handle new messages (text)
  socket.on('newMessage', (messageData) => {
    if (!socket.username) return;
    
    const message = {
      id: Date.now(),
      username: socket.username,
      text: messageData.text,
      timestamp: new Date().toISOString(),
      isAdmin: socket.isAdmin,
      type: 'text'
    };
    
    messages.push(message);
    
    // Keep only last 100 messages
    if (messages.length > 100) {
      messages = messages.slice(-100);
    }
    
    // Broadcast to all clients
    io.emit('messageReceived', message);
  });
  
  // Handle image messages
  socket.on('newImageMessage', (messageData) => {
    if (!socket.username) return;
    
    const message = {
      id: Date.now(),
      username: socket.username,
      imageUrl: messageData.imageUrl,
      caption: messageData.caption || '',
      timestamp: new Date().toISOString(),
      isAdmin: socket.isAdmin,
      type: 'image'
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

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large' });
    }
  }
  res.status(500).json({ success: false, message: error.message });
});

// Catch-all route for debugging
app.get('*', (req, res) => {
  console.log('Unmatched route:', req.path);
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found', path: req.path });
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Access from any device: http://YOUR_IP_ADDRESS:${PORT}`);
  console.log(`💻 Local access: http://localhost:${PORT}`);
  console.log(`👤 Admin login: Aditya / 123`);
  console.log(`🔧 Test API: /test`);
  console.log(`📊 Health check: /health`);
});
