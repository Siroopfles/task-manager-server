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
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MCPConfig } from './models/mcpConfig.js';
import { getDatabase } from './database/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load MCP config
const configPath = join(__dirname, '..', 'mcp.config.json');
const mcpConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as MCPConfig;

// Initialize services
console.log('Initializing services...');
const taskService = new TaskService();
const implRepo = new SQLiteImplementationRepository(getDatabase());
const patternService = new PatternAnalysisService(implRepo);

// Create server instance
console.log('Creating MCP server...');
const server = new Server(
    {
        name: mcpConfig.name,
        version: mcpConfig.version,
    },
    {
        capabilities: {
            tools: mcpConfig.tools
        }
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(mcpConfig.tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.schema
    }))
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log(`Executing tool: ${request.params.name}`);
    try {
        switch (request.params.name) {
            case 'create_task': {
                const args = z.object({
                    title: z.string().min(1),
                    description: z.string().optional(),
                    priority: z.number().int().min(1).max(5),
                    complexity: z.number().int().min(1).max(5),
                    initialCodeLocation: z.object({
                        filePath: z.string(),
                        startLine: z.number().int().positive(),
                        endLine: z.number().int().positive().optional()
                    }).optional()
                }).parse(request.params.arguments);

                const task = await taskService.createTask(args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
                };
            }

            case 'update_task_status': {
                const args = z.object({
                    taskId: z.string().uuid(),
                    status: z.enum(['CREATED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'])
                }).parse(request.params.arguments);

                const task = await taskService.updateTaskStatus(args.taskId, args.status);
                return {
                    content: [{ type: 'text', text: JSON.stringify(task, null, 2) }],
                };
            }

            case 'add_code_location': {
                const args = z.object({
                    taskId: z.string().uuid(),
                    filePath: z.string(),
                    startLine: z.number().int().positive(),
                    endLine: z.number().int().positive().optional()
                }).parse(request.params.arguments);

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
                const args = z.object({
                    taskId: z.string().uuid(),
                    patternType: z.string(),
                    patternData: z.string(),
                    successRating: z.number().min(0).max(1).optional()
                }).parse(request.params.arguments);

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
                try {
                    await taskService.completeTask(args.taskId);
                    return {
                        content: [{ type: 'text', text: 'Task completed successfully' }],
                    };
                } catch (error) {
                    if (error instanceof GitError) {
                        console.error('Git operation failed:', error);
                        throw new McpError(ErrorCode.InternalError, `Git operation failed: ${error.message}. Please ensure you're not on the task branch and try again.`);
                    }
                    throw error;
                }
            }

            case 'analyze_task_patterns': {
                const args = z.object({ taskId: z.string().uuid() }).parse(request.params.arguments);
                const patterns = await patternService.analyzeTaskPatterns(args.taskId);
                return {
                    content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }],
                };
            }

            case 'get_pattern_recommendations': {
                const args = z.object({ taskId: z.string().uuid() }).parse(request.params.arguments);
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
        console.error('Error executing MCP tool:', error);

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
console.log('Starting MCP server...');
const transport = new StdioServerTransport();
server.connect(transport).catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});
