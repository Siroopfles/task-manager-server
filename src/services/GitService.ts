import { SimpleGit, simpleGit } from 'simple-git';
import { join } from 'path';
import { GitError } from '../models/types.js';

export interface GitService {
    createBranch(taskId: string): Promise<void>;
    cleanupBranch(branchName: string): Promise<void>;
    getCurrentBranch(): Promise<string>;
    completeTask(taskId: string): Promise<void>;
    // Advanced Git operations
    cherryPickCommit(commit: string, branch: string): Promise<void>;
    rebaseBranch(sourceBranch: string, targetBranch: string): Promise<void>;
    stashChanges(description?: string): Promise<void>;
    popStash(): Promise<void>;
    getBranchStatus(): Promise<BranchStatus>;
    resolveConflicts(strategy: ConflictResolutionStrategy): Promise<void>;
    getFileHistory(filePath: string): Promise<CommitInfo[]>;
}

export interface BranchStatus {
    isClean: boolean;
    modified: string[];
    staged: string[];
    untracked: string[];
    conflicts: string[];
}

export interface CommitInfo {
    hash: string;
    date: Date;
    message: string;
    author: string;
}

export enum ConflictResolutionStrategy {
    ACCEPT_OURS = 'ours',
    ACCEPT_THEIRS = 'theirs',
    MANUAL = 'manual'
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
            // Check if we need to stash changes
            const status = await this.getBranchStatus();
            if (!status.isClean) {
                await this.stashChanges(`Auto-stash before branch cleanup`);
            }

            const mainBranch = await this.getMainBranch();
            await this.git.checkout(mainBranch);
            await this.git.deleteLocalBranch(branchName, true);

            // Restore stashed changes if needed
            if (!status.isClean) {
                await this.popStash();
            }
        } catch (error) {
            throw new GitError(`Failed to cleanup branch ${branchName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getCurrentBranch(): Promise<string> {
        const currentBranch = (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        return currentBranch;
    }

    async cherryPickCommit(commit: string, branch: string): Promise<void> {
        try {
            const currentBranch = await this.getCurrentBranch();
            await this.git.checkout(branch);
            await this.git.raw(['cherry-pick', commit]);
            await this.git.checkout(currentBranch);
        } catch (error) {
            // Abort cherry-pick if it failed
            try {
                await this.git.raw(['cherry-pick', '--abort']);
            } catch {
                // Ignore abort errors
            }
            throw new GitError(`Failed to cherry-pick commit ${commit}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async rebaseBranch(sourceBranch: string, targetBranch: string): Promise<void> {
        try {
            await this.git.checkout(sourceBranch);
            await this.git.rebase([targetBranch]);
        } catch (error) {
            // Abort rebase if it failed
            try {
                await this.git.rebase(['--abort']);
            } catch {
                // Ignore abort errors
            }
            throw new GitError(`Failed to rebase ${sourceBranch} onto ${targetBranch}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async stashChanges(description?: string): Promise<void> {
        try {
            const args = description ? ['save', description] : [];
            await this.git.stash(args);
        } catch (error) {
            throw new GitError(`Failed to stash changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async popStash(): Promise<void> {
        try {
            await this.git.stash(['pop']);
        } catch (error) {
            throw new GitError(`Failed to pop stash: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getBranchStatus(): Promise<BranchStatus> {
        try {
            const status = await this.git.status();
            return {
                isClean: status.isClean(),
                modified: status.modified,
                staged: status.staged,
                untracked: status.not_added,
                conflicts: status.conflicted
            };
        } catch (error) {
            throw new GitError(`Failed to get branch status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async resolveConflicts(strategy: ConflictResolutionStrategy): Promise<void> {
        try {
            const status = await this.getBranchStatus();
            if (status.conflicts.length === 0) {
                return;
            }

            switch (strategy) {
                case ConflictResolutionStrategy.ACCEPT_OURS:
                    await this.git.raw(['checkout', '--ours', ...status.conflicts]);
                    await this.git.add(status.conflicts);
                    break;
                case ConflictResolutionStrategy.ACCEPT_THEIRS:
                    await this.git.raw(['checkout', '--theirs', ...status.conflicts]);
                    await this.git.add(status.conflicts);
                    break;
                case ConflictResolutionStrategy.MANUAL:
                    throw new GitError('Manual conflict resolution required');
            }
        } catch (error) {
            throw new GitError(`Failed to resolve conflicts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getFileHistory(filePath: string): Promise<CommitInfo[]> {
        try {
            const log = await this.git.log({
                file: filePath,
                maxCount: 50
            });

            return log.all.map(commit => ({
                hash: commit.hash,
                date: new Date(commit.date),
                message: commit.message,
                author: commit.author_name
            }));
        } catch (error) {
            throw new GitError(`Failed to get file history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async completeTask(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        const mainBranch = await this.getMainBranch();

        try {
            // Get branch status before switching
            const status = await this.getBranchStatus();
            if (!status.isClean) {
                await this.stashChanges(`Auto-stash before completing task ${taskId}`);
            }

            // Switch to main branch if not already there
            const currentBranch = await this.getCurrentBranch();
            if (currentBranch !== mainBranch) {
                await this.git.checkout(mainBranch);
            }

            // Update main branch
            await this.git.pull();

            // Try to rebase task branch on updated main
            await this.git.checkout(branchName);
            await this.rebaseBranch(branchName, mainBranch);

            // Switch back to main and merge
            await this.git.checkout(mainBranch);
            console.log(`Merging branch ${branchName} into ${mainBranch}...`);
            await this.git.merge([branchName]);

            // Restore stashed changes if needed
            if (!status.isClean) {
                await this.popStash();
            }

            // Delete the task branch
            console.log(`Deleting branch ${branchName}...`);
            await this.git.deleteLocalBranch(branchName, true);

            console.log('Task completed successfully');
        } catch (error) {
            // Try to abort any ongoing operations
            try {
                await this.git.merge(['--abort']);
                await this.git.rebase(['--abort']);
            } catch (abortError) {
                console.error('Failed to abort operations:', abortError);
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
    private commits: Map<string, string> = new Map();
    private stash: { changes: string; description?: string }[] = [];

    async createBranch(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        this.branches.add(branchName);
        this.currentBranch = branchName;
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

    async cherryPickCommit(commit: string, branch: string): Promise<void> {
        if (!this.branches.has(branch)) {
            throw new GitError(`Branch ${branch} not found`);
        }
        this.commits.set(branch, commit);
    }

    async rebaseBranch(sourceBranch: string, targetBranch: string): Promise<void> {
        if (!this.branches.has(sourceBranch) || !this.branches.has(targetBranch)) {
            throw new GitError('Branch not found');
        }
    }

    async stashChanges(description?: string): Promise<void> {
        this.stash.push({ changes: 'mock-changes', description });
    }

    async popStash(): Promise<void> {
        if (this.stash.length === 0) {
            throw new GitError('No stash entries found');
        }
        this.stash.pop();
    }

    async getBranchStatus(): Promise<BranchStatus> {
        return {
            isClean: true,
            modified: [],
            staged: [],
            untracked: [],
            conflicts: []
        };
    }

    async resolveConflicts(strategy: ConflictResolutionStrategy): Promise<void> {
        // Mock implementation - just succeed
    }

    async getFileHistory(filePath: string): Promise<CommitInfo[]> {
        return [
            {
                hash: 'mock-hash-1',
                date: new Date(),
                message: 'Mock commit 1',
                author: 'Mock Author'
            }
        ];
    }

    async completeTask(taskId: string): Promise<void> {
        const branchName = `task/${taskId}`;
        if (!this.branches.has(branchName)) {
            throw new GitError(`Branch ${branchName} not found`);
        }

        const branchCommit = this.commits.get(branchName);
        if (branchCommit) {
            this.commits.set('master', branchCommit);
        }

        this.branches.delete(branchName);
        this.commits.delete(branchName);
        this.currentBranch = 'master';
    }
}