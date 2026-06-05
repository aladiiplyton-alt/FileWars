const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const DEFAULT_PORT = 3000;
const PORT = process.env.PORT || DEFAULT_PORT;

// Find a free port if the default is busy
async function startServer() {
  const http = require('http');
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    const attempt = (port) => {
      server.listen(port, () => { resolve(port); }).on('error', (e) => {
        if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
          attempt(port + 1);
        } else {
          reject(e);
        }
      });
    };
    attempt(PORT);
  });
  return server;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// In-memory storage for rooms
const rooms = new Map();

// Cleanup old rooms (older than 24 hours)
const ROOM_TTL = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_TTL) {
      // Delete uploaded files
      room.files.forEach(file => {
        const filePath = path.join(uploadsDir, file.storedName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      rooms.delete(code);
      console.log(`Cleaned up expired room: ${code}`);
    }
  }
}, 60 * 60 * 1000); // Check every hour

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, res, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Generate short room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create new room
app.post('/api/rooms', (req, res) => {
  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = {
    code,
    files: [],
    links: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  rooms.set(code, room);
  res.json({ code, url: `${req.protocol}://${req.get('host')}/${code}` });
});

// Get room info
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }
  res.json({
    code: room.code,
    files: room.files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      uploadedAt: f.uploadedAt
    })),
    links: room.links,
    createdAt: room.createdAt
  });
});

// Upload file to room
app.post('/api/rooms/:code/files', upload.single('file'), (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    // Delete uploaded file if room doesn't exist
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileInfo = {
    id: uuidv4(),
    name: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    type: req.file.mimetype,
    uploadedAt: Date.now()
  };

  room.files.push(fileInfo);
  room.updatedAt = Date.now();
  res.json(fileInfo);
});

// Download file
app.get('/api/rooms/:code/files/:fileId', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  const file = room.files.find(f => f.id === req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(uploadsDir, file.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.download(filePath, file.name);
});

// Add link to room
app.post('/api/rooms/:code/links', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  const { url, title } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const link = {
    id: uuidv4(),
    url,
    title: title || url,
    addedAt: Date.now()
  };

  room.links.push(link);
  room.updatedAt = Date.now();
  res.json(link);
});

// Delete link
app.delete('/api/rooms/:code/links/:linkId', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  const index = room.links.findIndex(l => l.id === req.params.linkId);
  if (index === -1) {
    return res.status(404).json({ error: 'Link not found' });
  }

  room.links.splice(index, 1);
  room.updatedAt = Date.now();
  res.json({ success: true });
});

// Delete file
app.delete('/api/rooms/:code/files/:fileId', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  const index = room.files.findIndex(f => f.id === req.params.fileId);
  if (index === -1) {
    return res.status(404).json({ error: 'File not found' });
  }

  const file = room.files[index];
  const filePath = path.join(uploadsDir, file.storedName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  room.files.splice(index, 1);
  room.updatedAt = Date.now();
  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Serve room page
app.get('/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!rooms.has(code)) {
    return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

startServer().then((server) => {
  console.log(`File Share server running on http://localhost:${server.address().port}`);
  console.log(`Share files between devices without accounts!`);
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});