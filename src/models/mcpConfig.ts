import { z } from 'zod';

export interface MCPTool {
    description: string;
    schema: z.ZodType;
}

export interface MCPConfig {
    name: string;
    version: string;
    transport: string;
    tools: {
        [key: string]: MCPTool;
    };
}