import { PatternAnalysisService } from '../../services/PatternAnalysisService.js';
import { SQLiteImplementationRepository } from '../../repositories/ImplementationRepository.js';
import { SQLiteTaskRepository } from '../../repositories/TaskRepository.js';
import { Database as BetterSqlite3Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getTestDatabase } from '../../database/testDatabase.js';
import { TaskStatus } from '../../models/types.js';

describe('PatternAnalysisService', () => {
    let db: BetterSqlite3Database;
    let implRepo: SQLiteImplementationRepository;
    let taskRepo: SQLiteTaskRepository;
    let patternService: PatternAnalysisService;

    beforeAll(() => {
        db = getTestDatabase();
        implRepo = new SQLiteImplementationRepository(db);
        taskRepo = new SQLiteTaskRepository(db);
        patternService = new PatternAnalysisService(implRepo);
    });

    beforeEach(() => {
        // Clear tables before each test (order matters due to foreign keys)
        db.exec('DELETE FROM implementations');
        db.exec('DELETE FROM code_locations');
        db.exec('DELETE FROM tasks');
    });

    describe('analyzeTaskPatterns', () => {
        test('should analyze patterns for a task', async () => {
            // Create a task first
            const task = await taskRepo.create({
                title: 'Test Task',
                description: null,
                priority: 1,
                complexity: 1,
                status: TaskStatus.IN_PROGRESS
            });

            // Add two implementations for the task
            await implRepo.create({
                task_id: task.id,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-method' }),
                success_rating: 0.9
            });

            await implRepo.create({
                task_id: task.id,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'rename-variable' }),
                success_rating: 0.8
            });

            const patterns = await patternService.analyzeTaskPatterns(task.id);

            expect(patterns).toHaveLength(1); // One pattern type (refactoring)
            const pattern = patterns[0];
            expect(pattern.patternType).toBe('refactoring');
            expect(pattern.successRate).toBeCloseTo(0.85, 5); // Average of 0.9 and 0.8
            expect(pattern.frequency).toBe(2);
            expect(pattern.recommendations).toEqual(expect.arrayContaining([
                expect.stringContaining('refactoring'),
                'Consider writing tests before refactoring'
            ]));
        });

        test('should handle task with no implementations', async () => {
            const patterns = await patternService.analyzeTaskPatterns(uuidv4());
            expect(patterns).toHaveLength(0);
        });
    });

    describe('analyzeAllPatterns', () => {
        test('should analyze patterns across all tasks', async () => {
            // Create tasks first
            const task1 = await taskRepo.create({
                title: 'Task 1',
                description: null,
                priority: 1,
                complexity: 1,
                status: TaskStatus.IN_PROGRESS
            });

            const task2 = await taskRepo.create({
                title: 'Task 2',
                description: null,
                priority: 1,
                complexity: 1,
                status: TaskStatus.IN_PROGRESS
            });

            // Add implementations for different tasks
            await implRepo.create({
                task_id: task1.id,
                pattern_type: 'bug-fix',
                pattern_data: JSON.stringify({ type: 'null-check' }),
                success_rating: 0.7
            });

            await implRepo.create({
                task_id: task2.id,
                pattern_type: 'bug-fix',
                pattern_data: JSON.stringify({ type: 'boundary-check' }),
                success_rating: 0.9
            });

            await implRepo.create({
                task_id: task2.id,
                pattern_type: 'feature',
                pattern_data: JSON.stringify({ type: 'new-endpoint' }),
                success_rating: 0.95
            });

            const patterns = await patternService.analyzeAllPatterns();

            expect(patterns.size).toBe(2); // bug-fix and feature

            const bugFixPattern = patterns.get('bug-fix');
            expect(bugFixPattern).toBeDefined();
            expect(bugFixPattern?.successRate).toBe(0.8); // Average of 0.7 and 0.9
            expect(bugFixPattern?.frequency).toBe(2);

            const featurePattern = patterns.get('feature');
            expect(featurePattern).toBeDefined();
            expect(featurePattern?.successRate).toBe(0.95);
            expect(featurePattern?.frequency).toBe(1);
        });
    });

    describe('getRecommendations', () => {
        test('should provide recommendations based on patterns', async () => {
            // Create tasks first
            const task1 = await taskRepo.create({
                title: 'Task 1',
                description: null,
                priority: 1,
                complexity: 1,
                status: TaskStatus.IN_PROGRESS
            });

            const task2 = await taskRepo.create({
                title: 'Task 2',
                description: null,
                priority: 1,
                complexity: 1,
                status: TaskStatus.IN_PROGRESS
            });

            // Add a low success rate implementation
            await implRepo.create({
                task_id: task1.id,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-method' }),
                success_rating: 0.4
            });

            // Add a high success rate implementation of the same type for another task
            await implRepo.create({
                task_id: task2.id,
                pattern_type: 'refactoring',
                pattern_data: JSON.stringify({ type: 'extract-class' }),
                success_rating: 0.9
            });

            const recommendations = await patternService.getRecommendations(task1.id);

            expect(recommendations).toEqual(expect.arrayContaining([
                expect.stringContaining('Consider alternative approaches'),
                expect.stringContaining('global success rate is 0.65'),
                'Consider writing tests before refactoring'
            ]));
        });

        test('should handle task with no implementations', async () => {
            const recommendations = await patternService.getRecommendations(uuidv4());
            expect(recommendations).toHaveLength(0);
        });
    });
});