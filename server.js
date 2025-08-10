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
  maxHttpBufferSize: 1e8
});

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Multer config for images and videos
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|mp4|avi|mov|wmv|flv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

// Data storage
let users = new Map();
let groups = new Map();
let messages = new Map(); // groupId -> messages array
let onlineUsers = new Set();
let userSocketMap = new Map(); // username -> socket.id

// Initialize admin user
users.set('Aditya', { 
  username: 'Aditya', 
  password: '123', 
  isAdmin: true,
  isSuperAdmin: true,
  createdAt: new Date().toISOString() 
});

// Initialize default group
const defaultGroup = {
  id: 'general',
  name: 'General Chat',
  description: 'Main chat room for everyone',
  createdBy: 'Aditya',
  createdAt: new Date().toISOString(),
  admins: ['Aditya'],
  members: ['Aditya'],
  isDefault: true,
  settings: {
    allowMediaUpload: true,
    allowMemberInvite: false,
    maxMembers: 100
  }
};

groups.set('general', defaultGroup);
messages.set('general', []);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test', (req, res) => {
  res.json({ 
    message: 'Enhanced Chat API working!', 
    users: users.size,
    groups: groups.size,
    totalMessages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0)
  });
});

// Authentication
app.post('/api/auth', (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = users.get(username);
    if (user && user.password === password) {
      // Add user to default group if not already a member
      const defaultGroup = groups.get('general');
      if (defaultGroup && !defaultGroup.members.includes(username)) {
        defaultGroup.members.push(username);
      }
      
      res.json({ 
        success: true, 
        user: { 
          username: user.username, 
          isAdmin: user.isAdmin || false,
          isSuperAdmin: user.isSuperAdmin || false
        },
        token: `${username}_${Date.now()}`
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user's groups
app.get('/api/groups/:username', (req, res) => {
  const { username } = req.params;
  const userGroups = Array.from(groups.values())
    .filter(group => group.members.includes(username))
    .map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      isDefault: group.isDefault,
      isAdmin: group.admins.includes(username),
      memberCount: group.members.length,
      lastActivity: getLastActivity(group.id)
    }));
  
  res.json(userGroups);
});

// Create new group
app.post('/api/groups', (req, res) => {
  const { name, description, createdBy, adminToken } = req.body;
  
  const user = users.get(createdBy);
  if (!user || !adminToken.includes(createdBy)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  
  const groupId = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
  const newGroup = {
    id: groupId,
    name,
    description,
    createdBy,
    createdAt: new Date().toISOString(),
    admins: [createdBy],
    members: [createdBy],
    isDefault: false,
    settings: {
      allowMediaUpload: true,
      allowMemberInvite: true,
      maxMembers: 50
    }
  };
  
  groups.set(groupId, newGroup);
  messages.set(groupId, []);
  
  res.json({ success: true, group: newGroup });
});

// Add user to group
app.post('/api/groups/:groupId/members', (req, res) => {
  const { groupId } = req.params;
  const { username, addedBy, adminToken } = req.body;
  
  const group = groups.get(groupId);
  const adder = users.get(addedBy);
  
  if (!group || !adder || !adminToken.includes(addedBy)) {
    return res.status(404).json({ success: false, message: 'Group or user not found' });
  }
  
  if (!group.admins.includes(addedBy) && !adder.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  if (!users.has(username)) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  
  if (group.members.includes(username)) {
    return res.status(400).json({ success: false, message: 'User already in group' });
  }
  
  group.members.push(username);
  res.json({ success: true, message: 'User added to group' });
});

// Promote user to group admin
app.post('/api/groups/:groupId/admins', (req, res) => {
  const { groupId } = req.params;
  const { username, promotedBy, adminToken } = req.body;
  
  const group = groups.get(groupId);
  const promoter = users.get(promotedBy);
  
  if (!group || !promoter || !adminToken.includes(promotedBy)) {
    return res.status(404).json({ success: false, message: 'Group or user not found' });
  }
  
  if (!group.admins.includes(promotedBy) && !promoter.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  if (!group.members.includes(username)) {
    return res.status(400).json({ success: false, message: 'User not in group' });
  }
  
  if (!group.admins.includes(username)) {
    group.admins.push(username);
  }
  
  res.json({ success: true, message: 'User promoted to admin' });
});

// Get group messages
app.get('/api/groups/:groupId/messages', (req, res) => {
  const { groupId } = req.params;
  const groupMessages = messages.get(groupId) || [];
  res.json(groupMessages);
});

// Delete message
app.delete('/api/messages/:groupId/:messageId', (req, res) => {
  const { groupId, messageId } = req.params;
  const { deletedBy, adminToken } = req.body;
  
  const group = groups.get(groupId);
  const user = users.get(deletedBy);
  
  if (!group || !user || !adminToken.includes(deletedBy)) {
    return res.status(404).json({ success: false, message: 'Not authorized' });
  }
  
  const groupMessages = messages.get(groupId) || [];
  const messageIndex = groupMessages.findIndex(msg => msg.id == messageId);
  
  if (messageIndex === -1) {
    return res.status(404).json({ success: false, message: 'Message not found' });
  }
  
  const message = groupMessages[messageIndex];
  
  // Check if user can delete (message owner, group admin, or super admin)
  if (message.username !== deletedBy && 
      !group.admins.includes(deletedBy) && 
      !user.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Permission denied' });
  }
  
  groupMessages.splice(messageIndex, 1);
  
  // Notify all group members about message deletion
  io.to(groupId).emit('messageDeleted', { groupId, messageId });
  
  res.json({ success: true, message: 'Message deleted' });
});

// Clear all messages in group
app.delete('/api/groups/:groupId/messages', (req, res) => {
  const { groupId } = req.params;
  const { clearedBy, adminToken } = req.body;
  
  const group = groups.get(groupId);
  const user = users.get(clearedBy);
  
  if (!group || !user || !adminToken.includes(clearedBy)) {
    return res.status(404).json({ success: false, message: 'Not authorized' });
  }
  
  if (!group.admins.includes(clearedBy) && !user.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  messages.set(groupId, []);
  
  // Notify all group members about chat clear
  io.to(groupId).emit('chatCleared', { groupId });
  
  res.json({ success: true, message: 'Chat cleared' });
});

// Add user (enhanced)
app.post('/api/add-user', (req, res) => {
  const { username, password, adminToken, isAdmin } = req.body;
  
  const adminUser = Array.from(users.values()).find(u => u.isSuperAdmin && adminToken.includes(u.username));
  if (!adminUser) {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  
  if (users.has(username)) {
    return res.status(400).json({ success: false, message: 'Username already exists' });
  }
  
  const newUser = {
    username,
    password,
    isAdmin: isAdmin || false,
    isSuperAdmin: false,
    createdAt: new Date().toISOString(),
    createdBy: adminUser.username
  };
  
  users.set(username, newUser);
  
  // Add to default group
  const defaultGroup = groups.get('general');
  if (defaultGroup) {
    defaultGroup.members.push(username);
  }
  
  res.json({ 
    success: true, 
    message: 'User added successfully',
    user: { username: newUser.username, isAdmin: newUser.isAdmin }
  });
});

// Media upload (enhanced for videos)
app.post('/api/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  const mediaUrl = `/uploads/${req.file.filename}`;
  const isVideo = req.file.mimetype.startsWith('video/');
  
  res.json({ 
    success: true, 
    mediaUrl: mediaUrl,
    filename: req.file.filename,
    type: isVideo ? 'video' : 'image',
    size: req.file.size
  });
});

// Download media endpoint
app.get('/api/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

// Get users (enhanced)
app.get('/api/users', (req, res) => {
  const adminToken = req.headers.authorization;
  if (!adminToken) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  const adminUser = Array.from(users.values()).find(u => (u.isAdmin || u.isSuperAdmin) && adminToken.includes(u.username));
  if (!adminUser) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  
  const userList = Array.from(users.values()).map(u => ({
    username: u.username,
    isAdmin: u.isAdmin,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt,
    createdBy: u.createdBy,
    isOnline: onlineUsers.has(u.username)
  }));
  
  res.json(userList);
});

// Helper function
function getLastActivity(groupId) {
  const groupMessages = messages.get(groupId) || [];
  if (groupMessages.length === 0) return null;
  return groupMessages[groupMessages.length - 1].timestamp;
}

// Socket.IO (enhanced)
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('authenticate', (userData) => {
    if (userData && userData.username) {
      const user = users.get(userData.username);
      if (user) {
        socket.username = userData.username;
        socket.isAdmin = user.isAdmin || false;
        socket.isSuperAdmin = user.isSuperAdmin || false;
        onlineUsers.add(userData.username);
        userSocketMap.set(userData.username, socket.id);
        
        // Join user's groups
        const userGroups = Array.from(groups.values())
          .filter(group => group.members.includes(userData.username));
        
        userGroups.forEach(group => {
          socket.join(group.id);
        });
        
        io.emit('onlineUsers', Array.from(onlineUsers));
        console.log(`${userData.username} authenticated and joined ${userGroups.length} groups`);
      }
    }
  });
  
  socket.on('joinGroup', (groupId) => {
    if (!socket.username) return;
    
    const group = groups.get(groupId);
    if (group && group.members.includes(socket.username)) {
      socket.join(groupId);
      socket.currentGroup = groupId;
    }
  });
  
  socket.on('leaveGroup', (groupId) => {
    socket.leave(groupId);
    if (socket.currentGroup === groupId) {
      socket.currentGroup = null;
    }
  });
  
  socket.on('newMessage', (messageData) => {
    if (!socket.username || !messageData.groupId) return;
    
    const group = groups.get(messageData.groupId);
    if (!group || !group.members.includes(socket.username)) return;
    
    const message = {
      id: Date.now(),
      username: socket.username,
      text: messageData.text,
      timestamp: new Date().toISOString(),
      isAdmin: socket.isAdmin,
      isSuperAdmin: socket.isSuperAdmin,
      groupId: messageData.groupId,
      type: 'text'
    };
    
    const groupMessages = messages.get(messageData.groupId) || [];
    groupMessages.push(message);
    
    // Keep only last 1000 messages per group
    if (groupMessages.length > 1000) {
      messages.set(messageData.groupId, groupMessages.slice(-1000));
    }
    
    io.to(messageData.groupId).emit('messageReceived', message);
  });
  
  socket.on('newMediaMessage', (messageData) => {
    if (!socket.username || !messageData.groupId) return;
    
    const group = groups.get(messageData.groupId);
    if (!group || !group.members.includes(socket.username)) return;
    
    const message = {
      id: Date.now(),
      username: socket.username,
      mediaUrl: messageData.mediaUrl,
      mediaType: messageData.mediaType,
      caption: messageData.caption || '',
      timestamp: new Date().toISOString(),
      isAdmin: socket.isAdmin,
      isSuperAdmin: socket.isSuperAdmin,
      groupId: messageData.groupId,
      type: messageData.mediaType
    };
    
    const groupMessages = messages.get(messageData.groupId) || [];
    groupMessages.push(message);
    
    if (groupMessages.length > 1000) {
      messages.set(messageData.groupId, groupMessages.slice(-1000));
    }
    
    io.to(messageData.groupId).emit('messageReceived', message);
  });
  
  socket.on('typing', (data) => {
    if (!socket.username || !data.groupId) return;
    
    socket.to(data.groupId).emit('userTyping', {
      username: socket.username,
      isTyping: data.isTyping,
      groupId: data.groupId
    });
  });
  
  socket.on('requestGroupUpdate', (groupId) => {
    if (!socket.username) return;
    
    const group = groups.get(groupId);
    if (group && group.members.includes(socket.username)) {
      const onlineMembers = group.members.filter(member => onlineUsers.has(member));
      socket.emit('groupUpdate', {
        groupId,
        onlineMembers,
        totalMembers: group.members.length,
        isAdmin: group.admins.includes(socket.username)
      });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      userSocketMap.delete(socket.username);
      io.emit('onlineUsers', Array.from(onlineUsers));
      console.log(`${socket.username} disconnected`);
    }
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Error:', error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large (max 50MB)' });
    }
  }
  res.status(500).json({ success: false, message: error.message });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Enhanced Chat Server running on port ${PORT}`);
  console.log(`👤 Super Admin login: Aditya / 123`);
  console.log(`🔧 Features: Groups, Media Upload/Download, Enhanced Admin Controls`);
});
