import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler.js';
import taskRouter from './routes/tasks.js';

// Create Express app
const app = express();

// Add basic middleware
app.use(helmet());  // Security headers
app.use(cors());    // CORS support
app.use(express.json()); // JSON body parser
app.use(morgan('dev')); // Request logging

// Add routes
app.use('/api/tasks', taskRouter);

// Add error handler
app.use(errorHandler);

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`HTTP API server running on port ${PORT}`);
        console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
    });
}

export default app;