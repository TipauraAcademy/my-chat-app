# 🚂 Railway Deployment Guide for Enhanced Group Chat

This guide will help you deploy your Enhanced Group Chat application on Railway.

## 📋 Prerequisites

1. **Railway Account** - Sign up at [railway.app](https://railway.app)
2. **GitHub Account** - Your code should be in a GitHub repository
3. **Git** - For version control

## 🚀 Quick Deployment Steps

### Method 1: Deploy from GitHub (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit for Railway deployment"
   git push origin main
   ```

2. **Go to Railway Dashboard**
   - Visit [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"

3. **Connect your repository**
   - Authorize Railway to access your GitHub
   - Select your chat application repository

4. **Configure Environment Variables**
   In Railway dashboard, go to Variables tab and add:
   ```
   NODE_ENV=production
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars-change-this
   SESSION_SECRET=your-session-secret-change-this
   MAX_FILE_SIZE=52428800
   RATE_LIMIT_MAX_REQUESTS=100
   RATE_LIMIT_WINDOW_MS=900000
   ```

5. **Deploy**
   - Railway will automatically detect it's a Node.js app
   - It will install dependencies and start your app
   - You'll get a public URL like `https://your-app-name.up.railway.app`

### Method 2: Deploy using Railway CLI

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Railway project**
   ```bash
   railway init
   ```

4. **Deploy**
   ```bash
   railway up
   ```

## ⚙️ Railway Configuration

### Environment Variables

Set these in Railway Dashboard → Variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Sets production mode |
| `JWT_SECRET` | `your-secret-key` | JWT signing secret (min 32 chars) |
| `SESSION_SECRET` | `your-session-secret` | Session secret |
| `MAX_FILE_SIZE` | `52428800` | Max upload size (50MB) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Rate limit per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |

### Custom Domain (Optional)

1. Go to your project settings in Railway
2. Click on "Domains"
3. Add your custom domain
4. Update DNS records as instructed

## 📁 File Structure for Railway

Your project should have this structure:

```
enhanced-group-chat/
├── public/
│   └── index.html
├── uploads/
│   └── .gitkeep
├── server.js
├── package.json
├── Dockerfile (optional)
├── nixpacks.toml
├── healthcheck.js
├── .env
├── .gitignore
└── README.md
```

## 🔧 Railway-Specific Features

### Automatic HTTPS
- Railway provides free HTTPS for all deployments
- Your app will be available at `https://your-app.up.railway.app`

### Persistent Storage
- **Note**: Railway doesn't provide persistent file storage
- Uploaded files will be lost on redeploy
- For production, consider using cloud storage (AWS S3, Cloudinary, etc.)

### Environment Detection
The app automatically detects Railway environment:

```javascript
// In server.js - Railway environment detection
const isRailway = process.env.RAILWAY_ENVIRONMENT_NAME;
const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN || 
                  process.env.RAILWAY_STATIC_URL || 
                  `http://localhost:${PORT}`;
```

## 🚨 Important Notes

### File Uploads on Railway
- Railway doesn't persist uploaded files between deployments
- Files are stored in memory/temporary storage
- For production use, integrate with:
  - **AWS S3** for file storage
  - **Cloudinary** for image/video processing
  - **Google Cloud Storage**

### Database Considerations
- Current setup uses in-memory storage
- For production, add a database:
  - Railway PostgreSQL (recommended)
  - Railway MySQL
  - External MongoDB Atlas

### Scaling Considerations
- Railway auto-scales based on usage
- For multiple instances, add Redis for session management
- Consider implementing database persistence

## 🛠️ Troubleshooting

### Common Issues

1. **Build Fails**
   ```bash
   # Check logs in Railway dashboard
   railway logs
   ```

2. **Environment Variables Not Working**
   - Ensure variables are set in Railway dashboard
   - Restart the service after adding variables

3. **File Upload Issues**
   ```javascript
   // Ensure uploads directory exists
   mkdir -p uploads
   ```

4. **Socket.IO Connection Issues**
   - Check CORS settings in server.js
   - Verify WebSocket support (Railway supports it)

### Debugging

1. **View Logs**
   ```bash
   railway logs --follow
   ```

2. **SSH into Container** (if needed)
   ```bash
   railway shell
   ```

3. **Check Health**
   - Visit `https://your-app.up.railway.app/health`

## 🔄 Continuous Deployment

Railway automatically redeploys when you push to your connected branch:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Railway will automatically redeploy
```

## 📊 Monitoring

### Built-in Metrics
- Railway provides CPU, Memory, and Network metrics
- Access via Railway dashboard

### Custom Health Check
The app includes a health endpoint:
```
GET /health
```

Returns:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "groups": 3,
  "users": 5,
  "onlineUsers": 2
}
```

## 💰 Pricing

- **Hobby Plan**: $0/month (500 hours)
- **Pro Plan**: $20/month (unlimited)
- Check [Railway Pricing](https://railway.app/pricing) for current rates

## 🔐 Security Best Practices

1. **Environment Variables**
   - Never commit secrets to Git
   - Use Railway's environment variable system
   - Rotate secrets regularly

2. **HTTPS Only**
   - Railway provides free HTTPS
   - Ensure all communication is encrypted

3. **Rate Limiting**
   - Already configured in the app
   - Monitor for abuse

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/reference/cli-api)
- [Node.js on Railway](https://docs.railway.app/getting-started/languages/nodejs)

## 🎉 Post-Deployment

After successful deployment:

1. **Test the Application**
   - Visit your Railway URL
   - Test login with default users
   - Try creating groups and sending messages

2. **Share Your App**
   - Your app is now live at `https://your-app.up.railway.app`
   - Share the URL with your users

3. **Monitor Performance**
   - Check Railway dashboard for metrics
   - Monitor logs for any issues

## 🚀 Default Users for Testing

Once deployed, you can login with these accounts:

| Username | Password | Role |
|----------|----------|------|
| `superadmin` | `super123` | Super Admin |
| `admin` | `admin123` | Admin |
| `alice` | `alice123` | User |
| `bob` | `bob123` | User |
| `charlie` | `charlie123` | User |

---

🎉 **Congratulations!** Your Enhanced Group Chat is now live on Railway!

For support, check the Railway documentation or create an issue in your repository.
