import BetterSqlite3, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Implementation, ImplementationRepository, ImplementationSchema, ValidationError, NotFoundError, DatabaseError } from '../models/types.js';
import { getDatabase } from '../database/schema.js';

export class SQLiteImplementationRepository implements ImplementationRepository {
    private db: BetterSqlite3Database;

    constructor() {
        this.db = getDatabase();
        this.setupPreparedStatements();
    }

    private statements: {
        create: BetterSqlite3.Statement | undefined;
        findByTaskId: BetterSqlite3.Statement | undefined;
        update: BetterSqlite3.Statement | undefined;
        delete: BetterSqlite3.Statement | undefined;
    } = {
        create: undefined,
        findByTaskId: undefined,
        update: undefined,
        delete: undefined
    };

    private setupPreparedStatements(): void {
        this.statements.create = this.db.prepare(`
            INSERT INTO implementations (id, task_id, pattern_type, pattern_data, success_rating, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        this.statements.findByTaskId = this.db.prepare(`
            SELECT * FROM implementations WHERE task_id = ?
        `);

        this.statements.update = this.db.prepare(`
            UPDATE implementations 
            SET pattern_type = coalesce(?, pattern_type),
                pattern_data = coalesce(?, pattern_data),
                success_rating = coalesce(?, success_rating)
            WHERE id = ?
        `);

        this.statements.delete = this.db.prepare(`
            DELETE FROM implementations WHERE id = ?
        `);
    }

    async create(impl: Omit<Implementation, 'id' | 'created_at'>): Promise<Implementation> {
        try {
            const id = uuidv4();
            const newImpl: Implementation = {
                id,
                ...impl,
                created_at: Date.now()
            };

            // Validate implementation data
            const validationResult = ImplementationSchema.safeParse(newImpl);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error.message);
            }

            if (!this.statements.create) {
                throw new DatabaseError('Create statement not initialized');
            }

            this.statements.create.run(
                newImpl.id,
                newImpl.task_id,
                newImpl.pattern_type,
                newImpl.pattern_data,
                newImpl.success_rating ?? null,
                newImpl.created_at
            );

            return newImpl;
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to create implementation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async findByTaskId(taskId: string): Promise<Implementation[]> {
        try {
            if (!this.statements.findByTaskId) {
                throw new DatabaseError('FindByTaskId statement not initialized');
            }

            const implementations = this.statements.findByTaskId.all(taskId);

            // Validate each implementation
            return implementations.map((impl: unknown) => {
                const validationResult = ImplementationSchema.safeParse(impl);
                if (!validationResult.success) {
                    throw new ValidationError(`Invalid implementation data in database: ${validationResult.error.message}`);
                }
                return impl as Implementation;
            });
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to find implementations: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async update(id: string, implUpdate: Partial<Implementation>): Promise<Implementation> {
        try {
            if (!this.statements.update) {
                throw new DatabaseError('Update statement not initialized');
            }

            // First check if the implementation exists
            const existingImpls = await this.findByTaskId(implUpdate.task_id ?? '');
            const existingImpl = existingImpls.find(impl => impl.id === id);
            
            if (!existingImpl) {
                throw new NotFoundError('Implementation', id);
            }

            const updatedImpl: Implementation = {
                ...existingImpl,
                ...implUpdate
            };

            // Validate updated implementation
            const validationResult = ImplementationSchema.safeParse(updatedImpl);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error.message);
            }

            this.statements.update.run(
                implUpdate.pattern_type ?? null,
                implUpdate.pattern_data ?? null,
                implUpdate.success_rating ?? null,
                id
            );

            return updatedImpl;
        } catch (error: unknown) {
            if (error instanceof ValidationError || error instanceof NotFoundError) {
                throw error;
            }
            throw new DatabaseError(`Failed to update implementation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            if (!this.statements.delete) {
                throw new DatabaseError('Delete statement not initialized');
            }

            // First check if the implementation exists
            const allImpls = await Promise.all(
                this.db.prepare('SELECT task_id FROM implementations WHERE id = ?').all(id)
                    .map(async (row: any) => this.findByTaskId(row.task_id))
            );
            
            const implExists = allImpls.flat().some(impl => impl.id === id);
            if (!implExists) {
                throw new NotFoundError('Implementation', id);
            }

            this.statements.delete.run(id);
        } catch (error: unknown) {
            if (error instanceof NotFoundError) {
                throw error;
            }
            throw new DatabaseError(`Failed to delete implementation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}