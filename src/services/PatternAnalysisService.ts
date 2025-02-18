import { Implementation, ImplementationRepository } from '../models/types.js';

export interface PatternAnalysisResult {
    patternType: string;
    successRate: number;
    frequency: number;
    recommendations: string[];
    complexity?: number;
    impact?: number;
    relatedPatterns?: string[];
    trends?: {
        timeFrame: string;
        successRate: number;
        frequency: number;
    }[];
}

interface PatternMetrics {
    totalImplementations: number;
    successfulImplementations: number;
    averageSuccessRate: number;
    complexity: number;
    impact: number;
    relatedPatterns: Set<string>;
}

export class PatternAnalysisService {
    constructor(private implRepo: ImplementationRepository) {}

    /**
     * Analyzes implementation patterns for a specific task
     */
    async analyzeTaskPatterns(taskId: string): Promise<PatternAnalysisResult[]> {
        const implementations = await this.implRepo.findByTaskId(taskId);
        return this.analyzeImplementations(implementations);
    }

    /**
     * Analyzes all implementation patterns to find common patterns and success rates
     * Now includes trend analysis and pattern relationships
     */
    async analyzeAllPatterns(): Promise<Map<string, PatternAnalysisResult>> {
        const implementations = await this.getAllImplementations();
        const patternGroups = this.groupByPatternType(implementations);
        const patternRelationships = this.analyzePatternRelationships(implementations);
        const results = new Map<string, PatternAnalysisResult>();
        
        for (const [patternType, impls] of patternGroups.entries()) {
            const analysis = this.analyzePatternGroup(patternType, impls);
            const relationships = patternRelationships.get(patternType) || [];
            
            // Add related patterns information
            analysis.relatedPatterns = relationships;
            
            // Add trend analysis
            analysis.trends = this.analyzeTrends(impls);
            
            results.set(patternType, analysis);
        }
        
        return results;
    }

    /**
     * Gets enhanced recommendations for a new task based on pattern analysis
     */
    async getRecommendations(taskId: string): Promise<string[]> {
        const taskImpls = await this.implRepo.findByTaskId(taskId);
        if (taskImpls.length === 0) {
            return [];
        }

        // Analyze patterns from this task
        const patterns = this.analyzeImplementations(taskImpls);
        
        // Get global patterns for comparison
        const allPatterns = await this.analyzeAllPatterns();
        
        // Get pattern metrics
        const metrics = this.calculateMetrics(taskImpls);
        
        return this.generateEnhancedRecommendations(patterns, allPatterns, metrics);
    }

    private async getAllImplementations(): Promise<Implementation[]> {
        return this.implRepo.getAllImplementations();
    }

    private groupByPatternType(implementations: Implementation[]): Map<string, Implementation[]> {
        return implementations.reduce((groups, impl) => {
            const group = groups.get(impl.pattern_type) || [];
            group.push(impl);
            groups.set(impl.pattern_type, group);
            return groups;
        }, new Map<string, Implementation[]>());
    }

    private analyzeImplementations(implementations: Implementation[]): PatternAnalysisResult[] {
        const groups = this.groupByPatternType(implementations);
        return Array.from(groups.entries()).map(([type, impls]) => 
            this.analyzePatternGroup(type, impls)
        );
    }

    private analyzePatternGroup(patternType: string, implementations: Implementation[]): PatternAnalysisResult {
        const metrics = this.calculateMetrics(implementations);
        const complexity = this.calculatePatternComplexity(implementations);
        const impact = this.calculatePatternImpact(implementations);

        return {
            patternType,
            successRate: metrics.averageSuccessRate,
            frequency: implementations.length,
            complexity,
            impact,
            recommendations: this.getPatternRecommendations(patternType, metrics)
        };
    }

    private calculateMetrics(implementations: Implementation[]): PatternMetrics {
        const withRating = implementations.filter(i => i.success_rating !== null && i.success_rating !== undefined);
        const successfulImpls = withRating.filter(i => (i.success_rating || 0) >= 0.7);
        
        return {
            totalImplementations: implementations.length,
            successfulImplementations: successfulImpls.length,
            averageSuccessRate: withRating.length > 0
                ? withRating.reduce((sum, i) => sum + (i.success_rating || 0), 0) / withRating.length
                : 0,
            complexity: this.calculatePatternComplexity(implementations),
            impact: this.calculatePatternImpact(implementations),
            relatedPatterns: new Set(implementations.map(i => this.extractRelatedPatterns(i.pattern_data)).flat())
        };
    }

    private calculatePatternComplexity(implementations: Implementation[]): number {
        // Analyze pattern_data for complexity indicators
        return implementations.reduce((complexity, impl) => {
            const data = impl.pattern_data.toLowerCase();
            let score = 1;
            
            if (data.includes('refactor')) score += 0.5;
            if (data.includes('dependency')) score += 0.3;
            if (data.includes('breaking change')) score += 0.8;
            if (data.includes('migration')) score += 0.6;
            
            return complexity + score;
        }, 0) / implementations.length;
    }

    private calculatePatternImpact(implementations: Implementation[]): number {
        // Analyze success ratings and pattern frequency
        const successRates = implementations
            .filter(i => i.success_rating !== null && i.success_rating !== undefined)
            .map(i => i.success_rating || 0);
        
        const frequency = implementations.length;
        const avgSuccess = successRates.length > 0 
            ? successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length
            : 0;
            
        return (avgSuccess * 0.7 + Math.min(frequency / 10, 1) * 0.3);
    }

    private analyzeTrends(implementations: Implementation[]): { timeFrame: string; successRate: number; frequency: number; }[] {
        const now = Date.now();
        const timeFrames = [
            { name: 'Last week', time: 7 * 24 * 60 * 60 * 1000 },
            { name: 'Last month', time: 30 * 24 * 60 * 60 * 1000 },
            { name: 'Last quarter', time: 90 * 24 * 60 * 60 * 1000 }
        ];

        return timeFrames.map(frame => {
            const periodImpls = implementations.filter(i => 
                (now - new Date(i.created_at).getTime()) <= frame.time
            );

            const successRates = periodImpls
                .filter(i => i.success_rating !== null && i.success_rating !== undefined)
                .map(i => i.success_rating || 0);

            return {
                timeFrame: frame.name,
                successRate: successRates.length > 0 
                    ? successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length
                    : 0,
                frequency: periodImpls.length
            };
        });
    }

    private analyzePatternRelationships(implementations: Implementation[]): Map<string, string[]> {
        const relationships = new Map<string, Set<string>>();
        
        implementations.forEach(impl => {
            const relatedPatterns = this.extractRelatedPatterns(impl.pattern_data);
            const currentPattern = impl.pattern_type;
            
            if (!relationships.has(currentPattern)) {
                relationships.set(currentPattern, new Set());
            }
            
            relatedPatterns.forEach(related => {
                if (related !== currentPattern) {
                    relationships.get(currentPattern)?.add(related);
                }
            });
        });
        
        return new Map(
            Array.from(relationships.entries())
                .map(([key, set]) => [key, Array.from(set)])
        );
    }

    private extractRelatedPatterns(patternData: string): string[] {
        const patterns = [
            'refactoring', 'bug-fix', 'feature', 'optimization',
            'security', 'performance', 'testing', 'documentation'
        ];
        
        return patterns.filter(pattern => 
            patternData.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    private generateEnhancedRecommendations(
        taskPatterns: PatternAnalysisResult[],
        allPatterns: Map<string, PatternAnalysisResult>,
        metrics: PatternMetrics
    ): string[] {
        const recommendations: string[] = [];

        // Pattern-specific recommendations
        for (const pattern of taskPatterns) {
            const globalPattern = allPatterns.get(pattern.patternType);
            
            if (globalPattern) {
                // Compare with global success rates
                if (pattern.successRate < globalPattern.successRate) {
                    recommendations.push(
                        `Consider reviewing "${pattern.patternType}" implementation - ` +
                        `global success rate is ${globalPattern.successRate.toFixed(2)}`
                    );
                }

                // Check complexity
                if (pattern.complexity && pattern.complexity > 2) {
                    recommendations.push(
                        `High complexity detected in "${pattern.patternType}" pattern. ` +
                        `Consider breaking down the implementation into smaller steps.`
                    );
                }

                // Check impact
                if (pattern.impact && pattern.impact < 0.5) {
                    recommendations.push(
                        `Low impact detected for "${pattern.patternType}" pattern. ` +
                        `Consider alternative approaches or improving implementation quality.`
                    );
                }

                // Analyze trends
                if (globalPattern.trends) {
                    const recentTrend = globalPattern.trends[0];
                    if (recentTrend && recentTrend.successRate > pattern.successRate) {
                        recommendations.push(
                            `Recent implementations of "${pattern.patternType}" show higher success rates. ` +
                            `Review recent successful implementations for insights.`
                        );
                    }
                }
            }

            // Add pattern-specific recommendations
            recommendations.push(...this.getPatternRecommendations(pattern.patternType, metrics));
        }

        return recommendations;
    }

    private getPatternRecommendations(patternType: string, metrics: PatternMetrics): string[] {
        const recommendations: string[] = [];
        const successRate = metrics.averageSuccessRate;

        // Success rate based recommendations
        if (successRate < 0.5) {
            recommendations.push(`Consider alternative approaches to "${patternType}" as it has low success rate`);
        } else if (successRate > 0.8) {
            recommendations.push(`"${patternType}" pattern shows high success rate - consider as primary approach`);
        }

        // Complexity based recommendations
        if (metrics.complexity > 2) {
            recommendations.push(`Complex implementation detected - consider breaking down into smaller tasks`);
        }

        // Impact based recommendations
        if (metrics.impact < 0.5) {
            recommendations.push(`Consider ways to improve the impact of this implementation`);
        }

        // Pattern-specific recommendations
        switch (patternType) {
            case 'refactoring':
                recommendations.push('Write comprehensive tests before refactoring');
                recommendations.push('Consider incremental refactoring approach');
                break;
            case 'bug-fix':
                recommendations.push('Add regression tests to prevent similar bugs');
                recommendations.push('Document root cause analysis');
                break;
            case 'feature':
                recommendations.push('Document implementation approach and decisions');
                recommendations.push('Consider feature flag for gradual rollout');
                break;
            case 'performance':
                recommendations.push('Add performance benchmarks');
                recommendations.push('Consider monitoring and metrics');
                break;
            case 'security':
                recommendations.push('Add security test cases');
                recommendations.push('Consider penetration testing');
                break;
        }

        // Related patterns recommendations
        if (metrics.relatedPatterns.size > 0) {
            recommendations.push(
                `Consider related patterns: ${Array.from(metrics.relatedPatterns).join(', ')}`
            );
        }

        return recommendations;
    }
}