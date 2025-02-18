import { SimpleGit, simpleGit } from 'simple-git';
import { join } from 'path';
import { GitError } from '../models/types.js';

export interface GitService {
    createBranch(taskId: string): Promise<void>;
    cleanupBranch(branchName: string): Promise<void>;
    getCurrentBranch(): Promise<string>;
    completeTask(taskId: string): Promise<void>;
}

export class RealGitService implements GitService {
    private git: SimpleGit;
    private mainBranch: string | null = null;
    
    constructor(repoRoot: string) {
        this.git = simpleGit({
            baseDir: repoRoot,
            maxConcurrentProcesses: 1
        });
    }

    private async getMainBranch(): Promise<string> {
        if (!this.mainBranch) {
            const branches = await this.git.branch();
            this.mainBranch = branches.current;
        }
        return this.mainBranch;
    }

    async createBranch(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        try {
            const mainBranch = await this.getMainBranch();
            await this.git.checkoutBranch(branchName, mainBranch);
        } catch (error) {
            throw new GitError(`Failed to create branch ${branchName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async cleanupBranch(branchName: string): Promise<void> {
        try {
            const mainBranch = await this.getMainBranch();
            await this.git.checkout(mainBranch);
            await this.git.deleteLocalBranch(branchName, true); // Force delete
        } catch (error) {
            throw new GitError(`Failed to cleanup branch ${branchName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getCurrentBranch(): Promise<string> {
        const currentBranch = (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        return currentBranch;
    }

    async completeTask(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        const mainBranch = await this.getMainBranch();

        try {
            // Switch to main branch if not already there
            const currentBranch = await this.getCurrentBranch();
            if (currentBranch !== mainBranch) {
                await this.git.checkout(mainBranch);
            }

            // Attempt to merge the task branch
            console.log(`Merging branch ${branchName} into ${mainBranch}...`);
            await this.git.merge([branchName]);

            // Delete the task branch
            console.log(`Deleting branch ${branchName}...`);
            await this.git.deleteLocalBranch(branchName, true); // Force delete

            console.log('Task completed successfully');
        } catch (error) {
            // Try to abort any ongoing merge
            try {
                await this.git.merge(['--abort']);
            } catch (abortError) {
                console.error('Failed to abort merge:', abortError);
            }

            throw new GitError(
                `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}

export class MockGitService implements GitService {
    private currentBranch: string = 'master';
    private branches: Set<string> = new Set(['master']);
    private commits: Map<string, string> = new Map(); // branch -> commit hash

    async createBranch(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        this.branches.add(branchName);
        this.currentBranch = branchName;
        // Add a mock commit hash for the branch
        this.commits.set(branchName, `mock-commit-${Math.random().toString(36).substr(2, 9)}`);
    }

    async cleanupBranch(branchName: string): Promise<void> {
        this.branches.delete(branchName);
        this.commits.delete(branchName);
        this.currentBranch = 'master';
    }

    async getCurrentBranch(): Promise<string> {
        return this.currentBranch;
    }

    getCurrentCommit(): string {
        return this.commits.get(this.currentBranch) || 'mock-commit-initial';
    }

    async completeTask(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        if (!this.branches.has(branchName)) {
            throw new GitError(`Branch ${branchName} not found`);
        }

        // Mock merging by copying commit to master
        const branchCommit = this.commits.get(branchName);
        if (branchCommit) {
            this.commits.set('master', branchCommit);
        }

        // Cleanup the branch
        this.branches.delete(branchName);
        this.commits.delete(branchName);
        this.currentBranch = 'master';
    }
}