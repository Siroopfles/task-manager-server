import BetterSqlite3, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskRepository, TaskSchema, ValidationError, NotFoundError, DatabaseError } from '../models/types.js';
import { getDatabase } from '../database/schema.js';

export class SQLiteTaskRepository implements TaskRepository {
    private db: BetterSqlite3Database;
    private statements: {
        create: BetterSqlite3.Statement | undefined;
        findById: BetterSqlite3.Statement | undefined;
        update: BetterSqlite3.Statement | undefined;
        delete: BetterSqlite3.Statement | undefined;
    } = {
        create: undefined,
        findById: undefined,
        update: undefined,
        delete: undefined
    };

    constructor(db?: BetterSqlite3Database) {
        this.db = db || getDatabase();
        this.setupPreparedStatements();
    }

    private setupPreparedStatements(): void {
        this.statements.create = this.db.prepare(`
            INSERT INTO tasks (id, title, description, priority, complexity, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.statements.findById = this.db.prepare(`
            SELECT * FROM tasks WHERE id = ?
        `);

        this.statements.update = this.db.prepare(`
            UPDATE tasks 
            SET title = coalesce(?, title),
                description = coalesce(?, description),
                priority = coalesce(?, priority),
                complexity = coalesce(?, complexity),
                status = coalesce(?, status),
                updated_at = ?
            WHERE id = ?
        `);

        this.statements.delete = this.db.prepare(`
            DELETE FROM tasks WHERE id = ?
        `);
    }

    async create(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
        try {
            const now = Date.now();
            const id = uuidv4();
            const newTask: Task = {
                id,
                ...task,
                created_at: now,
                updated_at: now
            };

            // Validate task data
            const validationResult = TaskSchema.safeParse(newTask);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error.message);
            }

            if (!this.statements.create) {
                throw new DatabaseError('Create statement not initialized');
            }

            this.statements.create.run(
                newTask.id,
                newTask.title,
                newTask.description,
                newTask.priority,
                newTask.complexity,
                newTask.status,
                newTask.created_at,
                newTask.updated_at
            );

            return newTask;
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async findById(id: string): Promise<Task | null> {
        try {
            if (!this.statements.findById) {
                throw new DatabaseError('FindById statement not initialized');
            }

            const task = this.statements.findById.get(id);
            if (!task) {
                return null;
            }
            const validationResult = TaskSchema.safeParse(task);
            if (!validationResult.success) {
                throw new ValidationError(`Invalid task data in database: ${validationResult.error.message}`);
            }
            return task as Task;
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to find task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async findAll(filters: Partial<Task> = {}): Promise<Task[]> {
        try {
            let query = 'SELECT * FROM tasks WHERE 1=1';
            const params: any[] = [];

            // Build dynamic query based on filters
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined) {
                    query += ` AND ${key} = ?`;
                    params.push(value);
                }
            });

            const stmt = this.db.prepare(query);
            const tasks = stmt.all(...params);

            // Validate each task
            return tasks.map((task: unknown) => {
                const validationResult = TaskSchema.safeParse(task);
                if (!validationResult.success) {
                    throw new ValidationError(`Invalid task data in database: ${validationResult.error.message}`);
                }
                return task as Task;
            });
        } catch (error: unknown) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new DatabaseError(`Failed to find tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async update(id: string, taskUpdate: Partial<Task>): Promise<Task> {
        try {
            if (!this.statements.update) {
                throw new DatabaseError('Update statement not initialized');
            }

            const existingTask = await this.findById(id);
            if (!existingTask) {
                throw new NotFoundError('Task', id);
            }

            const updatedTask: Task = {
                ...existingTask,
                ...taskUpdate,
                updated_at: Date.now()
            };

            // Validate updated task
            const validationResult = TaskSchema.safeParse(updatedTask);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error.message);
            }

            this.statements.update.run(
                taskUpdate.title ?? null,
                taskUpdate.description ?? null,
                taskUpdate.priority ?? null,
                taskUpdate.complexity ?? null,
                taskUpdate.status ?? null,
                updatedTask.updated_at,
                id
            );

            return updatedTask;
        } catch (error: unknown) {
            if (error instanceof ValidationError || error instanceof NotFoundError) {
                throw error;
            }
            throw new DatabaseError(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            if (!this.statements.delete) {
                throw new DatabaseError('Delete statement not initialized');
            }

            const existingTask = await this.findById(id);
            if (!existingTask) {
                throw new NotFoundError('Task', id);
            }

            this.statements.delete.run(id);
        } catch (error: unknown) {
            if (error instanceof NotFoundError) {
                throw error;
            }
            throw new DatabaseError(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}