import { 
    Implementation, Task, CodeLocation, TaskStatus,
    TaskRepository, CodeLocationRepository, ImplementationRepository 
} from '../models/types.js';
import { SQLiteTaskRepository } from '../repositories/TaskRepository.js';
import { SQLiteImplementationRepository } from '../repositories/ImplementationRepository.js';
import { SQLiteCodeLocationRepository } from '../repositories/CodeLocationRepository.js';
import { MachineLearningService } from './MachineLearningService.js';

interface ReportTimeframe {
    startDate: number;
    endDate: number;
}

export interface SuccessRateReport {
    overallSuccessRate: number;
    patternSuccessRates: Map<string, number>;
    trendByMonth: {
        month: string;
        successRate: number;
        implementationCount: number;
    }[];
}

export interface PatternReport {
    topPatterns: {
        pattern: string;
        frequency: number;
        avgSuccessRate: number;
    }[];
    emergingPatterns: {
        pattern: string;
        trend: 'rising' | 'stable' | 'declining';
        confidence: number;
    }[];
    riskFactors: {
        pattern: string;
        risks: string[];
        frequency: number;
    }[];
}

export interface TaskMetricsReport {
    completedTasks: number;
    averageCompletionTime: number;
    complexityDistribution: Map<number, number>;
    patternUsageByComplexity: Map<number, string[]>;
    successRateByComplexity: Map<number, number>;
}

export interface PerformanceReport {
    averageImplementationTime: number;
    patternEfficiency: {
        pattern: string;
        avgImplementationTime: number;
        successRate: number;
        efficiency: number;
    }[];
    complexityImpact: {
        complexity: number;
        avgTime: number;
        successRate: number;
    }[];
}

export class ReportingService {
    constructor(
        private taskRepo: TaskRepository,
        private implRepo: ImplementationRepository,
        private codeLocRepo: CodeLocationRepository,
        private mlService: MachineLearningService
    ) {}

    async generateSuccessRateReport(timeframe?: ReportTimeframe): Promise<SuccessRateReport> {
        const implementations = await this.implRepo.getAllImplementations();
        const filteredImpls = timeframe
            ? implementations.filter((i: Implementation) => 
                i.created_at >= timeframe.startDate && 
                i.created_at <= timeframe.endDate)
            : implementations;

        // Calculate overall success rate
        const withRating = filteredImpls.filter((i: Implementation) => i.success_rating !== null);
        const overallSuccessRate = withRating.length > 0
            ? withRating.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / withRating.length
            : 0;

        // Calculate success rates by pattern
        const patternSuccessRates = new Map<string, number>();
        const patternGroups = this.groupByPattern(filteredImpls);
        for (const [pattern, impls] of patternGroups) {
            const rated = impls.filter(i => i.success_rating !== null);
            if (rated.length > 0) {
                patternSuccessRates.set(
                    pattern,
                    rated.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / rated.length
                );
            }
        }

        // Calculate monthly trends
        const trendByMonth = this.calculateMonthlyTrends(filteredImpls);

        return {
            overallSuccessRate,
            patternSuccessRates,
            trendByMonth
        };
    }

    async generatePatternReport(): Promise<PatternReport> {
        const implementations = await this.implRepo.getAllImplementations();
        const patterns = await this.mlService.analyzePatternClusters();
        const trends = await this.mlService.identifyEmergingPatterns();

        // Calculate top patterns
        const topPatterns = this.calculateTopPatterns(implementations);

        // Get risk factors for patterns
        const riskFactors = await this.calculatePatternRisks(implementations);

        return {
            topPatterns,
            emergingPatterns: trends,
            riskFactors
        };
    }

    async generateTaskMetricsReport(timeframe?: ReportTimeframe): Promise<TaskMetricsReport> {
        const tasks = await this.taskRepo.findAll();
        const filteredTasks = timeframe
            ? tasks.filter((t: Task) => 
                t.created_at >= timeframe.startDate && 
                t.updated_at <= timeframe.endDate)
            : tasks;

        const completedTasks = filteredTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
        
        // Calculate average completion time
        const completionTimes = filteredTasks
            .filter((t: Task) => t.status === TaskStatus.COMPLETED)
            .map((t: Task) => t.updated_at - t.created_at);
        const averageCompletionTime = completionTimes.length > 0
            ? completionTimes.reduce((sum: number, time: number) => sum + time, 0) / completionTimes.length
            : 0;

        // Analyze complexity distribution
        const complexityDistribution = new Map<number, number>();
        filteredTasks.forEach((task: Task) => {
            const count = complexityDistribution.get(task.complexity) || 0;
            complexityDistribution.set(task.complexity, count + 1);
        });

        // Analyze pattern usage by complexity
        const patternUsageByComplexity = await this.analyzePatternsByComplexity(filteredTasks);
        
        // Calculate success rates by complexity
        const successRateByComplexity = await this.calculateSuccessRatesByComplexity(filteredTasks);

        return {
            completedTasks,
            averageCompletionTime,
            complexityDistribution,
            patternUsageByComplexity,
            successRateByComplexity
        };
    }

    async generatePerformanceReport(): Promise<PerformanceReport> {
        const implementations = await this.implRepo.getAllImplementations();
        const tasks = await this.taskRepo.findAll();

        // Calculate average implementation time
        const implementationTimes = implementations.map((impl: Implementation) => {
            const task = tasks.find((t: Task) => t.id === impl.task_id);
            return task ? task.updated_at - task.created_at : 0;
        }).filter((time: number) => time > 0);

        const averageImplementationTime = implementationTimes.length > 0
            ? implementationTimes.reduce((sum: number, time: number) => sum + time, 0) / implementationTimes.length
            : 0;

        // Calculate pattern efficiency
        const patternEfficiency = await this.calculatePatternEfficiency(implementations, tasks);

        // Analyze complexity impact
        const complexityImpact = this.analyzeComplexityImpact(tasks, implementations);

        return {
            averageImplementationTime,
            patternEfficiency,
            complexityImpact
        };
    }

    private groupByPattern(implementations: Implementation[]): Map<string, Implementation[]> {
        return implementations.reduce((groups: Map<string, Implementation[]>, impl: Implementation) => {
            const group = groups.get(impl.pattern_type) || [];
            group.push(impl);
            groups.set(impl.pattern_type, group);
            return groups;
        }, new Map<string, Implementation[]>());
    }

    private calculateMonthlyTrends(implementations: Implementation[]): {
        month: string;
        successRate: number;
        implementationCount: number;
    }[] {
        const monthlyGroups = new Map<string, Implementation[]>();

        implementations.forEach((impl: Implementation) => {
            const date = new Date(impl.created_at);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            const group = monthlyGroups.get(monthKey) || [];
            group.push(impl);
            monthlyGroups.set(monthKey, group);
        });

        return Array.from(monthlyGroups.entries())
            .map(([month, impls]) => {
                const rated = impls.filter((i: Implementation) => i.success_rating !== null);
                const successRate = rated.length > 0
                    ? rated.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / rated.length
                    : 0;

                return {
                    month,
                    successRate,
                    implementationCount: impls.length
                };
            })
            .sort((a, b) => a.month.localeCompare(b.month));
    }

    private calculateTopPatterns(implementations: Implementation[]): {
        pattern: string;
        frequency: number;
        avgSuccessRate: number;
    }[] {
        const patterns = this.groupByPattern(implementations);
        
        return Array.from(patterns.entries())
            .map(([pattern, impls]) => {
                const rated = impls.filter(i => i.success_rating !== null);
                const avgSuccessRate = rated.length > 0
                    ? rated.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / rated.length
                    : 0;

                return {
                    pattern,
                    frequency: impls.length,
                    avgSuccessRate
                };
            })
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10);
    }

    private async calculatePatternRisks(implementations: Implementation[]): Promise<{
        pattern: string;
        risks: string[];
        frequency: number;
    }[]> {
        const patterns = this.groupByPattern(implementations);
        const results: { pattern: string; risks: string[]; frequency: number; }[] = [];

        for (const [pattern, impls] of patterns) {
            const failedImpls = impls.filter(i => (i.success_rating || 0) < 0.6);
            if (failedImpls.length > 0) {
                const risks = new Set<string>();
                
                // Analyze common factors in failed implementations
                failedImpls.forEach(impl => {
                    if (impl.pattern_data.toLowerCase().includes('complex')) {
                        risks.add('High complexity');
                    }
                    if (impl.pattern_data.toLowerCase().includes('dependency')) {
                        risks.add('Dependency management');
                    }
                    if (impl.pattern_data.toLowerCase().includes('migration')) {
                        risks.add('Data migration');
                    }
                });

                results.push({
                    pattern,
                    risks: Array.from(risks),
                    frequency: failedImpls.length
                });
            }
        }

        return results.sort((a, b) => b.frequency - a.frequency);
    }

    private async analyzePatternsByComplexity(tasks: Task[]): Promise<Map<number, string[]>> {
        const result = new Map<number, string[]>();
        
        for (const task of tasks) {
            const implementations = await this.implRepo.findByTaskId(task.id);
            const patterns = implementations.map(i => i.pattern_type);
            if (patterns.length > 0) {
                const existingPatterns = result.get(task.complexity) || [];
                result.set(task.complexity, [...new Set([...existingPatterns, ...patterns])]);
            }
        }

        return result;
    }

    private async calculateSuccessRatesByComplexity(tasks: Task[]): Promise<Map<number, number>> {
        const result = new Map<number, number>();
        
        for (const complexity of new Set(tasks.map(t => t.complexity))) {
            const complexityTasks = tasks.filter(t => t.complexity === complexity);
            const implementations = await Promise.all(
                complexityTasks.map(t => this.implRepo.findByTaskId(t.id))
            );
            
            const allImpls = implementations.flat();
            const rated = allImpls.filter(i => i.success_rating !== null);
            
            if (rated.length > 0) {
                const avgSuccess = rated.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / rated.length;
                result.set(complexity, avgSuccess);
            }
        }

        return result;
    }

    private async calculatePatternEfficiency(
        implementations: Implementation[],
        tasks: Task[]
    ): Promise<{
        pattern: string;
        avgImplementationTime: number;
        successRate: number;
        efficiency: number;
    }[]> {
        const patterns = this.groupByPattern(implementations);
        const results: {
            pattern: string;
            avgImplementationTime: number;
            successRate: number;
            efficiency: number;
        }[] = [];

        for (const [pattern, impls] of patterns) {
            const implementationTimes = await Promise.all(
                impls.map(async impl => {
                    const task = tasks.find(t => t.id === impl.task_id);
                    return task ? task.updated_at - task.created_at : 0;
                })
            );

            const validTimes = implementationTimes.filter(t => t > 0);
            const avgTime = validTimes.length > 0
                ? validTimes.reduce((sum: number, time: number) => sum + time, 0) / validTimes.length
                : 0;

            const rated = impls.filter(i => i.success_rating !== null);
            const successRate = rated.length > 0
                ? rated.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / rated.length
                : 0;

            // Efficiency = success rate / normalized implementation time
            // Higher success rate and lower implementation time = higher efficiency
            const normalizedTime = avgTime / (24 * 60 * 60 * 1000); // Convert to days
            const efficiency = normalizedTime > 0 ? successRate / normalizedTime : 0;

            results.push({
                pattern,
                avgImplementationTime: avgTime,
                successRate,
                efficiency
            });
        }

        return results.sort((a, b) => b.efficiency - a.efficiency);
    }

    private analyzeComplexityImpact(
        tasks: Task[],
        implementations: Implementation[]
    ): {
        complexity: number;
        avgTime: number;
        successRate: number;
    }[] {
        const complexities = new Set(tasks.map(t => t.complexity));
        const results: {
            complexity: number;
            avgTime: number;
            successRate: number;
        }[] = [];

        for (const complexity of complexities) {
            const complexityTasks = tasks.filter(t => t.complexity === complexity);
            const complexityImpls = implementations.filter(i => 
                complexityTasks.some(t => t.id === i.task_id)
            );

            // Calculate average implementation time
            const times = complexityTasks
                .filter(t => t.status === TaskStatus.COMPLETED)
                .map(t => t.updated_at - t.created_at);
            const avgTime = times.length > 0
                ? times.reduce((sum: number, time: number) => sum + time, 0) / times.length
                : 0;

            // Calculate success rate
            const rated = complexityImpls.filter(i => i.success_rating !== null);
            const successRate = rated.length > 0
                ? rated.reduce((sum: number, i: Implementation) => sum + (i.success_rating || 0), 0) / rated.length
                : 0;

            results.push({
                complexity,
                avgTime,
                successRate
            });
        }

        return results.sort((a, b) => a.complexity - b.complexity);
    }
}