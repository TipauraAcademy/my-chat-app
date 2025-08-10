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
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|mp4|avi|mov|wmv|flv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

// Enhanced data storage
let users = new Map();
let groups = new Map();
let messages = new Map(); // groupId -> messages array
let onlineUsers = new Set();
let userSocketMap = new Map(); // username -> socket.id
let pinnedMessages = new Map(); // groupId -> pinned messages array
let messageReactions = new Map(); // messageId -> reactions object
let messageSeenStatus = new Map(); // messageId -> array of usernames who've seen it

// Initialize admin user
users.set('Aditya', { 
  username: 'Aditya', 
  password: '123', 
  isAdmin: true,
  isSuperAdmin: true,
  createdAt: new Date().toISOString() 
});

// Add some demo users for testing
users.set('demo', { 
  username: 'demo', 
  password: 'demo', 
  isAdmin: false,
  isSuperAdmin: false,
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
  members: ['Aditya', 'demo'],
  isDefault: true,
  settings: {
    allowMediaUpload: true,
    allowMemberInvite: false,
    maxMembers: 100
  }
};

groups.set('general', defaultGroup);
messages.set('general', []);
pinnedMessages.set('general', []);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test', (req, res) => {
  res.json({ 
    message: 'Enhanced Chat API working!', 
    users: users.size,
    groups: groups.size,
    totalMessages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0),
    onlineUsers: Array.from(onlineUsers)
  });
});

// Authentication
app.post('/api/auth', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    
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
      res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user's groups
app.get('/api/groups/:username', (req, res) => {
  try {
    const { username } = req.params;
    
    if (!users.has(username)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
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
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new group
app.post('/api/groups', (req, res) => {
  try {
    const { name, description, createdBy, adminToken } = req.body;
    
    if (!name || !createdBy) {
      return res.status(400).json({ success: false, message: 'Name and creator required' });
    }
    
    const user = users.get(createdBy);
    if (!user || !adminToken || !adminToken.includes(createdBy)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    // Check if group name already exists
    const existingGroup = Array.from(groups.values()).find(g => g.name.toLowerCase() === name.toLowerCase());
    if (existingGroup) {
      return res.status(400).json({ success: false, message: 'Group name already exists' });
    }
    
    const groupId = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const newGroup = {
      id: groupId,
      name,
      description: description || '',
      createdBy,
      createdAt: new Date().toISOString(),
      admins: [createdBy],
      members: [createdBy],
      isDefault: false,
      settings: {
        allowMediaUpload: true,
        allowMemberInvite: user.isSuperAdmin || user.isAdmin,
        maxMembers: 50
      }
    };
    
    groups.set(groupId, newGroup);
    messages.set(groupId, []);
    pinnedMessages.set(groupId, []);
    
    res.json({ success: true, group: newGroup });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add user to group
app.post('/api/groups/:groupId/members', (req, res) => {
  try {
    const { groupId } = req.params;
    const { username, addedBy, adminToken } = req.body;
    
    const group = groups.get(groupId);
    const adder = users.get(addedBy);
    
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    
    if (!adder || !adminToken || !adminToken.includes(addedBy)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
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
    
    if (group.members.length >= group.settings.maxMembers) {
      return res.status(400).json({ success: false, message: 'Group is full' });
    }
    
    group.members.push(username);
    res.json({ success: true, message: 'User added to group successfully' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get group messages
app.get('/api/groups/:groupId/messages', (req, res) => {
  try {
    const { groupId } = req.params;
    const groupMessages = messages.get(groupId) || [];
    
    // Add reactions and seen status to messages
    const enhancedMessages = groupMessages.map(message => ({
      ...message,
      reactions: messageReactions.get(message.id) || {},
      seenBy: messageSeenStatus.get(message.id) || []
    }));
    
    res.json(enhancedMessages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get pinned messages
app.get('/api/groups/:groupId/pinned', (req, res) => {
  try {
    const { groupId } = req.params;
    const pinned = pinnedMessages.get(groupId) || [];
    
    // Filter out expired pinned messages
    const now = new Date();
    const validPinned = pinned.filter(msg => new Date(msg.expiresAt) > now);
    
    if (validPinned.length !== pinned.length) {
      pinnedMessages.set(groupId, validPinned);
    }
    
    res.json(validPinned);
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Pin message
app.post('/api/messages/:groupId/:messageId/pin', (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const { pinnedBy, duration, adminToken } = req.body;
    
    const group = groups.get(groupId);
    const user = users.get(pinnedBy);
    
    if (!group || !user || !adminToken || !adminToken.includes(pinnedBy)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    if (!group.admins.includes(pinnedBy) && !user.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const groupMessages = messages.get(groupId) || [];
    const message = groupMessages.find(msg => msg.id == messageId);
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    
    const pinned = pinnedMessages.get(groupId) || [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(duration));
    
    const pinnedMessage = {
      ...message,
      pinnedBy,
      pinnedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    
    pinned.push(pinnedMessage);
    pinnedMessages.set(groupId, pinned);
    
    // Notify group members
    io.to(groupId).emit('messagePinned', { 
      groupId, 
      pinnedMessages: pinned 
    });
    
    res.json({ success: true, message: 'Message pinned successfully' });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete message
app.delete('/api/messages/:groupId/:messageId', (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const { deletedBy, adminToken } = req.body;
    
    const group = groups.get(groupId);
    const user = users.get(deletedBy);
    
    if (!group || !user || !adminToken || !adminToken.includes(deletedBy)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
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
    
    // Delete associated media file if exists
    if (message.mediaUrl && message.mediaUrl.startsWith('/uploads/')) {
      const filename = message.mediaUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    groupMessages.splice(messageIndex, 1);
    
    // Clean up reactions and seen status
    messageReactions.delete(message.id);
    messageSeenStatus.delete(message.id);
    
    // Notify all group members about message deletion
    io.to(groupId).emit('messageDeleted', { groupId, messageId });
    
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Media upload
app.post('/api/upload-media', upload.single('media'), (req, res) => {
  try {
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
      size: req.file.size,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// Download media endpoint
app.get('/api/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
});

// Add user (enhanced)
app.post('/api/add-user', (req, res) => {
  try {
    const { username, password, adminToken, isAdmin } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    
    const adminUser = Array.from(users.values()).find(u => u.isSuperAdmin && adminToken && adminToken.includes(u.username));
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
    if (defaultGroup && !defaultGroup.members.includes(username)) {
      defaultGroup.members.push(username);
    }
    
    res.json({ 
      success: true, 
      message: 'User added successfully',
      user: { username: newUser.username, isAdmin: newUser.isAdmin }
    });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get users (enhanced)
app.get('/api/users', (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper functions
function getLastActivity(groupId) {
  const groupMessages = messages.get(groupId) || [];
  if (groupMessages.length === 0) return null;
  return groupMessages[groupMessages.length - 1].timestamp;
}

function generateMessageId() {
  return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Socket.IO (enhanced)
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('authenticate', (userData) => {
    try {
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
    } catch (error) {
      console.error('Authentication error:', error);
    }
  });
  
  socket.on('joinGroup', (groupId) => {
    try {
      if (!socket.username) return;
      
      const group = groups.get(groupId);
      if (group && group.members.includes(socket.username)) {
        socket.join(groupId);
        socket.currentGroup = groupId;
        console.log(`${socket.username} joined group ${groupId}`);
      }
    } catch (error) {
      console.error('Join group error:', error);
    }
  });
  
  socket.on('leaveGroup', (groupId) => {
    try {
      socket.leave(groupId);
      if (socket.currentGroup === groupId) {
        socket.currentGroup = null;
      }
      console.log(`${socket.username} left group ${groupId}`);
    } catch (error) {
      console.error('Leave group error:', error);
    }
  });
  
  socket.on('newMessage', (messageData) => {
    try {
      if (!socket.username || !messageData.groupId || !messageData.text) return;
      
      const group = groups.get(messageData.groupId);
      if (!group || !group.members.includes(socket.username)) return;
      
      const messageId = generateMessageId();
      const message = {
        id: messageId,
        username: socket.username,
        text: messageData.text.trim(),
        timestamp: new Date().toISOString(),
        isAdmin: socket.isAdmin,
        isSuperAdmin: socket.isSuperAdmin,
        groupId: messageData.groupId,
        type: 'text',
        replyTo: messageData.replyTo || null
      };
      
      const groupMessages = messages.get(messageData.groupId) || [];
      groupMessages.push(message);
      
      // Keep only last 1000 messages per group
      if (groupMessages.length > 1000) {
        messages.set(messageData.groupId, groupMessages.slice(-1000));
      }
      
      // Initialize reactions and seen status
      messageReactions.set(messageId, {});
      messageSeenStatus.set(messageId, [socket.username]);
      
      io.to(messageData.groupId).emit('messageReceived', {
        ...message,
        reactions: {},
        seenBy: [socket.username]
      });
    } catch (error) {
      console.error('New message error:', error);
    }
  });
  
  socket.on('newMediaMessage', (messageData) => {
    try {
      if (!socket.username || !messageData.groupId || !messageData.mediaUrl) return;
      
      const group = groups.get(messageData.groupId);
      if (!group || !group.members.includes(socket.username)) return;
      
      if (!group.settings.allowMediaUpload) {
        socket.emit('error', { message: 'Media upload not allowed in this group' });
        return;
      }
      
      const messageId = generateMessageId();
      const message = {
        id: messageId,
        username: socket.username,
        mediaUrl: messageData.mediaUrl,
        mediaType: messageData.mediaType,
        text: messageData.caption || '',
        timestamp: new Date().toISOString(),
        isAdmin: socket.isAdmin,
        isSuperAdmin: socket.isSuperAdmin,
        groupId: messageData.groupId,
        type: messageData.mediaType === 'video' ? 'video' : 'image',
        replyTo: messageData.replyTo || null
      };
      
      const groupMessages = messages.get(messageData.groupId) || [];
      groupMessages.push(message);
      
      if (groupMessages.length > 1000) {
        messages.set(messageData.groupId, groupMessages.slice(-1000));
      }
      
      // Initialize reactions and seen status
      messageReactions.set(messageId, {});
      messageSeenStatus.set(messageId, [socket.username]);
      
      io.to(messageData.groupId).emit('messageReceived', {
        ...message,
        reactions: {},
        seenBy: [socket.username]
      });
    } catch (error) {
      console.error('New media message error:', error);
    }
  });
  
  socket.on('addReaction', (data) => {
    try {
      if (!socket.username || !data.messageId || !data.emoji || !data.groupId) return;
      
      const group = groups.get(data.groupId);
      if (!group || !group.members.includes(socket.username)) return;
      
      let reactions = messageReactions.get(data.messageId) || {};
      
      if (!reactions[data.emoji]) {
        reactions[data.emoji] = [];
      }
      
      if (!reactions[data.emoji].includes(socket.username)) {
        reactions[data.emoji].push(socket.username);
        messageReactions.set(data.messageId, reactions);
        
        io.to(data.groupId).emit('reactionAdded', {
          messageId: data.messageId,
          groupId: data.groupId,
          reactions: reactions
        });
      }
    } catch (error) {
      console.error('Add reaction error:', error);
    }
  });
  
  socket.on('toggleReaction', (data) => {
    try {
      if (!socket.username || !data.messageId || !data.emoji || !data.groupId) return;
      
      const group = groups.get(data.groupId);
      if (!group || !group.members.includes(socket.username)) return;
      
      let reactions = messageReactions.get(data.messageId) || {};
      
      if (!reactions[data.emoji]) {
        reactions[data.emoji] = [];
      }
      
      const userIndex = reactions[data.emoji].indexOf(socket.username);
      if (userIndex > -1) {
        reactions[data.emoji].splice(userIndex, 1);
        if (reactions[data.emoji].length === 0) {
          delete reactions[data.emoji];
        }
      } else {
        reactions[data.emoji].push(socket.username);
      }
      
      messageReactions.set(data.messageId, reactions);
      
      io.to(data.groupId).emit('reactionAdded', {
        messageId: data.messageId,
        groupId: data.groupId,
        reactions: reactions
      });
    } catch (error) {
      console.error('Toggle reaction error:', error);
    }
  });
  
  socket.on('markSeen', (data) => {
    try {
      if (!socket.username || !data.messageId || !data.groupId) return;
      
      const group = groups.get(data.groupId);
      if (!group || !group.members.includes(socket.username)) return;
      
      let seenBy = messageSeenStatus.get(data.messageId) || [];
      
      if (!seenBy.includes(socket.username)) {
        seenBy.push(socket.username);
        messageSeenStatus.set(data.messageId, seenBy);
        
        io.to(data.groupId).emit('messageSeenUpdate', {
          messageId: data.messageId,
          groupId: data.groupId,
          seenBy: seenBy
        });
      }
    } catch (error) {
      console.error('Mark seen error:', error);
    }
  });
  
  socket.on('typing', (data) => {
    try {
      if (!socket.username || !data.groupId) return;
      
      socket.to(data.groupId).emit('userTyping', {
        username: socket.username,
        isTyping: data.isTyping,
        groupId: data.groupId
      });
    } catch (error) {
      console.error('Typing error:', error);
    }
  });
  
  socket.on('disconnect', () => {
    try {
      if (socket.username) {
        onlineUsers.delete(socket.username);
        userSocketMap.delete(socket.username);
        io.emit('onlineUsers', Array.from(onlineUsers));
        console.log(`${socket.username} disconnected`);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large (max 50MB)' });
    }
    return res.status(400).json({ success: false, message: 'File upload error: ' + error.message });
  }
  
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Cleanup expired pinned messages periodically
setInterval(() => {
  try {
    const now = new Date();
    for (const [groupId, pinned] of pinnedMessages.entries()) {
      const validPinned = pinned.filter(msg => new Date(msg.expiresAt) > now);
      if (validPinned.length !== pinned.length) {
        pinnedMessages.set(groupId, validPinned);
        // Notify group about updated pinned messages
        io.to(groupId).emit('messagePinned', { 
          groupId, 
          pinnedMessages: validPinned 
        });
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60000); // Check every minute

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Enhanced Chat Server running on port ${PORT}`);
  console.log(`👤 Super Admin login: Aditya / 123`);
  console.log(`👤 Demo user login: demo / demo`);
  console.log(`🔧 Features: Groups, Media Upload/Download, Reactions, Pin Messages, Admin Controls`);
  console.log(`📊 Stats: ${users.size} users, ${groups.size} groups`);
});
