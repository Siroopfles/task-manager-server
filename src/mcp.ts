#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TaskService } from './services/TaskService.js';
import { PatternAnalysisService } from './services/PatternAnalysisService.js';
import { TaskStatus, ValidationError, GitError, DatabaseError } from './models/types.js';
import { SQLiteImplementationRepository } from './repositories/ImplementationRepository.js';
import { getDatabase } from './database/schema.js';

// Initialize services
const taskService = new TaskService();
const implRepo = new SQLiteImplementationRepository(getDatabase());
const patternService = new PatternAnalysisService(implRepo);

// Input validation schemas
const CreateTaskSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.number().int().min(1).max(5),
    complexity: z.number().int().min(1).max(5),
    initialCodeLocation: z.object({
        filePath: z.string(),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive().optional()
    }).optional()
});

const UpdateTaskStatusSchema = z.object({
    taskId: z.string().uuid(),
    status: z.enum(['CREATED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'])
});

const AddCodeLocationSchema = z.object({
    taskId: z.string().uuid(),
    filePath: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive().optional()
});

const RecordImplementationSchema = z.object({
    taskId: z.string().uuid(),
    patternType: z.string(),
    patternData: z.string(),
    successRating: z.number().min(0).max(1).optional()
});

const AnalyzeTaskPatternsSchema = z.object({
    taskId: z.string().uuid()
});

const GetPatternRecommendationsSchema = z.object({
    taskId: z.string().uuid()
});

// Define available tools
const tools = {
    create_task: {
        description: 'Create a new task with optional initial code location',
        schema: CreateTaskSchema
    },
    update_task_status: {
        description: 'Update the status of a task',
        schema: UpdateTaskStatusSchema
    },
    add_code_location: {
        description: 'Add a code location to a task',
        schema: AddCodeLocationSchema
    },
    record_implementation: {
        description: 'Record an implementation pattern for a task',
        schema: RecordImplementationSchema
    },
    get_task_details: {
        description: 'Get detailed information about a task',
        schema: z.object({ taskId: z.string().uuid() })
    },
    complete_task: {
        description: 'Mark a task as completed and merge its branch',
        schema: z.object({ taskId: z.string().uuid() })
    },
    analyze_task_patterns: {
        description: 'Analyze implementation patterns for a specific task',
        schema: AnalyzeTaskPatternsSchema
    },
    get_pattern_recommendations: {
        description: 'Get pattern-based recommendations for a task',
        schema: GetPatternRecommendationsSchema
    },
    analyze_all_patterns: {
        description: 'Analyze all implementation patterns across tasks',
        schema: z.object({})
    }
};

const server = new Server(
    {
        name: 'task-manager-server',
        version: '0.1.0',
    },
    {
        capabilities: {
            tools
        }
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.schema
    }))
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        switch (request.params.name) {
            case 'create_task': {
                const args = CreateTaskSchema.parse(request.params.arguments);
                const task = await taskService.createTask(args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
                };
            }

            case 'update_task_status': {
                const args = UpdateTaskStatusSchema.parse(request.params.arguments);
                const task = await taskService.updateTaskStatus(args.taskId, args.status);
                return {
                    content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
                };
            }

            case 'add_code_location': {
                const args = AddCodeLocationSchema.parse(request.params.arguments);
                const location = await taskService.addCodeLocation(args.taskId, {
                    filePath: args.filePath,
                    startLine: args.startLine,
                    endLine: args.endLine,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(location, null, 2) }],
                };
            }

            case 'record_implementation': {
                const args = RecordImplementationSchema.parse(request.params.arguments);
                const impl = await taskService.recordImplementation(
                    args.taskId,
                    args.patternType,
                    args.patternData,
                    args.successRating
                );
                return {
                    content: [{ type: 'text', text: JSON.stringify(impl, null, 2) }],
                };
            }

            case 'get_task_details': {
                const args = z.object({ taskId: z.string().uuid() }).parse(request.params.arguments);
                const details = await taskService.getTaskWithDetails(args.taskId);
                return {
                    content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
                };
            }

            case 'complete_task': {
                const args = z.object({ taskId: z.string().uuid() }).parse(request.params.arguments);
                await taskService.completeTask(args.taskId);
                return {
                    content: [{ type: 'text', text: 'Task completed successfully' }],
                };
            }

            case 'analyze_task_patterns': {
                const args = AnalyzeTaskPatternsSchema.parse(request.params.arguments);
                const patterns = await patternService.analyzeTaskPatterns(args.taskId);
                return {
                    content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }],
                };
            }

            case 'get_pattern_recommendations': {
                const args = GetPatternRecommendationsSchema.parse(request.params.arguments);
                const recommendations = await patternService.getRecommendations(args.taskId);
                return {
                    content: [{ type: 'text', text: JSON.stringify(recommendations, null, 2) }],
                };
            }

            case 'analyze_all_patterns': {
                const patterns = await patternService.analyzeAllPatterns();
                const patternsArray = Array.from(patterns.entries())
                    .map(([type, result]) => ({ type, ...result }));
                return {
                    content: [{ type: 'text', text: JSON.stringify(patternsArray, null, 2) }],
                };
            }

            default:
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
    } catch (error) {
        if (error instanceof ValidationError || error instanceof z.ZodError) {
            throw new McpError(ErrorCode.InvalidParams, error.message);
        }
        if (error instanceof GitError) {
            throw new McpError(ErrorCode.InternalError, `Git error: ${error.message}`);
        }
        if (error instanceof DatabaseError) {
            throw new McpError(ErrorCode.InternalError, `Database error: ${error.message}`);
        }
        throw error;
    }
});

// Error handler
server.onerror = (error) => {
    console.error('[MCP Error]', error);
};

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});