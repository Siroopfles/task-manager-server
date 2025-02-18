import { Implementation, ImplementationRepository } from '../../models/types.js';
import { NotFoundError } from '../../models/types.js';

export class MockImplementationRepository implements ImplementationRepository {
    private implementations: Implementation[] = [];

    async getAllImplementations(): Promise<Implementation[]> {
        return this.implementations;
    }

    async findByTaskId(taskId: string): Promise<Implementation[]> {
        return this.implementations.filter(impl => impl.task_id === taskId);
    }

    async create(impl: Omit<Implementation, 'id' | 'created_at'>): Promise<Implementation> {
        const newImpl: Implementation = {
            ...impl,
            id: Math.random().toString(36).substr(2, 9),
            created_at: Date.now()
        };
        this.implementations.push(newImpl);
        return newImpl;
    }

    async update(id: string, implUpdate: Partial<Implementation>): Promise<Implementation> {
        const existingImpl = this.implementations.find(i => i.id === id);
        if (!existingImpl) {
            throw new NotFoundError('Implementation', id);
        }

        const updatedImpl = { ...existingImpl, ...implUpdate };
        const index = this.implementations.findIndex(i => i.id === id);
        this.implementations[index] = updatedImpl;
        return updatedImpl;
    }

    async delete(id: string): Promise<void> {
        const index = this.implementations.findIndex(i => i.id === id);
        if (index === -1) {
            throw new NotFoundError('Implementation', id);
        }
        this.implementations.splice(index, 1);
    }

    // Test helper methods
    setImplementations(impls: Implementation[]): void {
        this.implementations = [...impls];
    }

    clearImplementations(): void {
        this.implementations = [];
    }

    // Test helper to access implementation data
    _getImplementationById(id: string): Implementation | null {
        return this.implementations.find(i => i.id === id) || null;
    }
}