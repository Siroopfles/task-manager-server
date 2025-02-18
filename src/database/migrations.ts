import { Database } from 'better-sqlite3';
import { getDatabase } from './schema.js';
import { indexService } from './indexService.js';

interface Migration {
    id: number;
    name: string;
    up: (db: Database) => void;
    down: (db: Database) => void;
}

const migrations: Migration[] = [
    {
        id: 1,
        name: 'initial_schema',
        up: (db: Database) => {
            // Create initial tables
            db.prepare(`
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    priority INTEGER NOT NULL,
                    complexity INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            `).run();

            db.prepare(`
                CREATE TABLE IF NOT EXISTS code_locations (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    start_line INTEGER NOT NULL,
                    end_line INTEGER,
                    git_branch TEXT,
                    git_commit TEXT,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
            `).run();

            db.prepare(`
                CREATE TABLE IF NOT EXISTS implementations (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    pattern_type TEXT NOT NULL,
                    pattern_data TEXT NOT NULL,
                    success_rating REAL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
            `).run();
        },
        down: (db: Database) => {
            db.prepare('DROP TABLE IF EXISTS implementations').run();
            db.prepare('DROP TABLE IF EXISTS code_locations').run();
            db.prepare('DROP TABLE IF EXISTS tasks').run();
        }
    },
    {
        id: 2,
        name: 'add_basic_indexes',
        up: async (db: Database) => {
            // Add basic indexes
            indexService.createIndex('tasks', 'status', 'task_status_idx');
            indexService.createIndex('tasks', 'created_at', 'task_created_idx');
            indexService.createIndex('code_locations', 'task_id', 'codeloc_task_idx');
            indexService.createIndex('implementations', 'task_id', 'impl_task_idx');
        },
        down: async (db: Database) => {
            // Remove basic indexes
            db.prepare('DROP INDEX IF EXISTS task_status_idx').run();
            db.prepare('DROP INDEX IF EXISTS task_created_idx').run();
            db.prepare('DROP INDEX IF EXISTS codeloc_task_idx').run();
            db.prepare('DROP INDEX IF EXISTS impl_task_idx').run();
        }
    },
    {
        id: 3,
        name: 'add_performance_indexes',
        up: async (db: Database) => {
            // Add performance-optimized indexes
            indexService.createCompoundIndex(
                'implementations',
                ['pattern_type', 'success_rating'],
                'impl_pattern_success_idx'
            );
            indexService.createCompoundIndex(
                'implementations',
                ['task_id', 'created_at'],
                'impl_task_time_idx'
            );
            indexService.createCompoundIndex(
                'tasks',
                ['status', 'complexity'],
                'task_status_complexity_idx'
            );
        },
        down: async (db: Database) => {
            // Remove performance indexes
            db.prepare('DROP INDEX IF EXISTS impl_pattern_success_idx').run();
            db.prepare('DROP INDEX IF EXISTS impl_task_time_idx').run();
            db.prepare('DROP INDEX IF EXISTS task_status_complexity_idx').run();
        }
    },
    {
        id: 4,
        name: 'add_audit_logs',
        up: (db: Database) => {
            // Create audit logs table
            db.prepare(`
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

            // Add indexes for audit logs
            indexService.createIndex('audit_logs', 'timestamp', 'audit_timestamp_idx');
            indexService.createIndex('audit_logs', 'action', 'audit_action_idx');
            indexService.createIndex('audit_logs', 'severity', 'audit_severity_idx');
            indexService.createIndex('audit_logs', 'user_id', 'audit_user_idx');

            // Add compound indexes for common queries
            indexService.createCompoundIndex(
                'audit_logs',
                ['severity', 'timestamp'],
                'audit_severity_time_idx'
            );
            indexService.createCompoundIndex(
                'audit_logs',
                ['user_id', 'timestamp'],
                'audit_user_time_idx'
            );
        },
        down: (db: Database) => {
            // Remove indexes
            db.prepare('DROP INDEX IF EXISTS audit_timestamp_idx').run();
            db.prepare('DROP INDEX IF EXISTS audit_action_idx').run();
            db.prepare('DROP INDEX IF EXISTS audit_severity_idx').run();
            db.prepare('DROP INDEX IF EXISTS audit_user_idx').run();
            db.prepare('DROP INDEX IF EXISTS audit_severity_time_idx').run();
            db.prepare('DROP INDEX IF EXISTS audit_user_time_idx').run();
            
            // Drop table
            db.prepare('DROP TABLE IF EXISTS audit_logs').run();
        }
    }
];

export class MigrationService {
    private db: Database;

    constructor(db?: Database) {
        this.db = db || getDatabase();
        this.initMigrationTable();
    }

    private initMigrationTable(): void {
        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                executed_at INTEGER NOT NULL
            )
        `).run();
    }

    async getAppliedMigrations(): Promise<number[]> {
        return this.db.prepare('SELECT id FROM migrations ORDER BY id')
            .all()
            .map((row: any) => row.id);
    }

    async applyMigrations(): Promise<void> {
        const applied = await this.getAppliedMigrations();
        const pending = migrations.filter(m => !applied.includes(m.id));

        for (const migration of pending) {
            try {
                await this.applyMigration(migration);
            } catch (error) {
                console.error(`Failed to apply migration ${migration.name}:`, error);
                throw error;
            }
        }
    }

    async rollbackMigration(): Promise<void> {
        const applied = await this.getAppliedMigrations();
        if (applied.length === 0) {
            return;
        }

        const lastMigration = migrations.find(m => m.id === applied[applied.length - 1]);
        if (lastMigration) {
            try {
                await this.rollback(lastMigration);
            } catch (error) {
                console.error(`Failed to rollback migration ${lastMigration.name}:`, error);
                throw error;
            }
        }
    }

    async rollbackAll(): Promise<void> {
        const applied = await this.getAppliedMigrations();
        const toRollback = migrations
            .filter(m => applied.includes(m.id))
            .sort((a, b) => b.id - a.id);

        for (const migration of toRollback) {
            try {
                await this.rollback(migration);
            } catch (error) {
                console.error(`Failed to rollback migration ${migration.name}:`, error);
                throw error;
            }
        }
    }

    private async applyMigration(migration: Migration): Promise<void> {
        console.log(`Applying migration: ${migration.name}`);
        
        migration.up(this.db);
        
        this.db.prepare(`
            INSERT INTO migrations (id, name, executed_at)
            VALUES (?, ?, ?)
        `).run(migration.id, migration.name, Date.now());
        
        console.log(`Migration applied: ${migration.name}`);
    }

    private async rollback(migration: Migration): Promise<void> {
        console.log(`Rolling back migration: ${migration.name}`);
        
        migration.down(this.db);
        
        this.db.prepare('DELETE FROM migrations WHERE id = ?')
            .run(migration.id);
        
        console.log(`Migration rolled back: ${migration.name}`);
    }

    async getMigrationStatus(): Promise<{
        id: number;
        name: string;
        status: 'applied' | 'pending';
        executed_at?: number;
    }[]> {
        const applied = this.db.prepare(`
            SELECT id, name, executed_at 
            FROM migrations 
            ORDER BY id
        `).all() as { id: number; name: string; executed_at: number; }[];

        const appliedIds = new Set(applied.map(m => m.id));

        return migrations.map(migration => ({
            id: migration.id,
            name: migration.name,
            status: appliedIds.has(migration.id) ? 'applied' : 'pending',
            executed_at: applied.find(m => m.id === migration.id)?.executed_at
        }));
    }
}

// Create singleton instance
export const migrationService = new MigrationService();