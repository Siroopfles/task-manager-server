import express from 'express';
import { MachineLearningService } from '../services/MachineLearningService.js';
import { SQLiteImplementationRepository } from '../repositories/ImplementationRepository.js';
import { TaskService } from '../services/TaskService.js';
import { ValidationError } from '../models/types.js';
import { analysisLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const implRepo = new SQLiteImplementationRepository();
const mlService = new MachineLearningService(implRepo);

/**
 * @swagger
 * /analysis/predict:
 *   post:
 *     summary: Predict success rate for a proposed implementation
 *     tags: [Analysis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               taskId:
 *                 type: string
 *                 format: uuid
 *               proposedPattern:
 *                 type: string
 *             required:
 *               - taskId
 *               - proposedPattern
 *     responses:
 *       200:
 *         description: Success prediction and recommendations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 predictedSuccessRate:
 *                   type: number
 *                   minimum: 0
 *                   maximum: 1
 *                 confidence:
 *                   type: number
 *                   minimum: 0
 *                   maximum: 1
 *                 suggestedPatterns:
 *                   type: array
 *                   items:
 *                     type: string
 *                 riskFactors:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.post('/predict', analysisLimiter, async (req, res, next) => {
    try {
        const { taskId, proposedPattern } = req.body;
        if (!taskId || !proposedPattern) {
            throw new ValidationError('Missing required fields');
        }

        const taskService = new TaskService();
        const { task, codeLocations } = await taskService.getTaskWithDetails(taskId);

        const prediction = await mlService.predictSuccess(task, proposedPattern, codeLocations);
        res.json(prediction);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /analysis/patterns:
 *   get:
 *     summary: Get pattern analysis including clusters and trends
 *     tags: [Analysis]
 *     responses:
 *       200:
 *         description: Pattern analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clusters:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: string
 *                 emergingPatterns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       pattern:
 *                         type: string
 *                       trend:
 *                         type: string
 *                         enum: [rising, stable, declining]
 *                       confidence:
 *                         type: number
 */
router.get('/patterns', analysisLimiter, async (req, res, next) => {
    try {
        const [clusters, emergingPatterns] = await Promise.all([
            mlService.analyzePatternClusters(),
            mlService.identifyEmergingPatterns()
        ]);

        res.json({
            clusters: Object.fromEntries(clusters),
            emergingPatterns
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /analysis/train:
 *   post:
 *     summary: Train the machine learning model with current data
 *     tags: [Analysis]
 *     responses:
 *       200:
 *         description: Model training completed
 */
router.post('/train', analysisLimiter, async (req, res, next) => {
    try {
        await mlService.trainModel();
        res.json({ message: 'Model training completed successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;