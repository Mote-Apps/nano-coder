import type { Tool, ToolHandler } from "../../types/index.js";
import { tools as staticTools, toolRegistry as staticToolRegistry } from "./index.js";
import { MCPClient } from "../mcp/mcp-client.js";
import { MCPToolAdapter } from "../mcp/mcp-tool-adapter.js";

/**
 * Manages both static tools and dynamic MCP tools
 */
export class ToolManager {
  private mcpClient: MCPClient | null = null;
  private mcpAdapter: MCPToolAdapter | null = null;
  private toolRegistry: Record<string, ToolHandler> = {};
  private allTools: Tool[] = [];

  constructor() {
    // Initialize with static tools
    this.toolRegistry = { ...staticToolRegistry };
    this.allTools = [...staticTools];
  }

  /**
   * Initialize MCP client and connect to servers
   */
  async initializeMCP(servers: any[]): Promise<void> {
    if (servers && servers.length > 0) {
      this.mcpClient = new MCPClient();
      this.mcpAdapter = new MCPToolAdapter(this.mcpClient);
      
      await this.mcpClient.connectToServers(servers);
      
      // Register MCP tools
      this.mcpAdapter.registerMCPTools(this.toolRegistry);
      
      // Add MCP tools to the tool list
      const mcpTools = this.mcpClient.getAllTools();
      this.allTools = [...staticTools, ...mcpTools];
    }
  }

  /**
   * Get all available tools (static + MCP)
   */
  getAllTools(): Tool[] {
    return this.allTools;
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): Record<string, ToolHandler> {
    return this.toolRegistry;
  }

  /**
   * Get a specific tool handler
   */
  getToolHandler(toolName: string): ToolHandler | undefined {
    return this.toolRegistry[toolName];
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return toolName in this.toolRegistry;
  }

  /**
   * Disconnect MCP servers
   */
  async disconnectMCP(): Promise<void> {
    if (this.mcpClient && this.mcpAdapter) {
      // Unregister MCP tools
      this.mcpAdapter.unregisterMCPTools(this.toolRegistry);
      
      // Disconnect from servers
      await this.mcpClient.disconnect();
      
      // Reset to static tools only
      this.allTools = [...staticTools];
      this.mcpClient = null;
      this.mcpAdapter = null;
    }
  }

  /**
   * Get connected MCP servers
   */
  getConnectedServers(): string[] {
    return this.mcpClient?.getConnectedServers() || [];
  }

  /**
   * Get tools for a specific MCP server
   */
  getServerTools(serverName: string): any[] {
    return this.mcpClient?.getServerTools(serverName) || [];
  }
}