import express from 'express';
import { TaskService } from '../services/TaskService.js';
import { ValidationError } from '../models/types.js';

const router = express.Router();

/**
 * @swagger
 * /tasks:
 *   get:
 *     summary: Get all tasks
 *     tags: [Tasks]
 *     responses:
 *       200:
 *         description: List of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 */
router.get('/', async (req, res, next) => {
    try {
        const taskService = new TaskService();
        const tasks = await taskService.findAll();
        res.json(tasks);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /tasks/{id}:
 *   get:
 *     summary: Get task by ID
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task details with code locations and implementations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *                 codeLocations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CodeLocation'
 *                 implementations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Implementation'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', async (req, res, next) => {
    try {
        const taskService = new TaskService();
        const details = await taskService.getTaskWithDetails(req.params.id);
        res.json(details);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               complexity:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               initialCodeLocation:
 *                 type: object
 *                 properties:
 *                   filePath:
 *                     type: string
 *                   startLine:
 *                     type: number
 *                   endLine:
 *                     type: number
 *             required:
 *               - title
 *               - priority
 *               - complexity
 *     responses:
 *       201:
 *         description: Created task
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', async (req, res, next) => {
    try {
        if (!req.body.title || !req.body.priority || !req.body.complexity) {
            throw new ValidationError('Missing required fields');
        }

        const taskService = new TaskService();
        const task = await taskService.createTask(req.body);
        res.status(201).json(task);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /tasks/{id}/locations:
 *   post:
 *     summary: Add a code location to a task
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filePath:
 *                 type: string
 *               startLine:
 *                 type: number
 *               endLine:
 *                 type: number
 *             required:
 *               - filePath
 *               - startLine
 *     responses:
 *       201:
 *         description: Created code location
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CodeLocation'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/locations', async (req, res, next) => {
    try {
        if (!req.body.filePath || !req.body.startLine) {
            throw new ValidationError('Missing required fields');
        }

        const taskService = new TaskService();
        const location = await taskService.addCodeLocation(req.params.id, req.body);
        res.status(201).json(location);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /tasks/{id}/implementations:
 *   post:
 *     summary: Record an implementation pattern for a task
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patternType:
 *                 type: string
 *               patternData:
 *                 type: string
 *               successRating:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *             required:
 *               - patternType
 *               - patternData
 *     responses:
 *       201:
 *         description: Created implementation record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Implementation'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/implementations', async (req, res, next) => {
    try {
        if (!req.body.patternType || !req.body.patternData) {
            throw new ValidationError('Missing required fields');
        }

        const taskService = new TaskService();
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

/**
 * @swagger
 * /tasks/{id}/complete:
 *   post:
 *     summary: Mark a task as completed and merge its branch
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task completed successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/complete', async (req, res, next) => {
    try {
        const taskService = new TaskService();
        await taskService.completeTask(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        next(error);
    }
});

export default router;