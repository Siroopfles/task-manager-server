import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler.js';
import taskRouter from './routes/tasks.js';
import analysisRouter from './routes/analysis.js';
import reportsRouter from './routes/reports.js';
import authRouter from './routes/auth.js';
import { setupSwagger } from './swagger.js';
import {
    apiLimiter,
    createTaskLimiter,
    taskModificationLimiter,
    analysisLimiter,
    implementationLimiter,
    loginLimiter,
    registrationLimiter,
    passwordChangeLimiter
} from './middleware/rateLimiter.js';

// Create Express app
const app = express();

// Add basic middleware
app.use(helmet());  // Security headers
app.use(cors());    // CORS support
app.use(express.json()); // JSON body parser
app.use(morgan('dev')); // Request logging

// Apply general rate limiter to all routes
app.use('/api', apiLimiter);

// Authentication routes with specific rate limits
const authRoutes = express.Router();
authRoutes.post('/login', loginLimiter);
authRoutes.post('/register', registrationLimiter);
authRoutes.post('/change-password', passwordChangeLimiter);
authRoutes.use('/', authRouter);

// Set up specific rate limiters for task routes
const taskRoutes = express.Router();
taskRoutes.post('/', createTaskLimiter);  // Task creation
taskRoutes.post('/:id/complete', taskModificationLimiter);  // Task completion
taskRoutes.post('/:id/locations', taskModificationLimiter);  // Adding code locations
taskRoutes.post('/:id/implementations', implementationLimiter);  // Recording implementations
taskRoutes.get('/:id/patterns', analysisLimiter);  // Pattern analysis
taskRoutes.use('/', taskRouter);

// Add routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analysis', analysisRouter);
app.use('/api/reports', reportsRouter);

// Set up Swagger documentation
setupSwagger(app);

// Add error handler
app.use(errorHandler);

// Health check endpoint (excluded from rate limiting)
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`HTTP API server running on port ${PORT}`);
        console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
        console.log(`Health check available at http://localhost:${PORT}/health`);
    });
}

export default app;