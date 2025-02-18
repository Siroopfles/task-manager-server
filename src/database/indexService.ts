import { Database } from 'better-sqlite3';
import { getDatabase } from './schema.js';

interface IndexInfo {
    tableName: string;
    indexName: string;
    columns: string[];
}

interface IndexStats {
    indexName: string;
    usageCount: number;
    avgTime: number;
}

interface IndexRow {
    name: string;
}

interface StatRow {
    indexName: string;
    usageCount: number;
    avgTime: number;
}

interface QueryPlanRow {
    id: number;
    parent: number;
    detail: string;
}

/**
 * Service to manage database indexes for query optimization
 */
export class IndexService {
    private db: Database;

    constructor(db?: Database) {
        this.db = db || getDatabase();
    }

    /**
     * Create all necessary indexes for optimal query performance
     */
    async createIndexes(): Promise<void> {
        // Task indexes
        this.createIndex('tasks', 'status', 'task_status_idx');
        this.createIndex('tasks', 'complexity', 'task_complexity_idx');
        this.createIndex('tasks', 'created_at', 'task_created_idx');
        this.createIndex('tasks', 'updated_at', 'task_updated_idx');
        
        // Code location indexes
        this.createIndex('code_locations', 'task_id', 'codeloc_task_idx');
        this.createIndex('code_locations', 'file_path', 'codeloc_file_idx');
        this.createIndex('code_locations', 'git_branch', 'codeloc_branch_idx');
        this.createIndex('code_locations', 'created_at', 'codeloc_created_idx');
        
        // Implementation indexes
        this.createIndex('implementations', 'task_id', 'impl_task_idx');
        this.createIndex('implementations', 'pattern_type', 'impl_pattern_idx');
        this.createIndex('implementations', 'success_rating', 'impl_success_idx');
        this.createIndex('implementations', 'created_at', 'impl_created_idx');
        
        // Compound indexes for common queries
        this.createCompoundIndex(
            'implementations',
            ['pattern_type', 'success_rating'],
            'impl_pattern_success_idx'
        );
        this.createCompoundIndex(
            'implementations',
            ['task_id', 'created_at'],
            'impl_task_time_idx'
        );
        this.createCompoundIndex(
            'tasks',
            ['status', 'complexity'],
            'task_status_complexity_idx'
        );
    }

    /**
     * Drop all custom indexes
     */
    async dropIndexes(): Promise<void> {
        const indexes = this.db.prepare(`
            SELECT name 
            FROM sqlite_master 
            WHERE type='index' 
            AND name NOT LIKE 'sqlite_%'
        `).all() as IndexRow[];

        for (const { name } of indexes) {
            this.db.prepare(`DROP INDEX IF EXISTS ${name}`).run();
        }
    }

    /**
     * Create a single column index
     */
    public createIndex(
        table: string,
        column: string,
        indexName: string
    ): void {
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS ${indexName}
            ON ${table} (${column})
        `).run();
    }

    /**
     * Create a compound index
     */
    public createCompoundIndex(
        table: string,
        columns: string[],
        indexName: string
    ): void {
        this.db.prepare(`
            CREATE INDEX IF NOT EXISTS ${indexName}
            ON ${table} (${columns.join(', ')})
        `).run();
    }

    /**
     * Rebuild all indexes for optimal performance
     */
    async rebuildIndexes(): Promise<void> {
        await this.dropIndexes();
        await this.createIndexes();
        await this.analyze();
    }

    /**
     * Get information about existing indexes
     */
    async getIndexInfo(): Promise<IndexInfo[]> {
        type IndexInfoRow = {
            tableName: string;
            indexName: string;
            columnName: string;
        };

        const rows = this.db.prepare(`
            SELECT 
                m.tbl_name as tableName,
                m.name as indexName,
                ii.name as columnName
            FROM sqlite_master m
            JOIN pragma_index_info(m.name) ii
            WHERE m.type = 'index'
            AND m.name NOT LIKE 'sqlite_%'
            ORDER BY m.tbl_name, m.name, ii.seqno
        `).all() as IndexInfoRow[];

        return rows.reduce((acc: IndexInfo[], row: IndexInfoRow) => {
            const existing = acc.find(i => i.indexName === row.indexName);
            if (existing) {
                existing.columns.push(row.columnName);
            } else {
                acc.push({
                    tableName: row.tableName,
                    indexName: row.indexName,
                    columns: [row.columnName]
                });
            }
            return acc;
        }, []);
    }

    /**
     * Get index usage statistics
     */
    async getIndexStats(): Promise<IndexStats[]> {
        const rows = this.db.prepare(`
            SELECT 
                idx.name as indexName,
                CAST(stat.stat1 AS INTEGER) as usageCount,
                CAST(stat.stat2 AS FLOAT) as avgTime
            FROM sqlite_stat1 stat
            JOIN sqlite_master idx ON idx.name = stat.idx
            WHERE idx.type = 'index'
            AND idx.name NOT LIKE 'sqlite_%'
            ORDER BY stat.stat1 DESC
        `).all() as StatRow[];

        return rows.map(row => ({
            indexName: row.indexName,
            usageCount: row.usageCount,
            avgTime: row.avgTime
        }));
    }

    /**
     * Optimize specific queries by creating custom indexes
     */
    async optimizeQueries(queries: string[]): Promise<void> {
        // Analyze queries and create appropriate indexes
        for (const query of queries) {
            const explained = this.db.prepare(`EXPLAIN QUERY PLAN ${query}`).all() as QueryPlanRow[];
            // Check if the query could benefit from additional indexes
            this.analyzeQueryPlan(explained);
        }
    }

    /**
     * Analyze database for query optimization
     */
    private async analyze(): Promise<void> {
        this.db.prepare('ANALYZE').run();
    }

    /**
     * Analyze query plan to identify missing indexes
     */
    private analyzeQueryPlan(plan: QueryPlanRow[]): void {
        // Extract tables and columns from query plan
        const scans = plan.filter(p => 
            p.detail?.includes('SCAN TABLE') || 
            p.detail?.includes('SEARCH TABLE')
        );

        for (const scan of scans) {
            if (scan.detail?.includes('SCAN TABLE')) {
                // Consider creating an index for full table scans
                const match = scan.detail.match(/SCAN TABLE (\w+)/);
                if (match) {
                    console.log(`Consider adding index for table scan on ${match[1]}`);
                }
            }
        }
    }
}

// Create singleton instance
export const indexService = new IndexService();