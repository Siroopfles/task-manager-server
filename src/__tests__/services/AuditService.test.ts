import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { AuditService, AuditAction, AuditSeverity } from '../../services/AuditService.js';
import { UserRole } from '../../services/AuthenticationService.js';
import { getTestDatabase } from '../../database/testDatabase.js';
import { Database } from 'better-sqlite3';

describe('AuditService', () => {
    let auditService: AuditService;
    let db: Database;

    beforeEach(async () => {
        db = await getTestDatabase();
        auditService = new AuditService(db);
    });

    afterEach(async () => {
        db.prepare('DROP TABLE IF EXISTS audit_logs').run();
        db.close();
    });

    describe('Log Creation', () => {
        test('should create basic log entry', async () => {
            await auditService.log(
                AuditAction.USER_LOGIN,
                AuditSeverity.INFO,
                'User logged in'
            );

            const logs = await auditService.query({});
            expect(logs).toHaveLength(1);
            expect(logs[0].action).toBe(AuditAction.USER_LOGIN);
            expect(logs[0].severity).toBe(AuditSeverity.INFO);
        });

        test('should store all log fields', async () => {
            const metadata = { browser: 'Chrome', os: 'Windows' };
            await auditService.log(
                AuditAction.USER_LOGIN,
                AuditSeverity.INFO,
                'User logged in',
                {
                    userId: 'test-user',
                    userRole: UserRole.DEVELOPER,
                    ipAddress: '127.0.0.1',
                    metadata
                }
            );

            const logs = await auditService.query({});
            const savedMetadata = logs[0].metadata ? JSON.parse(logs[0].metadata as string) : null;

            expect(logs[0]).toMatchObject({
                action: AuditAction.USER_LOGIN,
                severity: AuditSeverity.INFO,
                user_id: 'test-user',
                user_role: UserRole.DEVELOPER,
                ip_address: '127.0.0.1'
            });
            expect(savedMetadata).toEqual(metadata);
        });
    });

    describe('Query Functionality', () => {
        beforeEach(async () => {
            // Create test logs
            await auditService.log(
                AuditAction.USER_LOGIN,
                AuditSeverity.INFO,
                'User 1 login',
                { userId: 'user1' }
            );
            await auditService.log(
                AuditAction.AUTHENTICATION_FAILURE,
                AuditSeverity.WARNING,
                'Failed login attempt',
                { userId: 'user1' }
            );
            await auditService.log(
                AuditAction.SYSTEM_ERROR,
                AuditSeverity.ERROR,
                'System crash',
                { userId: 'user2' }
            );
        });

        test('should query by time range', async () => {
            const now = Date.now();
            const logs = await auditService.query({
                startDate: now - 1000,
                endDate: now + 1000
            });
            expect(logs).toHaveLength(3);
        });

        test('should query by action type', async () => {
            const logs = await auditService.query({
                actions: [AuditAction.USER_LOGIN]
            });
            expect(logs).toHaveLength(1);
            expect(logs[0].action).toBe(AuditAction.USER_LOGIN);
        });

        test('should query by severity', async () => {
            const logs = await auditService.query({
                severities: [AuditSeverity.ERROR, AuditSeverity.WARNING]
            });
            expect(logs).toHaveLength(2);
        });

        test('should query by user ID', async () => {
            const logs = await auditService.query({
                userId: 'user1'
            });
            expect(logs).toHaveLength(2);
        });

        test('should apply pagination', async () => {
            const logs = await auditService.query({
                limit: 2,
                offset: 1
            });
            expect(logs).toHaveLength(2);
        });
    });

    describe('Security Event Tracking', () => {
        beforeEach(async () => {
            // Create security-related logs
            await auditService.log(
                AuditAction.AUTHENTICATION_FAILURE,
                AuditSeverity.WARNING,
                'Failed login attempt'
            );
            await auditService.log(
                AuditAction.PASSWORD_CHANGE,
                AuditSeverity.INFO,
                'Password changed'
            );
            await auditService.log(
                AuditAction.TASK_CREATE,
                AuditSeverity.INFO,
                'Task created'
            );
        });

        test('should retrieve security events', async () => {
            const events = await auditService.getSecurityEvents();
            expect(events).toHaveLength(2);
            expect(events.every(e => 
                [AuditAction.AUTHENTICATION_FAILURE, AuditAction.PASSWORD_CHANGE]
                .includes(e.action as AuditAction)
            )).toBe(true);
        });

        test('should filter security events by severity', async () => {
            const events = await auditService.getSecurityEvents(AuditSeverity.WARNING);
            expect(events).toHaveLength(1);
            expect(events[0].action).toBe(AuditAction.AUTHENTICATION_FAILURE);
        });
    });

    describe('User Activity Tracking', () => {
        const userId = 'test-user';

        beforeEach(async () => {
            // Create user activity logs
            await auditService.log(
                AuditAction.USER_LOGIN,
                AuditSeverity.INFO,
                'User login',
                { userId }
            );
            await auditService.log(
                AuditAction.TASK_CREATE,
                AuditSeverity.INFO,
                'Task created',
                { userId }
            );
            await auditService.log(
                AuditAction.TASK_UPDATE,
                AuditSeverity.INFO,
                'Task updated',
                { userId: 'other-user' }
            );
        });

        test('should retrieve user activity', async () => {
            const activity = await auditService.getUserActivity(userId);
            expect(activity).toHaveLength(2);
            expect(activity.every(log => log.user_id === userId)).toBe(true);
        });

        test('should filter activity by date range', async () => {
            const now = Date.now();
            const activity = await auditService.getUserActivity(
                userId,
                now - 1000,
                now + 1000
            );
            expect(activity).toHaveLength(2);
        });
    });

    describe('Error Tracking', () => {
        beforeEach(async () => {
            // Create error logs
            await auditService.log(
                AuditAction.SYSTEM_ERROR,
                AuditSeverity.ERROR,
                'System error'
            );
            await auditService.log(
                AuditAction.SYSTEM_ERROR,
                AuditSeverity.CRITICAL,
                'Critical error'
            );
            await auditService.log(
                AuditAction.USER_LOGIN,
                AuditSeverity.INFO,
                'Normal event'
            );
        });

        test('should retrieve error events', async () => {
            const errors = await auditService.getErrorEvents();
            expect(errors).toHaveLength(2);
            expect(errors.every(e => 
                [AuditSeverity.ERROR, AuditSeverity.CRITICAL]
                .includes(e.severity as AuditSeverity)
            )).toBe(true);
        });

        test('should filter errors by date range', async () => {
            const now = Date.now();
            const errors = await auditService.getErrorEvents(
                now - 1000,
                now + 1000
            );
            expect(errors).toHaveLength(2);
        });
    });

    describe('Data Cleanup', () => {
        test('should cleanup old logs', async () => {
            const now = Date.now();
            const dayInMs = 24 * 60 * 60 * 1000;

            // Create logs with different dates
            for (const daysAgo of [0, 15, 31]) {
                await auditService.log(
                    AuditAction.USER_LOGIN,
                    AuditSeverity.INFO,
                    'Test log',
                    {
                        metadata: { timestamp: now - (daysAgo * dayInMs) }
                    }
                );
            }

            await auditService.cleanup(30); // 30 days retention

            const logs = await auditService.query({});
            expect(logs).toHaveLength(2); // Only today and 15 days ago logs should remain
        });

        test('should keep recent logs', async () => {
            const now = Date.now();
            const dayInMs = 24 * 60 * 60 * 1000;

            // Create logs with different dates
            for (const daysAgo of [0, 5, 10]) {
                await auditService.log(
                    AuditAction.USER_LOGIN,
                    AuditSeverity.INFO,
                    'Test log',
                    {
                        metadata: { timestamp: now - (daysAgo * dayInMs) }
                    }
                );
            }

            await auditService.cleanup(7); // 7 days retention

            const logs = await auditService.query({});
            expect(logs).toHaveLength(2); // Only logs from 0 and 5 days ago should remain
        });
    });
});