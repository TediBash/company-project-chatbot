import jwt from 'jsonwebtoken';

/**
 * Middleware to verify JWT and extract Multi-Tenant context
 */
export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // UNPACK THE NEW SECURE TOKEN STRUCTURE
    // Attach the decoded nested context to the request object
    req.user = decoded.user; 
    req.tenant = decoded.tenant;
    
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]', error.message);
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.' });
  }
};

/**
 * Middleware factory to enforce domain visibility rules.
 * @param {Array<string>} allowedRoles - e.g., ['full', 'technician']
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // Because we unpacked req.user above, req.user.visibility now points to the correct nested string
    if (!req.user || !req.user.visibility) {
      return res.status(403).json({ message: 'Forbidden: Role context missing.' });
    }

    if (!allowedRoles.includes(req.user.visibility)) {
      return res.status(403).json({ 
        message: 'Forbidden: You do not have permission to access this resource.',
        requiredRoles: allowedRoles,
        yourRole: req.user.visibility
      });
    }

    next();
  };
};