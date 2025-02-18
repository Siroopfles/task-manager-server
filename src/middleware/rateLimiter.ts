import rateLimit from 'express-rate-limit';

// Base limiter configuration
const baseLimiter = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later',
};

// General API limiter
export const apiLimiter = rateLimit({
    ...baseLimiter,
    max: 100, // Limit each IP to 100 requests per windowMs
});

// Task creation limiter (more restrictive)
export const createTaskLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // Limit each IP to 30 task creations per hour
    message: 'Too many tasks created from this IP, please try again after an hour',
});

// Task modification limiter
export const taskModificationLimiter = rateLimit({
    ...baseLimiter,
    max: 50, // Limit each IP to 50 modifications per windowMs
    message: 'Too many task modifications from this IP, please try again later',
});

// Analysis limiter (most restrictive due to computational intensity)
export const analysisLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 analysis requests per hour
    message: 'Analysis request limit reached, please try again after an hour',
});

// Pattern implementation limiter
export const implementationLimiter = rateLimit({
    ...baseLimiter,
    max: 60, // Limit each IP to 60 implementation records per windowMs
    message: 'Too many implementation records from this IP, please try again later',
});