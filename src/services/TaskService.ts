import { SimpleGit, simpleGit } from 'simple-git';
import {
    Task,
    CodeLocation,
    Implementation,
    TaskStatus,
    ValidationError,
    GitError,
    DatabaseError
} from '../models/types.js';
import { SQLiteTaskRepository } from '../repositories/TaskRepository.js';
import { SQLiteCodeLocationRepository } from '../repositories/CodeLocationRepository.js';
import { SQLiteImplementationRepository } from '../repositories/ImplementationRepository.js';

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
    private git: SimpleGit;

    constructor() {
        this.taskRepo = new SQLiteTaskRepository();
        this.codeLocationRepo = new SQLiteCodeLocationRepository();
        this.implRepo = new SQLiteImplementationRepository();
        this.git = simpleGit();
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
            const branchName = `task/${createdTask.id}`;
            try {
                await this.git.checkoutLocalBranch(branchName);
            } catch (error) {
                throw new GitError(`Failed to create branch ${branchName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            // If initial code location is provided, track it
            if (options.initialCodeLocation) {
                await this.codeLocationRepo.create({
                    task_id: createdTask.id,
                    file_path: options.initialCodeLocation.filePath,
                    start_line: options.initialCodeLocation.startLine,
                    end_line: options.initialCodeLocation.endLine,
                    git_branch: branchName
                });
            }

            return createdTask;
        } catch (error) {
            // Clean up Git branch if task creation fails
            if (error instanceof GitError && createdTask) {
                try {
                    await this.git.deleteLocalBranch(`task/${createdTask.id}`, true);
                } catch {
                    // Ignore cleanup errors
                }
            }
            throw error;
        }
    }

    async updateTaskStatus(taskId: string, status: keyof typeof TaskStatus): Promise<Task> {
        // Access the value using TaskStatus[status]
        const statusValue = TaskStatus[status];
        return this.taskRepo.update(taskId, { status: statusValue });
    }

    async addCodeLocation(taskId: string, location: {
        filePath: string;
        startLine: number;
        endLine?: number;
    }): Promise<CodeLocation> {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
            throw new ValidationError(`Task ${taskId} not found`);
        }

        const branchName = `task/${taskId}`;
        try {
            const currentBranch = (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim();
            if (currentBranch !== branchName) {
                throw new GitError(`Must be on task branch ${branchName} to add code location`);
            }

            const commit = (await this.git.revparse(['HEAD'])).trim();
            return this.codeLocationRepo.create({
                task_id: taskId,
                file_path: location.filePath,
                start_line: location.startLine,
                end_line: location.endLine,
                git_branch: branchName,
                git_commit: commit
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
            throw new ValidationError(`Task ${taskId} not found`);
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
            throw new ValidationError(`Task ${taskId} not found`);
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
            throw new ValidationError(`Task ${taskId} not found`);
        }

        const branchName = `task/${taskId}`;
        try {
            // Update task status
            await this.taskRepo.update(taskId, { status: TaskStatus.COMPLETED });

            // Get the main branch name (could be main or master)
            const mainBranch = (await this.git.branch()).current;

            // Attempt to merge the task branch
            await this.git.checkout(mainBranch);
            await this.git.merge([branchName]);

            // Delete the task branch after successful merge
            await this.git.deleteLocalBranch(branchName, true);
        } catch (error) {
            if (error instanceof GitError) {
                // Revert status update if Git operations fail
                await this.taskRepo.update(taskId, { status: task.status });
                throw error;
            }
            throw new DatabaseError(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}