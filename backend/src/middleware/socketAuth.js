const jwt = require("jsonwebtoken");

function socketAuth(socket, next) {
  try {
    const cookieHeader = socket.handshake.headers.cookie;

    if (!cookieHeader) {
      return next(new Error("Authentication required"));
    }

    const cookies = {};

    cookieHeader.split(";").forEach((cookie) => {
      const [name, ...valueParts] = cookie.trim().split("=");
      cookies[name] = valueParts.join("=");
    });

    const token = cookies.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = decoded;

    next();
  } catch (error) {
    console.error("Socket authentication failed:", error.message);
    next(new Error("Invalid or expired token"));
  }
}

module.exports = socketAuth;