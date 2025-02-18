import express from 'express';
import { authService, UserRole, AuthenticationError } from '../services/AuthenticationService.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { ValidationError } from '../models/types.js';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user (Admin only)
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, developer, viewer]
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.post('/register', requireAdmin, async (req, res, next) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            throw new ValidationError('Missing required fields');
        }

        // Validate password strength
        if (!(await authService.validatePassword(password))) {
            throw new ValidationError(
                'Password must be at least 8 characters and include uppercase, lowercase, number, and special character'
            );
        }

        // Validate role
        if (!Object.values(UserRole).includes(role)) {
            throw new ValidationError('Invalid role');
        }

        const user = await authService.createUser(username, password, role as UserRole);
        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login to get an access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            throw new ValidationError('Missing username or password');
        }

        const result = await authService.login(username, password);
        res.json(result);
    } catch (error) {
        if (error instanceof AuthenticationError) {
            res.status(401).json({ error: error.message });
            return;
        }
        next(error);
    }
});

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change user's password
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Invalid credentials
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user!.userId;

        if (!currentPassword || !newPassword) {
            throw new ValidationError('Missing required fields');
        }

        // Validate new password strength
        if (!(await authService.validatePassword(newPassword))) {
            throw new ValidationError(
                'New password must be at least 8 characters and include uppercase, lowercase, number, and special character'
            );
        }

        await authService.changePassword(userId, currentPassword, newPassword);
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        if (error instanceof AuthenticationError) {
            res.status(401).json({ error: error.message });
            return;
        }
        next(error);
    }
});

/**
 * @swagger
 * /auth/update-role:
 *   post:
 *     summary: Update user's role (Admin only)
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, developer, viewer]
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.post('/update-role', requireAdmin, async (req, res, next) => {
    try {
        const { userId, role } = req.body;

        if (!userId || !role) {
            throw new ValidationError('Missing required fields');
        }

        if (!Object.values(UserRole).includes(role)) {
            throw new ValidationError('Invalid role');
        }

        await authService.updateRole(userId, role as UserRole);
        res.json({ message: 'Role updated successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /auth/user:
 *   get:
 *     summary: Get current user information
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User information
 *       401:
 *         description: Not authenticated
 */
router.get('/user', requireAuth, async (req, res, next) => {
    try {
        const user = await authService.getUserById(req.user!.userId);
        if (!user) {
            throw new AuthenticationError('User not found');
        }
        res.json(user);
    } catch (error) {
        next(error);
    }
});

export default router;