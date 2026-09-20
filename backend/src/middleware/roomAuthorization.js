const pool = require("../config/db");

async function getRoomAccess(roomId, userId) {
  const result = await pool.query(
    `SELECT r.id, r.owner_id,
            EXISTS (
              SELECT 1
              FROM room_members rm
              WHERE rm.room_id = r.id AND rm.user_id = $2
            ) AS is_member
     FROM rooms r
     WHERE r.id = $1`,
    [roomId, userId]
  );

  return result.rows[0] || null;
}

async function authorizeRoomOwner(req, res, next) {
  const roomId = req.params.roomId || req.body.roomId;

  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required",
    });
  }

  try {
    const room = await getRoomAccess(roomId, req.user.userId);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (String(room.owner_id) !== String(req.user.userId)) {
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

async function authorizeRoomMember(req, res, next) {
  const roomId = req.params.roomId || req.body.roomId;

  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required",
    });
  }

  try {
    const room = await getRoomAccess(roomId, req.user.userId);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (
      String(room.owner_id) !== String(req.user.userId) &&
      !room.is_member
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this room",
      });
    }

    req.roomId = Number(room.id);
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to authorize room access",
    });
  }
}

async function authorizeFileMember(req, res, next) {
  const fileId = req.params.id;

  if (!fileId) {
    return res.status(400).json({
      success: false,
      message: "File ID is required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT room_id
       FROM files
       WHERE id = $1`,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found or unauthorized",
      });
    }

    req.body = req.body || {};
    req.body.roomId = result.rows[0].room_id;
    return authorizeRoomMember(req, res, next);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to authorize file access",
    });
  }
}

module.exports = authorizeRoomOwner;
module.exports.authorizeRoomMember = authorizeRoomMember;
module.exports.authorizeFileMember = authorizeFileMember;
module.exports.getRoomAccess = getRoomAccess;