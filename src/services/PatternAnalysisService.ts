import { Implementation, ImplementationRepository } from '../models/types.js';

export interface PatternAnalysisResult {
    patternType: string;
    successRate: number;
    frequency: number;
    recommendations: string[];
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
     */
    async analyzeAllPatterns(): Promise<Map<string, PatternAnalysisResult>> {
        // Group implementations by pattern type
        const implementations = await this.getAllImplementations();
        const patternGroups = this.groupByPatternType(implementations);
        
        const results = new Map<string, PatternAnalysisResult>();
        
        for (const [patternType, impls] of patternGroups.entries()) {
            const analysis = this.analyzePatternGroup(patternType, impls);
            results.set(patternType, analysis);
        }
        
        return results;
    }

    /**
     * Gets recommendations for a new task based on similar patterns
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
        
        return this.generateRecommendations(patterns, allPatterns);
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

    private analyzePatternGroup(patternType: string, implementations: Implementation[]): PatternAnalysisResult {
        const withRating = implementations.filter(i => i.success_rating !== null && i.success_rating !== undefined);
        const successRate = withRating.length > 0
            ? withRating.reduce((sum, i) => sum + (i.success_rating || 0), 0) / withRating.length
            : 0;

        return {
            patternType,
            successRate,
            frequency: implementations.length,
            recommendations: this.getPatternRecommendations(patternType, successRate)
        };
    }

    private analyzeImplementations(implementations: Implementation[]): PatternAnalysisResult[] {
        const groups = this.groupByPatternType(implementations);
        return Array.from(groups.entries()).map(([type, impls]) => 
            this.analyzePatternGroup(type, impls)
        );
    }

    private getPatternRecommendations(patternType: string, successRate: number): string[] {
        const recommendations: string[] = [];

        // Add basic recommendations based on pattern type and success rate
        if (successRate < 0.5) {
            recommendations.push(`Consider alternative approaches to "${patternType}" as it has low success rate`);
        } else if (successRate > 0.8) {
            recommendations.push(`"${patternType}" pattern shows high success rate - consider as primary approach`);
        }

        // Add pattern-specific recommendations
        switch (patternType) {
            case 'refactoring':
                recommendations.push('Consider writing tests before refactoring');
                break;
            case 'bug-fix':
                recommendations.push('Add regression tests to prevent similar bugs');
                break;
            case 'feature':
                recommendations.push('Document the implementation approach for future reference');
                break;
        }

        return recommendations;
    }

    private generateRecommendations(
        taskPatterns: PatternAnalysisResult[],
        allPatterns: Map<string, PatternAnalysisResult>
    ): string[] {
        const recommendations: string[] = [];

        for (const pattern of taskPatterns) {
            const globalPattern = allPatterns.get(pattern.patternType);
            if (globalPattern) {
                if (pattern.successRate < globalPattern.successRate) {
                    recommendations.push(
                        `Consider reviewing "${pattern.patternType}" implementation - ` +
                        `global success rate is ${globalPattern.successRate.toFixed(2)}`
                    );
                }
            }
            
            // Add pattern-specific recommendations
            recommendations.push(...this.getPatternRecommendations(pattern.patternType, pattern.successRate));
        }

        return recommendations;
    }
}