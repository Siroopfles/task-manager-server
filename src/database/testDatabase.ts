import Database from 'better-sqlite3';
import { schema } from './schema.js';

export class TestDatabaseManager {
    private db: Database.Database;

    constructor() {
        this.db = new Database(':memory:');
        this.initialize();
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

export const getTestDatabase = (): Database.Database => {
    const manager = new TestDatabaseManager();
    return manager.getDatabase();
};