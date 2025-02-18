import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { Database } from 'better-sqlite3';
import { MigrationService } from '../../database/migrations.js';
import { getTestDatabase } from '../../database/testDatabase.js';

describe('MigrationService', () => {
    let db: Database;
    let migrationService: MigrationService;

    beforeEach(async () => {
        db = await getTestDatabase();
        migrationService = new MigrationService(db);
    });

    afterEach(async () => {
        // Clean up by dropping all tables
        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name NOT LIKE 'sqlite_%'
        `).all() as { name: string }[];

        for (const { name } of tables) {
            db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
        }

        db.close();
    });

    describe('Migration Management', () => {
        test('should create migrations table', async () => {
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name='migrations'
            `).all();

            expect(tables.length).toBe(1);
        });

        test('should apply migrations in order', async () => {
            await migrationService.applyMigrations();

            const applied = await migrationService.getAppliedMigrations();
            expect(applied).toEqual([1, 2, 3]); // Our three migrations

            // Verify tables were created
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name NOT LIKE 'sqlite_%'
            `).all() as { name: string }[];

            const tableNames = tables.map(t => t.name);
            expect(tableNames).toContain('tasks');
            expect(tableNames).toContain('code_locations');
            expect(tableNames).toContain('implementations');
        });

        test('should not reapply existing migrations', async () => {
            // Apply migrations twice
            await migrationService.applyMigrations();
            await migrationService.applyMigrations();

            const applied = await migrationService.getAppliedMigrations();
            expect(applied.length).toBe(3); // Should still only have three migrations
            expect(applied).toEqual([1, 2, 3]);
        });
    });

    describe('Rollback Functionality', () => {
        test('should rollback last migration', async () => {
            // Apply all migrations
            await migrationService.applyMigrations();

            // Rollback last migration
            await migrationService.rollbackMigration();

            const applied = await migrationService.getAppliedMigrations();
            expect(applied.length).toBe(2);
            expect(applied).toEqual([1, 2]);

            // Verify indexes were removed
            const indexes = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='index' 
                AND name='impl_pattern_success_idx'
            `).all();
            expect(indexes.length).toBe(0);
        });

        test('should rollback all migrations', async () => {
            // Apply all migrations
            await migrationService.applyMigrations();

            // Rollback all
            await migrationService.rollbackAll();

            const applied = await migrationService.getAppliedMigrations();
            expect(applied.length).toBe(0);

            // Verify tables were removed
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name NOT LIKE 'sqlite_%'
                AND name != 'migrations'
            `).all();
            expect(tables.length).toBe(0);
        });

        test('should handle rollback with no migrations', async () => {
            // Try to rollback without any migrations applied
            await expect(migrationService.rollbackMigration())
                .resolves.toBeUndefined();
        });
    });

    describe('Migration Status', () => {
        test('should report correct migration status', async () => {
            // Check initial status
            let status = await migrationService.getMigrationStatus();
            expect(status.length).toBeGreaterThan(0);
            expect(status.every(m => m.status === 'pending')).toBe(true);

            // Apply some migrations
            await migrationService.applyMigrations();

            // Check updated status
            status = await migrationService.getMigrationStatus();
            expect(status.every(m => m.status === 'applied')).toBe(true);
            expect(status.every(m => m.executed_at !== undefined)).toBe(true);
        });

        test('should handle partial migrations', async () => {
            // Apply first migration only
            await migrationService.applyMigrations();
            await migrationService.rollbackMigration();
            await migrationService.rollbackMigration();

            const status = await migrationService.getMigrationStatus();
            
            const appliedCount = status.filter(m => m.status === 'applied').length;
            const pendingCount = status.filter(m => m.status === 'pending').length;

            expect(appliedCount).toBe(1);
            expect(pendingCount).toBe(2);
        });
    });

    describe('Error Handling', () => {
        test('should handle migration errors', async () => {
            // Create a table that would conflict with migration
            db.prepare(`
                CREATE TABLE tasks (
                    different_schema TEXT
                )
            `).run();

            await expect(migrationService.applyMigrations())
                .rejects.toThrow();
        });

        test('should handle rollback errors', async () => {
            // Apply migrations
            await migrationService.applyMigrations();

            // Drop a table manually to cause rollback error
            db.prepare('DROP TABLE implementations').run();

            await expect(migrationService.rollbackAll())
                .rejects.toThrow();
        });
    });

    describe('Performance', () => {
        test('should handle large number of migrations efficiently', async () => {
            const startTime = Date.now();

            // Apply and rollback multiple times
            for (let i = 0; i < 5; i++) {
                await migrationService.applyMigrations();
                await migrationService.rollbackAll();
            }

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });
    });
});