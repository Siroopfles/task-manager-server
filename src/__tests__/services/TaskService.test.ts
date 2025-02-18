import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TaskService } from '../../services/TaskService.js';
import { NotFoundError, TaskStatus, GitError } from '../../models/types.js';
import Database from 'better-sqlite3';
import { schema } from '../../database/schema.js';
import { MockGitService } from '../../services/GitService.js';

describe('TaskService', () => {
    let db: Database.Database;
    let taskService: TaskService;
    let gitService: MockGitService;

    beforeAll(async () => {
        db = new Database(':memory:');
        for (const statement of schema) {
            db.exec(statement);
        }
        gitService = new MockGitService();
        taskService = new TaskService(db, gitService);
    });

    afterAll(async () => {
        db.close();
    });

    beforeEach(async () => {
        // Clear tables in correct order for foreign key constraints
        db.exec('DELETE FROM implementations');
        db.exec('DELETE FROM code_locations');
        db.exec('DELETE FROM tasks');
    });

    describe('createTask', () => {
        test('should create task with Git branch', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                description: 'Test Description',
                priority: 1,
                complexity: 2
            });

            expect(task).toBeDefined();
            expect(task.id).toBeDefined();
            expect(task.title).toBe('Test Task');

            // Verify Git branch was created
            const currentBranch = await gitService.getCurrentBranch();
            expect(currentBranch).toBe(`task/${task.id}`);
        });

        test('should create task with initial code location', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                description: 'Test Description',
                priority: 1,
                complexity: 2,
                initialCodeLocation: {
                    filePath: 'src/test.ts',
                    startLine: 1,
                    endLine: 10
                }
            });

            const details = await taskService.getTaskWithDetails(task.id);
            expect(details.codeLocations.length).toBe(1);
            expect(details.codeLocations[0].file_path).toBe('src/test.ts');
            expect(details.codeLocations[0].git_branch).toBe(`task/${task.id}`);
        });
    });

    describe('addCodeLocation', () => {
        test('should add code location to task', async () => {
            // Create a task first
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2
            });

            const location = await taskService.addCodeLocation(task.id, {
                filePath: 'test.txt',
                startLine: 1,
                endLine: 10
            });

            expect(location).toBeDefined();
            expect(location.task_id).toBe(task.id);
            expect(location.file_path).toBe('test.txt');
            expect(location.git_branch).toBe(`task/${task.id}`);
        });

        test('should fail if not on task branch', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2
            });

            // Switch to wrong branch
            await gitService.cleanupBranch(`task/${task.id}`);

            await expect(taskService.addCodeLocation(task.id, {
                filePath: 'test.txt',
                startLine: 1
            })).rejects.toThrow(GitError);
        });
    });

    describe('recordImplementation', () => {
        test('should record implementation pattern', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2
            });

            const impl = await taskService.recordImplementation(
                task.id,
                'refactoring',
                'Extracted method',
                0.95
            );

            expect(impl).toBeDefined();
            expect(impl.task_id).toBe(task.id);
            expect(impl.pattern_type).toBe('refactoring');
            expect(impl.success_rating).toBe(0.95);
        });
    });

    describe('completeTask', () => {
        test('should complete task and merge branch', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2
            });

            await taskService.completeTask(task.id);

            const updatedTask = await taskService.getTaskWithDetails(task.id);
            expect(updatedTask.task.status).toBe(TaskStatus.COMPLETED);

            // Verify branch was cleaned up
            const currentBranch = await gitService.getCurrentBranch();
            expect(currentBranch).toBe('master');
        });

        test('should fail if task not found', async () => {
            await expect(taskService.completeTask('non-existent-id')).rejects.toThrow(NotFoundError);
        });
    });
});