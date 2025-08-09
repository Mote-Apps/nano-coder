import { Command } from "../../types/index.js";
import * as p from "@clack/prompts";
import { getCurrentChatSession } from "../chat.js";
import { primaryColor } from "../../ui/colors.js";

export const mcpCommand: Command = {
  name: "mcp",
  description: "Show connected MCP servers and their tools",
  handler: async (_args: string[]) => {
    const chatSession = getCurrentChatSession();
    if (!chatSession) {
      p.log.error("No active chat session found.");
      return;
    }

    // Access the tool manager through the public getter
    const toolManager = (chatSession as any).getToolManager();
    const connectedServers = toolManager.getConnectedServers();
    
    if (connectedServers.length === 0) {
      p.log.info("No MCP servers connected.");
      p.log.message(
        "To connect MCP servers, add them to your agents.config.json file:"
      );
      p.log.message(`
{
  "nanocoder": {
    "mcpServers": [
      {
        "name": "example-server",
        "command": "node",
        "args": ["path/to/server.js"],
        "env": {
          "API_KEY": "your-key"
        }
      }
    ]
  }
}`);
      return;
    }

    p.log.success(`Connected MCP Servers:`);
    for (const serverName of connectedServers) {
      const serverTools = toolManager.getServerTools(serverName);
      p.log.message(
        `  ${primaryColor(serverName)}: ${serverTools.length} tools`
      );
      if (serverTools.length > 0) {
        p.log.message(
          `    Tools: ${serverTools.map((t: any) => t.name).join(", ")}`
        );
      }
    }
  },
};