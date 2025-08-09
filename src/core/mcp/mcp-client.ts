import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as p from "@clack/prompts";
import type { Tool } from "../../types/index.js";
import { shouldLog } from "../../config/logging.js";

export interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
  serverName: string;
}

export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private serverTools: Map<string, MCPTool[]> = new Map();
  private isConnected: boolean = false;

  constructor() {}

  async connectToServer(server: MCPServer): Promise<void> {
    try {
      // Create transport for the server
      // When not in verbose mode, suppress stderr output from MCP servers
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env: {
          ...server.env,
          // Set log level environment variables that many servers respect
          LOG_LEVEL: shouldLog("debug") ? "DEBUG" : "ERROR",
          DEBUG: shouldLog("debug") ? "1" : "0",
          VERBOSE: shouldLog("debug") ? "1" : "0",
        },
        // Suppress stderr if not in verbose mode
        stderr: shouldLog("debug") ? "inherit" : "ignore",
      });

      // Create and connect client
      const client = new Client({
        name: "nanocoder-mcp-client",
        version: "1.0.0",
      });

      await client.connect(transport);

      // Store client and transport
      this.clients.set(server.name, client);
      this.transports.set(server.name, transport);

      // List available tools from this server
      const toolsResult = await client.listTools();
      const tools: MCPTool[] = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || undefined,
        inputSchema: tool.inputSchema,
        serverName: server.name,
      }));

      this.serverTools.set(server.name, tools);

      if (shouldLog("info")) {
        p.log.success(
          `Connected to MCP server "${server.name}" with ${tools.length} tools: ${tools
            .map((t) => t.name)
            .join(", ")}`
        );
      }
    } catch (error) {
      p.log.error(`Failed to connect to MCP server "${server.name}": ${error}`);
      throw error;
    }
  }

  async connectToServers(servers: MCPServer[]): Promise<void> {
    for (const server of servers) {
      try {
        await this.connectToServer(server);
      } catch (error) {
        // Log error but continue with other servers
        if (shouldLog("warn")) {
          p.log.warn(`Skipping server "${server.name}" due to connection error`);
        }
      }
    }
    this.isConnected = true;
  }

  getAllTools(): Tool[] {
    const tools: Tool[] = [];
    
    for (const [serverName, serverTools] of this.serverTools.entries()) {
      for (const mcpTool of serverTools) {
        // Convert MCP tool to nanocoder Tool format
        // Use the original tool name for better model compatibility
        const tool: Tool = {
          type: "function",
          function: {
            name: mcpTool.name,
            description: mcpTool.description 
              ? `[MCP:${serverName}] ${mcpTool.description}`
              : `MCP tool from ${serverName}`,
            parameters: mcpTool.inputSchema || {
              type: "object",
              properties: {},
              required: [],
            },
          },
        };
        tools.push(tool);
      }
    }
    
    return tools;
  }
  
  getToolMapping(): Map<string, { serverName: string; originalName: string }> {
    const mapping = new Map<string, { serverName: string; originalName: string }>();
    
    for (const [serverName, serverTools] of this.serverTools.entries()) {
      for (const mcpTool of serverTools) {
        mapping.set(mcpTool.name, {
          serverName,
          originalName: mcpTool.name
        });
      }
    }
    
    return mapping;
  }

  async callTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<string> {
    // First, try to find which server has this tool
    const toolMapping = this.getToolMapping();
    const mapping = toolMapping.get(toolName);
    
    if (!mapping) {
      // Fallback: try parsing as prefixed name (mcp_serverName_toolName) for backward compatibility
      const parts = toolName.split("_");
      if (parts.length >= 3 && parts[0] === "mcp" && parts[1]) {
        const serverName = parts[1];
        const originalToolName = parts.slice(2).join("_");
        const client = this.clients.get(serverName);
        if (client) {
          return this.executeToolCall(client, originalToolName, args);
        }
      }
      throw new Error(`MCP tool not found: ${toolName}`);
    }
    
    const client = this.clients.get(mapping.serverName);
    if (!client) {
      throw new Error(`No MCP client connected for server: ${mapping.serverName}`);
    }
    
    return this.executeToolCall(client, mapping.originalName, args);
  }
  
  private async executeToolCall(
    client: Client,
    toolName: string,
    args: Record<string, any>
  ): Promise<string> {
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      // Convert result content to string
      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === "text") {
          return content.text || "";
        } else {
          return JSON.stringify(content);
        }
      }
      
      return "Tool executed successfully (no output)";
    } catch (error) {
      throw new Error(`MCP tool execution failed: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    for (const [serverName, client] of this.clients.entries()) {
      try {
        await client.close();
        p.log.info(`Disconnected from MCP server: ${serverName}`);
      } catch (error) {
        p.log.warn(`Error disconnecting from ${serverName}: ${error}`);
      }
    }
    
    this.clients.clear();
    this.transports.clear();
    this.serverTools.clear();
    this.isConnected = false;
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  isServerConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  getServerTools(serverName: string): MCPTool[] {
    return this.serverTools.get(serverName) || [];
  }
}