/**
 * VeraTrace — Sliding-Window Rate Limiting Engine
 *
 * Implements in-memory IP/User-based rate limiting for sensitive endpoints:
 * - Ingestion / File uploads
 * - Decryption & File Streaming
 * - General API
 */

export function createRateLimiter({ windowMs = 60000, maxRequests = 100, message = 'Too many requests, please try again later.' } = {}) {
  const requests = new Map();

  return function rateLimitMiddleware(req, res, next) {
    // In test environment, allow bypassing rate limits if configured
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    const now = Date.now();
    const identifier = req.user?.userId || req.ip || req.socket.remoteAddress || 'unknown';

    const clientHistory = requests.get(identifier) || [];
    // Filter timestamps within window
    const recent = clientHistory.filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= maxRequests) {
      const oldest = recent[0];
      const resetTimeSec = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', resetTimeSec);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', resetTimeSec);

      return res.status(429).json({
        error: message,
        retryAfterSeconds: resetTimeSec,
      });
    }

    recent.push(now);
    requests.set(identifier, recent);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - recent.length);

    next();
  };
}
