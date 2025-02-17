import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { CodeLocation } from '../../models/types.js';
import { SQLiteCodeLocationRepository } from '../../repositories/CodeLocationRepository.js';
import Database from 'better-sqlite3';
import { schema } from '../../database/schema.js';
import { v4 as uuidv4 } from 'uuid';

describe('CodeLocationRepository', () => {
    const TEST_DB_PATH = ':memory:';
    let db: Database.Database;
    let codeLocationRepo: SQLiteCodeLocationRepository;
    let testTaskId: string;

    beforeAll(async () => {
        // Setup in-memory database
        db = new Database(TEST_DB_PATH);
        
        // Create tables
        for (const createStatement of schema) {
            db.exec(createStatement);
        }

        codeLocationRepo = new SQLiteCodeLocationRepository(db);

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
        // Clear code_locations table before each test
        db.exec('DELETE FROM code_locations');
    });

    describe('create', () => {
        test('should create a new code location', async () => {
            const locationData = {
                task_id: testTaskId,
                file_path: 'src/test.ts',
                start_line: 1,
                end_line: 10,
                git_branch: 'feature/test',
                git_commit: 'abc123'
            };

            const location = await codeLocationRepo.create(locationData);

            expect(location).toBeDefined();
            expect(location.id).toBeDefined();
            expect(location.task_id).toBe(locationData.task_id);
            expect(location.file_path).toBe(locationData.file_path);
            expect(location.start_line).toBe(locationData.start_line);
            expect(location.end_line).toBe(locationData.end_line);
            expect(location.git_branch).toBe(locationData.git_branch);
            expect(location.git_commit).toBe(locationData.git_commit);
            expect(location.created_at).toBeDefined();
        });

        test('should create a code location without optional fields', async () => {
            const locationData = {
                task_id: testTaskId,
                file_path: 'src/test.ts',
                start_line: 1
            };

            const location = await codeLocationRepo.create(locationData);

            expect(location).toBeDefined();
            expect(location.end_line).toBeUndefined();
            expect(location.git_branch).toBeUndefined();
            // Either null or undefined is acceptable for optional fields
            expect([null, undefined]).toContain(location.git_commit);
        });
    });

    describe('findByTaskId', () => {
        test('should return empty array for task with no locations', async () => {
            const locations = await codeLocationRepo.findByTaskId(uuidv4());
            expect(locations).toEqual([]);
        });

        test('should find all locations for a task', async () => {
            const locationData1 = {
                task_id: testTaskId,
                file_path: 'src/test1.ts',
                start_line: 1
            };

            const locationData2 = {
                task_id: testTaskId,
                file_path: 'src/test2.ts',
                start_line: 1
            };

            await Promise.all([
                codeLocationRepo.create(locationData1),
                codeLocationRepo.create(locationData2)
            ]);

            const locations = await codeLocationRepo.findByTaskId(testTaskId);
            expect(locations.length).toBe(2);
            expect(locations.map(l => l.file_path).sort()).toEqual(['src/test1.ts', 'src/test2.ts'].sort());
        });
    });

    describe('update', () => {
        test('should update code location fields', async () => {
            const locationData = {
                task_id: testTaskId,
                file_path: 'src/test.ts',
                start_line: 1
            };

            const created = await codeLocationRepo.create(locationData);
            const updated = await codeLocationRepo.update(created.id, {
                file_path: 'src/updated.ts',
                end_line: 20,
                git_commit: 'def456'
            });

            expect(updated.file_path).toBe('src/updated.ts');
            expect(updated.end_line).toBe(20);
            expect(updated.git_commit).toBe('def456');
            expect(updated.task_id).toBe(created.task_id);
            expect(updated.start_line).toBe(created.start_line);
        });
    });

    describe('delete', () => {
        test('should delete code location', async () => {
            const locationData = {
                task_id: testTaskId,
                file_path: 'src/test.ts',
                start_line: 1
            };

            const created = await codeLocationRepo.create(locationData);
            await codeLocationRepo.delete(created.id);

            const locations = await codeLocationRepo.findByTaskId(testTaskId);
            expect(locations.length).toBe(0);
        });
    });
});