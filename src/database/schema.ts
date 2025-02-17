import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export const schema = [
    `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority INTEGER NOT NULL,
        complexity INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS code_locations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        git_branch TEXT,
        git_commit TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id)
    )`,

    `CREATE TABLE IF NOT EXISTS implementations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        pattern_data TEXT NOT NULL,
        success_rating REAL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_code_locations_task_id ON code_locations(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_implementations_task_id ON implementations(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`
];

// Get the directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
    private static instance: DatabaseManager;
    private db: Database.Database;

    private constructor() {
        const dbPath = join(dirname(__dirname), '..', 'data', 'task-manager.db');
        this.db = new Database(dbPath);
        this.initialize();
    }

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    private initialize(): void {
        for (const statement of schema) {
            this.db.exec(statement);
        }
    }

    public getDatabase(): Database.Database {
        return this.db;
    }

    public close(): void {
        this.db.close();
    }
}

// Export a singleton instance
export const getDatabase = (): Database.Database => {
    return DatabaseManager.getInstance().getDatabase();
};