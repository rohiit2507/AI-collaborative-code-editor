const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./config/db");

const app = express();
const PORT = 5000;

// =========================
// Middleware
// =========================

app.use(cors());
app.use(express.json());

// =========================
// HTTP + Socket.IO Server
// =========================

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// =========================
// REST APIs
// =========================

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "Backend and database are connected",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Create user
app.post("/api/users", async (req, res) => {
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({
      success: false,
      message: "Username and email are required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (username, email)
       VALUES ($1, $2)
       RETURNING *`,
      [username, email]
    );

    res.status(201).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
});

// Create room
app.post("/api/rooms", async (req, res) => {
  const { name, ownerId } = req.body;

  if (!name || !ownerId) {
    return res.status(400).json({
      success: false,
      message: "Room name and ownerId are required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO rooms (name, owner_id)
       VALUES ($1, $2)
       RETURNING *`,
      [name, ownerId]
    );

    res.status(201).json({
      success: true,
      room: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create room",
    });
  }
});

// Save file
app.post("/api/files", async (req, res) => {
  const { roomId, filename, language, content } = req.body;

  if (!roomId || !filename || !language) {
    return res.status(400).json({
      success: false,
      message: "roomId, filename and language are required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO files (room_id, filename, language, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [roomId, filename, language, content || ""]
    );

    res.status(201).json({
      success: true,
      file: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to save file",
    });
  }
});

// Get file
app.get("/api/files/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM files WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    res.json({
      success: true,
      file: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve file",
    });
  }
});

// Temporary code execution API
app.post("/api/execute", (req, res) => {
  const { code, language } = req.body;

  if (!code || !language) {
    return res.status(400).json({
      success: false,
      message: "Code and language are required",
    });
  }

  res.json({
    success: true,
    message: "Execution service will be connected later",
    language,
    code,
  });
});

// =========================
// SOCKET.IO
// =========================

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join room
  socket.on("join_room", (roomId) => {
    const roomName = `room_${roomId}`;

    socket.join(roomName);

    console.log(`${socket.id} joined ${roomName}`);

    // Tell the user that they joined successfully
    socket.emit("room_joined", {
      roomId,
    });

    // Tell other users in the room
    socket.to(roomName).emit("user_joined", {
      socketId: socket.id,
    });
  });

  // Real-time code changes
  socket.on("code_change", (data) => {
    console.log("Code change received:", data);

    socket.broadcast
      .to(`room_${data.roomId}`)
      .emit("code_change", data);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// =========================
// START SERVER
// =========================

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});