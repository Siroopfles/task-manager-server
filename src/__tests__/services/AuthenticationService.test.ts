import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { AuthenticationService, AuthenticationError, UserRole } from '../../services/AuthenticationService.js';
import { getTestDatabase } from '../../database/testDatabase.js';
import jwt from 'jsonwebtoken';

describe('AuthenticationService', () => {
    let authService: AuthenticationService;
    let testUserData: {
        username: string;
        password: string;
        id?: string;
    };

    beforeEach(async () => {
        const db = await getTestDatabase();
        authService = new AuthenticationService(db);
        
        testUserData = {
            username: 'testuser',
            password: 'Test@123Password'
        };
    });

    afterEach(async () => {
        const db = await getTestDatabase();
        db.prepare('DROP TABLE IF EXISTS users').run();
        db.close();
    });

    describe('User Registration', () => {
        test('should create new user successfully', async () => {
            const user = await authService.createUser(
                testUserData.username,
                testUserData.password,
                UserRole.DEVELOPER
            );

            expect(user.username).toBe(testUserData.username);
            expect(user.role).toBe(UserRole.DEVELOPER);
            expect(user.id).toBeDefined();
            testUserData.id = user.id;
        });

        test('should not allow duplicate usernames', async () => {
            await authService.createUser(
                testUserData.username,
                testUserData.password,
                UserRole.DEVELOPER
            );

            await expect(
                authService.createUser(
                    testUserData.username,
                    testUserData.password,
                    UserRole.DEVELOPER
                )
            ).rejects.toThrow(AuthenticationError);
        });

        test('should validate password requirements', async () => {
            const weakPasswords = [
                'short',
                'nouppercase123!',
                'NOLOWERCASE123!',
                'NoSpecialChar123',
                'No@Numbers'
            ];

            for (const password of weakPasswords) {
                const isValid = await authService.validatePassword(password);
                expect(isValid).toBe(false);
            }

            const strongPassword = 'StrongP@ssw0rd';
            const isValid = await authService.validatePassword(strongPassword);
            expect(isValid).toBe(true);
        });
    });

    describe('Authentication', () => {
        beforeEach(async () => {
            // Create a test user
            const user = await authService.createUser(
                testUserData.username,
                testUserData.password,
                UserRole.DEVELOPER
            );
            testUserData.id = user.id;
        });

        test('should login successfully with correct credentials', async () => {
            const result = await authService.login(
                testUserData.username,
                testUserData.password
            );

            expect(result.token).toBeDefined();
            expect(result.user.username).toBe(testUserData.username);
            expect(result.user.role).toBe(UserRole.DEVELOPER);
        });

        test('should fail login with incorrect password', async () => {
            await expect(
                authService.login(testUserData.username, 'wrongpassword')
            ).rejects.toThrow(AuthenticationError);
        });

        test('should fail login with non-existent user', async () => {
            await expect(
                authService.login('nonexistent', testUserData.password)
            ).rejects.toThrow(AuthenticationError);
        });

        test('should validate JWT token', async () => {
            const { token } = await authService.login(
                testUserData.username,
                testUserData.password
            );

            const payload = authService.validateToken(token);
            expect(payload.username).toBe(testUserData.username);
            expect(payload.role).toBe(UserRole.DEVELOPER);
        });

        test('should reject invalid tokens', async () => {
            const invalidToken = 'invalid.token.here';
            expect(() => authService.validateToken(invalidToken))
                .toThrow(AuthenticationError);
        });
    });

    describe('Password Management', () => {
        beforeEach(async () => {
            const user = await authService.createUser(
                testUserData.username,
                testUserData.password,
                UserRole.DEVELOPER
            );
            testUserData.id = user.id;
        });

        test('should change password successfully', async () => {
            const newPassword = 'NewP@ssw0rd123';
            await authService.changePassword(
                testUserData.id!,
                testUserData.password,
                newPassword
            );

            // Should be able to login with new password
            const result = await authService.login(testUserData.username, newPassword);
            expect(result.token).toBeDefined();
        });

        test('should fail password change with incorrect current password', async () => {
            const newPassword = 'NewP@ssw0rd123';
            await expect(
                authService.changePassword(
                    testUserData.id!,
                    'wrongpassword',
                    newPassword
                )
            ).rejects.toThrow(AuthenticationError);
        });

        test('should fail password change with weak new password', async () => {
            const weakPassword = 'weak';
            await expect(
                authService.changePassword(
                    testUserData.id!,
                    testUserData.password,
                    weakPassword
                )
            ).rejects.toThrow(AuthenticationError);
        });
    });

    describe('Role Management', () => {
        beforeEach(async () => {
            const user = await authService.createUser(
                testUserData.username,
                testUserData.password,
                UserRole.DEVELOPER
            );
            testUserData.id = user.id;
        });

        test('should update user role', async () => {
            await authService.updateRole(testUserData.id!, UserRole.ADMIN);
            
            const user = await authService.getUserById(testUserData.id!);
            expect(user?.role).toBe(UserRole.ADMIN);
        });

        test('should fail role update for non-existent user', async () => {
            await expect(
                authService.updateRole('nonexistent-id', UserRole.ADMIN)
            ).rejects.toThrow(AuthenticationError);
        });
    });

    describe('User Retrieval', () => {
        beforeEach(async () => {
            const user = await authService.createUser(
                testUserData.username,
                testUserData.password,
                UserRole.DEVELOPER
            );
            testUserData.id = user.id;
        });

        test('should get user by id', async () => {
            const user = await authService.getUserById(testUserData.id!);
            expect(user).toBeDefined();
            expect(user?.username).toBe(testUserData.username);
            expect(user?.role).toBe(UserRole.DEVELOPER);
        });

        test('should return null for non-existent user', async () => {
            const user = await authService.getUserById('nonexistent-id');
            expect(user).toBeNull();
        });

        test('should not expose password hash in user data', async () => {
            const user = await authService.getUserById(testUserData.id!);
            expect(user).not.toHaveProperty('hashedPassword');
            expect(user).not.toHaveProperty('password');
        });
    });
});