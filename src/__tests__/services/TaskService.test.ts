import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TaskService } from '../../services/TaskService.js';
import { Task, TaskStatus } from '../../models/types.js';
import Database from 'better-sqlite3';
import { schema } from '../../database/schema.js';
import { simpleGit, SimpleGit } from 'simple-git';
import { join } from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

describe('TaskService', () => {
    let db: Database.Database;
    let taskService: TaskService;
    let tmpDir: string;
    let git: SimpleGit;
    let mainBranch: string;

    beforeAll(async () => {
        // Create temporary directory for Git operations
        tmpDir = await mkdtemp(join(tmpdir(), 'task-service-test-'));
        
        // Initialize test database
        db = new Database(':memory:');
        for (const createStatement of schema) {
            db.exec(createStatement);
        }

        // Initialize Git repository
        git = simpleGit(tmpDir);
        await git.init();
        await git.addConfig('user.name', 'Test User');
        await git.addConfig('user.email', 'test@example.com');
        
        // Create a test file and initial commit
        const testFile = join(tmpDir, 'test.txt');
        await writeFile(testFile, 'Initial content');
        await git.add(testFile);
        await git.commit('Initial commit');

        // Store the main branch name
        mainBranch = (await git.branch()).current;

        // Initialize TaskService with test dependencies
        taskService = new TaskService(db, tmpDir);
    });

    afterAll(async () => {
        db.close();
        // Clean up temporary directory
        await rm(tmpDir, { recursive: true, force: true });
    });

    beforeEach(async () => {
        // Clear all tables before each test (order matters due to foreign keys)
        db.exec('DELETE FROM implementations');
        db.exec('DELETE FROM code_locations');
        db.exec('DELETE FROM tasks');

        // Reset Git to initial state
        try {
            // First checkout main branch
            await git.checkout(mainBranch);
            
            // Force delete any non-main branches
            const branches = await git.branch();
            await Promise.all(branches.all
                .filter(branch => branch !== mainBranch)
                .map(branch => git.deleteLocalBranch(branch, true))
            );

            // Reset to initial commit
            await git.add('.');
            await git.reset(['--hard', mainBranch]);
            await git.clean(['--force', '-d']);
        } catch (error) {
            console.error('Error resetting Git state:', error);
        }
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
            expect(task.status).toBe(TaskStatus.CREATED);

            // Verify Git branch was created
            const branches = await git.branch();
            expect(branches.all).toContain(`task/${task.id}`);
            expect(branches.current).toBe(`task/${task.id}`);
        });

        test('should create task with initial code location', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2,
                initialCodeLocation: {
                    filePath: 'test.txt',
                    startLine: 1,
                    endLine: 10
                }
            });

            const details = await taskService.getTaskWithDetails(task.id);
            expect(details.codeLocations).toHaveLength(1);
            expect(details.codeLocations[0].file_path).toBe('test.txt');
            expect(details.codeLocations[0].git_branch).toBe(`task/${task.id}`);
        });
    });

    describe('addCodeLocation', () => {
        test('should add code location to task', async () => {
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
            expect(location.file_path).toBe('test.txt');
            expect(location.git_branch).toBe(`task/${task.id}`);
            expect(location.git_commit).toBeDefined();
        });

        test('should fail if not on task branch', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2
            });

            // Switch back to main branch
            await git.checkout(mainBranch);

            await expect(taskService.addCodeLocation(task.id, {
                filePath: 'test.txt',
                startLine: 1
            })).rejects.toThrow('Must be on task branch');
        });
    });

    describe('recordImplementation', () => {
        test('should record implementation pattern', async () => {
            const task = await taskService.createTask({
                title: 'Test Task',
                priority: 1,
                complexity: 2
            });

            const impl = await taskService.recordImplementation(task.id, 
                'refactoring',
                JSON.stringify({ type: 'extract-method' }),
                0.95
            );

            expect(impl).toBeDefined();
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

            // Switch to task branch and make changes
            await git.checkout(`task/${task.id}`);
            await writeFile(join(tmpDir, 'test.txt'), 'Updated content');
            await git.add('test.txt');
            await git.commit('Update test file');

            // Switch back to main branch before completing
            await git.checkout(mainBranch);
            await taskService.completeTask(task.id);

            const details = await taskService.getTaskWithDetails(task.id);
            expect(details.task.status).toBe(TaskStatus.COMPLETED);

            // Verify branch was merged and deleted
            const branches = await git.branch();
            expect(branches.all).not.toContain(`task/${task.id}`);
        });

        test('should fail if task not found', async () => {
            await expect(taskService.completeTask('non-existent-id'))
                .rejects.toThrow('Task with id non-existent-id not found');
        });
    });
});