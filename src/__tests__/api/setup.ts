import { Express } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from '../../middleware/errorHandler.js';
import { TaskService } from '../../services/TaskService.js';
import { SQLiteTaskRepository } from '../../repositories/TaskRepository.js';
import { SQLiteCodeLocationRepository } from '../../repositories/CodeLocationRepository.js';
import { SQLiteImplementationRepository } from '../../repositories/ImplementationRepository.js';
import { MockGitService } from '../../services/GitService.js';
import Database from 'better-sqlite3';
import { schema } from '../../database/schema.js';
import taskRouter from '../../routes/tasks.js';

export function createTestApp(): { 
    app: Express, 
    db: Database.Database,
    taskService: TaskService,
    gitService: MockGitService 
} {
    // Create in-memory test database
    const db = new Database(':memory:');
    
    // Initialize schema
    for (const createStatement of schema) {
        db.exec(createStatement);
    }

    // Create mock Git service
    const gitService = new MockGitService();

    // Create repositories
    const taskRepo = new SQLiteTaskRepository(db);
    const codeLocationRepo = new SQLiteCodeLocationRepository(db);
    const implRepo = new SQLiteImplementationRepository(db);

    // Create TaskService with mock Git service
    const taskService = new TaskService(db, gitService);

    // Create Express app with test configuration
    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(morgan('dev'));

    // Override taskService in routes
    app.use('/api/tasks', (req, res, next) => {
        (req as any).taskService = taskService;
        next();
    }, taskRouter);

    app.use(errorHandler);

    return { app, db, taskService, gitService };
}