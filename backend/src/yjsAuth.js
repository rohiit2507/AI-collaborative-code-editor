const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const YJS_TOKEN_AUDIENCE = "yjs";
const YJS_TOKEN_TTL = "2m";
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeRoomJoinCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generateRoomJoinCode(seed = "") {
  const normalizedSeed = normalizeRoomJoinCode(seed);
  const randomBytes = crypto.randomBytes(6);
  let code = "";

  for (const byte of randomBytes) {
    code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  }

  if (!normalizedSeed) {
    return code.slice(0, 8);
  }

  const seedSource = normalizedSeed.slice(0, 4);
  const suffixLength = Math.max(4, 8 - seedSource.length);
  const suffix = code.slice(0, suffixLength).padEnd(suffixLength, "X");

  return `${seedSource}${suffix}`.slice(0, 8);
}

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
  generateRoomJoinCode,
  normalizeRoomJoinCode,
  verifyYjsToken,
};
