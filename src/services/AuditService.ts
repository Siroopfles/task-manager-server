import { Database } from 'better-sqlite3';
import { getDatabase } from '../database/schema.js';
import { UserRole } from './AuthenticationService.js';

export enum AuditAction {
    USER_LOGIN = 'USER_LOGIN',
    USER_LOGOUT = 'USER_LOGOUT',
    USER_REGISTER = 'USER_REGISTER',
    PASSWORD_CHANGE = 'PASSWORD_CHANGE',
    ROLE_UPDATE = 'ROLE_UPDATE',
    TASK_CREATE = 'TASK_CREATE',
    TASK_UPDATE = 'TASK_UPDATE',
    TASK_DELETE = 'TASK_DELETE',
    PATTERN_RECORD = 'PATTERN_RECORD',
    SENSITIVE_DATA_ACCESS = 'SENSITIVE_DATA_ACCESS',
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    AUTHENTICATION_FAILURE = 'AUTHENTICATION_FAILURE'
}

export enum AuditSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL'
}

interface AuditLog {
    id: string;
    timestamp: number;
    action: AuditAction;
    severity: AuditSeverity;
    user_id?: string;
    user_role?: UserRole;
    ip_address?: string;
    details: string;
    metadata?: Record<string, any>;
}

export class AuditService {
    private db: Database;

    constructor(db?: Database) {
        this.db = db || getDatabase();
        this.initializeAuditTable();
    }

    private initializeAuditTable(): void {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                action TEXT NOT NULL,
                severity TEXT NOT NULL,
                user_id TEXT,
                user_role TEXT,
                ip_address TEXT,
                details TEXT NOT NULL,
                metadata TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `).run();

        // Create indexes for efficient querying
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp 
            ON audit_logs(timestamp)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_action 
            ON audit_logs(action)
        `).run();

        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_audit_user 
            ON audit_logs(user_id)
        `).run();
    }

    async log(
        action: AuditAction,
        severity: AuditSeverity,
        details: string,
        options?: {
            userId?: string;
            userRole?: UserRole;
            ipAddress?: string;
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        const log: AuditLog = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            action,
            severity,
            details,
            user_id: options?.userId,
            user_role: options?.userRole,
            ip_address: options?.ipAddress,
            metadata: options?.metadata
        };

        this.db.prepare(`
            INSERT INTO audit_logs (
                id, timestamp, action, severity, user_id, user_role, 
                ip_address, details, metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            log.id,
            log.timestamp,
            log.action,
            log.severity,
            log.user_id,
            log.user_role,
            log.ip_address,
            log.details,
            log.metadata ? JSON.stringify(log.metadata) : null
        );
    }

    async query(options: {
        startDate?: number;
        endDate?: number;
        actions?: AuditAction[];
        severities?: AuditSeverity[];
        userId?: string;
        limit?: number;
        offset?: number;
    }): Promise<AuditLog[]> {
        let query = `
            SELECT * FROM audit_logs
            WHERE 1=1
        `;
        const params: any[] = [];

        if (options.startDate) {
            query += ' AND timestamp >= ?';
            params.push(options.startDate);
        }

        if (options.endDate) {
            query += ' AND timestamp <= ?';
            params.push(options.endDate);
        }

        if (options.actions?.length) {
            query += ` AND action IN (${options.actions.map(() => '?').join(',')})`;
            params.push(...options.actions);
        }

        if (options.severities?.length) {
            query += ` AND severity IN (${options.severities.map(() => '?').join(',')})`;
            params.push(...options.severities);
        }

        if (options.userId) {
            query += ' AND user_id = ?';
            params.push(options.userId);
        }

        query += ' ORDER BY timestamp DESC';

        if (options.limit) {
            query += ' LIMIT ?';
            params.push(options.limit);
        }

        if (options.offset) {
            query += ' OFFSET ?';
            params.push(options.offset);
        }

        return this.db.prepare(query).all(...params) as AuditLog[];
    }

    async getSecurityEvents(
        severity?: AuditSeverity,
        limit = 100
    ): Promise<AuditLog[]> {
        const securityActions = [
            AuditAction.AUTHENTICATION_FAILURE,
            AuditAction.USER_LOGIN,
            AuditAction.PASSWORD_CHANGE,
            AuditAction.ROLE_UPDATE,
            AuditAction.SENSITIVE_DATA_ACCESS
        ];

        return this.query({
            actions: securityActions,
            severities: severity ? [severity] : undefined,
            limit
        });
    }

    async getUserActivity(
        userId: string,
        startDate?: number,
        endDate?: number
    ): Promise<AuditLog[]> {
        return this.query({
            userId,
            startDate,
            endDate,
            limit: 1000
        });
    }

    async getErrorEvents(
        startDate?: number,
        endDate?: number
    ): Promise<AuditLog[]> {
        return this.query({
            severities: [AuditSeverity.ERROR, AuditSeverity.CRITICAL],
            startDate,
            endDate,
            limit: 100
        });
    }

    async cleanup(retentionDays: number): Promise<void> {
        const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
        
        this.db.prepare(`
            DELETE FROM audit_logs 
            WHERE timestamp < ?
        `).run(cutoffDate);
    }
}

// Create singleton instance
export const auditService = new AuditService();