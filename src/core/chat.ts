import { createLLMClient } from "./client-factory.js";
import type { LLMClient, ProviderType } from "../types/index.js";
import { getUserInput } from "../ui/input.js";
import {
  parseToolCallsFromContent,
  cleanContentFromToolCalls,
  executeToolCalls,
} from "./tool-calling/index.js";
import {
  displayAssistantMessage,
  displayThinkingIndicator,
  clearThinkingIndicator,
} from "../ui/output.js";
import { tools, read_file } from "../tools/index.js";
import { promptPath } from "../config/index.js";
import { commandRegistry } from "./commands.js";
import { isCommandInput, parseInput } from "./command-parser.js";
import type { Message } from "../types/index.js";

import {
  exitCommand,
  helpCommand,
  clearCommand,
  modelCommand,
  providerCommand,
} from "./commands/index.js";

let currentChatSession: ChatSession | null = null;

export function getCurrentChatSession(): ChatSession | null {
  return currentChatSession;
}

export class ChatSession {
  private client: LLMClient;
  private messages: Message[] = [];
  private currentModel: string;
  private currentProvider: ProviderType = "ollama";
  private modelContextSize: number = 4000;

  constructor() {
    // Client will be initialized in start() method
    this.client = null as any; // Temporary until async initialization
    this.currentModel = "";
    currentChatSession = this;
    commandRegistry.register([
      helpCommand,
      exitCommand,
      clearCommand,
      modelCommand,
      providerCommand,
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
      this.currentModel = this.client.getCurrentModel();
      await this.clearHistory();
    }
  }

  getAvailableProviders(): ProviderType[] {
    return ["ollama", "openrouter"];
  }

  async start(): Promise<void> {
    // Initialize client on startup
    try {
      this.client = await createLLMClient(this.currentProvider);
      this.currentModel = this.client.getCurrentModel();
    } catch (error) {
      console.error(`Failed to initialize ${this.currentProvider} provider:`, error);
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
          const result = await commandRegistry.execute(parsed.fullCommand);
          if (result) {
            console.log(result);
          }
          continue;
        }
      }

      this.messages.push({ role: "user", content: userInput });

      const { fullContent, toolCalls } = await this.processStreamResponse();

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
  }> {
    const instructions = await read_file({ path: promptPath });
    const systemMessage: Message = {
      role: "system",
      content: instructions,
    };
    const stream = await this.client.chatStream(
      [systemMessage, ...this.messages],
      tools
    );

    let fullContent = "";
    let tokenCount = 0;
    let toolCalls: any = null;
    const startTime = Date.now();

    for await (const chunk of stream) {
      if (chunk.message?.content) {
        fullContent += chunk.message.content;
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
        const totalTokensUsed = systemTokens + conversationTokens + tokenCount;
        displayThinkingIndicator(
          tokenCount,
          elapsedSeconds,
          this.modelContextSize,
          totalTokensUsed
        );
      }
    }

    clearThinkingIndicator();

    // Parse tool calls from content if tool_calls field is empty
    if (!toolCalls && fullContent) {
      const extractedCalls = parseToolCallsFromContent(fullContent);
      if (extractedCalls.length > 0) {
        toolCalls = extractedCalls;
        fullContent = cleanContentFromToolCalls(fullContent, extractedCalls);
      }
    }

    return { fullContent, toolCalls };
  }

  private async continueConversation(): Promise<void> {
    const { fullContent, toolCalls } = await this.processStreamResponse();

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
