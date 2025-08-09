import type { Message, Tool, LLMClient } from "../types/index.js";
import * as p from "@clack/prompts";

export class OpenAICompatibleClient implements LLMClient {
  private baseUrl: string;
  private apiKey?: string;
  private currentModel: string;
  private availableModels: string[];

  constructor(baseUrl: string, apiKey?: string, models?: string[]) {
    // Ensure baseUrl ends without a trailing slash for consistent URL construction
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.availableModels = models || ["default"];
    this.currentModel = this.availableModels[0]!;
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  getContextSize(): number {
    // Default context size for OpenAI-compatible APIs
    // This could be made configurable per model if needed
    return 32768;
  }

  async getAvailableModels(): Promise<string[]> {
    // If models are configured, return them
    if (
      this.availableModels.length > 0 &&
      this.availableModels[0] !== "default"
    ) {
      return this.availableModels;
    }

    // Try to fetch models from the API
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers,
      });

      if (response.ok) {
        const data: any = await response.json();
        const models = data.data?.map((model: any) => model.id) || [];
        if (models.length > 0) {
          this.availableModels = models;
          if (!this.currentModel || this.currentModel === "default") {
            this.currentModel = models[0];
          }
        }
        return models;
      }
    } catch (error) {
      console.warn("Failed to fetch models from OpenAI-compatible API:", error);
    }

    return this.availableModels;
  }

  /**
   * Determines the appropriate tool_choice value based on messages and tools
   */
  private _getToolChoice(messages: Message[], tools: Tool[]): "required" | undefined {
    if (tools.length === 0) return undefined;
    
    // Check if the last user message suggests tool usage
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const shouldForceTools =
      lastUserMessage &&
      (lastUserMessage.content?.toLowerCase().includes("retrieve") ||
        lastUserMessage.content?.toLowerCase().includes("check") ||
        lastUserMessage.content?.toLowerCase().includes("search") ||
        lastUserMessage.content?.toLowerCase().includes("find") ||
        lastUserMessage.content?.toLowerCase().includes("get") ||
        lastUserMessage.content?.toLowerCase().includes("list") ||
        lastUserMessage.content?.toLowerCase().includes("show"));

    return shouldForceTools ? "required" : undefined;
  }

  async chat(messages: Message[], tools: Tool[]): Promise<any> {
    const toolChoice = this._getToolChoice(messages, tools);

    const requestBody: any = {
      model: this.currentModel,
      messages: messages.map((msg) => {
        // Convert tool result messages to user messages for Anthropic compatibility
        if (msg.role === "tool") {
          return {
            role: "user",
            content: `Tool result for ${msg.name}:\n${msg.content || ""}`,
          };
        }

        const cleanMsg: any = {
          role: msg.role,
          content: msg.content || "",
        };

        // Note: Anthropic API doesn't support tool_calls in messages
        // Tool calling is handled differently, so we don't include tool_calls here
        // The model will output tool calls in its content which we parse separately

        return cleanMsg;
      }),
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 4096,
      stream: false,
      tool_choice: toolChoice,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = `OpenAI-compatible API error: ${response.status} ${response.statusText}`;

      try {
        const errorData = (await response.json()) as any;
        if (errorData.error?.message) {
          errorMessage += ` - ${errorData.error.message}`;
        }
      } catch {
        // If we can't parse the error response, use the basic message
      }

      p.log.error(errorMessage);
      return null;
    }

    return await response.json();
  }

  async *chatStream(messages: Message[], tools: Tool[]): AsyncIterable<any> {
    const toolChoice = this._getToolChoice(messages, tools);

    const requestBody: any = {
      model: this.currentModel,
      messages: messages.map((msg) => {
        // Convert tool result messages to user messages for Anthropic compatibility
        if (msg.role === "tool") {
          return {
            role: "user",
            content: `Tool result for ${msg.name}:\n${msg.content || ""}`,
          };
        }

        const cleanMsg: any = {
          role: msg.role,
          content: msg.content || "",
        };

        // Note: Anthropic API doesn't support tool_calls in messages
        // Tool calling is handled differently, so we don't include tool_calls here
        // The model will output tool calls in its content which we parse separately

        return cleanMsg;
      }),
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 4096,
      stream: true,
      tool_choice: toolChoice,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = `OpenAI-compatible API error: ${response.status} ${response.statusText}`;

      try {
        const errorData = (await response.json()) as any;
        if (errorData.error?.message) {
          errorMessage += ` - ${errorData.error.message}`;
        }
      } catch {
        // If we can't parse the error response, use the basic message
      }

      p.log.error(errorMessage);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      p.log.error("Failed to get response reader");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedContent = "";
    let accumulatedToolCalls: any[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              // Yield final result with accumulated tool calls
              if (accumulatedToolCalls.length > 0) {
                // Parse arguments as JSON objects
                const processedToolCalls = accumulatedToolCalls.map((tool) => ({
                  ...tool,
                  function: {
                    ...tool.function,
                    arguments: tool.function.arguments
                      ? JSON.parse(tool.function.arguments)
                      : {},
                  },
                }));

                yield {
                  message: {
                    content: accumulatedContent,
                    tool_calls: processedToolCalls,
                  },
                  done: true,
                };
              } else {
                yield { done: true };
              }
              return;
            }

            try {
              const chunk = JSON.parse(data);

              // Accumulate content
              if (chunk.choices?.[0]?.delta?.content) {
                accumulatedContent += chunk.choices[0].delta.content;
                yield {
                  message: {
                    content: chunk.choices[0].delta.content,
                  },
                  done: false,
                };
              }

              // Accumulate tool calls (OpenAI streams them in pieces)
              if (chunk.choices?.[0]?.delta?.tool_calls) {
                const deltaToolCalls = chunk.choices[0].delta.tool_calls;
                for (const deltaTool of deltaToolCalls) {
                  if (deltaTool.index !== undefined) {
                    // Ensure we have an entry for this index
                    while (accumulatedToolCalls.length <= deltaTool.index) {
                      accumulatedToolCalls.push({
                        id: "",
                        type: "function",
                        function: { name: "", arguments: "" },
                      });
                    }

                    const currentTool = accumulatedToolCalls[deltaTool.index];

                    // Accumulate the tool call data
                    if (deltaTool.id) currentTool.id = deltaTool.id;
                    if (deltaTool.type) currentTool.type = deltaTool.type;
                    if (deltaTool.function?.name)
                      currentTool.function.name = deltaTool.function.name;
                    if (deltaTool.function?.arguments) {
                      currentTool.function.arguments +=
                        deltaTool.function.arguments;
                    }
                  }
                }
              }
            } catch (e) {
              // Skip invalid JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async clearContext(): Promise<void> {
    // OpenAI-compatible APIs are typically stateless, no context to clear
  }
}
