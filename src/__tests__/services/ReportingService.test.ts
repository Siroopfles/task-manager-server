import { describe, expect, test, beforeEach } from '@jest/globals';
import { ReportingService } from '../../services/ReportingService.js';
import { MockImplementationRepository } from '../mocks/MockImplementationRepository.js';
import { MachineLearningService } from '../../services/MachineLearningService.js';
import { Implementation, Task, CodeLocation, TaskStatus } from '../../models/types.js';

// Mock data
const mockTasks: Task[] = [
    {
        id: '1',
        title: 'Easy Task',
        description: 'Simple task',
        priority: 1,
        complexity: 1,
        status: TaskStatus.COMPLETED,
        created_at: Date.now() - 1000000,
        updated_at: Date.now() - 900000
    },
    {
        id: '2',
        title: 'Medium Task',
        description: 'Medium complexity task',
        priority: 2,
        complexity: 3,
        status: TaskStatus.COMPLETED,
        created_at: Date.now() - 800000,
        updated_at: Date.now() - 600000
    },
    {
        id: '3',
        title: 'Hard Task',
        description: 'Complex task',
        priority: 3,
        complexity: 5,
        status: TaskStatus.IN_PROGRESS,
        created_at: Date.now() - 500000,
        updated_at: Date.now()
    }
];

const mockImplementations: Implementation[] = [
    {
        id: '1',
        task_id: '1',
        pattern_type: 'simple-fix',
        pattern_data: 'Simple bug fix implementation',
        success_rating: 0.9,
        created_at: Date.now() - 950000
    },
    {
        id: '2',
        task_id: '2',
        pattern_type: 'refactoring',
        pattern_data: 'Complex refactoring with dependencies',
        success_rating: 0.7,
        created_at: Date.now() - 700000
    },
    {
        id: '3',
        task_id: '2',
        pattern_type: 'refactoring',
        pattern_data: 'Another refactoring step',
        success_rating: 0.8,
        created_at: Date.now() - 650000
    },
    {
        id: '4',
        task_id: '3',
        pattern_type: 'feature',
        pattern_data: 'Complex feature implementation',
        success_rating: 0.6,
        created_at: Date.now() - 400000
    }
];

const mockCodeLocations: CodeLocation[] = [
    {
        id: '1',
        task_id: '1',
        file_path: 'src/simple.ts',
        start_line: 1,
        end_line: 10,
        git_branch: 'task/1',
        created_at: Date.now() - 950000
    },
    {
        id: '2',
        task_id: '2',
        file_path: 'src/complex.ts',
        start_line: 1,
        end_line: 50,
        git_branch: 'task/2',
        created_at: Date.now() - 700000
    }
];

// Mock repositories
class MockTaskRepository {
    private tasks: Task[] = [];

    async findAll(): Promise<Task[]> {
        return this.tasks;
    }

    setTasks(tasks: Task[]): void {
        this.tasks = [...tasks];
    }
}

class MockCodeLocationRepository {
    private locations: CodeLocation[] = [];

    async findByTaskId(taskId: string): Promise<CodeLocation[]> {
        return this.locations.filter(loc => loc.task_id === taskId);
    }

    setLocations(locations: CodeLocation[]): void {
        this.locations = [...locations];
    }
}

describe('ReportingService', () => {
    let reportingService: ReportingService;
    let taskRepo: MockTaskRepository;
    let implRepo: MockImplementationRepository;
    let codeLocRepo: MockCodeLocationRepository;
    let mlService: MachineLearningService;

    beforeEach(() => {
        taskRepo = new MockTaskRepository();
        implRepo = new MockImplementationRepository();
        codeLocRepo = new MockCodeLocationRepository();
        mlService = new MachineLearningService(implRepo);

        taskRepo.setTasks(mockTasks);
        implRepo.setImplementations(mockImplementations);
        codeLocRepo.setLocations(mockCodeLocations);

        reportingService = new ReportingService(
            taskRepo as any,
            implRepo,
            codeLocRepo as any,
            mlService
        );
    });

    describe('generateSuccessRateReport', () => {
        test('should calculate overall success rate', async () => {
            const report = await reportingService.generateSuccessRateReport();
            
            expect(report.overallSuccessRate).toBeGreaterThan(0);
            expect(report.overallSuccessRate).toBeLessThanOrEqual(1);
            expect(report.patternSuccessRates.size).toBeGreaterThan(0);
            expect(report.trendByMonth.length).toBeGreaterThan(0);
        });

        test('should filter by timeframe', async () => {
            const timeframe = {
                startDate: Date.now() - 800000,
                endDate: Date.now()
            };

            const report = await reportingService.generateSuccessRateReport(timeframe);
            expect(report.trendByMonth.length).toBeLessThan(mockImplementations.length);
        });
    });

    describe('generatePatternReport', () => {
        test('should identify top patterns', async () => {
            const report = await reportingService.generatePatternReport();
            
            expect(report.topPatterns.length).toBeGreaterThan(0);
            expect(report.topPatterns[0].pattern).toBe('refactoring');
            expect(report.topPatterns[0].frequency).toBe(2);
        });

        test('should identify risk factors', async () => {
            const report = await reportingService.generatePatternReport();
            
            const refactoringRisks = report.riskFactors.find(r => r.pattern === 'refactoring');
            expect(refactoringRisks).toBeDefined();
            expect(refactoringRisks?.risks).toContain('Dependency management');
        });
    });

    describe('generateTaskMetricsReport', () => {
        test('should calculate task completion metrics', async () => {
            const report = await reportingService.generateTaskMetricsReport();
            
            expect(report.completedTasks).toBe(2);
            expect(report.averageCompletionTime).toBeGreaterThan(0);
            expect(report.complexityDistribution.size).toBeGreaterThan(0);
        });

        test('should analyze complexity impact', async () => {
            const report = await reportingService.generateTaskMetricsReport();
            
            expect(report.successRateByComplexity.size).toBeGreaterThan(0);
            expect(report.patternUsageByComplexity.size).toBeGreaterThan(0);
        });
    });

    describe('generatePerformanceReport', () => {
        test('should calculate pattern efficiency', async () => {
            const report = await reportingService.generatePerformanceReport();
            
            expect(report.averageImplementationTime).toBeGreaterThan(0);
            expect(report.patternEfficiency.length).toBeGreaterThan(0);
            expect(report.complexityImpact.length).toBeGreaterThan(0);
        });

        test('should rank patterns by efficiency', async () => {
            const report = await reportingService.generatePerformanceReport();
            
            const efficiencies = report.patternEfficiency.map(p => p.efficiency);
            const isSorted = efficiencies.every((v, i, arr) => i === 0 || v <= arr[i - 1]);
            expect(isSorted).toBe(true);
        });
    });
});