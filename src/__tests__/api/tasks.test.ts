import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { TaskStatus } from '../../models/types.js';
import { createTestApp } from './setup.js';
import { Express } from 'express';
import { TaskService } from '../../services/TaskService.js';
import { MockGitService } from '../../services/GitService.js';
import Database from 'better-sqlite3';

describe('Tasks API', () => {
    let app: Express;
    let db: Database.Database;
    let taskService: TaskService;
    let gitService: MockGitService;
    let testTaskId: string;

    beforeAll(async () => {
        const testSetup = createTestApp();
        app = testSetup.app;
        db = testSetup.db;
        taskService = testSetup.taskService;
        gitService = testSetup.gitService;
    });

    afterAll(async () => {
        db.close();
    });

    beforeEach(async () => {
        // Clear tables in correct order due to foreign key constraints
        db.exec('DELETE FROM implementations');
        db.exec('DELETE FROM code_locations');
        db.exec('DELETE FROM tasks');
        
        // Create a test task for use in individual tests
        const testTask = await taskService.createTask({
            title: 'Test Task',
            description: 'Test Description',
            priority: 1,
            complexity: 2
        });
        testTaskId = testTask.id;
    });

    describe('POST /', () => {
        it('should create a new task', async () => {
            const response = await request(app)
                .post('/api/tasks')
                .send({
                    title: 'New Task',
                    description: 'Task Description',
                    priority: 3,
                    complexity: 4,
                    initialCodeLocation: {
                        filePath: 'src/test.ts',
                        startLine: 1,
                        endLine: 10
                    }
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.title).toBe('New Task');
            expect(response.body.status).toBe(TaskStatus.CREATED);
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/tasks')
                .send({
                    description: 'Missing required fields'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /', () => {
        it('should list all tasks', async () => {
            const response = await request(app).get('/api/tasks');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });

        it('should filter tasks by status', async () => {
            const response = await request(app)
                .get('/api/tasks')
                .query({ status: 'CREATED' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.every((task: any) => task.status === TaskStatus.CREATED)).toBe(true);
        });
    });

    describe('GET /:id', () => {
        it('should get task by ID with details', async () => {
            const response = await request(app).get(`/api/tasks/${testTaskId}`);

            expect(response.status).toBe(200);
            expect(response.body.task.id).toBe(testTaskId);
            expect(response.body).toHaveProperty('codeLocations');
            expect(response.body).toHaveProperty('implementations');
        });

        it('should return 404 for non-existent task', async () => {
            const response = await request(app).get(`/api/tasks/${uuidv4()}`);
            expect(response.status).toBe(404);
        });
    });

    describe('POST /:id/locations', () => {
        it('should add code location to task', async () => {
            // First ensure we're on the right branch
            await gitService.createBranch(testTaskId);
            
            const response = await request(app)
                .post(`/api/tasks/${testTaskId}/locations`)
                .send({
                    filePath: 'src/example.ts',
                    startLine: 1,
                    endLine: 5
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.file_path).toBe('src/example.ts');
            expect(response.body.task_id).toBe(testTaskId);
        });

        it('should validate code location data', async () => {
            const response = await request(app)
                .post(`/api/tasks/${testTaskId}/locations`)
                .send({
                    startLine: 1
                });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /:id/implementations', () => {
        it('should record implementation for task', async () => {
            const response = await request(app)
                .post(`/api/tasks/${testTaskId}/implementations`)
                .send({
                    patternType: 'refactoring',
                    patternData: 'Extract method pattern applied',
                    successRating: 0.95
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.pattern_type).toBe('refactoring');
            expect(response.body.task_id).toBe(testTaskId);
        });

        it('should validate implementation data', async () => {
            const response = await request(app)
                .post(`/api/tasks/${testTaskId}/implementations`)
                .send({
                    successRating: 0.5
                });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /:id/complete', () => {
        it('should complete a task', async () => {
            // Create a branch to complete
            await gitService.createBranch(testTaskId);
            
            const response = await request(app)
                .post(`/api/tasks/${testTaskId}/complete`);

            expect(response.status).toBe(200);
            
            // Verify task status is updated
            const verifyResponse = await request(app).get(`/api/tasks/${testTaskId}`);
            expect(verifyResponse.body.task.status).toBe(TaskStatus.COMPLETED);
        });

        it('should return 404 for non-existent task', async () => {
            const response = await request(app)
                .post(`/api/tasks/${uuidv4()}/complete`);

            expect(response.status).toBe(404);
        });
    });

    describe('End-to-End Task Lifecycle', () => {
        it('should handle a complete task lifecycle', async () => {
            // 1. Create a new task
            const createResponse = await request(app)
                .post('/api/tasks')
                .send({
                    title: 'E2E Test Task',
                    description: 'Testing complete task lifecycle',
                    priority: 2,
                    complexity: 3,
                    initialCodeLocation: {
                        filePath: 'src/feature.ts',
                        startLine: 10,
                        endLine: 20
                    }
                });

            expect(createResponse.status).toBe(201);
            const taskId = createResponse.body.id;

            // 2. Verify task was created with initial code location
            const verifyCreateResponse = await request(app).get(`/api/tasks/${taskId}`);
            expect(verifyCreateResponse.status).toBe(200);
            expect(verifyCreateResponse.body.codeLocations.length).toBe(1);
            expect(verifyCreateResponse.body.codeLocations[0].file_path).toBe('src/feature.ts');

            // 3. Add additional code location
            await gitService.createBranch(taskId); // Ensure we're on the right branch
            const addLocationResponse = await request(app)
                .post(`/api/tasks/${taskId}/locations`)
                .send({
                    filePath: 'src/utils.ts',
                    startLine: 5,
                    endLine: 15
                });

            expect(addLocationResponse.status).toBe(201);

            // 4. Record implementation pattern
            const implResponse = await request(app)
                .post(`/api/tasks/${taskId}/implementations`)
                .send({
                    patternType: 'refactor',
                    patternData: 'Extracted utility function',
                    successRating: 0.9
                });

            expect(implResponse.status).toBe(201);

            // 5. Verify all data is present
            const finalCheckResponse = await request(app).get(`/api/tasks/${taskId}`);
            expect(finalCheckResponse.status).toBe(200);
            expect(finalCheckResponse.body.codeLocations.length).toBe(2);
            expect(finalCheckResponse.body.implementations.length).toBe(1);

            // 6. Complete the task
            const completeResponse = await request(app)
                .post(`/api/tasks/${taskId}/complete`);

            expect(completeResponse.status).toBe(200);

            // 7. Verify final state
            const finalResponse = await request(app).get(`/api/tasks/${taskId}`);
            expect(finalResponse.body.task.status).toBe(TaskStatus.COMPLETED);
        });
    });
});