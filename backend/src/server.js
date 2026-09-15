const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const authenticateToken = require("./middleware/authMiddleware");
const authorizeRoomOwner = require("./middleware/roomAuthorization");
const socketAuth = require("./middleware/socketAuth");
const ExecutionQueue = require("./executionQueue");
const { LIMITS, RUNNERS, executeInDocker } = require("./dockerExecutor");
const { createVersionSnapshot, buildVersionLabel } = require("./versionHistory");
const logger = require("./logger");
const { corsOrigins, host, isProduction, jwtSecret, port } = require("./config/env");

const app = express();
const PORT = port;
const MAX_CODE_BYTES = 100 * 1024;
const executionQueue = new ExecutionQueue({
  maxPending: 20,
  worker: executeInDocker,
});

async function ensureChatTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    logger.error("Failed to initialize room_messages table", { error: error.message });
  }
}

async function ensureVersionHistoryTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_versions (
        id SERIAL PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        language VARCHAR(64) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_id, version_number)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS file_versions_file_created_idx
      ON file_versions (file_id, created_at DESC)
    `);
  } catch (error) {
    logger.error("Failed to initialize file_versions table", { error: error.message });
  }
}

ensureChatTable();
ensureVersionHistoryTable();

// =========================
// Middleware
// =========================

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(helmet());
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
}));
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Try again later.",
  },
});

// =========================
// HTTP + Socket.IO Server
// =========================

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
});

io.use(socketAuth);

// =========================
// REST APIs
// =========================

// =========================
// HEALTH CHECK
// =========================

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "Backend and database are connected",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    logger.error("Health check failed", { error: error.message });

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.get("/api/readiness", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, status: "ready" });
  } catch (error) {
    logger.error("Readiness check failed", { error: error.message });
    res.status(503).json({ success: false, status: "not_ready" });
  }
});

// =========================
// USERS / REGISTER
// =========================

app.post("/api/users", authRateLimit, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Username, email and password are required",
    });
  }

  try {
    // Hash password before storing it
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email, passwordHash]
    );

    res.status(201).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    // PostgreSQL unique constraint violation
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
});

// =========================
// LOGIN
// =========================

app.post("/api/login", authRateLimit, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  try {
    // Find user by email
    const result = await pool.query(
      `SELECT id, username, email, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    // Compare entered password with stored hash
    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
      },
      jwtSecret,
      {
        expiresIn: "1d",
      }
    );

    // Store JWT in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Never send password/password_hash to client
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// =========================
// PROTECTED USER PROFILE
// =========================

app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve user",
    });
  }
});

// =========================
// ROOMS
// =========================

// Create room - authenticated user becomes owner
app.post("/api/rooms", authenticateToken, async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Room name is required",
    });
  }

  try {
    // Get owner from verified JWT
    const ownerId = req.user.userId;

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

// Get rooms owned by authenticated user
app.get("/api/rooms", authenticateToken, async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const result = await pool.query(
      `SELECT id, name, owner_id, created_at
       FROM rooms
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [ownerId]
    );

    res.json({
      success: true,
      rooms: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve rooms",
    });
  }
});
// =========================
// FILES
// =========================
// Create file
app.post(
  "/api/files",
  authenticateToken,
  authorizeRoomOwner,
  async (req, res) => {
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

      const createdFile = result.rows[0];
      const versionResult = await pool.query(
        `INSERT INTO file_versions (file_id, room_id, version_number, filename, language, content, summary)
         VALUES ($1, $2, 1, $3, $4, $5, $6)
         RETURNING *`,
        [createdFile.id, createdFile.room_id, createdFile.filename, createdFile.language, createdFile.content, `Created ${createdFile.filename}`]
      );

      res.status(201).json({
        success: true,
        file: createdFile,
        version: createVersionSnapshot({
          id: versionResult.rows[0].id,
          filename: versionResult.rows[0].filename,
          language: versionResult.rows[0].language,
          content: versionResult.rows[0].content,
          versionNumber: versionResult.rows[0].version_number,
          summary: versionResult.rows[0].summary,
        }),
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to save file",
      });
    }
  }
);

// Get files by room
app.get(
  "/api/files/room/:roomId",
  authenticateToken,
  authorizeRoomOwner,
  async (req, res) => {
    const { roomId } = req.params;

    try {
      const result = await pool.query(
        `SELECT *
         FROM files
         WHERE room_id = $1
         ORDER BY id ASC`,
        [roomId]
      );

      res.json({
        success: true,
        files: result.rows,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to retrieve room files",
      });
    }
  }
);

// Update file
app.put(
  "/api/files/:id",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const { filename, language, content } = req.body;

    if (!filename || !language) {
      return res.status(400).json({
        success: false,
        message: "Filename and language are required",
      });
    }

    try {
      const result = await pool.query(
        `UPDATE files
         SET filename = $1,
             language = $2,
             content = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
           AND room_id IN (
             SELECT id
             FROM rooms
             WHERE owner_id = $5
           )
         RETURNING *`,
        [
          filename,
          language,
          content || "",
          id,
          req.user.userId,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "File not found or unauthorized",
        });
      }

      const updatedFile = result.rows[0];
      const versionResult = await pool.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM file_versions
         WHERE file_id = $1`,
        [updatedFile.id]
      );

      const nextVersionNumber = Number(versionResult.rows[0].next_version || 1);
      const savedVersion = await pool.query(
        `INSERT INTO file_versions (file_id, room_id, version_number, filename, language, content, summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [updatedFile.id, updatedFile.room_id, nextVersionNumber, updatedFile.filename, updatedFile.language, updatedFile.content, `Saved ${updatedFile.filename}`]
      );

      res.json({
        success: true,
        file: updatedFile,
        version: createVersionSnapshot({
          id: savedVersion.rows[0].id,
          filename: savedVersion.rows[0].filename,
          language: savedVersion.rows[0].language,
          content: savedVersion.rows[0].content,
          versionNumber: savedVersion.rows[0].version_number,
          summary: savedVersion.rows[0].summary,
        }),
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to update file",
      });
    }
  }
);

app.get(
  "/api/files/:id/versions",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `SELECT fv.*
         FROM file_versions fv
         JOIN files f ON f.id = fv.file_id
         JOIN rooms r ON r.id = f.room_id
         WHERE fv.file_id = $1 AND r.owner_id = $2
         ORDER BY fv.version_number DESC`,
        [id, req.user.userId]
      );

      res.json({
        success: true,
        versions: result.rows.map((row) => createVersionSnapshot({
          id: row.id,
          filename: row.filename,
          language: row.language,
          content: row.content,
          versionNumber: row.version_number,
          summary: row.summary,
        })),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to load file versions",
      });
    }
  }
);

app.post(
  "/api/files/:id/restore",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const { versionNumber } = req.body;

    if (!versionNumber) {
      return res.status(400).json({
        success: false,
        message: "Version number is required",
      });
    }

    try {
      const versionResult = await pool.query(
        `SELECT fv.*
         FROM file_versions fv
         JOIN files f ON f.id = fv.file_id
         JOIN rooms r ON r.id = f.room_id
         WHERE fv.file_id = $1 AND fv.version_number = $2 AND r.owner_id = $3`,
        [id, versionNumber, req.user.userId]
      );

      if (versionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Version not found or unauthorized",
        });
      }

      const version = versionResult.rows[0];
      const restoreResult = await pool.query(
        `UPDATE files
         SET filename = $1,
             language = $2,
             content = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [version.filename, version.language, version.content, id]
      );

      const currentFile = restoreResult.rows[0];
      const nextVersionNumber = await pool.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM file_versions
         WHERE file_id = $1`,
        [currentFile.id]
      );

      const savedVersion = await pool.query(
        `INSERT INTO file_versions (file_id, room_id, version_number, filename, language, content, summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [currentFile.id, currentFile.room_id, Number(nextVersionNumber.rows[0].next_version), currentFile.filename, currentFile.language, currentFile.content, `Restored ${buildVersionLabel({ versionNumber })}`]
      );

      res.json({
        success: true,
        file: currentFile,
        restoredVersion: createVersionSnapshot({
          id: savedVersion.rows[0].id,
          filename: savedVersion.rows[0].filename,
          language: savedVersion.rows[0].language,
          content: savedVersion.rows[0].content,
          versionNumber: savedVersion.rows[0].version_number,
          summary: savedVersion.rows[0].summary,
        }),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to restore version",
      });
    }
  }
);

// Get file
app.get(
  "/api/files/:id",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `SELECT f.*
         FROM files f
         JOIN rooms r ON f.room_id = r.id
         WHERE f.id = $1
           AND r.owner_id = $2`,
        [id, req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "File not found or unauthorized",
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
  }
);

// Delete file
app.delete(
  "/api/files/:id",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        `DELETE FROM files
         WHERE id = $1
           AND room_id IN (
             SELECT id
             FROM rooms
             WHERE owner_id = $2
           )
         RETURNING *`,
        [id, req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "File not found or unauthorized",
        });
      }

      res.json({
        success: true,
        deletedFile: result.rows[0],
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to delete file",
      });
    }
  }
);

// =========================
// ROOM CHAT
// =========================

app.get(
  "/api/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    const { roomId } = req.params;

    try {
      const result = await pool.query(
        `SELECT id, room_id, user_id, username, message, created_at
         FROM room_messages
         WHERE room_id = $1
         ORDER BY created_at ASC
         LIMIT 200`,
        [roomId]
      );

      res.json({
        success: true,
        messages: result.rows,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to load room chat",
      });
    }
  }
);

app.post(
  "/api/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    const { roomId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    try {
      const roomResult = await pool.query(
        `SELECT id, owner_id
         FROM rooms
         WHERE id = $1`,
        [roomId]
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }

      const room = roomResult.rows[0];
      if (String(room.owner_id) !== String(req.user.userId)) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to chat in this room",
        });
      }

      const result = await pool.query(
        `INSERT INTO room_messages (room_id, user_id, username, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, room_id, user_id, username, message, created_at`,
        [roomId, req.user.userId, req.user.username, message.trim()]
      );

      const savedMessage = result.rows[0];
      io.to(`room_${roomId}`).emit("room_message", savedMessage);

      res.status(201).json({
        success: true,
        message: savedMessage,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to send message",
      });
    }
  }
);

// =========================
// CODE EXECUTION
// =========================

app.post("/api/execute", authenticateToken, async (req, res) => {
  const { roomId, fileId, code, language } = req.body;

  if (!roomId || typeof code !== "string" || !code.trim() || !language) {
    return res.status(400).json({
      success: false,
      status: "system_error",
      message: "roomId, code and language are required",
    });
  }

  if (!RUNNERS[language]) {
    return res.status(400).json({
      success: false,
      status: "system_error",
      message: `Unsupported language: ${language}`,
    });
  }

  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return res.status(413).json({
      success: false,
      status: "resource_limit",
      message: `Code must be smaller than ${MAX_CODE_BYTES} bytes`,
    });
  }

  try {
    const roomResult = await pool.query(
      `SELECT id, owner_id
       FROM rooms
       WHERE id = $1`,
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        status: "system_error",
        message: "Room not found",
      });
    }

    if (String(roomResult.rows[0].owner_id) !== String(req.user.userId)) {
      return res.status(403).json({
        success: false,
        status: "system_error",
        message: "You are not authorized to execute code in this room",
      });
    }

    if (fileId) {
      const fileResult = await pool.query(
        `SELECT id
         FROM files
         WHERE id = $1 AND room_id = $2`,
        [fileId, roomId]
      );

      if (fileResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          status: "system_error",
          message: "File not found in this room",
        });
      }
    }

    const jobId = require("node:crypto").randomUUID();
    const result = await executionQueue.enqueue({
      jobId,
      language,
      code,
      limits: LIMITS,
    });

    return res.json({
      success: result.status === "success",
      jobId,
      language,
      ...result,
    });
  } catch (error) {
    if (error.code === "QUEUE_FULL") {
      return res.status(429).json({
        success: false,
        status: "resource_limit",
        message: "Execution queue is full. Try again shortly.",
      });
    }

    if (error.code === "ENOENT") {
      return res.status(503).json({
        success: false,
        status: "system_error",
        message: "Docker is unavailable. Start Docker Desktop to run code.",
      });
    }

    console.error("Execution error:", error);
    return res.status(500).json({
      success: false,
      status: "system_error",
      message: "Execution service failed",
    });
  }
});

function getRoomUsers(roomName) {
  const room = io.sockets.adapter.rooms.get(roomName);

  if (!room) {
    return [];
  }

  return Array.from(room).reduce((users, socketId) => {
    const clientSocket = io.sockets.sockets.get(socketId);

    if (!clientSocket?.user) {
      return users;
    }

    users.push({
      socketId,
      userId: clientSocket.user.userId,
      username: clientSocket.user.username,
    });

    return users;
  }, []);
}

// =========================
// SOCKET.IO
// =========================

io.on("connection", (socket) => {
  console.log(
    `User connected: ${socket.id} | User ID: ${socket.user.userId}`
  );

  socket.on("join_room", async (roomId) => {
    try {
      const result = await pool.query(
        `SELECT id, name, owner_id
         FROM rooms
         WHERE id = $1`,
        [roomId]
      );

      if (result.rows.length === 0) {
        socket.emit("room_error", {
          message: "Room not found",
        });

        return;
      }

      const room = result.rows[0];

      if (room.owner_id !== socket.user.userId) {
        socket.emit("room_error", {
          message: "You are not authorized to join this room",
        });

        return;
      }

      const roomName = `room_${roomId}`;
      socket.data.roomId = roomId;
      socket.join(roomName);

      console.log(
        `User ${socket.user.userId} joined ${roomName}`
      );

      const members = getRoomUsers(roomName);
      io.to(roomName).emit("room_users", members);

      socket.emit("room_joined", {
        roomId,
        userId: socket.user.userId,
        username: socket.user.username,
      });

      socket.to(roomName).emit("user_joined", {
        socketId: socket.id,
        userId: socket.user.userId,
        username: socket.user.username,
      });
    } catch (error) {
      console.error("Room join error:", error);

      socket.emit("room_error", {
        message: "Failed to join room",
      });
    }
  });

  socket.on("send_room_message", async ({ roomId, message }) => {
    if (!roomId || !message || !message.trim()) {
      return;
    }

    const roomName = `room_${roomId}`;

    if (!socket.rooms.has(roomName)) {
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO room_messages (room_id, user_id, username, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, room_id, user_id, username, message, created_at`,
        [roomId, socket.user.userId, socket.user.username, message.trim()]
      );

      io.to(roomName).emit("room_message", result.rows[0]);
    } catch (error) {
      console.error("Room message error:", error);
      socket.emit("room_error", {
        message: "Failed to send message",
      });
    }
  });

  socket.on("typing_status", ({ roomId, isTyping }) => {
    if (!roomId || typeof isTyping !== "boolean") {
      return;
    }

    const roomName = `room_${roomId}`;
    if (!socket.rooms.has(roomName)) {
      return;
    }

    socket.to(roomName).emit("user_typing", {
      roomId,
      userId: socket.user.userId,
      username: socket.user.username,
      isTyping,
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      const roomName = `room_${roomId}`;
      const members = getRoomUsers(roomName);
      io.to(roomName).emit("room_users", members);
      io.to(roomName).emit("user_left", {
        socketId: socket.id,
        userId: socket.user?.userId,
        username: socket.user?.username,
      });
    }

    console.log(
      `User disconnected: ${socket.id} | User ID: ${socket.user?.userId}`
    );
  });
});

app.use((error, req, res, next) => {
  logger.error("Unhandled request error", {
    error: error.message,
    method: req.method,
    path: req.path,
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(error.status || 500).json({
    success: false,
    message: isProduction ? "Internal server error" : error.message,
  });
});

// =========================
// START SERVER
// =========================

httpServer.listen(PORT, host, () => {
  logger.info("Server started", { host, port: PORT, environment: process.env.NODE_ENV || "development" });
});
