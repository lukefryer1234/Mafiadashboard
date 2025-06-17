const jwt = require('jsonwebtoken');

// Ensure JWT_SECRET is consistent with how it's defined in index.js
// It's critical that this secret is the same one used for signing tokens.
// Best practice: Centralize this configuration or ensure .env is loaded before this module is.
// For this setup, we assume process.env.JWT_SECRET is available via dotenv.config() in index.js.
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secure-and-long-secret-key-for-dev-pls-change';

/**
 * Middleware to authenticate users based on JWT.
 * If token is valid, attaches user payload to req.user.
 * Otherwise, sends a 401 or 403 response.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Token should be in the format: "Bearer TOKEN_STRING"
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    console.warn('[AUTH_MIDDLEWARE] No token provided. Auth header:', authHeader);
    // 401 Unauthorized - client should provide credentials
    return res.status(401).json({ errorCode: 'NO_TOKEN_PROVIDED', error: 'Access token is required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, userPayload) => {
    // userPayload is the object that was signed, e.g., { user: { id, email }, iat, exp }
    if (err) {
      console.warn('[AUTH_MIDDLEWARE] Token verification failed:', err.message);
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ errorCode: 'TOKEN_EXPIRED', error: 'Access token has expired.' });
      }
      // For other errors (e.g., JsonWebTokenError for malformed tokens), also return 403.
      return res.status(403).json({ errorCode: 'INVALID_TOKEN', error: 'Access token is invalid.' });
    }

    // Token is valid, attach user object from payload to request object
    // Assuming the payload was signed as { user: { id: ..., email: ... } }
    if (userPayload && userPayload.user) {
      req.user = userPayload.user;
      console.log(`[AUTH_MIDDLEWARE] Authenticated user ID: \${req.user.id}, Email: \${req.user.email}`);
      next(); // Proceed to the next middleware or route handler
    } else {
      // This case should ideally not happen if tokens are signed correctly with a 'user' property.
      console.error('[AUTH_MIDDLEWARE] Token verified but user payload is missing or malformed:', userPayload);
      return res.status(403).json({ errorCode: 'INVALID_TOKEN_PAYLOAD', error: 'Token payload is invalid.' });
    }
  });
}

module.exports = authenticateToken;
