const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuration
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure directories exist
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(DATA_DIR);

// In-memory storage (replace with database in production)
let users = new Map();
let groups = new Map();
let messages = new Map();
let pinnedMessages = new Map();
let onlineUsers = new Map();
let userSockets = new Map();

// Default data initialization
function initializeDefaultData() {
    // Default users
    const defaultUsers = [
        { username: 'admin', password: 'admin123', isAdmin: true, isSuperAdmin: false },
        { username: 'superadmin', password: 'super123', isAdmin: true, isSuperAdmin: true },
        { username: 'alice', password: 'alice123', isAdmin: false, isSuperAdmin: false },
        { username: 'bob', password: 'bob123', isAdmin: false, isSuperAdmin: false },
        { username: 'charlie', password: 'charlie123', isAdmin: false, isSuperAdmin: false }
    ];

    defaultUsers.forEach(user => {
        const hashedPassword = bcrypt.hashSync(user.password, 10);
        users.set(user.username, {
            ...user,
            password: hashedPassword,
            id: uuidv4(),
            avatar: null,
            joinedAt: new Date(),
            lastSeen: new Date()
        });
    });

    // Default groups
    const defaultGroups = [
        {
            id: 'general',
            name: 'General',
            description: 'General discussion for everyone',
            members: ['admin', 'superadmin', 'alice', 'bob', 'charlie'],
            admins: ['admin', 'superadmin'],
            createdBy: 'superadmin',
            createdAt: new Date(),
            isDefault: true
        },
        {
            id: 'random',
            name: 'Random',
            description: 'Random chat and fun discussions',
            members: ['alice', 'bob', 'charlie'],
            admins: [],
            createdBy: 'alice',
            createdAt: new Date(),
            isDefault: false
        },
        {
            id: 'tech',
            name: 'Tech Talk',
            description: 'Technology discussions and updates',
            members: ['admin', 'superadmin', 'charlie'],
            admins: ['superadmin'],
            createdBy: 'superadmin',
            createdAt: new Date(),
            isDefault: false
        }
    ];

    defaultGroups.forEach(group => {
        groups.set(group.id, group);
        messages.set(group.id, []);
        pinnedMessages.set(group.id, []);
    });

    // Default messages
    const defaultMessages = [
        {
            id: uuidv4(),
            groupId: 'general',
            text: 'Welcome to Enhanced Group Chat! 🎉',
            username: 'superadmin',
            timestamp: Date.now() - 1800000,
            type: 'text',
            reactions: new Map([['👍', ['admin', 'alice']], ['❤️', ['bob']]]),
            seenBy: ['admin', 'alice', 'bob'],
            replyTo: null,
            edited: false,
            editedAt: null
        },
        {
            id: uuidv4(),
            groupId: 'general',
            text: 'Thanks for setting this up! The UI looks amazing 🔥',
            username: 'alice',
            timestamp: Date.now() - 1200000,
            type: 'text',
            reactions: new Map([['🔥', ['superadmin', 'charlie']]]),
            seenBy: ['superadmin', 'charlie'],
            replyTo: null,
            edited: false,
            editedAt: null
        },
        {
            id: uuidv4(),
            groupId: 'tech',
            text: 'Check out the new real-time features! Socket.io integration is working perfectly.',
            username: 'charlie',
            timestamp: Date.now() - 600000,
            type: 'text',
            reactions: new Map([['💯', ['admin', 'superadmin']]]),
            seenBy: ['admin', 'superadmin'],
            replyTo: null,
            edited: false,
            editedAt: null
        }
    ];

    defaultMessages.forEach(message => {
        const groupMessages = messages.get(message.groupId) || [];
        groupMessages.push(message);
        messages.set(message.groupId, groupMessages);
    });

    console.log('✅ Default data initialized');
    console.log('📊 Users:', users.size);
    console.log('🏠 Groups:', groups.size);
    console.log('💬 Total Messages:', Array.from(messages.values()).reduce((total, msgs) => total + msgs.length, 0));
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            mediaSrc: ["'self'", "blob:"]
        }
    }
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
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
        const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|ogg|mov/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed'));
        }
    }
});

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));

// JWT Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Socket.io authentication middleware
function authenticateSocket(socket, next) {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Authentication token required'));
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error('Invalid token'));
        }
        socket.userId = decoded.username;
        next();
    });
}

// API Routes

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = users.get(username.toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = bcrypt.compareSync(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last seen
        user.lastSeen = new Date();
        users.set(username.toLowerCase(), user);

        const token = jwt.sign(
            { 
                username: user.username, 
                isAdmin: user.isAdmin, 
                isSuperAdmin: user.isSuperAdmin 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                username: user.username,
                isAdmin: user.isAdmin,
                isSuperAdmin: user.isSuperAdmin,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (username.length < 3 || password.length < 6) {
            return res.status(400).json({ error: 'Username must be at least 3 characters and password at least 6 characters' });
        }

        if (users.has(username.toLowerCase())) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const newUser = {
            id: uuidv4(),
            username: username,
            password: hashedPassword,
            isAdmin: false,
            isSuperAdmin: false,
            avatar: null,
            joinedAt: new Date(),
            lastSeen: new Date()
        };

        users.set(username.toLowerCase(), newUser);

        // Add user to default group
        const generalGroup = groups.get('general');
        if (generalGroup) {
            generalGroup.members.push(username);
            groups.set('general', generalGroup);
        }

        const token = jwt.sign(
            { 
                username: newUser.username, 
                isAdmin: newUser.isAdmin, 
                isSuperAdmin: newUser.isSuperAdmin 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                username: newUser.username,
                isAdmin: newUser.isAdmin,
                isSuperAdmin: newUser.isSuperAdmin,
                avatar: newUser.avatar
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Group routes
app.get('/api/groups', authenticateToken, (req, res) => {
    try {
        const userGroups = Array.from(groups.values()).filter(group => 
            group.members.includes(req.user.username)
        ).map(group => ({
            id: group.id,
            name: group.name,
            description: group.description,
            memberCount: group.members.length,
            isAdmin: group.admins.includes(req.user.username) || req.user.isSuperAdmin,
            isDefault: group.isDefault
        }));

        res.json({ groups: userGroups });
    } catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/groups', authenticateToken, (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Group name is required' });
        }

        const groupId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        if (groups.has(groupId)) {
            return res.status(409).json({ error: 'Group with this name already exists' });
        }

        const newGroup = {
            id: groupId,
            name: name.trim(),
            description: description || '',
            members: [req.user.username],
            admins: [req.user.username],
            createdBy: req.user.username,
            createdAt: new Date(),
            isDefault: false
        };

        groups.set(groupId, newGroup);
        messages.set(groupId, []);
        pinnedMessages.set(groupId, []);

        res.status(201).json({
            success: true,
            group: {
                id: newGroup.id,
                name: newGroup.name,
                description: newGroup.description,
                memberCount: newGroup.members.length,
                isAdmin: true,
                isDefault: false
            }
        });

        // Notify all users about new group
        io.emit('groupCreated', {
            group: newGroup,
            createdBy: req.user.username
        });

    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Message routes
app.get('/api/groups/:groupId/messages', authenticateToken, (req, res) => {
    try {
        const { groupId } = req.params;
        const group = groups.get(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        if (!group.members.includes(req.user.username)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const groupMessages = messages.get(groupId) || [];
        const groupPinnedMessages = pinnedMessages.get(groupId) || [];

        // Convert Map objects to regular objects for JSON response
        const formattedMessages = groupMessages.map(msg => ({
            ...msg,
            reactions: Object.fromEntries(msg.reactions || new Map()),
            seenBy: msg.seenBy || []
        }));

        res.json({
            messages: formattedMessages,
            pinnedMessages: groupPinnedMessages
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// File upload route
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

        res.json({
            success: true,
            fileUrl,
            fileType,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Socket.io connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
    const username = socket.userId;
    console.log(`👤 User ${username} connected`);

    // Store socket reference
    userSockets.set(username, socket.id);
    onlineUsers.set(username, {
        username,
        socketId: socket.id,
        connectedAt: new Date()
    });

    // Join user's groups
    const userGroups = Array.from(groups.values()).filter(group => 
        group.members.includes(username)
    );
    
    userGroups.forEach(group => {
        socket.join(group.id);
    });

    // Send online users list
    const onlineUsersList = Array.from(onlineUsers.keys());
    io.emit('onlineUsers', onlineUsersList);

    // Handle new message
    socket.on('newMessage', (data) => {
        try {
            const group = groups.get(data.groupId);
            if (!group || !group.members.includes(username)) {
                socket.emit('error', { message: 'Access denied' });
                return;
            }

            const user = users.get(username);
            const messageId = uuidv4();
            
            const message = {
                id: messageId,
                groupId: data.groupId,
                text: data.text || '',
                username: username,
                timestamp: Date.now(),
                type: data.type || 'text',
                mediaUrl: data.mediaUrl || null,
                reactions: new Map(),
                seenBy: [],
                replyTo: data.replyTo || null,
                edited: false,
                editedAt: null,
                isAdmin: user.isAdmin,
                isSuperAdmin: user.isSuperAdmin
            };

            // Store message
            const groupMessages = messages.get(data.groupId) || [];
            groupMessages.push(message);
            messages.set(data.groupId, groupMessages);

            // Format for broadcast
            const broadcastMessage = {
                ...message,
                reactions: Object.fromEntries(message.reactions),
                seenBy: message.seenBy
            };

            // Broadcast to group members
            io.to(data.groupId).emit('message', broadcastMessage);
            
            console.log(`💬 Message sent by ${username} in ${data.groupId}`);
        } catch (error) {
            console.error('Message error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle typing
    socket.on('typing', (data) => {
        socket.to(data.groupId).emit('userTyping', {
            username: username,
            groupId: data.groupId,
            isTyping: true
        });
    });

    socket.on('stopTyping', (data) => {
        socket.to(data.groupId).emit('userTyping', {
            username: username,
            groupId: data.groupId,
            isTyping: false
        });
    });

    // Handle reactions
    socket.on('toggleReaction', (data) => {
        try {
            const { messageId, emoji, groupId } = data;
            const groupMessages = messages.get(groupId);
            
            if (!groupMessages) return;

            const messageIndex = groupMessages.findIndex(msg => msg.id === messageId);
            if (messageIndex === -1) return;

            const message = groupMessages[messageIndex];
            
            if (!message.reactions.has(emoji)) {
                message.reactions.set(emoji, []);
            }

            const users = message.reactions.get(emoji);
            const userIndex = users.indexOf(username);

            if (userIndex > -1) {
                users.splice(userIndex, 1);
                if (users.length === 0) {
                    message.reactions.delete(emoji);
                }
            } else {
                users.push(username);
            }

            // Update message
            groupMessages[messageIndex] = message;
            messages.set(groupId, groupMessages);

            // Broadcast reaction update
            io.to(groupId).emit('reactionUpdate', {
                messageId,
                reactions: Object.fromEntries(message.reactions)
            });
        } catch (error) {
            console.error('Reaction error:', error);
        }
    });

    // Handle message deletion
    socket.on('deleteMessage', (data) => {
        try {
            const { messageId, groupId } = data;
            const group = groups.get(groupId);
            const groupMessages = messages.get(groupId);
            
            if (!group || !groupMessages) return;

            const messageIndex = groupMessages.findIndex(msg => msg.id === messageId);
            if (messageIndex === -1) return;

            const message = groupMessages[messageIndex];
            const user = users.get(username);

            // Check permissions
            const canDelete = message.username === username || 
                             user.isSuperAdmin || 
                             group.admins.includes(username);

            if (!canDelete) {
                socket.emit('error', { message: 'Permission denied' });
                return;
            }

            // Remove message
            groupMessages.splice(messageIndex, 1);
            messages.set(groupId, groupMessages);

            // Broadcast deletion
            io.to(groupId).emit('messageDeleted', { messageId });
        } catch (error) {
            console.error('Delete message error:', error);
        }
    });

    // Handle message pinning
    socket.on('pinMessage', (data) => {
        try {
            const { messageId, groupId, duration } = data;
            const group = groups.get(groupId);
            const groupMessages = messages.get(groupId);
            
            if (!group || !groupMessages) return;

            const user = users.get(username);
            const canPin = user.isSuperAdmin || group.admins.includes(username);

            if (!canPin) {
                socket.emit('error', { message: 'Permission denied' });
                return;
            }

            const message = groupMessages.find(msg => msg.id === messageId);
            if (!message) return;

            const pinnedMessage = {
                id: messageId,
                text: message.text,
                username: message.username,
                pinnedBy: username,
                pinnedAt: new Date(),
                expiresAt: new Date(Date.now() + (duration * 24 * 60 * 60 * 1000))
            };

            const groupPinned = pinnedMessages.get(groupId) || [];
            groupPinned.push(pinnedMessage);
            pinnedMessages.set(groupId, groupPinned);

            // Broadcast pin update
            io.to(groupId).emit('pinnedMessagesUpdate', groupPinned);
        } catch (error) {
            console.error('Pin message error:', error);
        }
    });

    // Handle join group
    socket.on('joinGroup', (data) => {
        const { groupId } = data;
        const group = groups.get(groupId);
        
        if (group && group.members.includes(username)) {
            socket.join(groupId);
            
            // Mark messages as seen
            const groupMessages = messages.get(groupId) || [];
            groupMessages.forEach(msg => {
                if (!msg.seenBy.includes(username)) {
                    msg.seenBy.push(username);
                }
            });
            messages.set(groupId, groupMessages);
            
            // Broadcast seen status update
            socket.to(groupId).emit('messagesSeen', {
                username: username,
                groupId: groupId
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`👤 User ${username} disconnected`);
        
        userSockets.delete(username);
        onlineUsers.delete(username);
        
        // Update user's last seen
        const user = users.get(username);
        if (user) {
            user.lastSeen = new Date();
            users.set(username, user);
        }

        // Broadcast updated online users list
        const onlineUsersList = Array.from(onlineUsers.keys());
        io.emit('onlineUsers', onlineUsersList);
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
        }
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Cleanup function for expired pinned messages
function cleanupExpiredPins() {
    const now = new Date();
    
    for (const [groupId, pins] of pinnedMessages.entries()) {
        const activePins = pins.filter(pin => new Date(pin.expiresAt) > now);
        
        if (activePins.length !== pins.length) {
            pinnedMessages.set(groupId, activePins);
            
            // Broadcast update to group
            io.to(groupId).emit('pinnedMessagesUpdate', activePins);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredPins, 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    
    // Save data to files before shutdown (if needed)
    // This is where you'd implement data persistence
    
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Initialize default data and start server
initializeDefaultData();

server.listen(PORT, () => {
    console.log('🚀 Enhanced Group Chat Server Started');
    console.log(`📍 Server running on http://localhost:${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('💡 Default users created:');
    console.log('   - superadmin:super123 (Super Admin)');
    console.log('   - admin:admin123 (Admin)');
    console.log('   - alice:alice123, bob:bob123, charlie:charlie123 (Regular users)');
    console.log('✨ Ready to accept connections!');
});

module.exports = { app, server, io };
