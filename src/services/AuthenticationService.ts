import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Database } from 'better-sqlite3';
import { getDatabase } from '../database/schema.js';

interface User {
    id: string;
    username: string;
    hashedPassword: string;
    role: UserRole;
    created_at: number;
    last_login?: number;
}

export enum UserRole {
    ADMIN = 'admin',
    DEVELOPER = 'developer',
    VIEWER = 'viewer'
}

interface AuthTokenPayload {
    userId: string;
    username: string;
    role: UserRole;
}

interface LoginResult {
    token: string;
    user: {
        id: string;
        username: string;
        role: UserRole;
    };
}

export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class AuthenticationService {
    private db: Database;
    private readonly SALT_ROUNDS = 12;
    private readonly JWT_SECRET: string;
    private readonly TOKEN_EXPIRY = '24h';

    constructor(db?: Database) {
        this.db = db || getDatabase();
        this.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
        this.initializeUserTable();
    }

    private initializeUserTable(): void {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_login INTEGER
            )
        `).run();

        // Create indexes
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_users_username
            ON users(username)
        `).run();
    }

    async createUser(
        username: string,
        password: string,
        role: UserRole
    ): Promise<Omit<User, 'hashedPassword'>> {
        try {
            // Check if username already exists
            const existing = this.db.prepare('SELECT id FROM users WHERE username = ?')
                .get(username);

            if (existing) {
                throw new AuthenticationError('Username already exists');
            }

            const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
            const id = crypto.randomUUID();
            const now = Date.now();

            this.db.prepare(`
                INSERT INTO users (id, username, password, role, created_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(id, username, hashedPassword, role, now);

            return {
                id,
                username,
                role,
                created_at: now
            };
        } catch (error) {
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Failed to create user');
        }
    }

    async login(username: string, password: string): Promise<LoginResult> {
        try {
            const user = this.db.prepare('SELECT * FROM users WHERE username = ?')
                .get(username) as User | undefined;

            if (!user) {
                throw new AuthenticationError('Invalid username or password');
            }

            const passwordValid = await bcrypt.compare(password, user.hashedPassword);
            if (!passwordValid) {
                throw new AuthenticationError('Invalid username or password');
            }

            // Update last login
            this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?')
                .run(Date.now(), user.id);

            // Generate JWT token
            const token = this.generateToken({
                userId: user.id,
                username: user.username,
                role: user.role
            });

            return {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            };
        } catch (error) {
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Authentication failed');
        }
    }

    validateToken(token: string): AuthTokenPayload {
        try {
            return jwt.verify(token, this.JWT_SECRET) as AuthTokenPayload;
        } catch (error) {
            throw new AuthenticationError('Invalid token');
        }
    }

    async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string
    ): Promise<void> {
        try {
            const user = this.db.prepare('SELECT * FROM users WHERE id = ?')
                .get(userId) as User | undefined;

            if (!user) {
                throw new AuthenticationError('User not found');
            }

            const passwordValid = await bcrypt.compare(currentPassword, user.hashedPassword);
            if (!passwordValid) {
                throw new AuthenticationError('Invalid current password');
            }

            const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
            
            this.db.prepare('UPDATE users SET password = ? WHERE id = ?')
                .run(hashedPassword, userId);
        } catch (error) {
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Failed to change password');
        }
    }

    async updateRole(userId: string, newRole: UserRole): Promise<void> {
        try {
            const result = this.db.prepare('UPDATE users SET role = ? WHERE id = ?')
                .run(newRole, userId);

            if (result.changes === 0) {
                throw new AuthenticationError('User not found');
            }
        } catch (error) {
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Failed to update role');
        }
    }

    private generateToken(payload: AuthTokenPayload): string {
        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.TOKEN_EXPIRY
        });
    }

    async validatePassword(password: string): Promise<boolean> {
        // Password requirements:
        // - At least 8 characters
        // - At least one uppercase letter
        // - At least one lowercase letter
        // - At least one number
        // - At least one special character
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return passwordRegex.test(password);
    }

    async getUserById(userId: string): Promise<Omit<User, 'hashedPassword'> | null> {
        try {
            const user = this.db.prepare('SELECT * FROM users WHERE id = ?')
                .get(userId) as User | undefined;

            if (!user) {
                return null;
            }

            const { hashedPassword, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            throw new AuthenticationError('Failed to get user');
        }
    }
}

// Create singleton instance
export const authService = new AuthenticationService();