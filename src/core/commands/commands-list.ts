import type { Command } from "../../types/index.js";
import * as p from "@clack/prompts";
import { primaryColor, secondaryColor } from "../../ui/colors.js";
import { getCurrentChatSession } from "../chat.js";

export const commandsCommand: Command = {
  name: "commands",
  description: "List all custom commands from .nanocoder/commands",
  handler: async (_args: string[]): Promise<void> => {
    const chatSession = getCurrentChatSession();
    if (!chatSession) {
      p.log.error("No active chat session found.");
      return;
    }
    
    const customLoader = chatSession.getCustomCommandLoader();
    const commands = customLoader.getAllCommands();
    
    if (commands.length === 0) {
      p.log.message(`${primaryColor("No custom commands found")}\n\n` +
        `To create custom commands:\n` +
        `1. Create a ${secondaryColor(".nanocoder/commands")} directory in your project\n` +
        `2. Add ${secondaryColor(".md")} files with command prompts\n` +
        `3. Optionally add frontmatter for metadata:\n\n` +
        `${secondaryColor("---")}\n` +
        `${secondaryColor("description: Generate unit tests")}\n` +
        `${secondaryColor("aliases: [test, unittest]")}\n` +
        `${secondaryColor("parameters: [filename]")}\n` +
        `${secondaryColor("---")}\n` +
        `${secondaryColor("Generate comprehensive unit tests for {{filename}}...")}\n`);
      return;
    }
    
    // Group commands by namespace
    const byNamespace = new Map<string | undefined, typeof commands>();
    for (const cmd of commands) {
      const namespace = cmd.namespace;
      if (!byNamespace.has(namespace)) {
        byNamespace.set(namespace, []);
      }
      byNamespace.get(namespace)!.push(cmd);
    }
    
    let output = `${primaryColor("Custom Commands:")}\n\n`;
    
    // Show commands without namespace first
    const rootCommands = byNamespace.get(undefined);
    if (rootCommands && rootCommands.length > 0) {
      for (const cmd of rootCommands.sort((a, b) => a.name.localeCompare(b.name))) {
        output += formatCommand(cmd) + "\n";
      }
      output += "\n";
    }
    
    // Show namespaced commands
    for (const [namespace, cmds] of byNamespace.entries()) {
      if (namespace !== undefined) {
        output += `${primaryColor(namespace + ":")}\n`;
        for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
          output += formatCommand(cmd) + "\n";
        }
        output += "\n";
      }
    }
    
    p.log.message(output.trim());
  },
};

function formatCommand(cmd: any): string {
  const parts: string[] = [`  • /${cmd.fullName}`];
  
  if (cmd.metadata.parameters && cmd.metadata.parameters.length > 0) {
    parts.push(secondaryColor(cmd.metadata.parameters.map((p: string) => `<${p}>`).join(" ")));
  }
  
  if (cmd.metadata.description) {
    parts.push(`- ${cmd.metadata.description}`);
  }
  
  if (cmd.metadata.aliases && cmd.metadata.aliases.length > 0) {
    const aliasNames = cmd.metadata.aliases.map((a: string) => 
      cmd.namespace ? `${cmd.namespace}:${a}` : a
    );
    parts.push(secondaryColor(`(aliases: ${aliasNames.join(", ")})`));
  }
  
  return parts.join(" ");
}