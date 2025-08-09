import { createLLMClient } from "./client-factory.js";
import type { LLMClient, ProviderType } from "../types/index.js";
import { getUserInput } from "../ui/input.js";
import {
  parseToolCallsFromContent,
  cleanContentFromToolCalls,
  executeToolCalls,
} from "./tool-calling/index.js";
import { setToolRegistryGetter } from "./message-handler.js";
import {
  displayAssistantMessage,
  displayThinkingIndicator,
  clearThinkingIndicator,
} from "../ui/output.js";
import * as p from "@clack/prompts";
import { tools, read_file } from "./tools/index.js";
import { ToolManager } from "./tools/tool-manager.js";
import { promptPath, appConfig } from "../config/index.js";
import { loadPreferences, updateLastUsed, getLastUsedModel } from "../config/preferences.js";
import { initializeLogging, shouldLog } from "../config/logging.js";
import { commandRegistry } from "./commands.js";
import { isCommandInput, parseInput } from "./command-parser.js";
import type { Message } from "../types/index.js";
import { CustomCommandLoader, CustomCommandExecutor } from "./custom-commands/index.js";

import {
  exitCommand,
  helpCommand,
  clearCommand,
  modelCommand,
  providerCommand,
  mcpCommand,
  debugCommand,
  commandsCommand,
  historyCommand,
} from "./commands/index.js";

let currentChatSession: ChatSession | null = null;

export function getCurrentChatSession(): ChatSession | null {
  return currentChatSession;
}

/**
 * Cleans duplicate content from model responses as a safety net
 */
function cleanDuplicateContent(content: string): string {
  if (!content || content.length < 50) return content;

  // Split by sentences and remove exact duplicates
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      cleaned.push(sentence);
    }
  }

  return cleaned.join(" ").trim();
}

export class ChatSession {
  private client: LLMClient;
  private messages: Message[] = [];
  private currentModel: string;
  private currentProvider: ProviderType = "ollama";
  private toolManager: ToolManager;
  private customCommandLoader: CustomCommandLoader;
  private customCommandExecutor: CustomCommandExecutor;
  private customCommandCache: Map<string, any> = new Map();

  constructor() {
    // Initialize logging system
    initializeLogging();
    
    // Client will be initialized in start() method
    this.client = null as any; // Temporary until async initialization
    this.currentModel = "";
    this.toolManager = new ToolManager();
    
    // Initialize custom commands
    this.customCommandLoader = new CustomCommandLoader();
    this.customCommandExecutor = new CustomCommandExecutor(this);
    
    // Load preferences to set initial provider
    const preferences = loadPreferences();
    if (preferences.lastProvider) {
      this.currentProvider = preferences.lastProvider;
    }
    
    // Set up the tool registry getter for the message handler
    setToolRegistryGetter(() => this.toolManager.getToolRegistry());
    
    currentChatSession = this;
    commandRegistry.register([
      helpCommand,
      exitCommand,
      clearCommand,
      modelCommand,
      providerCommand,
      mcpCommand,
      debugCommand,
      commandsCommand,
      historyCommand,
    ]);
  }

  async clearHistory(): Promise<void> {
    this.messages = [];
    await this.client.clearContext();
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.client.setModel(model);
    // Save the preference
    updateLastUsed(this.currentProvider, model);
  }

  async getAvailableModels(): Promise<string[]> {
    return await this.client.getAvailableModels();
  }

  getCurrentProvider(): ProviderType {
    return this.currentProvider;
  }

  async setProvider(provider: ProviderType): Promise<void> {
    if (provider !== this.currentProvider) {
      // This will throw if provider requirements aren't met (e.g., missing API key)
      const newClient = await createLLMClient(provider);

      this.currentProvider = provider;
      this.client = newClient;
      
      // Check if we have a preferred model for this provider
      const lastUsedModel = getLastUsedModel(provider);
      if (lastUsedModel) {
        const availableModels = await newClient.getAvailableModels();
        if (availableModels.includes(lastUsedModel)) {
          newClient.setModel(lastUsedModel);
          this.currentModel = lastUsedModel;
        } else {
          this.currentModel = newClient.getCurrentModel();
        }
      } else {
        this.currentModel = newClient.getCurrentModel();
      }
      
      // Save the preference
      updateLastUsed(provider, this.currentModel);
      await this.clearHistory();
    }
  }

  getAvailableProviders(): ProviderType[] {
    return ["ollama", "openrouter", "openai-compatible"];
  }

  getToolManager(): ToolManager {
    return this.toolManager;
  }
  
  getCustomCommandLoader(): CustomCommandLoader {
    return this.customCommandLoader;
  }
  
  async processUserInput(input: string): Promise<void> {
    // This method is called by CustomCommandExecutor
    this.messages.push({ role: "user", content: input });
    
    const response = await this.processStreamResponse();
    
    // If there was an error, just return (keep user message in history)
    if (!response) {
      return;
    }
    
    const { fullContent, toolCalls } = response;
    
    this.messages.push({
      role: "assistant",
      content: fullContent,
      tool_calls: toolCalls,
    });
    
    if (fullContent) {
      displayAssistantMessage(fullContent, this.currentModel);
    }
    
    if (toolCalls && toolCalls.length > 0) {
      const result = await executeToolCalls(toolCalls);
      
      // Add tool results to message history
      this.messages.push(...result.results);
      
      // If tools were executed, continue the AI conversation
      if (result.executed) {
        await this.continueConversation();
      }
    }
  }

  async start(): Promise<void> {
    // Initialize client on startup
    try {
      this.client = await createLLMClient(this.currentProvider);
      
      // Try to use the last used model for this provider
      const lastUsedModel = getLastUsedModel(this.currentProvider);
      if (lastUsedModel) {
        const availableModels = await this.client.getAvailableModels();
        if (availableModels.includes(lastUsedModel)) {
          this.client.setModel(lastUsedModel);
          this.currentModel = lastUsedModel;
        } else {
          this.currentModel = this.client.getCurrentModel();
        }
      } else {
        this.currentModel = this.client.getCurrentModel();
      }
      
      // Save the preference
      updateLastUsed(this.currentProvider, this.currentModel);
      
      // Display current provider and model (always show this)
      p.log.info(`Using provider: ${this.currentProvider}, model: ${this.currentModel}`);
      
      // Load custom commands
      await this.customCommandLoader.loadCommands();
      const customCommands = this.customCommandLoader.getAllCommands();
      
      // Populate command cache for better performance
      this.customCommandCache.clear();
      for (const command of customCommands) {
        this.customCommandCache.set(command.name, command);
        // Also cache aliases for quick lookup
        if (command.metadata?.aliases) {
          for (const alias of command.metadata.aliases) {
            this.customCommandCache.set(alias, command);
          }
        }
      }
      
      if (customCommands.length > 0 && shouldLog("info")) {
        p.log.info(`Loaded ${customCommands.length} custom commands from .nanocoder/commands`);
      }
      
      // Initialize MCP servers if configured
      if (appConfig.mcpServers && appConfig.mcpServers.length > 0) {
        if (shouldLog("info")) {
          p.log.info("Connecting to MCP servers...");
        }
        await this.toolManager.initializeMCP(appConfig.mcpServers);
      }
    } catch (error) {
      console.error(
        `Failed to initialize ${this.currentProvider} provider:`,
        error
      );
      process.exit(1);
    }

    while (true) {
      const userInput = await getUserInput();

      if (userInput === null) {
        break;
      }

      // Handle commands
      if (isCommandInput(userInput)) {
        const parsed = parseInput(userInput);
        if (parsed.fullCommand) {
          // Check for custom command first
          const customCommand = this.customCommandCache.get(parsed.fullCommand) || this.customCommandLoader.getCommand(parsed.fullCommand);
          if (customCommand) {
            // Execute custom command with any arguments
            const args = userInput.slice(parsed.fullCommand.length + 1).trim().split(/\s+/).filter(arg => arg);
            await this.customCommandExecutor.execute(customCommand, args);
            continue;
          }
          
          // Otherwise try built-in command
          const result = await commandRegistry.execute(parsed.fullCommand);
          if (result && result.trim()) {
            // Check if the result is a prompt to execute
            if (result.startsWith("EXECUTE_PROMPT:")) {
              const promptToExecute = result.replace("EXECUTE_PROMPT:", "");
              // Add the selected prompt as a user message and process it
              this.messages.push({ role: "user", content: promptToExecute });
              // Continue to process this as a regular user input
              const response = await this.processStreamResponse();
              if (!response) {
                continue;
              }
              const { fullContent, toolCalls } = response;
              this.messages.push({
                role: "assistant",
                content: fullContent,
                tool_calls: toolCalls,
              });
              if (fullContent) {
                displayAssistantMessage(fullContent, this.currentModel);
              }
              if (toolCalls && toolCalls.length > 0) {
                const toolResult = await executeToolCalls(toolCalls);
                this.messages.push(...toolResult.results);
                if (toolResult.executed) {
                  await this.continueConversation();
                }
              }
            } else {
              p.log.message(result);
            }
          }
          continue;
        }
      }

      this.messages.push({ role: "user", content: userInput });

      const response = await this.processStreamResponse();

      // If there was an error, just continue to next input (keep user message in history)
      if (!response) {
        continue;
      }

      const { fullContent, toolCalls } = response;

      this.messages.push({
        role: "assistant",
        content: fullContent,
        tool_calls: toolCalls,
      });

      if (fullContent) {
        displayAssistantMessage(fullContent, this.currentModel);
      }

      if (toolCalls && toolCalls.length > 0) {
        const result = await executeToolCalls(toolCalls);

        // Add tool results to message history
        this.messages.push(...result.results);

        // If tools were executed, continue the AI conversation
        if (result.executed) {
          await this.continueConversation();
        }
      }
    }
  }

  private async processStreamResponse(): Promise<{
    fullContent: string;
    toolCalls: any;
  } | null> {
    let timerInterval: NodeJS.Timeout | null = null;
    let onKeypress: ((chunk: Buffer) => void) | null = null;
    let originalRawMode: boolean | undefined;

    try {
      let instructions = await read_file({ path: promptPath });
      
      // Append MCP server information to the system prompt if servers are connected
      const connectedServers = this.toolManager.getConnectedServers();
      if (connectedServers.length > 0) {
        instructions += "\n\nAdditional MCP Tools Available:\n";
        for (const serverName of connectedServers) {
          const serverTools = this.toolManager.getServerTools(serverName);
          if (serverTools.length > 0) {
            instructions += `\nFrom MCP Server "${serverName}":\n`;
            for (const tool of serverTools) {
              instructions += `- ${tool.name}: ${tool.description || 'MCP tool'}\n`;
            }
          }
        }
        instructions += "\nThese MCP tools extend your capabilities beyond file operations and bash commands.";
      }
      
      const systemMessage: Message = {
        role: "system",
        content: instructions,
      };
      const stream = await this.client.chatStream(
        [systemMessage, ...this.messages],
        this.toolManager.getAllTools()
      );

      let fullContent = "";
      let tokenCount = 0;
      let toolCalls: any = null;
      let hasContent = false;
      let isComplete = false;
      let isCancelled = false;
      const startTime = Date.now();

      // Set up ESC key handler to cancel the request
      originalRawMode = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      onKeypress = (chunk: Buffer) => {
        // ESC key is keyCode 27
        if (chunk[0] === 27) {
          isCancelled = true;
          isComplete = true;
          // Consume the ESC key to prevent it from propagating
          return;
        }
      };

      process.stdin.on("data", onKeypress);

      // Start a timer that updates the display every second
      timerInterval = setInterval(() => {
        if (isComplete) return;

        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        const systemTokens = Math.ceil(instructions.length / 4);
        const conversationTokens = this.messages.reduce((total, msg) => {
          return total + Math.ceil((msg.content?.length || 0) / 4);
        }, 0);
        const totalTokensUsed = systemTokens + conversationTokens + tokenCount;
        displayThinkingIndicator(
          tokenCount,
          elapsedSeconds,
          this.client.getContextSize(),
          totalTokensUsed
        );
      }, 1000);

      let lastSeenContent = "";
      let repetitionCount = 0;
      const MAX_REPETITIONS = 3;

      for await (const chunk of stream) {
        // Check if cancelled by ESC key
        if (isCancelled) {
          break;
        }

        hasContent = true;

        if (chunk.message?.content) {
          const newContent = chunk.message.content;

          // Check for repetitive content (Kimi issue)
          if (newContent === lastSeenContent && newContent.trim().length > 0) {
            repetitionCount++;
            if (repetitionCount >= MAX_REPETITIONS) {
              break;
            }
          } else {
            repetitionCount = 0;
            lastSeenContent = newContent;
          }

          fullContent += newContent;

          // Also check for content-level repetition (sentences/phrases repeated within the full content)
          if (fullContent.length > 100) {
            const sentences = fullContent
              .split(/[.!?]+/)
              .filter((s) => s.trim().length > 20);
            const sentenceSet = new Set();
            let duplicateCount = 0;

            for (const sentence of sentences) {
              const normalized = sentence.trim().toLowerCase();
              if (sentenceSet.has(normalized)) {
                duplicateCount++;
                if (duplicateCount >= 2) {
                  break;
                }
              } else {
                sentenceSet.add(normalized);
              }
            }

            if (duplicateCount >= 2) break;
          }

          tokenCount = Math.ceil(fullContent.length / 4);
        }

        if (chunk.eval_count) {
          tokenCount = chunk.eval_count;
        }

        if (chunk.message?.tool_calls) {
          toolCalls = chunk.message.tool_calls;
        }

        if (!chunk.done) {
          const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
          const systemTokens = Math.ceil(instructions.length / 4);
          const conversationTokens = this.messages.reduce((total, msg) => {
            return total + Math.ceil((msg.content?.length || 0) / 4);
          }, 0);
          const totalTokensUsed =
            systemTokens + conversationTokens + tokenCount;
          displayThinkingIndicator(
            tokenCount,
            elapsedSeconds,
            this.client.getContextSize(),
            totalTokensUsed
          );
        }
      }

      isComplete = true;
      if (timerInterval) clearInterval(timerInterval);

      // Clean up ESC key handler and restore terminal state
      if (onKeypress) {
        process.stdin.removeListener("data", onKeypress);
      }
      if (originalRawMode !== undefined) {
        process.stdin.setRawMode(originalRawMode);
      }
      // Clear any remaining input buffer
      process.stdin.read();
      process.stdin.pause();

      clearThinkingIndicator();

      // If cancelled by ESC, show cancellation message and return null
      if (isCancelled) {
        p.log.warn("Request cancelled by user");
        // Add a small delay to ensure terminal state is restored before next prompt
        await new Promise((resolve) => setTimeout(resolve, 100));
        return null;
      }

      // If no content was received (stream was empty due to error), return null
      if (!hasContent) {
        return null;
      }

      // Clean up any duplicate content before processing
      fullContent = cleanDuplicateContent(fullContent);

      // Parse tool calls from content if tool_calls field is empty
      if (!toolCalls && fullContent) {
        const extractedCalls = parseToolCallsFromContent(fullContent);
        if (extractedCalls.length > 0) {
          toolCalls = extractedCalls;
          fullContent = cleanContentFromToolCalls(fullContent, extractedCalls);
        }
      }

      return { fullContent, toolCalls };
    } catch (error) {
      if (timerInterval) clearInterval(timerInterval);

      // Clean up ESC key handler and restore terminal state
      try {
        if (onKeypress) {
          process.stdin.removeListener("data", onKeypress);
        }
        if (originalRawMode !== undefined) {
          process.stdin.setRawMode(originalRawMode);
        }
        // Clear any remaining input buffer
        process.stdin.read();
        process.stdin.pause();
      } catch {
        // Ignore cleanup errors
      }

      clearThinkingIndicator();
      // Error was already logged in the OpenRouter client, just return null
      return null;
    }
  }

  private async continueConversation(): Promise<void> {
    const response = await this.processStreamResponse();

    // If there was an error, stop the conversation chain
    if (!response) {
      return;
    }

    const { fullContent, toolCalls } = response;

    this.messages.push({
      role: "assistant",
      content: fullContent,
      tool_calls: toolCalls,
    });

    if (fullContent) {
      displayAssistantMessage(fullContent, this.currentModel);
    }

    // If there are new tool calls, handle them recursively
    if (toolCalls && toolCalls.length > 0) {
      const result = await executeToolCalls(toolCalls);

      // Add tool results to message history
      this.messages.push(...result.results);

      // Continue conversation if tools were executed
      if (result.executed) {
        await this.continueConversation();
      }
    }
  }
}
