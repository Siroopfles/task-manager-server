import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { TaskService } from '../services/TaskService.js';
import { TaskStatus, ValidationError } from '../models/types.js';

const router = Router();
const taskService = new TaskService();

// Request type definitions
interface CreateTaskRequest extends Request {
    body: {
        title: string;
        description?: string;
        priority: number;
        complexity: number;
        initialCodeLocation?: {
            filePath: string;
            startLine: number;
            endLine?: number;
        };
    };
}

interface AddCodeLocationRequest extends Request {
    params: { id: string };
    body: {
        filePath: string;
        startLine: number;
        endLine?: number;
    };
}

interface RecordImplementationRequest extends Request {
    params: { id: string };
    body: {
        patternType: string;
        patternData: string;
        successRating?: number;
    };
}

// Validation middleware
const createTaskValidation = [
    body('title').notEmpty().trim().escape(),
    body('priority').isInt({ min: 1, max: 5 }),
    body('complexity').isInt({ min: 1, max: 5 }),
    body('description').optional().trim().escape(),
    body('initialCodeLocation')
        .optional()
        .isObject()
        .custom(value => {
            if (value) {
                if (!value.filePath || !value.startLine) {
                    throw new Error('Initial code location requires filePath and startLine');
                }
            }
            return true;
        })
];

const updateTaskValidation = [
    param('id').isUUID(),
    body('status').optional().isIn(Object.values(TaskStatus)),
    body('priority').optional().isInt({ min: 1, max: 5 }),
    body('complexity').optional().isInt({ min: 1, max: 5 }),
    body('description').optional().trim().escape()
];

// Validation error handler
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError(errors.array().map(err => err.msg).join(', '));
    }
    next();
};

// Create a new task
router.post('/', createTaskValidation, handleValidationErrors, async (req: CreateTaskRequest, res: Response, next: NextFunction) => {
    try {
        const task = await taskService.createTask({
            title: req.body.title,
            description: req.body.description,
            priority: req.body.priority,
            complexity: req.body.complexity,
            initialCodeLocation: req.body.initialCodeLocation
        });
        res.status(201).json(task);
    } catch (error) {
        next(error);
    }
});

// Get all tasks with optional status filter
router.get('/', [
    query('status').optional().isIn(Object.values(TaskStatus)),
    handleValidationErrors
], async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status = req.query.status as keyof typeof TaskStatus | undefined;
        const tasks = await taskService.findAll(status ? { status: TaskStatus[status] } : undefined);
        res.json(tasks);
    } catch (error) {
        next(error);
    }
});

// Get task by ID with details
router.get('/:id', [
    param('id').isUUID(),
    handleValidationErrors
], async (req: Request, res: Response, next: NextFunction) => {
    try {
        const taskDetails = await taskService.getTaskWithDetails(req.params.id);
        res.json(taskDetails);
    } catch (error) {
        next(error);
    }
});

// Add code location to task
router.post('/:id/locations', [
    param('id').isUUID(),
    body('filePath').notEmpty().trim(),
    body('startLine').isInt({ min: 1 }),
    body('endLine').optional().isInt({ min: 1 }),
    handleValidationErrors
], async (req: AddCodeLocationRequest, res: Response, next: NextFunction) => {
    try {
        const location = await taskService.addCodeLocation(req.params.id, {
            filePath: req.body.filePath,
            startLine: req.body.startLine,
            endLine: req.body.endLine
        });
        res.status(201).json(location);
    } catch (error) {
        next(error);
    }
});

// Record implementation for task
router.post('/:id/implementations', [
    param('id').isUUID(),
    body('patternType').notEmpty().trim(),
    body('patternData').notEmpty(),
    body('successRating').optional().isFloat({ min: 0, max: 1 }),
    handleValidationErrors
], async (req: RecordImplementationRequest, res: Response, next: NextFunction) => {
    try {
        const implementation = await taskService.recordImplementation(
            req.params.id,
            req.body.patternType,
            req.body.patternData,
            req.body.successRating
        );
        res.status(201).json(implementation);
    } catch (error) {
        next(error);
    }
});

// Complete task
router.post('/:id/complete', [
    param('id').isUUID(),
    handleValidationErrors
], async (req: Request, res: Response, next: NextFunction) => {
    try {
        await taskService.completeTask(req.params.id);
        res.status(200).json({ message: 'Task completed successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;