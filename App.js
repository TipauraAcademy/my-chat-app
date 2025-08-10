import React, { useState, useRef, useEffect } from 'react';
import { Send, User, MessageCircle, Settings, Smile, UserPlus, Shield, Check, X, Users, Clock, Phone, Video, Search, MoreVertical, Paperclip, Image, Camera, Mic, Heart, ThumbsUp, Laugh, Angry, Sad, Star, Pin, Trash2, Reply, Copy, Download, Menu, Bell, Hash, Lock } from 'lucide-react';

export default function ModernChatApp() {
  // Core state
  const [messages, setMessages] = useState([
    {
      id: 1,
      user: 'System',
      text: 'Welcome to the Ultimate Chat Experience! 🎉',
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      type: 'system'
    },
    {
      id: 2,
      user: 'Admin',
      text: 'Hey everyone! This is our new enhanced chat room with tons of cool features 😎',
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      type: 'message',
      reactions: { '❤️': ['User1', 'User2'], '👍': ['User1'] }
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentView, setCurrentView] = useState('login');
  
  // UI state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeUsers] = useState(['Admin', 'User1', 'User2', 'Guest']);
  const [isTyping, setIsTyping] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Simulate typing
  useEffect(() => {
    if (isLoggedIn) {
      const typingSimulation = setInterval(() => {
        const randomUsers = ['User1', 'User2', 'Guest'];
        const randomUser = randomUsers[Math.floor(Math.random() * randomUsers.length)];
        if (Math.random() > 0.95) {
          setIsTyping(`${randomUser} is typing...`);
          setTimeout(() => setIsTyping(''), 2000);
        }
      }, 3000);
      return () => clearInterval(typingSimulation);
    }
  }, [isLoggedIn]);

  const emojis = ['😀', '😂', '🥰', '😍', '🤔', '👍', '👎', '❤️', '🔥', '✨', '🎉', '💯'];
  const reactions = ['❤️', '👍', '👎', '😂', '😢', '😮'];

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) return;

    if (password === 'ADMIN') {
      setIsAdmin(true);
      setIsLoggedIn(true);
      setCurrentView('chat');
      addSystemMessage(`🎯 Admin ${username} has joined the chat!`);
    } else if (password === 'ADITYA') {
      setIsLoggedIn(true);
      setCurrentView('chat');
      addSystemMessage(`👋 ${username} joined the conversation!`);
    } else {
      alert('Invalid password! Use "ADMIN" or "ADITYA"');
    }
  };

  const addSystemMessage = (text) => {
    const systemMessage = {
      id: Date.now(),
      user: 'System',
      text: text,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      type: 'system'
    };
    setMessages(prev => [...prev, systemMessage]);
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    const message = {
      id: Date.now(),
      user: username,
      text: newMessage.trim(),
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      type: 'message',
      isAdmin: isAdmin,
      reactions: {}
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');
  };

  const addReaction = (messageId, emoji) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions };
        if (reactions[emoji]) {
          if (reactions[emoji].includes(username)) {
            reactions[emoji] = reactions[emoji].filter(u => u !== username);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji].push(username);
          }
        } else {
          reactions[emoji] = [username];
        }
        return { ...msg, reactions };
      }
      return msg;
    }));
  };

  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Login Screen
  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
          <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-pink-500/20 rounded-full blur-2xl animate-bounce"></div>
        </div>
        
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 w-full max-w-md border border-white/20 shadow-2xl relative">
          <div className="text-center mb-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <MessageCircle className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-3 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              ChatVerse
            </h1>
            <p className="text-gray-300 text-lg">Enter the future of messaging</p>
          </div>
          
          <div className="space-y-6">
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Your awesome username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                autoFocus
              />
            </div>
            
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                placeholder="Secret password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
              />
            </div>
            
            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-2xl font-bold text-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              🚀 Launch into Chat
            </button>
          </div>
          
          <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/10">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Access Codes
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>👑 Admin Access:</span>
                <code className="bg-purple-500/20 px-2 py-1 rounded">ADMIN</code>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>🎯 User Access:</span>
                <code className="bg-blue-500/20 px-2 py-1 rounded">ADITYA</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Chat Interface
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex">
      {/* Sidebar */}
      <div className={`${showSidebar ? 'w-80' : 'w-0'} transition-all duration-300 bg-black/20 backdrop-blur-xl border-r border-white/10 flex flex-col overflow-hidden`}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Hash className="w-5 h-5 text-purple-400" />
              Channels
            </h2>
            <button
              onClick={() => setShowSidebar(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-purple-500/20 rounded-xl cursor-pointer">
              <Hash className="w-4 h-4 text-purple-400" />
              <span className="text-white font-medium">general</span>
              <span className="ml-auto bg-purple-500 text-white text-xs px-2 py-1 rounded-full">24</span>
            </div>
            <div className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors">
              <Hash className="w-4 h-4 text-gray-400" />
              <span className="text-gray-300">random</span>
            </div>
            <div className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors">
              <Hash className="w-4 h-4 text-gray-400" />
              <span className="text-gray-300">tech-talk</span>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-green-400" />
            Online ({activeUsers.length})
          </h3>
          <div className="space-y-2">
            {activeUsers.map((user, index) => (
              <div key={index} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                <div className="relative">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {user.charAt(0)}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-900"></div>
                </div>
                <span className="text-white font-medium">{user}</span>
                {user === 'Admin' && <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded-full font-bold">👑</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-black/20 backdrop-blur-xl border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5 text-white" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Hash className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">General Chat</h1>
                  <p className="text-sm text-gray-400">{activeUsers.length} members online</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Search className="w-5 h-5 text-white" />
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <Phone className="w-5 h-5 text-white" />
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <Video className="w-5 h-5 text-white" />
              </button>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {username.charAt(0)}
                </div>
                <span className="text-white font-medium">{username}</span>
                {isAdmin && <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded-full font-bold">ADMIN</span>}
              </div>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.user === username ? 'justify-end' : 'justify-start'}`}>
              {message.type === 'system' ? (
                <div className="bg-white/5 backdrop-blur-sm text-gray-300 px-6 py-3 rounded-full text-sm text-center mx-auto border border-white/10">
                  {message.text}
                </div>
              ) : (
                <div className={`max-w-lg group ${message.user === username ? 'items-end' : 'items-start'} flex flex-col`}>
                  {message.user !== username && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                        {message.user.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-white">{message.user}</span>
                      <span className="text-xs text-gray-400">{message.time}</span>
                      {message.isAdmin && <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded-full font-bold">ADMIN</span>}
                    </div>
                  )}
                  
                  <div className={`relative p-4 rounded-2xl shadow-lg ${
                    message.user === username 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                      : 'bg-white/10 backdrop-blur-sm text-white border border-white/20'
                  }`}>
                    <p className="break-words">{message.text}</p>
                    
                    {message.user === username && (
                      <span className="text-xs opacity-75 mt-2 block">{message.time}</span>
                    )}
                    
                    {/* Message Actions */}
                    <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button 
                        onClick={() => addReaction(message.id, '❤️')}
                        className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
                      >
                        <Heart className="w-4 h-4 text-red-400" />
                      </button>
                      <button className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors">
                        <Reply className="w-4 h-4 text-white" />
                      </button>
                      <button className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/70 transition-colors">
                        <MoreVertical className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Reactions */}
                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(message.reactions).map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => addReaction(message.id, emoji)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-all hover:scale-105 ${
                            users.includes(username) 
                              ? 'bg-purple-500/30 border border-purple-400' 
                              : 'bg-white/10 border border-white/20'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="text-xs text-white font-medium">{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-200"></div>
              </div>
              <span>{isTyping}</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Reactions Bar */}
        <div className="px-6 py-2">
          <div className="flex gap-2 justify-center">
            {reactions.map((emoji, index) => (
              <button
                key={index}
                onClick={() => insertEmoji(emoji)}
                className="text-2xl hover:scale-125 transition-transform duration-200 p-2 hover:bg-white/10 rounded-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-black/20 backdrop-blur-xl border-t border-white/10">
          <div className="flex items-end gap-4">
            <div className="flex gap-2">
              <button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                <Paperclip className="w-5 h-5 text-white" />
              </button>
              <button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                <Image className="w-5 h-5 text-white" />
              </button>
              <button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                <Camera className="w-5 h-5 text-white" />
              </button>
            </div>
            
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Type something awesome..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className="w-full px-6 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 pr-16"
              />
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <Smile className="w-5 h-5" />
              </button>
              
              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/80 backdrop-blur-xl rounded-xl p-4 grid grid-cols-6 gap-2 border border-white/20">
                  {emojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => insertEmoji(emoji)}
                      className="text-2xl hover:scale-125 transition-transform duration-200 p-2 hover:bg-white/10 rounded-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
              <Mic className="w-5 h-5 text-white" />
            </button>
            
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold hover:from-purple-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
