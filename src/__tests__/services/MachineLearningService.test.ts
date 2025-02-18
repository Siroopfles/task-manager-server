import { describe, expect, test, beforeEach } from '@jest/globals';
import { MachineLearningService } from '../../services/MachineLearningService.js';
import { MockImplementationRepository } from '../mocks/MockImplementationRepository.js';
import { Implementation, Task, CodeLocation, TaskStatus } from '../../models/types.js';

// Test data
const mockTask: Task = {
    id: '123',
    title: 'Test Task',
    description: 'Test Description',
    priority: 3,
    complexity: 4,
    status: TaskStatus.IN_PROGRESS,
    created_at: Date.now(),
    updated_at: Date.now()
};

const mockCodeLocations: CodeLocation[] = [
    {
        id: '456',
        task_id: '123',
        file_path: 'src/test.ts',
        start_line: 1,
        end_line: 10,
        git_branch: 'test-branch',
        created_at: Date.now()
    }
];

const mockImplementations: Implementation[] = [
    {
        id: '789',
        task_id: '123',
        pattern_type: 'refactoring',
        pattern_data: 'Complex refactoring with dependency changes',
        success_rating: 0.8,
        created_at: Date.now() - 1000000
    },
    {
        id: '790',
        task_id: '124',
        pattern_type: 'bug-fix',
        pattern_data: 'Simple bug fix',
        success_rating: 0.9,
        created_at: Date.now() - 500000
    },
    {
        id: '791',
        task_id: '125',
        pattern_type: 'refactoring',
        pattern_data: 'Another complex refactoring',
        success_rating: 0.7,
        created_at: Date.now()
    }
];

describe('MachineLearningService', () => {
    let mlService: MachineLearningService;
    let mockRepo: MockImplementationRepository;

    beforeEach(() => {
        mockRepo = new MockImplementationRepository();
        mockRepo.setImplementations(mockImplementations);
        mlService = new MachineLearningService(mockRepo);
    });

    describe('trainModel', () => {
        test('should train the model successfully', async () => {
            await mlService.trainModel();
            const prediction = await mlService.predictSuccess(mockTask, 'refactoring', mockCodeLocations);
            expect(prediction.predictedSuccessRate).toBeDefined();
            expect(prediction.suggestedPatterns).toBeDefined();
        });

        test('should extract unique pattern types', async () => {
            await mlService.trainModel();
            const uniquePatterns = new Set(mockImplementations.map(impl => impl.pattern_type));
            const clusters = await mlService.analyzePatternClusters();
            const clusterPatterns = new Set(Array.from(clusters.keys()));
            expect(clusterPatterns).toEqual(uniquePatterns);
        });
    });

    describe('predictSuccess', () => {
        test('should predict success rate for a given task and pattern', async () => {
            await mlService.trainModel();
            const prediction = await mlService.predictSuccess(mockTask, 'refactoring', mockCodeLocations);
            
            expect(prediction.predictedSuccessRate).toBeGreaterThanOrEqual(0);
            expect(prediction.predictedSuccessRate).toBeLessThanOrEqual(1);
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(Array.isArray(prediction.suggestedPatterns)).toBe(true);
            expect(Array.isArray(prediction.riskFactors)).toBe(true);
        });

        test('should have high confidence for known patterns', async () => {
            await mlService.trainModel();
            const prediction = await mlService.predictSuccess(mockTask, 'refactoring', mockCodeLocations);
            expect(prediction.confidence).toBeGreaterThan(0.5);
        });

        test('should have low confidence for new patterns', async () => {
            await mlService.trainModel();
            const prediction = await mlService.predictSuccess(mockTask, 'new-pattern', mockCodeLocations);
            expect(prediction.confidence).toBeLessThanOrEqual(0.5);
        });
    });

    describe('analyzePatternClusters', () => {
        test('should identify pattern clusters', async () => {
            await mlService.trainModel();
            const clusters = await mlService.analyzePatternClusters();
            
            expect(clusters).toBeInstanceOf(Map);
            expect(clusters.size).toBeGreaterThan(0);
        });

        test('should group similar patterns together', async () => {
            const similarPattern: Implementation = {
                id: '792',
                task_id: '126',
                pattern_type: 'code-refactoring',
                pattern_data: 'Similar to refactoring',
                success_rating: 0.85,
                created_at: Date.now()
            };

            mockRepo.setImplementations([...mockImplementations, similarPattern]);
            await mlService.trainModel();
            const clusters = await mlService.analyzePatternClusters();
            
            // Find cluster containing 'refactoring'
            let refactoringCluster: string[] | undefined;
            clusters.forEach((patterns) => {
                if (patterns.includes('refactoring')) {
                    refactoringCluster = patterns;
                }
            });

            expect(refactoringCluster).toBeDefined();
            expect(refactoringCluster).toContain('code-refactoring');
        });
    });

    describe('identifyEmergingPatterns', () => {
        test('should identify pattern trends', async () => {
            await mlService.trainModel();
            const trends = await mlService.identifyEmergingPatterns();
            
            expect(Array.isArray(trends)).toBe(true);
            expect(trends.length).toBeGreaterThan(0);
            trends.forEach(trend => {
                expect(trend).toHaveProperty('pattern');
                expect(trend).toHaveProperty('trend');
                expect(trend).toHaveProperty('confidence');
                expect(['rising', 'stable', 'declining']).toContain(trend.trend);
            });
        });

        test('should identify rising patterns', async () => {
            const risingTrend: Implementation[] = [
                {
                    id: '793',
                    task_id: '127',
                    pattern_type: 'optimization',
                    pattern_data: 'Performance optimization',
                    success_rating: 0.5,
                    created_at: Date.now() - 2000000
                },
                {
                    id: '794',
                    task_id: '128',
                    pattern_type: 'optimization',
                    pattern_data: 'Another optimization',
                    success_rating: 0.7,
                    created_at: Date.now() - 1000000
                },
                {
                    id: '795',
                    task_id: '129',
                    pattern_type: 'optimization',
                    pattern_data: 'Final optimization',
                    success_rating: 0.9,
                    created_at: Date.now()
                }
            ];

            mockRepo.setImplementations(risingTrend);
            await mlService.trainModel();
            const trends = await mlService.identifyEmergingPatterns();
            
            const optimizationTrend = trends.find(t => t.pattern === 'optimization');
            expect(optimizationTrend?.trend).toBe('rising');
            expect(optimizationTrend?.confidence).toBeGreaterThan(0.5);
        });

        test('should handle patterns with insufficient data', async () => {
            mockRepo.setImplementations([mockImplementations[0]]);
            await mlService.trainModel();
            const trends = await mlService.identifyEmergingPatterns();
            
            const singlePatternTrend = trends.find(t => t.pattern === 'refactoring');
            expect(singlePatternTrend?.trend).toBe('stable');
            expect(singlePatternTrend?.confidence).toBe(0);
        });
    });
});