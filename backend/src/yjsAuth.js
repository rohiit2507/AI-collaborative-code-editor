const jwt = require("jsonwebtoken");

const YJS_TOKEN_AUDIENCE = "yjs";
const YJS_TOKEN_TTL = "2m";

function createYjsToken(user, secret) {
  return jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      purpose: YJS_TOKEN_AUDIENCE,
    },
    secret,
    {
      expiresIn: YJS_TOKEN_TTL,
      audience: YJS_TOKEN_AUDIENCE,
    }
  );
}

function verifyYjsToken(token, secret) {
  if (!token) {
    const error = new Error("Yjs token is required");
    error.code = "YJS_TOKEN_MISSING";
    throw error;
  }

  const payload = jwt.verify(token, secret, {
    audience: YJS_TOKEN_AUDIENCE,
  });

  if (payload.purpose !== YJS_TOKEN_AUDIENCE || !payload.userId) {
    const error = new Error("Invalid Yjs token purpose");
    error.code = "YJS_TOKEN_INVALID_PURPOSE";
    throw error;
  }

  return payload;
}

async function authorizeYjsRoom(pool, roomId, userId) {
  const result = await pool.query(
    `SELECT r.owner_id,
            EXISTS (
              SELECT 1
              FROM room_members rm
              WHERE rm.room_id = r.id AND rm.user_id = $2
            ) AS is_member
     FROM rooms r
     WHERE r.id = $1`,
    [roomId, userId]
  );

  return (
    result.rows.length === 1 &&
    (String(result.rows[0].owner_id) === String(userId) ||
      result.rows[0].is_member)
  );
}

module.exports = {
  authorizeYjsRoom,
  YJS_TOKEN_AUDIENCE,
  YJS_TOKEN_TTL,
  createYjsToken,
  verifyYjsToken,
};
