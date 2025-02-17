import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Implementation } from '../../models/types.js';
import { SQLiteImplementationRepository } from '../../repositories/ImplementationRepository.js';
import Database from 'better-sqlite3';
import { schema } from '../../database/schema.js';
import { v4 as uuidv4 } from 'uuid';

describe('ImplementationRepository', () => {
    const TEST_DB_PATH = ':memory:';
    let db: Database.Database;
    let implRepo: SQLiteImplementationRepository;
    let testTaskId: string;

    beforeAll(async () => {
        // Setup in-memory database
        db = new Database(TEST_DB_PATH);
        
        // Create tables
        for (const createStatement of schema) {
            db.exec(createStatement);
        }

        implRepo = new SQLiteImplementationRepository(db);

        // Create a task for testing
        testTaskId = uuidv4();
        db.prepare(`
            INSERT INTO tasks (id, title, priority, complexity, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            testTaskId,
            'Test Task',
            1,
            1,
            'created',
            Date.now(),
            Date.now()
        );
    });

    afterAll(async () => {
        db.close();
    });

    beforeEach(() => {
        // Clear implementations table before each test
        db.exec('DELETE FROM implementations');
    });

    describe('create', () => {
        test('should create a new implementation', async () => {
            const implData = {
                task_id: testTaskId,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-method', context: 'test' }),
                success_rating: 0.95
            };

            const implementation = await implRepo.create(implData);

            expect(implementation).toBeDefined();
            expect(implementation.id).toBeDefined();
            expect(implementation.task_id).toBe(implData.task_id);
            expect(implementation.pattern_type).toBe(implData.pattern_type);
            expect(implementation.pattern_data).toBe(implData.pattern_data);
            expect(implementation.success_rating).toBe(implData.success_rating);
            expect(implementation.created_at).toBeDefined();
        });

        test('should create implementation without success rating', async () => {
            const implData = {
                task_id: testTaskId,
                pattern_type: 'bug-fix',
                pattern_data: JSON.stringify({ type: 'null-check', location: 'test' })
            };

            const implementation = await implRepo.create(implData);

            expect(implementation).toBeDefined();
            expect(implementation.success_rating).toBeUndefined();
        });
    });

    describe('findByTaskId', () => {
        test('should return empty array for task with no implementations', async () => {
            const implementations = await implRepo.findByTaskId(uuidv4());
            expect(implementations).toEqual([]);
        });

        test('should find all implementations for a task', async () => {
            const implData1 = {
                task_id: testTaskId,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-method' })
            };

            const implData2 = {
                task_id: testTaskId,
                pattern_type: 'bug-fix',
                pattern_data: JSON.stringify({ type: 'null-check' })
            };

            await Promise.all([
                implRepo.create(implData1),
                implRepo.create(implData2)
            ]);

            const implementations = await implRepo.findByTaskId(testTaskId);
            expect(implementations.length).toBe(2);
            expect(implementations.map(i => i.pattern_type).sort()).toEqual(['bug-fix', 'refactoring'].sort());
        });
    });

    describe('update', () => {
        test('should update implementation fields', async () => {
            const implData = {
                task_id: testTaskId,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-method' })
            };

            const created = await implRepo.create(implData);
            const updated = await implRepo.update(created.id, {
                pattern_type: 'optimization',
                success_rating: 0.85
            });

            expect(updated.pattern_type).toBe('optimization');
            expect(updated.success_rating).toBe(0.85);
            expect(updated.task_id).toBe(created.task_id);
            expect(updated.pattern_data).toBe(created.pattern_data);
        });
    });

    describe('delete', () => {
        test('should delete implementation', async () => {
            const implData = {
                task_id: testTaskId,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-method' })
            };

            const created = await implRepo.create(implData);
            await implRepo.delete(created.id);

            const implementations = await implRepo.findByTaskId(testTaskId);
            expect(implementations.length).toBe(0);
        });
    });
});