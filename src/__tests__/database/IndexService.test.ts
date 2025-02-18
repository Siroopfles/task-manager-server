import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { Database } from 'better-sqlite3';
import { IndexService } from '../../database/indexService.js';
import { getTestDatabase } from '../../database/testDatabase.js';

describe('IndexService', () => {
    let db: Database;
    let indexService: IndexService;

    beforeEach(async () => {
        db = await getTestDatabase();
        indexService = new IndexService(db);
        
        // Create test tables
        db.prepare(`
            CREATE TABLE IF NOT EXISTS test_table (
                id TEXT PRIMARY KEY,
                value TEXT,
                number INTEGER,
                created_at INTEGER
            )
        `).run();

        // Insert some test data
        const insert = db.prepare(`
            INSERT INTO test_table (id, value, number, created_at)
            VALUES (?, ?, ?, ?)
        `);

        for (let i = 0; i < 100; i++) {
            insert.run(
                `id_${i}`,
                `value_${i % 10}`,
                i,
                Date.now() - i * 1000
            );
        }
    });

    afterEach(async () => {
        // Drop test tables and close connection
        db.prepare('DROP TABLE IF EXISTS test_table').run();
        db.close();
    });

    describe('Index Management', () => {
        test('should create and drop indexes', async () => {
            // Create test index
            indexService['createIndex']('test_table', 'value', 'test_value_idx');

            // Get indexes
            const indexes = await indexService.getIndexInfo();
            const testIndex = indexes.find(idx => idx.indexName === 'test_value_idx');

            expect(testIndex).toBeDefined();
            expect(testIndex?.columns).toContain('value');

            // Drop indexes
            await indexService.dropIndexes();

            // Verify index was dropped
            const afterDrop = await indexService.getIndexInfo();
            expect(afterDrop.find(idx => idx.indexName === 'test_value_idx')).toBeUndefined();
        });

        test('should create compound indexes', async () => {
            // Create compound index
            indexService['createCompoundIndex'](
                'test_table',
                ['value', 'number'],
                'test_compound_idx'
            );

            const indexes = await indexService.getIndexInfo();
            const compoundIndex = indexes.find(idx => idx.indexName === 'test_compound_idx');

            expect(compoundIndex).toBeDefined();
            expect(compoundIndex?.columns).toContain('value');
            expect(compoundIndex?.columns).toContain('number');
        });

        test('should rebuild indexes', async () => {
            // Create some indexes
            indexService['createIndex']('test_table', 'value', 'test_value_idx');
            indexService['createIndex']('test_table', 'number', 'test_number_idx');

            // Rebuild indexes
            await indexService.rebuildIndexes();

            // Verify indexes were recreated
            const indexes = await indexService.getIndexInfo();
            expect(indexes.length).toBeGreaterThan(0);
        });
    });

    describe('Query Optimization', () => {
        test('should analyze query plans', async () => {
            const queries = [
                'SELECT * FROM test_table WHERE value = ? AND number > ?',
                'SELECT * FROM test_table ORDER BY created_at DESC LIMIT 10'
            ];

            // This shouldn't throw
            await indexService.optimizeQueries(queries);
        });

        test('should improve query performance with indexes', async () => {
            // Run query without index and measure time
            const startNoIndex = Date.now();
            db.prepare('SELECT * FROM test_table WHERE value = ?').all('value_1');
            const timeNoIndex = Date.now() - startNoIndex;

            // Create index
            indexService['createIndex']('test_table', 'value', 'test_value_idx');

            // Run query with index and measure time
            const startWithIndex = Date.now();
            db.prepare('SELECT * FROM test_table WHERE value = ?').all('value_1');
            const timeWithIndex = Date.now() - startWithIndex;

            // Index should improve performance
            expect(timeWithIndex).toBeLessThanOrEqual(timeNoIndex);
        });
    });

    describe('Index Statistics', () => {
        test('should track index usage', async () => {
            // Create index
            indexService['createIndex']('test_table', 'value', 'test_value_idx');

            // Run some queries to generate statistics
            for (let i = 0; i < 5; i++) {
                db.prepare('SELECT * FROM test_table WHERE value = ?').all(`value_${i}`);
            }

            // Analyze to update statistics
            await indexService['analyze']();

            // Get statistics
            const stats = await indexService.getIndexStats();
            const indexStats = stats.find(s => s.indexName === 'test_value_idx');

            expect(indexStats).toBeDefined();
            expect(typeof indexStats?.usageCount).toBe('number');
            expect(typeof indexStats?.avgTime).toBe('number');
        });

        test('should handle missing statistics', async () => {
            // Drop all indexes and statistics
            await indexService.dropIndexes();
            db.prepare('DELETE FROM sqlite_stat1').run();

            const stats = await indexService.getIndexStats();
            expect(Array.isArray(stats)).toBe(true);
        });
    });

    describe('Performance Tests', () => {
        test('should handle concurrent index operations', async () => {
            const operations = [];
            for (let i = 0; i < 10; i++) {
                operations.push(
                    indexService['createIndex'](
                        'test_table',
                        `value`,
                        `test_value_idx_${i}`
                    )
                );
            }

            await Promise.all(operations);
            const indexes = await indexService.getIndexInfo();
            expect(indexes.length).toBeGreaterThanOrEqual(10);
        });

        test('should handle large datasets', async () => {
            // Insert more test data
            const insert = db.prepare(`
                INSERT INTO test_table (id, value, number, created_at)
                VALUES (?, ?, ?, ?)
            `);

            for (let i = 0; i < 1000; i++) {
                insert.run(
                    `large_id_${i}`,
                    `large_value_${i % 20}`,
                    i,
                    Date.now() - i * 1000
                );
            }

            // Create and rebuild indexes
            const startTime = Date.now();
            await indexService.rebuildIndexes();
            const endTime = Date.now();

            // Should complete within reasonable time
            expect(endTime - startTime).toBeLessThan(5000);
        });
    });
});