import express from 'express';
import { TaskService } from '../services/TaskService.js';
import { ValidationError } from '../models/types.js';
import { ReportingService } from '../services/ReportingService.js';
import { SQLiteTaskRepository } from '../repositories/TaskRepository.js';
import { SQLiteImplementationRepository } from '../repositories/ImplementationRepository.js';
import { SQLiteCodeLocationRepository } from '../repositories/CodeLocationRepository.js';
import { MachineLearningService } from '../services/MachineLearningService.js';
import { reportsLimiter, performanceReportLimiter } from '../middleware/rateLimiter.js';
import { CacheService, reportCache } from '../services/CacheService.js';

const router = express.Router();

// Initialize repositories and services
const taskRepo = new SQLiteTaskRepository();
const implRepo = new SQLiteImplementationRepository();
const codeLocRepo = new SQLiteCodeLocationRepository();
const mlService = new MachineLearningService(implRepo);
const reportingService = new ReportingService(taskRepo, implRepo, codeLocRepo, mlService);

/**
 * @swagger
 * /reports/success:
 *   get:
 *     summary: Get success rate report
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: number
 *         description: Start timestamp for the report period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: number
 *         description: End timestamp for the report period
 *     responses:
 *       200:
 *         description: Success rate report
 */
router.get('/success', reportsLimiter, async (req, res, next) => {
    try {
        const timeframe = req.query.startDate && req.query.endDate ? {
            startDate: Number(req.query.startDate),
            endDate: Number(req.query.endDate)
        } : undefined;

        // Try to get from cache
        const cacheKey = CacheService.generateReportKey('success', timeframe);
        const cachedReport = reportCache.get(cacheKey);
        
        if (cachedReport) {
            res.json(cachedReport);
            return;
        }

        // Generate new report
        const report = await reportingService.generateSuccessRateReport(timeframe);
        
        // Convert Map to object for JSON serialization
        const response = {
            ...report,
            patternSuccessRates: Object.fromEntries(report.patternSuccessRates)
        };

        // Cache the response
        reportCache.set(cacheKey, response);

        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /reports/patterns:
 *   get:
 *     summary: Get pattern analysis report
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Pattern analysis report
 */
router.get('/patterns', reportsLimiter, async (req, res, next) => {
    try {
        // Try to get from cache
        const cacheKey = CacheService.generateReportKey('patterns');
        const cachedReport = reportCache.get(cacheKey);
        
        if (cachedReport) {
            res.json(cachedReport);
            return;
        }

        const report = await reportingService.generatePatternReport();
        
        // Cache the response
        reportCache.set(cacheKey, report);

        res.json(report);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /reports/metrics:
 *   get:
 *     summary: Get task metrics report
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: number
 *         description: Start timestamp for the report period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: number
 *         description: End timestamp for the report period
 *     responses:
 *       200:
 *         description: Task metrics report
 */
router.get('/metrics', reportsLimiter, async (req, res, next) => {
    try {
        const timeframe = req.query.startDate && req.query.endDate ? {
            startDate: Number(req.query.startDate),
            endDate: Number(req.query.endDate)
        } : undefined;

        // Try to get from cache
        const cacheKey = CacheService.generateReportKey('metrics', timeframe);
        const cachedReport = reportCache.get(cacheKey);
        
        if (cachedReport) {
            res.json(cachedReport);
            return;
        }

        const report = await reportingService.generateTaskMetricsReport(timeframe);
        
        // Convert Maps to objects for JSON serialization
        const response = {
            ...report,
            complexityDistribution: Object.fromEntries(report.complexityDistribution),
            patternUsageByComplexity: Object.fromEntries(report.patternUsageByComplexity),
            successRateByComplexity: Object.fromEntries(report.successRateByComplexity)
        };

        // Cache the response with shorter TTL due to frequent updates
        reportCache.set(cacheKey, response, 2 * 60 * 1000); // 2 minutes TTL

        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /reports/performance:
 *   get:
 *     summary: Get performance report
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Performance report
 */
router.get('/performance', performanceReportLimiter, async (req, res, next) => {
    try {
        // Try to get from cache
        const cacheKey = CacheService.generateReportKey('performance');
        const cachedReport = reportCache.get(cacheKey);
        
        if (cachedReport) {
            res.json(cachedReport);
            return;
        }

        const report = await reportingService.generatePerformanceReport();
        
        // Cache the response with longer TTL due to heavy computation
        reportCache.set(cacheKey, report, 10 * 60 * 1000); // 10 minutes TTL

        res.json(report);
    } catch (error) {
        next(error);
    }
});

export default router;