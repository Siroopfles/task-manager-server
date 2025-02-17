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
import { TaskStatus, ValidationError, GitError, DatabaseError } from './models/types.js';

const taskService = new TaskService();

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

class TaskManagerServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'task-manager-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupRequestHandlers();
        this.setupErrorHandler();
    }

    private setupRequestHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'create_task',
                    description: 'Create a new task with optional initial code location',
                    inputSchema: CreateTaskSchema,
                },
                {
                    name: 'update_task_status',
                    description: 'Update the status of a task',
                    inputSchema: UpdateTaskStatusSchema,
                },
                {
                    name: 'add_code_location',
                    description: 'Add a code location to a task',
                    inputSchema: AddCodeLocationSchema,
                },
                {
                    name: 'record_implementation',
                    description: 'Record an implementation pattern for a task',
                    inputSchema: RecordImplementationSchema,
                },
                {
                    name: 'get_task_details',
                    description: 'Get detailed information about a task',
                    inputSchema: z.object({
                        taskId: z.string().uuid()
                    }),
                },
                {
                    name: 'complete_task',
                    description: 'Mark a task as completed and merge its branch',
                    inputSchema: z.object({
                        taskId: z.string().uuid()
                    }),
                }
            ],
        }));

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
    }

    private setupErrorHandler(): void {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };

        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Task Manager MCP server running on stdio');
    }
}

const server = new TaskManagerServer();
server.run().catch(console.error);
