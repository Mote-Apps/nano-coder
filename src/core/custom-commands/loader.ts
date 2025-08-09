import { existsSync, readdirSync, statSync } from "fs";
import { join, basename, relative } from "path";
import type { CustomCommand } from "./types.js";
import { parseCommandFile } from "./parser.js";

export class CustomCommandLoader {
  private commands: Map<string, CustomCommand> = new Map();
  private aliases: Map<string, string> = new Map(); // alias -> command name
  private projectRoot: string;
  private commandsDir: string;
  
  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.commandsDir = join(projectRoot, ".nanocoder", "commands");
  }
  
  /**
   * Load all custom commands from the .nanocoder/commands directory
   */
  async loadCommands(): Promise<void> {
    this.commands.clear();
    this.aliases.clear();
    
    if (!existsSync(this.commandsDir)) {
      return; // No custom commands directory
    }
    
    this.scanDirectory(this.commandsDir);
  }
  
  /**
   * Recursively scan directory for .md files
   */
  private scanDirectory(dir: string, namespace?: string): void {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Subdirectory becomes a namespace
        const subNamespace = namespace 
          ? `${namespace}:${entry}`
          : entry;
        this.scanDirectory(fullPath, subNamespace);
      } else if (entry.endsWith(".md")) {
        // Parse and register command
        this.loadCommand(fullPath, namespace);
      }
    }
  }
  
  /**
   * Load a single command file
   */
  private loadCommand(filePath: string, namespace?: string): void {
    try {
      const parsed = parseCommandFile(filePath);
      const commandName = basename(filePath, ".md");
      const fullName = namespace ? `${namespace}:${commandName}` : commandName;
      
      const command: CustomCommand = {
        name: commandName,
        path: filePath,
        namespace,
        fullName,
        metadata: parsed.metadata,
        content: parsed.content,
      };
      
      // Register main command
      this.commands.set(fullName, command);
      
      // Register aliases
      if (parsed.metadata.aliases) {
        for (const alias of parsed.metadata.aliases) {
          const fullAlias = namespace ? `${namespace}:${alias}` : alias;
          this.aliases.set(fullAlias, fullName);
        }
      }
    } catch (error) {
      console.warn(`Failed to load custom command from ${filePath}:`, error);
    }
  }
  
  /**
   * Get a command by name (checking aliases too)
   */
  getCommand(name: string): CustomCommand | undefined {
    // Check direct command name
    const command = this.commands.get(name);
    if (command) return command;
    
    // Check aliases
    const aliasTarget = this.aliases.get(name);
    if (aliasTarget) {
      return this.commands.get(aliasTarget);
    }
    
    return undefined;
  }
  
  /**
   * Get all available commands
   */
  getAllCommands(): CustomCommand[] {
    return Array.from(this.commands.values());
  }
  
  /**
   * Get command suggestions for autocomplete
   */
  getSuggestions(prefix: string): string[] {
    const suggestions: string[] = [];
    const lowerPrefix = prefix.toLowerCase();
    
    // Add matching command names
    for (const [name, command] of this.commands.entries()) {
      if (name.toLowerCase().startsWith(lowerPrefix)) {
        suggestions.push(name);
      }
    }
    
    // Add matching aliases
    for (const [alias, target] of this.aliases.entries()) {
      if (alias.toLowerCase().startsWith(lowerPrefix) && !suggestions.includes(alias)) {
        suggestions.push(alias);
      }
    }
    
    return suggestions.sort();
  }
  
  /**
   * Check if commands directory exists
   */
  hasCustomCommands(): boolean {
    return existsSync(this.commandsDir);
  }
  
  /**
   * Get the commands directory path
   */
  getCommandsDirectory(): string {
    return this.commandsDir;
  }
}