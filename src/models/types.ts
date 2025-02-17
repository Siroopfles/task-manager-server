import { z } from 'zod';

// Task Status Enum
export const TaskStatus = {
    CREATED: 'created',
    IN_PROGRESS: 'in_progress',
    PAUSED: 'paused',
    COMPLETED: 'completed'
} as const;

// Zod Schemas for Validation
export const TaskSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.number().int().min(1).max(5),
    complexity: z.number().int().min(1).max(5),
    status: z.enum([
        TaskStatus.CREATED,
        TaskStatus.IN_PROGRESS,
        TaskStatus.PAUSED,
        TaskStatus.COMPLETED
    ]),
    created_at: z.number(),
    updated_at: z.number()
});

export const CodeLocationSchema = z.object({
    id: z.string().uuid(),
    task_id: z.string().uuid(),
    file_path: z.string(),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive().optional(),
    git_branch: z.string().optional(),
    git_commit: z.string().optional(),
    created_at: z.number()
});

export const ImplementationSchema = z.object({
    id: z.string().uuid(),
    task_id: z.string().uuid(),
    pattern_type: z.string(),
    pattern_data: z.string(),
    success_rating: z.number().min(0).max(1).optional(),
    created_at: z.number()
});

// TypeScript Types
export type Task = z.infer<typeof TaskSchema>;
export type CodeLocation = z.infer<typeof CodeLocationSchema>;
export type Implementation = z.infer<typeof ImplementationSchema>;

// Repository Interfaces
export interface TaskRepository {
    create(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task>;
    findById(id: string): Promise<Task | null>;
    findAll(filters?: Partial<Task>): Promise<Task[]>;
    update(id: string, task: Partial<Task>): Promise<Task>;
    delete(id: string): Promise<void>;
}

export interface CodeLocationRepository {
    create(location: Omit<CodeLocation, 'id' | 'created_at'>): Promise<CodeLocation>;
    findByTaskId(taskId: string): Promise<CodeLocation[]>;
    update(id: string, location: Partial<CodeLocation>): Promise<CodeLocation>;
    delete(id: string): Promise<void>;
}

export interface ImplementationRepository {
    create(impl: Omit<Implementation, 'id' | 'created_at'>): Promise<Implementation>;
    findByTaskId(taskId: string): Promise<Implementation[]>;
    update(id: string, impl: Partial<Implementation>): Promise<Implementation>;
    delete(id: string): Promise<void>;
}

// Error Types
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends Error {
    constructor(resource: string, id: string) {
        super(`${resource} with id ${id} not found`);
        this.name = 'NotFoundError';
    }
}

export class GitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitError';
    }
}

export class DatabaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseError';
    }
}