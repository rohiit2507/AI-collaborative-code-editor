const pool = require("../config/db");

async function authorizeRoomOwner(req, res, next) {
  const roomId = req.params.roomId || req.body.roomId;

  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, owner_id
       FROM rooms
       WHERE id = $1`,
      [roomId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const room = result.rows[0];

    if (room.owner_id !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this room",
      });
    }

    next();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to authorize room access",
    });
  }
}

module.exports = authorizeRoomOwner;