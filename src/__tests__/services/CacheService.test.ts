import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { CacheService } from '../../services/CacheService.js';

describe('CacheService', () => {
    let cache: CacheService;

    beforeEach(() => {
        cache = new CacheService({
            defaultTTL: 1000,    // 1 second for testing
            maxEntries: 3        // Small size for testing eviction
        });
    });

    describe('Basic Operations', () => {
        test('should store and retrieve values', () => {
            cache.set('test', { data: 'value' });
            expect(cache.get('test')).toEqual({ data: 'value' });
        });

        test('should return null for non-existent keys', () => {
            expect(cache.get('nonexistent')).toBeNull();
        });

        test('should clear all entries', () => {
            cache.set('test1', 'value1');
            cache.set('test2', 'value2');
            cache.clear();
            expect(cache.get('test1')).toBeNull();
            expect(cache.get('test2')).toBeNull();
        });
    });

    describe('Cache Expiration', () => {
        test('should expire entries after TTL', async () => {
            cache.set('test', 'value', 100); // 100ms TTL
            expect(cache.get('test')).toBe('value');
            
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(cache.get('test')).toBeNull();
        });

        test('should use default TTL when not specified', async () => {
            cache.set('test', 'value');
            expect(cache.get('test')).toBe('value');
            
            await new Promise(resolve => setTimeout(resolve, 1100));
            expect(cache.get('test')).toBeNull();
        });

        test('should update expiration on access', async () => {
            cache.set('test', 'value', 200); // 200ms TTL
            
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(cache.get('test')).toBe('value'); // Access refreshes
            
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(cache.get('test')).toBe('value'); // Should still be valid
        });
    });

    describe('Cache Eviction', () => {
        test('should evict least recently used entry when full', () => {
            cache.set('test1', 'value1');
            cache.set('test2', 'value2');
            cache.set('test3', 'value3');
            expect(cache.get('test1')).toBe('value1'); // Access test1
            cache.set('test4', 'value4');              // Should evict test2
            
            expect(cache.get('test1')).toBe('value1');
            expect(cache.get('test2')).toBeNull();     // Evicted
            expect(cache.get('test3')).toBe('value3');
            expect(cache.get('test4')).toBe('value4');
        });

        test('should evict expired entries automatically', async () => {
            cache.set('test1', 'value1', 100); // 100ms TTL
            cache.set('test2', 'value2', 500); // 500ms TTL
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Accessing any key should trigger expired entry eviction
            expect(cache.get('test2')).toBe('value2');
            expect(cache.get('test1')).toBeNull();
        });
    });

    describe('Report Key Generation', () => {
        test('should generate consistent keys for same parameters', () => {
            const params1 = { startDate: 1000, endDate: 2000 };
            const params2 = { endDate: 2000, startDate: 1000 };
            
            const key1 = CacheService.generateReportKey('success', params1);
            const key2 = CacheService.generateReportKey('success', params2);
            
            expect(key1).toBe(key2);
        });

        test('should generate different keys for different reports', () => {
            const params = { startDate: 1000, endDate: 2000 };
            
            const key1 = CacheService.generateReportKey('success', params);
            const key2 = CacheService.generateReportKey('patterns', params);
            
            expect(key1).not.toBe(key2);
        });

        test('should handle undefined parameters', () => {
            const key = CacheService.generateReportKey('metrics');
            expect(key).toBe('report:metrics');
        });
    });

    describe('Performance', () => {
        test('should handle rapid access patterns', () => {
            for (let i = 0; i < 1000; i++) {
                cache.set(`key${i % 3}`, `value${i}`);
                cache.get(`key${i % 2}`);
            }
            // Should not throw or slow down significantly
        });

        test('should handle concurrent operations', async () => {
            const operations = [];
            for (let i = 0; i < 100; i++) {
                operations.push(
                    Promise.resolve().then(() => {
                        if (i % 2 === 0) {
                            cache.set(`key${i}`, `value${i}`);
                        } else {
                            cache.get(`key${i - 1}`);
                        }
                    })
                );
            }
            
            await Promise.all(operations);
            // Should not throw or produce race conditions
        });
    });
});