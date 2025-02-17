import { SimpleGit, simpleGit } from 'simple-git';
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
    private repoRoot: string;
    private mainBranch: string | null = null;

    constructor(db?: Database, gitBaseDir?: string) {
        const dbInstance = db || getDatabase();
        this.taskRepo = new SQLiteTaskRepository(dbInstance);
        this.codeLocationRepo = new SQLiteCodeLocationRepository(dbInstance);
        this.implRepo = new SQLiteImplementationRepository(dbInstance);

        // Get the repository root path
        this.repoRoot = gitBaseDir || this.getRepoRoot();
        this.git = simpleGit({
            baseDir: this.repoRoot,
            maxConcurrentProcesses: 1
        });
    }

    private getRepoRoot(): string {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        return join(__dirname, '..', '..');
    }

    private async getMainBranch(): Promise<string> {
        if (!this.mainBranch) {
            const branches = await this.git.branch();
            this.mainBranch = branches.current;
        }
        return this.mainBranch;
    }

    private async doesBranchExist(branchName: string): Promise<boolean> {
        try {
            const branches = await this.git.branch();
            return branches.all.includes(branchName);
        } catch {
            return false;
        }
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
            const branchName = `task/${createdTask.id}`;
            try {
                const mainBranch = await this.getMainBranch();
                await this.git.checkoutBranch(branchName, mainBranch);
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
                    const mainBranch = await this.getMainBranch();
                    await this.git.checkout(mainBranch);
                    await this.git.deleteLocalBranch(`task/${createdTask.id}`);
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

        const branchName = `task/${taskId}`;
        const mainBranch = await this.getMainBranch();

        // First update task status - do this regardless of Git operations
        await this.taskRepo.update(taskId, { status: TaskStatus.COMPLETED });

        // Check if the task branch exists
        const branchExists = await this.doesBranchExist(branchName);
        if (!branchExists) {
            // If no branch exists, task is already completed
            console.log(`No branch ${branchName} found - task marked as completed`);
            return;
        }

        try {
            // Get current branch to restore it later if needed
            const currentBranch = (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim();

            // Switch to main branch if not already there
            if (currentBranch !== mainBranch) {
                await this.git.checkout(mainBranch);
            }

            // Attempt to merge the task branch
            console.log(`Merging branch ${branchName} into ${mainBranch}...`);
            await this.git.merge([branchName]);

            // Delete the task branch (without force)
            console.log(`Deleting branch ${branchName}...`);
            await this.git.deleteLocalBranch(branchName);

            console.log('Task completed successfully');
        } catch (error) {
            console.error('Git operation failed:', error);

            // Try to abort any ongoing merge
            try {
                await this.git.merge(['--abort']);
            } catch (abortError) {
                console.error('Failed to abort merge:', abortError);
            }

            // Revert task status
            await this.taskRepo.update(taskId, { status: task.status });

            throw new GitError(
                `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}