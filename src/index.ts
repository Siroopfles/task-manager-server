#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import taskRouter from './routes/tasks.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/tasks', taskRouter);

// Error handling
app.use(errorHandler);

// Start HTTP server
app.listen(PORT, () => {
    console.log(`HTTP API server running on port ${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
}).on('error', (err) => {
    console.error('Failed to start HTTP server:', err);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Performing graceful shutdown...');
    process.exit(0);
});
