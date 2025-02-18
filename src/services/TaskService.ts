import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Database } from 'better-sqlite3';
import {
    Task,
    CodeLocation,
    Implementation,
    TaskStatus,
    ValidationError,
    GitError,
    DatabaseError,
    NotFoundError
} from '../models/types.js';
import { SQLiteTaskRepository } from '../repositories/TaskRepository.js';
import { SQLiteCodeLocationRepository } from '../repositories/CodeLocationRepository.js';
import { SQLiteImplementationRepository } from '../repositories/ImplementationRepository.js';
import { getDatabase } from '../database/schema.js';
import { GitService, RealGitService } from './GitService.js';

interface CreateTaskOptions {
    title: string;
    description?: string;
    priority: number;
    complexity: number;
    initialCodeLocation?: {
        filePath: string;
        startLine: number;
        endLine?: number;
    };
}

export class TaskService {
    private taskRepo: SQLiteTaskRepository;
    private codeLocationRepo: SQLiteCodeLocationRepository;
    private implRepo: SQLiteImplementationRepository;
    private gitService: GitService;

    constructor(db?: Database, gitServiceOrPath?: GitService | string) {
        // Handle database initialization
        const dbInstance = db || getDatabase();
        
        this.taskRepo = new SQLiteTaskRepository(dbInstance);
        this.codeLocationRepo = new SQLiteCodeLocationRepository(dbInstance);
        this.implRepo = new SQLiteImplementationRepository(dbInstance);

        // Handle Git service initialization
        if (!gitServiceOrPath) {
            const repoRoot = this.getRepoRoot();
            this.gitService = new RealGitService(repoRoot);
        } else if (typeof gitServiceOrPath === 'string') {
            this.gitService = new RealGitService(gitServiceOrPath);
        } else {
            this.gitService = gitServiceOrPath;
        }
    }

    private getRepoRoot(): string {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        return join(__dirname, '..', '..');
    }

    async findAll(filters?: Partial<Task>): Promise<Task[]> {
        return this.taskRepo.findAll(filters);
    }

    async updateTaskStatus(taskId: string, status: keyof typeof TaskStatus): Promise<Task> {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
            throw new NotFoundError('Task', taskId);
        }
        return this.taskRepo.update(taskId, { status: TaskStatus[status] });
    }

    async createTask(options: CreateTaskOptions): Promise<Task> {
        let createdTask: Task | null = null;
        try {
            // Create a new task
            createdTask = await this.taskRepo.create({
                title: options.title,
                description: options.description,
                priority: options.priority,
                complexity: options.complexity,
                status: TaskStatus.CREATED
            });

            // Create a Git branch for the task
            await this.gitService.createBranch(createdTask.id);

            // If initial code location is provided, track it
            if (options.initialCodeLocation) {
                await this.codeLocationRepo.create({
                    task_id: createdTask.id,
                    file_path: options.initialCodeLocation.filePath,
                    start_line: options.initialCodeLocation.startLine,
                    end_line: options.initialCodeLocation.endLine,
                    git_branch: `task/${createdTask.id}`
                });
            }

            return createdTask;
        } catch (error) {
            // Clean up Git branch if task creation fails
            if (error instanceof GitError && createdTask) {
                try {
                    await this.gitService.cleanupBranch(`task/${createdTask.id}`);
                } catch {
                    // Ignore cleanup errors
                }
            }
            throw error;
        }
    }

    async addCodeLocation(taskId: string, location: {
        filePath: string;
        startLine: number;
        endLine?: number;
    }): Promise<CodeLocation> {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
            throw new NotFoundError('Task', taskId);
        }

        const branchName = `task/${taskId}`;
        try {
            const currentBranch = await this.gitService.getCurrentBranch();
            if (currentBranch !== branchName) {
                throw new GitError(`Must be on task branch ${branchName} to add code location`);
            }

            return this.codeLocationRepo.create({
                task_id: taskId,
                file_path: location.filePath,
                start_line: location.startLine,
                end_line: location.endLine,
                git_branch: branchName
            });
        } catch (error) {
            if (error instanceof GitError) {
                throw error;
            }
            throw new DatabaseError(`Failed to add code location: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async recordImplementation(taskId: string, patternType: string, patternData: string, successRating?: number): Promise<Implementation> {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
            throw new NotFoundError('Task', taskId);
        }

        return this.implRepo.create({
            task_id: taskId,
            pattern_type: patternType,
            pattern_data: patternData,
            success_rating: successRating
        });
    }

    async getTaskWithDetails(taskId: string): Promise<{
        task: Task;
        codeLocations: CodeLocation[];
        implementations: Implementation[];
    }> {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
            throw new NotFoundError('Task', taskId);
        }

        const [codeLocations, implementations] = await Promise.all([
            this.codeLocationRepo.findByTaskId(taskId),
            this.implRepo.findByTaskId(taskId)
        ]);

        return {
            task,
            codeLocations,
            implementations
        };
    }

    async completeTask(taskId: string): Promise<void> {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
            throw new NotFoundError('Task', taskId);
        }

        try {
            await this.gitService.completeTask(taskId);
            await this.taskRepo.update(taskId, { status: TaskStatus.COMPLETED });
        } catch (error) {
            await this.taskRepo.update(taskId, { status: task.status });
            throw error;
        }
    }
}