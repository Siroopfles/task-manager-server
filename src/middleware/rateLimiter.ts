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

// Authentication rate limits
export const loginLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 login attempts per hour
    message: 'Too many login attempts, please try again after an hour',
});

export const registrationLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 5, // 5 registrations per day
    message: 'Maximum registration limit reached, please try again tomorrow',
});

export const passwordChangeLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password changes per hour
    message: 'Too many password change attempts, please try again after an hour',
});

// Task creation limiter
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

// Reports limiter (very restrictive due to heavy computation)
export const reportsLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 report generations per hour
    message: 'Report generation limit reached, please try again after an hour',
});

// Performance report limiter (most restrictive)
export const performanceReportLimiter = rateLimit({
    ...baseLimiter,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 performance report requests per hour
    message: 'Performance report limit reached, please try again after an hour',
});