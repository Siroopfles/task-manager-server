import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ValidationError, NotFoundError, GitError, DatabaseError } from '../models/types.js';

// Error handling middleware
export const errorHandler: ErrorRequestHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);

    if (err instanceof ValidationError) {
        res.status(400).json({
            status: 'error',
            message: err.message
        });
        return;
    }

    if (err instanceof NotFoundError) {
        res.status(404).json({
            status: 'error',
            message: err.message
        });
        return;
    }

    if (err instanceof GitError) {
        res.status(500).json({
            status: 'error',
            message: 'Git operation failed: ' + err.message
        });
        return;
    }

    if (err instanceof DatabaseError) {
        res.status(500).json({
            status: 'error',
            message: 'Database operation failed: ' + err.message
        });
        return;
    }

    // Default error
    res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
};