import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TaskStatus, Task } from '../../models/types.js';
import { SQLiteTaskRepository } from '../../repositories/TaskRepository.js';
import Database from 'better-sqlite3';
import { unlink } from 'fs/promises';
import { schema } from '../../database/schema.js';

describe('TaskRepository', () => {
    const TEST_DB_PATH = ':memory:';
    let db: Database.Database;
    let taskRepo: SQLiteTaskRepository;

    beforeAll(async () => {
        // Setup in-memory database
        db = new Database(TEST_DB_PATH);
        
        // Create tables
        for (const createStatement of schema) {
            db.exec(createStatement);
        }

        taskRepo = new SQLiteTaskRepository(db);
    });

    afterAll(async () => {
        db.close();
    });

    beforeEach(() => {
        // Clear tables before each test
        db.exec('DELETE FROM tasks');
    });

    describe('create', () => {
        test('should create a new task with required fields', async () => {
            const taskData = {
                title: 'Test Task',
                priority: 1,
                complexity: 2,
                status: TaskStatus.CREATED,
            };

            const task = await taskRepo.create(taskData);

            expect(task).toBeDefined();
            expect(task.id).toBeDefined();
            expect(task.title).toBe(taskData.title);
            expect(task.priority).toBe(taskData.priority);
            expect(task.complexity).toBe(taskData.complexity);
            expect(task.status).toBe(taskData.status);
            expect(task.created_at).toBeDefined();
            expect(task.updated_at).toBeDefined();
        });

        test('should create a task with optional description', async () => {
            const taskData = {
                title: 'Test Task with Description',
                description: 'This is a test task',
                priority: 1,
                complexity: 2,
                status: TaskStatus.CREATED,
            };

            const task = await taskRepo.create(taskData);

            expect(task).toBeDefined();
            expect(task.description).toBe(taskData.description);
        });
    });

    describe('findById', () => {
        test('should return null for non-existent task', async () => {
            const result = await taskRepo.findById('non-existent-id');
            expect(result).toBeNull();
        });

        test('should find task by id', async () => {
            const taskData = {
                title: 'Test Task',
                priority: 1,
                complexity: 2,
                status: TaskStatus.CREATED,
            };

            const created = await taskRepo.create(taskData);
            const found = await taskRepo.findById(created.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(created.id);
        });
    });

    describe('update', () => {
        test('should update task fields', async () => {
            const taskData = {
                title: 'Original Title',
                priority: 1,
                complexity: 2,
                status: TaskStatus.CREATED,
            };

            const created = await taskRepo.create(taskData);
            const updated = await taskRepo.update(created.id, {
                title: 'Updated Title',
                status: TaskStatus.IN_PROGRESS,
            });

            expect(updated.title).toBe('Updated Title');
            expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
            expect(updated.priority).toBe(created.priority);
            expect(updated.complexity).toBe(created.complexity);
        });
    });

    describe('delete', () => {
        test('should delete task', async () => {
            const taskData = {
                title: 'Task to Delete',
                priority: 1,
                complexity: 2,
                status: TaskStatus.CREATED,
            };

            const created = await taskRepo.create(taskData);
            await taskRepo.delete(created.id);
            const found = await taskRepo.findById(created.id);

            expect(found).toBeNull();
        });
    });

    describe('findAll', () => {
        test('should return all tasks', async () => {
            const tasksData = [
                {
                    title: 'Task 1',
                    priority: 1,
                    complexity: 1,
                    status: TaskStatus.CREATED,
                },
                {
                    title: 'Task 2',
                    priority: 2,
                    complexity: 2,
                    status: TaskStatus.IN_PROGRESS,
                },
            ];

            await Promise.all(tasksData.map(data => taskRepo.create(data)));
            const tasks = await taskRepo.findAll();

            expect(tasks.length).toBe(2);
        });

        test('should filter tasks by status', async () => {
            const tasksData = [
                {
                    title: 'Task 1',
                    priority: 1,
                    complexity: 1,
                    status: TaskStatus.CREATED,
                },
                {
                    title: 'Task 2',
                    priority: 2,
                    complexity: 2,
                    status: TaskStatus.IN_PROGRESS,
                },
            ];

            await Promise.all(tasksData.map(data => taskRepo.create(data)));
            const tasks = await taskRepo.findAll({ status: TaskStatus.CREATED });

            expect(tasks.length).toBe(1);
            expect(tasks[0].status).toBe(TaskStatus.CREATED);
        });
    });
});