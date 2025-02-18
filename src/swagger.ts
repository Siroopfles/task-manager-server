import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Task Manager API',
            version: '1.0.0',
            description: 'Task Manager API with Git integration and pattern analysis',
        },
        servers: [
            {
                url: '/api',
                description: 'API endpoint',
            },
        ],
        components: {
            schemas: {
                Task: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Task unique identifier',
                        },
                        title: {
                            type: 'string',
                            description: 'Task title',
                        },
                        description: {
                            type: 'string',
                            description: 'Task description',
                            nullable: true,
                        },
                        priority: {
                            type: 'number',
                            minimum: 1,
                            maximum: 5,
                            description: 'Task priority (1-5)',
                        },
                        complexity: {
                            type: 'number',
                            minimum: 1,
                            maximum: 5,
                            description: 'Task complexity (1-5)',
                        },
                        status: {
                            type: 'string',
                            enum: ['CREATED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'],
                            description: 'Task status',
                        },
                        created_at: {
                            type: 'number',
                            description: 'Task creation timestamp',
                        },
                        updated_at: {
                            type: 'number',
                            description: 'Task last update timestamp',
                        },
                    },
                    required: ['id', 'title', 'priority', 'complexity', 'status', 'created_at', 'updated_at'],
                },
                CodeLocation: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Code location unique identifier',
                        },
                        task_id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Associated task ID',
                        },
                        file_path: {
                            type: 'string',
                            description: 'File path relative to repository root',
                        },
                        start_line: {
                            type: 'number',
                            description: 'Starting line number',
                        },
                        end_line: {
                            type: 'number',
                            description: 'Ending line number',
                            nullable: true,
                        },
                        git_branch: {
                            type: 'string',
                            description: 'Associated Git branch',
                        },
                        git_commit: {
                            type: 'string',
                            description: 'Associated Git commit hash',
                            nullable: true,
                        },
                        created_at: {
                            type: 'number',
                            description: 'Creation timestamp',
                        },
                    },
                    required: ['id', 'task_id', 'file_path', 'start_line', 'git_branch', 'created_at'],
                },
                Implementation: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Implementation unique identifier',
                        },
                        task_id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Associated task ID',
                        },
                        pattern_type: {
                            type: 'string',
                            description: 'Implementation pattern type',
                        },
                        pattern_data: {
                            type: 'string',
                            description: 'Implementation pattern details',
                        },
                        success_rating: {
                            type: 'number',
                            minimum: 0,
                            maximum: 1,
                            description: 'Implementation success rating (0-1)',
                            nullable: true,
                        },
                        created_at: {
                            type: 'number',
                            description: 'Creation timestamp',
                        },
                    },
                    required: ['id', 'task_id', 'pattern_type', 'pattern_data', 'created_at'],
                },
                Error: {
                    type: 'object',
                    properties: {
                        code: {
                            type: 'string',
                            description: 'Error code',
                        },
                        message: {
                            type: 'string',
                            description: 'Error message',
                        },
                    },
                    required: ['code', 'message'],
                },
            },
            responses: {
                NotFound: {
                    description: 'Resource not found',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error',
                            },
                        },
                    },
                },
                ValidationError: {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error',
                            },
                        },
                    },
                },
            },
        },
    },
    apis: ['./src/routes/*.ts'], // Path to the API routes
};

export function setupSwagger(app: Express): void {
    const specs = swaggerJsdoc(options);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}