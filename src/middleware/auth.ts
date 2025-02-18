import { Request, Response, NextFunction } from 'express';
import { authService, AuthenticationError, UserRole } from '../services/AuthenticationService.js';

// Extend Express Request type to include user information
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                username: string;
                role: UserRole;
            };
        }
    }
}

/**
 * Authentication middleware
 */
export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const payload = authService.validateToken(token);
        
        // Add user information to request
        req.user = payload;
        next();
    } catch (error) {
        if (error instanceof AuthenticationError) {
            res.status(401).json({ error: error.message });
            return;
        }
        next(error);
    }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (allowedRoles: UserRole[]) => {
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            if (!allowedRoles.includes(req.user.role)) {
                res.status(403).json({ error: 'Insufficient permissions' });
                return;
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Admin-only middleware
 */
export const requireAdmin = authorize([UserRole.ADMIN]);

/**
 * Developer or Admin middleware
 */
export const requireDeveloper = authorize([UserRole.ADMIN, UserRole.DEVELOPER]);

/**
 * Any authenticated user middleware
 */
export const requireAuth = authorize([
    UserRole.ADMIN,
    UserRole.DEVELOPER,
    UserRole.VIEWER
]);