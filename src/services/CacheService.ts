import { SuccessRateReport, PatternReport, TaskMetricsReport, PerformanceReport } from './ReportingService.js';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

interface CacheConfig {
    defaultTTL: number;  // Time To Live in milliseconds
    maxEntries: number;
}

/**
 * Cache service for storing and retrieving report results.
 * Uses LRU (Least Recently Used) strategy for cache eviction.
 */
export class CacheService {
    private cache: Map<string, CacheEntry<any>>;
    private accessOrder: string[];
    private config: CacheConfig;

    constructor(config?: Partial<CacheConfig>) {
        this.cache = new Map();
        this.accessOrder = [];
        this.config = {
            defaultTTL: 15 * 60 * 1000, // 15 minutes default TTL
            maxEntries: 100,            // Maximum cache entries
            ...config
        };
    }

    /**
     * Store a value in the cache with optional TTL
     */
    set<T>(key: string, value: T, ttl?: number): void {
        this.evictExpired();

        // If cache is full, remove least recently used entry
        if (this.cache.size >= this.config.maxEntries) {
            const oldestKey = this.accessOrder[0];
            this.cache.delete(oldestKey);
            this.accessOrder.shift();
        }

        const timestamp = Date.now();
        const expiresAt = timestamp + (ttl || this.config.defaultTTL);

        this.cache.set(key, {
            data: value,
            timestamp,
            expiresAt
        });

        // Update access order
        this.accessOrder = [
            key,
            ...this.accessOrder.filter(k => k !== key)
        ];
    }

    /**
     * Retrieve a value from the cache
     */
    get<T>(key: string): T | null {
        this.evictExpired();

        const entry = this.cache.get(key);
        if (!entry || Date.now() > entry.expiresAt) {
            return null;
        }

        // Update access order
        this.accessOrder = [
            key,
            ...this.accessOrder.filter(k => k !== key)
        ];

        return entry.data;
    }

    /**
     * Clear all cached entries
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    /**
     * Remove expired entries
     */
    private evictExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                this.accessOrder = this.accessOrder.filter(k => k !== key);
            }
        }
    }

    /**
     * Generate cache key for reports
     */
    static generateReportKey(reportType: string, params?: any): string {
        if (!params) {
            return `report:${reportType}`;
        }

        const paramString = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('&');

        return `report:${reportType}:${paramString}`;
    }
}

// Create singleton instance
export const reportCache = new CacheService({
    defaultTTL: 5 * 60 * 1000,  // 5 minutes for reports
    maxEntries: 50              // Maximum number of cached reports
});