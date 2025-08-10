const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed'));
        }
    }
});

// In-memory data storage (in production, use a proper database)
const users = new Map();
const groups = new Map();
const messages = new Map(); // groupId -> messages[]
const onlineUsers = new Set();
const userSockets = new Map(); // username -> socketId
const pinnedMessages = new Map(); // groupId -> pinned messages[]
const messageReactions = new Map(); // messageId -> reactions{}
const messageSeenBy = new Map(); // messageId -> username[]
const typingUsers = new Map(); // groupId -> Set of usernames

// Default credentials
const DEFAULT_USERS = {
    'admin': { password: 'ADMIN', isSuperAdmin: true },
    'aditya': { password: 'ADITYA', isAdmin: true },
    'user1': { password: 'ADITYA', isAdmin: false },
    'user2': { password: 'ADITYA', isAdmin: false },
    'guest': { password: 'GUEST', isAdmin: false }
};

// Initialize default group
const DEFAULT_GROUP = {
    id: 'general',
    name: 'General Chat',
    members: Object.keys(DEFAULT_USERS),
    admins: ['admin', 'aditya'],
    isDefault: true,
    createdAt: new Date(),
    memberCount: Object.keys(DEFAULT_USERS).length
};

groups.set('general', DEFAULT_GROUP);
messages.set('general', []);
pinnedMessages.set('general', []);

// Initialize default users
Object.entries(DEFAULT_USERS).forEach(([username, userData]) => {
    users.set(username, {
        username,
        ...userData,
        groups: ['general'],
        createdAt: new Date()
    });
});

// Helper functions
function generateMessageId() {
    return crypto.randomBytes(16).toString('hex');
}

function isUserAdmin(username, groupId) {
    const group = groups.get(groupId);
    const user = users.get(username);
    return user?.isSuperAdmin || group?.admins.includes(username);
}

function canUserAccessGroup(username, groupId) {
    const group = groups.get(groupId);
    return group?.members.includes(username);
}

function cleanupExpiredPins() {
    const now = new Date();
    for (const [groupId, pins] of pinnedMessages.entries()) {
        const validPins = pins.filter(pin => new Date(pin.expiresAt) > now);
        pinnedMessages.set(groupId, validPins);
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredPins, 60 * 60 * 1000);

// Authentication endpoint
app.post('/api/auth', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: 'Username and password required' });
    }

    const user = users.get(username.toLowerCase());
    
    if (!user || user.password !== password) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const userData = {
        username: user.username,
        isAdmin: user.isAdmin || false,
        isSuperAdmin: user.isSuperAdmin || false,
        groups: user.groups || ['general'],
        token
    };

    res.json({ success: true, user: userData, token });
});

// Get user groups
app.get('/api/groups/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    const user = users.get(username);
    
    if (!user) {
        return res.json([]);
    }

    const userGroups = [];
    for (const [groupId, group] of groups.entries()) {
        if (group.members.includes(username)) {
            userGroups.push({
                id: groupId,
                name: group.name,
                memberCount: group.memberCount,
                isAdmin: group.admins.includes(username),
                isDefault: group.isDefault || false,
                createdAt: group.createdAt
            });
        }
    }

    res.json(userGroups);
});

// Get group messages
app.get('/api/groups/:groupId/messages', (req, res) => {
    const { groupId } = req.params;
    const groupMessages = messages.get(groupId) || [];
    
    // Add reactions and seen status to messages
    const messagesWithMeta = groupMessages.map(msg => {
        return {
            ...msg,
            reactions: messageReactions.get(msg.id) || {},
            seenBy: messageSeenBy.get(msg.id) || []
        };
    });
    
    res.json(messagesWithMeta.slice(-50)); // Return last 50 messages
});

// Get pinned messages
app.get('/api/groups/:groupId/pinned', (req, res) => {
    const { groupId } = req.params;
    const pins = pinnedMessages.get(groupId) || [];
    const validPins = pins.filter(pin => new Date(pin.expiresAt) > new Date());
    res.json(validPins);
});

// Upload media
app.post('/api/upload-media', upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded' });
    }

    const mediaUrl = `/uploads/${req.file.filename}`;
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

    res.json({
        success: true,
        mediaUrl: mediaUrl,
        type: mediaType,
        filename: req.file.filename
    });
});

// Download media
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filepath)) {
        res.download(filepath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Delete message
app.delete('/api/messages/:groupId/:messageId', (req, res) => {
    const { groupId, messageId } = req.params;
    const { deletedBy, adminToken } = req.body;

    if (!deletedBy) {
        return res.json({ success: false, message: 'deletedBy required' });
    }

    const groupMessages = messages.get(groupId) || [];
    const messageIndex = groupMessages.findIndex(msg => msg.id === messageId);
    
    if (messageIndex === -1) {
        return res.json({ success: false, message: 'Message not found' });
    }

    const message = groupMessages[messageIndex];
    const user = users.get(deletedBy.toLowerCase());
    
    // Check permissions
    if (message.username !== deletedBy && !user?.isSuperAdmin && !isUserAdmin(deletedBy, groupId)) {
        return res.json({ success: false, message: 'Permission denied' });
    }

    // Remove message
    groupMessages.splice(messageIndex, 1);
    messages.set(groupId, groupMessages);

    // Clean up related data
    messageReactions.delete(messageId);
    messageSeenBy.delete(messageId);

    // Notify clients
    io.to(groupId).emit('messageDeleted', { messageId, groupId, deletedBy });

    res.json({ success: true });
});

// Pin message
app.post('/api/messages/:groupId/:messageId/pin', (req, res) => {
    const { groupId, messageId } = req.params;
    const { pinnedBy, duration, adminToken } = req.body;

    if (!isUserAdmin(pinnedBy, groupId)) {
        return res.json({ success: false, message: 'Admin permissions required' });
    }

    const groupMessages = messages.get(groupId) || [];
    const message = groupMessages.find(msg => msg.id === messageId);
    
    if (!message) {
        return res.json({ success: false, message: 'Message not found' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (duration || 1));

    const pinnedMessage = {
        ...message,
        pinnedBy,
        pinnedAt: new Date(),
        expiresAt
    };

    const pins = pinnedMessages.get(groupId) || [];
    pins.push(pinnedMessage);
    pinnedMessages.set(groupId, pins);

    // Notify clients
    io.to(groupId).emit('messagePinned', { groupId, pinnedMessages: pins });

    res.json({ success: true });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentUser = null;
    let currentGroups = new Set();

    // User authentication
    socket.on('authenticate', (userData) => {
        currentUser = userData;
        onlineUsers.add(userData.username);
        userSockets.set(userData.username, socket.id);
        
        console.log(`${userData.username} authenticated`);
        
        // Broadcast updated online users
        io.emit('onlineUsers', Array.from(onlineUsers));
    });

    // Join group
    socket.on('joinGroup', (groupId) => {
        if (!currentUser || !canUserAccessGroup(currentUser.username, groupId)) {
            return;
        }

        socket.join(groupId);
        currentGroups.add(groupId);
        
        console.log(`${currentUser.username} joined group ${groupId}`);
        
        // Send recent messages
        const groupMessages = messages.get(groupId) || [];
        const recentMessages = groupMessages.slice(-20).map(msg => ({
            ...msg,
            reactions: messageReactions.get(msg.id) || {},
            seenBy: messageSeenBy.get(msg.id) || []
        }));
        
        socket.emit('groupMessages', { groupId, messages: recentMessages });
        
        // Send pinned messages
        const pins = pinnedMessages.get(groupId) || [];
        const validPins = pins.filter(pin => new Date(pin.expiresAt) > new Date());
        socket.emit('messagePinned', { groupId, pinnedMessages: validPins });
    });

    // Leave group
    socket.on('leaveGroup', (groupId) => {
        socket.leave(groupId);
        currentGroups.delete(groupId);
        
        // Remove from typing users
        const typingSet = typingUsers.get(groupId);
        if (typingSet && currentUser) {
            typingSet.delete(currentUser.username);
            if (typingSet.size === 0) {
                typingUsers.delete(groupId);
            }
        }
    });

    // Handle new message
    socket.on('newMessage', (data) => {
        if (!currentUser || !data.text || !data.groupId) return;
        
        if (!canUserAccessGroup(currentUser.username, data.groupId)) {
            return;
        }

        const message = {
            id: generateMessageId(),
            username: currentUser.username,
            text: data.text.trim().substring(0, 1000), // Limit message length
            timestamp: new Date(),
            groupId: data.groupId,
            type: 'text',
            isAdmin: currentUser.isAdmin || false,
            isSuperAdmin: currentUser.isSuperAdmin || false,
            replyTo: data.replyTo || null
        };

        // Store message
        const groupMessages = messages.get(data.groupId) || [];
        groupMessages.push(message);
        
        // Keep only last 1000 messages per group
        if (groupMessages.length > 1000) {
            groupMessages.splice(0, groupMessages.length - 1000);
        }
        
        messages.set(data.groupId, groupMessages);

        // Initialize seen status
        messageSeenBy.set(message.id, []);

        // Broadcast to group
        io.to(data.groupId).emit('messageReceived', message);
        
        console.log(`Message from ${currentUser.username} in ${data.groupId}: ${data.text.substring(0, 50)}...`);
    });

    // Handle media message
    socket.on('newMediaMessage', (data) => {
        if (!currentUser || !data.mediaUrl || !data.groupId) return;
        
        if (!canUserAccessGroup(currentUser.username, data.groupId)) {
            return;
        }

        const message = {
            id: generateMessageId(),
            username: currentUser.username,
            mediaUrl: data.mediaUrl,
            timestamp: new Date(),
            groupId: data.groupId,
            type: data.mediaType || 'image',
            isAdmin: currentUser.isAdmin || false,
            isSuperAdmin: currentUser.isSuperAdmin || false,
            replyTo: data.replyTo || null
        };

        // Store message
        const groupMessages = messages.get(data.groupId) || [];
        groupMessages.push(message);
        messages.set(data.groupId, groupMessages);

        // Initialize seen status
        messageSeenBy.set(message.id, []);

        // Broadcast to group
        io.to(data.groupId).emit('messageReceived', message);
        
        console.log(`Media message from ${currentUser.username} in ${data.groupId}`);
    });

    // Handle typing
    socket.on('typing', (data) => {
        if (!currentUser || !data.groupId) return;
        
        const { isTyping, groupId } = data;
        
        if (!typingUsers.has(groupId)) {
            typingUsers.set(groupId, new Set());
        }
        
        const typingSet = typingUsers.get(groupId);
        
        if (isTyping) {
            typingSet.add(currentUser.username);
        } else {
            typingSet.delete(currentUser.username);
        }
        
        // Broadcast to others in group
        socket.to(groupId).emit('userTyping', {
            username: currentUser.username,
            isTyping,
            groupId
        });
    });

    // Handle reactions
    socket.on('addReaction', (data) => {
        if (!currentUser) return;
        
        const { messageId, groupId, emoji, username } = data;
        
        if (!canUserAccessGroup(currentUser.username, groupId)) {
            return;
        }

        let reactions = messageReactions.get(messageId) || {};
        
        if (!reactions[emoji]) {
            reactions[emoji] = [];
        }
        
        if (!reactions[emoji].includes(username)) {
            reactions[emoji].push(username);
        }
        
        messageReactions.set(messageId, reactions);
        
        io.to(groupId).emit('reactionAdded', {
            messageId,
            groupId,
            reactions
        });
    });

    // Handle toggle reaction
    socket.on('toggleReaction', (data) => {
        if (!currentUser) return;
        
        const { messageId, groupId, emoji, username } = data;
        
        if (!canUserAccessGroup(currentUser.username, groupId)) {
            return;
        }

        let reactions = messageReactions.get(messageId) || {};
        
        if (!reactions[emoji]) {
            reactions[emoji] = [];
        }
        
        const userIndex = reactions[emoji].indexOf(username);
        if (userIndex > -1) {
            reactions[emoji].splice(userIndex, 1);
            if (reactions[emoji].length === 0) {
                delete reactions[emoji];
            }
        } else {
            reactions[emoji].push(username);
        }
        
        messageReactions.set(messageId, reactions);
        
        io.to(groupId).emit('reactionAdded', {
            messageId,
            groupId,
            reactions
        });
    });

    // Handle message seen
    socket.on('markSeen', (data) => {
        if (!currentUser) return;
        
        const { messageId, groupId } = data;
        
        let seenBy = messageSeenBy.get(messageId) || [];
        if (!seenBy.includes(currentUser.username)) {
            seenBy.push(currentUser.username);
            messageSeenBy.set(messageId, seenBy);
            
            io.to(groupId).emit('messageSeenUpdate', {
                messageId,
                groupId,
                seenBy
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        if (currentUser) {
            onlineUsers.delete(currentUser.username);
            userSockets.delete(currentUser.username);
            
            // Remove from typing users
            for (const [groupId, typingSet] of typingUsers.entries()) {
                typingSet.delete(currentUser.username);
                if (typingSet.size === 0) {
                    typingUsers.delete(groupId);
                }
            }
            
            // Broadcast updated online users
            io.emit('onlineUsers', Array.from(onlineUsers));
            
            console.log(`${currentUser.username} disconnected`);
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Enhanced Group Chat Server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${uploadsDir}`);
    console.log(`👥 Default users: ${Object.keys(DEFAULT_USERS).join(', ')}`);
    console.log(`🏠 Default group: ${DEFAULT_GROUP.name}`);
    
    // Clean up expired pins on startup
    cleanupExpiredPins();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
