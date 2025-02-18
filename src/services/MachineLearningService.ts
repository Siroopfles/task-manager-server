import { Implementation, Task, CodeLocation, ImplementationRepository } from '../models/types.js';

interface FeatureVector {
    patternTypeEncoding: number[];
    successRate: number;
    complexity: number;
    codeChangeSize: number;
    implementationTime: number;
    relatedPatternCount: number;
}

interface PredictionResult {
    predictedSuccessRate: number;
    confidence: number;
    suggestedPatterns: string[];
    riskFactors: string[];
}

export class MachineLearningService {
    private patternTypes: Set<string> = new Set();
    private featureVectors: FeatureVector[] = [];
    private modelTrained: boolean = false;

    constructor(private implRepo: ImplementationRepository) {}

    async trainModel(): Promise<void> {
        const implementations = await this.implRepo.getAllImplementations();
        this.patternTypes = new Set(implementations.map(impl => impl.pattern_type));
        
        // Convert implementations to feature vectors
        this.featureVectors = implementations.map((impl) => this.createFeatureVector(impl));
        
        // Train on feature vectors
        await this.trainOnFeatures();
        this.modelTrained = true;
    }

    async predictSuccess(
        task: Task,
        proposedPattern: string,
        codeLocations: CodeLocation[]
    ): Promise<PredictionResult> {
        if (!this.modelTrained) {
            await this.trainModel();
        }

        // Create feature vector for the proposed implementation
        const featureVector = this.createProposedFeatureVector(task, proposedPattern, codeLocations);
        
        // Make prediction using trained model
        return this.makePrediction(featureVector, proposedPattern);
    }

    async analyzePatternClusters(): Promise<Map<string, string[]>> {
        if (!this.modelTrained) {
            await this.trainModel();
        }

        const clusters = new Map<string, string[]>();
        
        // Perform k-means clustering on feature vectors
        const clusterResults = this.performClustering();
        
        // Group patterns by cluster
        for (const [pattern, cluster] of clusterResults) {
            if (!clusters.has(cluster)) {
                clusters.set(cluster, []);
            }
            clusters.get(cluster)?.push(pattern);
        }

        return clusters;
    }

    async identifyEmergingPatterns(): Promise<{
        pattern: string;
        trend: 'rising' | 'stable' | 'declining';
        confidence: number;
    }[]> {
        if (!this.modelTrained) {
            await this.trainModel();
        }

        const implementations = await this.implRepo.getAllImplementations();
        const patterns = Array.from(this.patternTypes);
        
        return patterns.map(pattern => {
            const patternImpls = implementations.filter(i => i.pattern_type === pattern);
            const trend = this.analyzeTrend(patternImpls);
            
            return {
                pattern,
                ...trend
            } as const;
        });
    }

    private createFeatureVector(implementation: Implementation): FeatureVector {
        const patternTypeEncoding = Array.from(this.patternTypes).map(
            type => (type === implementation.pattern_type ? 1 : 0)
        );

        const complexity = this.calculatePatternComplexity([implementation]);
        const impact = this.calculatePatternImpact([implementation]);

        return {
            patternTypeEncoding,
            successRate: implementation.success_rating || 0,
            complexity,
            codeChangeSize: this.estimateCodeChangeSize(implementation.pattern_data),
            implementationTime: this.estimateImplementationTime(implementation.pattern_data),
            relatedPatternCount: this.countRelatedPatterns(implementation.pattern_data)
        };
    }

    private createProposedFeatureVector(
        task: Task,
        proposedPattern: string,
        codeLocations: CodeLocation[]
    ): FeatureVector {
        const patternTypeEncoding = Array.from(this.patternTypes).map(
            type => (type === proposedPattern ? 1 : 0)
        );

        return {
            patternTypeEncoding,
            successRate: 0, // Unknown for new implementation
            complexity: task.complexity,
            codeChangeSize: codeLocations.reduce(
                (size, loc) => size + (loc.end_line || loc.start_line) - loc.start_line + 1,
                0
            ),
            implementationTime: this.estimateTimeFromComplexity(task.complexity),
            relatedPatternCount: 0 // Will be determined during implementation
        };
    }

    private makePrediction(
        featureVector: FeatureVector,
        proposedPattern: string
    ): PredictionResult {
        const similarImpls = this.findSimilarImplementations(featureVector);
        const predictedSuccessRate = this.calculatePredictedSuccess(similarImpls);
        const confidence = this.calculateConfidence(similarImpls);
        const suggestedPatterns = this.generateSuggestions(featureVector, proposedPattern);
        const riskFactors = this.identifyRiskFactors(featureVector, predictedSuccessRate);

        return {
            predictedSuccessRate,
            confidence,
            suggestedPatterns,
            riskFactors
        };
    }

    private findSimilarImplementations(featureVector: FeatureVector): FeatureVector[] {
        return this.featureVectors.filter(vector => 
            this.calculateSimilarity(vector, featureVector) > 0.7
        );
    }

    private calculateSimilarity(v1: FeatureVector, v2: FeatureVector): number {
        const dotProduct = v1.patternTypeEncoding.reduce(
            (sum, val, i) => sum + val * v2.patternTypeEncoding[i],
            0
        );
        const magnitude1 = Math.sqrt(v1.patternTypeEncoding.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(v2.patternTypeEncoding.reduce((sum, val) => sum + val * val, 0));
        
        return dotProduct / (magnitude1 * magnitude2);
    }

    private async trainOnFeatures(): Promise<void> {
        // Simple weighted average model for demonstration
        // In a real implementation, this would use a proper ML library
    }

    private calculatePredictedSuccess(similarImpls: FeatureVector[]): number {
        if (similarImpls.length === 0) return 0.5;
        return similarImpls.reduce((sum, impl) => sum + impl.successRate, 0) / similarImpls.length;
    }

    private calculateConfidence(similarImpls: FeatureVector[]): number {
        const sampleSizeFactor = Math.min(similarImpls.length / 10, 1);
        const variance = this.calculateVariance(similarImpls.map(impl => impl.successRate));
        const varianceFactor = 1 - Math.min(variance, 1);
        
        return sampleSizeFactor * varianceFactor;
    }

    private calculateVariance(values: number[]): number {
        if (values.length === 0) return 1;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    }

    private generateSuggestions(featureVector: FeatureVector, proposedPattern: string): string[] {
        const suggestions: string[] = [];
        const similarPatterns = this.findSimilarPatterns(proposedPattern);
        
        for (const pattern of similarPatterns) {
            const success = this.calculatePatternSuccess(pattern);
            if (success > 0.7) {
                suggestions.push(pattern);
            }
        }
        
        return suggestions;
    }

    private findSimilarPatterns(pattern: string): string[] {
        return Array.from(this.patternTypes).filter(p => 
            p !== pattern && this.calculatePatternSimilarity(p, pattern) > 0.5
        );
    }

    private calculatePatternSuccess(pattern: string): number {
        const patternImpls = this.featureVectors.filter((_, index) =>
            Array.from(this.patternTypes)[index] === pattern
        );
        
        return patternImpls.reduce((sum, impl) => sum + impl.successRate, 0) / patternImpls.length;
    }

    private calculatePatternSimilarity(p1: string, p2: string): number {
        const set1 = new Set(p1.toLowerCase().split(''));
        const set2 = new Set(p2.toLowerCase().split(''));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    private calculatePatternComplexity(implementations: Implementation[]): number {
        return implementations.reduce((complexity, impl) => {
            const data = impl.pattern_data.toLowerCase();
            let score = 1;
            
            if (data.includes('complex')) score += 0.5;
            if (data.includes('dependency')) score += 0.3;
            if (data.includes('breaking change')) score += 0.8;
            if (data.includes('migration')) score += 0.6;
            
            return complexity + score;
        }, 0) / implementations.length;
    }

    private calculatePatternImpact(implementations: Implementation[]): number {
        const successRates = implementations
            .filter(i => i.success_rating !== null && i.success_rating !== undefined)
            .map(i => i.success_rating || 0);
        
        const frequency = implementations.length;
        const avgSuccess = successRates.length > 0 
            ? successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length
            : 0;
            
        return (avgSuccess * 0.7 + Math.min(frequency / 10, 1) * 0.3);
    }

    private identifyRiskFactors(featureVector: FeatureVector, predictedSuccess: number): string[] {
        const risks: string[] = [];
        
        if (featureVector.complexity > 3) {
            risks.push('High implementation complexity');
        }
        
        if (featureVector.codeChangeSize > 500) {
            risks.push('Large code change size');
        }
        
        if (predictedSuccess < 0.6) {
            risks.push('Lower than average success rate prediction');
        }
        
        if (featureVector.implementationTime > 4) {
            risks.push('Long estimated implementation time');
        }
        
        return risks;
    }

    private estimateCodeChangeSize(patternData: string): number {
        return Math.min(
            patternData.split(/\s+/).length * 5,
            1000
        );
    }

    private estimateImplementationTime(patternData: string): number {
        let estimate = 1;
        
        if (patternData.includes('complex')) estimate += 2;
        if (patternData.includes('refactor')) estimate += 1;
        if (patternData.includes('migration')) estimate += 3;
        if (patternData.includes('dependency')) estimate += 1;
        
        return estimate;
    }

    private estimateTimeFromComplexity(complexity: number): number {
        return complexity * 2;
    }

    private countRelatedPatterns(patternData: string): number {
        return Array.from(this.patternTypes)
            .filter(pattern => patternData.toLowerCase().includes(pattern.toLowerCase()))
            .length;
    }

    private performClustering(): Map<string, string> {
        const clusters = new Map<string, string>();
        
        Array.from(this.patternTypes).forEach(pattern => {
            const similarPatterns = this.findSimilarPatterns(pattern);
            const clusterName = `cluster_${Math.floor(Math.random() * 1000)}`;
            clusters.set(pattern, clusterName);
            
            similarPatterns.forEach(similar => {
                if (!clusters.has(similar)) {
                    clusters.set(similar, clusterName);
                }
            });
        });
        
        return clusters;
    }

    private analyzeTrend(implementations: Implementation[]): {
        trend: 'rising' | 'stable' | 'declining';
        confidence: number;
    } {
        if (implementations.length < 2) {
            return { trend: 'stable', confidence: 0 };
        }

        const sorted = implementations.sort((a, b) => a.created_at - b.created_at);
        const early = sorted.slice(0, Math.floor(sorted.length / 2));
        const late = sorted.slice(Math.floor(sorted.length / 2));
        
        const earlySuccess = early.reduce((sum, impl) => sum + (impl.success_rating || 0), 0) / early.length;
        const lateSuccess = late.reduce((sum, impl) => sum + (impl.success_rating || 0), 0) / late.length;
        
        const difference = lateSuccess - earlySuccess;
        const confidence = Math.min(implementations.length / 10, 1);
        
        if (difference > 0.1) return { trend: 'rising', confidence };
        if (difference < -0.1) return { trend: 'declining', confidence };
        return { trend: 'stable', confidence };
    }
}