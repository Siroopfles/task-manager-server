import BetterSqlite3, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { CodeLocation, CodeLocationRepository, CodeLocationSchema, ValidationError, NotFoundError, DatabaseError } from '../models/types.js';
import { getDatabase } from '../database/schema.js';

export class SQLiteCodeLocationRepository implements CodeLocationRepository {
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
            INSERT INTO code_locations (id, task_id, file_path, start_line, end_line, git_branch, git_commit, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.statements.findByTaskId = this.db.prepare(`
            SELECT * FROM code_locations WHERE task_id = ?
        `);

        this.statements.update = this.db.prepare(`
            UPDATE code_locations 
            SET file_path = coalesce(?, file_path),
                start_line = coalesce(?, start_line),
                end_line = coalesce(?, end_line),
                git_branch = coalesce(?, git_branch),
                git_commit = coalesce(?, git_commit)
            WHERE id = ?
        `);

        this.statements.delete = this.db.prepare(`
            DELETE FROM code_locations WHERE id = ?
        `);
    }

    async create(location: Omit<CodeLocation, 'id' | 'created_at'>): Promise<CodeLocation> {
        try {
            const id = uuidv4();
            const newLocation: CodeLocation = {
                id,
                ...location,
                created_at: Date.now()
            };

            // Validate location data
            const validationResult = CodeLocationSchema.safeParse(newLocation);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error.message);
            }

            if (!this.statements.create) {
                throw new DatabaseError('Create statement not initialized');
            }

            this.statements.create.run(
                newLocation.id,
                newLocation.task_id,
                newLocation.file_path,
                newLocation.start_line,
                newLocation.end_line ?? null,
                newLocation.git_branch ?? null,
                newLocation.git_commit ?? null,
                newLocation.created_at
            );

            return newLocation;
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to create code location: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async findByTaskId(taskId: string): Promise<CodeLocation[]> {
        try {
            if (!this.statements.findByTaskId) {
                throw new DatabaseError('FindByTaskId statement not initialized');
            }

            const locations = this.statements.findByTaskId.all(taskId);

            // Validate each location
            return locations.map((location: unknown) => {
                const validationResult = CodeLocationSchema.safeParse(location);
                if (!validationResult.success) {
                    throw new ValidationError(`Invalid code location data in database: ${validationResult.error.message}`);
                }
                return location as CodeLocation;
            });
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to find code locations: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async update(id: string, locationUpdate: Partial<CodeLocation>): Promise<CodeLocation> {
        try {
            if (!this.statements.update) {
                throw new DatabaseError('Update statement not initialized');
            }

            // First check if the location exists
            const existingLocations = await this.findByTaskId(locationUpdate.task_id ?? '');
            const existingLocation = existingLocations.find(loc => loc.id === id);
            
            if (!existingLocation) {
                throw new NotFoundError('CodeLocation', id);
            }

            const updatedLocation: CodeLocation = {
                ...existingLocation,
                ...locationUpdate
            };

            // Validate updated location
            const validationResult = CodeLocationSchema.safeParse(updatedLocation);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error.message);
            }

            this.statements.update.run(
                locationUpdate.file_path ?? null,
                locationUpdate.start_line ?? null,
                locationUpdate.end_line ?? null,
                locationUpdate.git_branch ?? null,
                locationUpdate.git_commit ?? null,
                id
            );

            return updatedLocation;
        } catch (error: unknown) {
            if (error instanceof ValidationError || error instanceof NotFoundError) {
                throw error;
            }
            throw new DatabaseError(`Failed to update code location: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            if (!this.statements.delete) {
                throw new DatabaseError('Delete statement not initialized');
            }

            // First check if the location exists by getting all locations and finding the matching one
            // This is not the most efficient way, but it ensures we throw NotFoundError consistently
            const allLocations = await Promise.all(
                this.db.prepare('SELECT task_id FROM code_locations WHERE id = ?').all(id)
                    .map(async (row: any) => this.findByTaskId(row.task_id))
            );
            
            const locationExists = allLocations.flat().some(loc => loc.id === id);
            if (!locationExists) {
                throw new NotFoundError('CodeLocation', id);
            }

            this.statements.delete.run(id);
        } catch (error: unknown) {
            if (error instanceof NotFoundError) {
                throw error;
            }
            throw new DatabaseError(`Failed to delete code location: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}