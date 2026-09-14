const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const authenticateToken = require("./middleware/authMiddleware");
const authorizeRoomOwner = require("./middleware/roomAuthorization");
const socketAuth = require("./middleware/socketAuth");

const app = express();
const PORT = 5000;

// =========================
// Middleware
// =========================

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// =========================
// HTTP + Socket.IO Server
// =========================

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
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
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// =========================
// USERS / REGISTER
// =========================

app.post("/api/users", async (req, res) => {
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

app.post("/api/login", async (req, res) => {
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
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    // Store JWT in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
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

      res.json({
        success: true,
        file: result.rows[0],
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
// CODE EXECUTION
// =========================

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

      socket.join(`room_${roomId}`);

      console.log(
        `User ${socket.user.userId} joined room_${roomId}`
      );

      socket.emit("room_joined", {
        roomId,
        userId: socket.user.userId,
      });

      socket.to(`room_${roomId}`).emit("user_joined", {
        socketId: socket.id,
        userId: socket.user.userId,
      });
    } catch (error) {
      console.error("Room join error:", error);

      socket.emit("room_error", {
        message: "Failed to join room",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(
      `User disconnected: ${socket.id} | User ID: ${socket.user.userId}`
    );
  });
});

// =========================
// START SERVER
// =========================

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
