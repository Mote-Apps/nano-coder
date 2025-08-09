import type { ToolHandler } from "../../types/index.js";
import { MCPClient } from "./mcp-client.js";

/**
 * Creates tool handlers for MCP tools that integrate with the existing tool system
 */
export class MCPToolAdapter {
  private mcpClient: MCPClient;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }

  /**
   * Creates a tool handler function for an MCP tool
   */
  createToolHandler(toolName: string): ToolHandler {
    return async (args: any) => {
      try {
        const result = await this.mcpClient.callTool(toolName, args);
        return result;
      } catch (error) {
        return `Error executing MCP tool: ${error}`;
      }
    };
  }

  /**
   * Registers all MCP tools in the tool registry
   */
  registerMCPTools(toolRegistry: Record<string, ToolHandler>): void {
    const mcpTools = this.mcpClient.getAllTools();
    
    for (const tool of mcpTools) {
      const toolName = tool.function.name;
      // Check for conflicts with existing tools
      if (toolRegistry[toolName]) {
        console.warn(`Warning: MCP tool "${toolName}" conflicts with existing tool. MCP tool will override.`);
      }
      toolRegistry[toolName] = this.createToolHandler(toolName);
    }
  }

  /**
   * Unregisters all MCP tools from the tool registry
   */
  unregisterMCPTools(toolRegistry: Record<string, ToolHandler>): void {
    const mcpTools = this.mcpClient.getAllTools();
    
    for (const tool of mcpTools) {
      const toolName = tool.function.name;
      delete toolRegistry[toolName];
    }
  }
}