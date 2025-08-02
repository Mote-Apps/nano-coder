import type { Message, Tool, LLMClient } from "../types/index.js";
import { errorColor } from "../ui/colors.js";

export class OpenRouterClient implements LLMClient {
  private apiKey: string;
  private currentModel: string;
  private availableModels: string[];
  private modelInfo: Map<string, any> = new Map();

  constructor(apiKey: string, models: string[]) {
    this.apiKey = apiKey;
    this.availableModels = models;
    this.currentModel = models[0]!;
    // Pre-fetch model info for all available models
    this.fetchModelInfo();
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  private async fetchModelInfo(): Promise<void> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data: any = await response.json();
        for (const model of data.data) {
          this.modelInfo.set(model.id, model);
        }
      }
    } catch (error) {
      console.warn("Failed to fetch OpenRouter model info:", error);
    }
  }

  getContextSize(): number {
    const modelData = this.modelInfo.get(this.currentModel);
    if (modelData && modelData.context_length) {
      return modelData.context_length;
    }

    // Fallback to reasonable default
    return 32768;
  }

  async getAvailableModels(): Promise<string[]> {
    return this.availableModels;
  }

  async chat(messages: Message[], tools: Tool[]): Promise<any> {
    const requestBody = {
      model: this.currentModel,
      messages: messages.map((msg) => {
        // Filter message to only include fields supported by OpenRouter
        const cleanMsg: any = {
          role: msg.role,
          content: msg.content || "",
        };

        // Include tool_calls for assistant messages
        if (msg.role === "assistant" && msg.tool_calls) {
          cleanMsg.tool_calls = msg.tool_calls.map((toolCall: any) => ({
            ...toolCall,
            function: {
              ...toolCall.function,
              arguments:
                typeof toolCall.function.arguments === "string"
                  ? toolCall.function.arguments
                  : JSON.stringify(toolCall.function.arguments),
            },
          }));
        }

        // Only include tool_call_id for tool messages
        if (msg.role === "tool" && msg.tool_call_id) {
          cleanMsg.tool_call_id = msg.tool_call_id;
        }

        // Only include name for tool messages
        if (msg.role === "tool" && msg.name) {
          cleanMsg.name = msg.name;
        }

        return cleanMsg;
      }),
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 4096,
      stream: false,
    };

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "NanoCoder",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;

      // Try to get more detailed error information
      try {
        const errorData = (await response.json()) as any;
        if (errorData.error?.message) {
          errorMessage += ` - ${errorData.error.message}`;
        }
      } catch {
        // If we can't parse the error response, use the basic message
      }

      console.log(errorColor(`\n❌ ${errorMessage}\n`));
      return null; // Return null to indicate error
    }

    return await response.json();
  }

  async *chatStream(messages: Message[], tools: Tool[]): AsyncIterable<any> {
    const requestBody = {
      model: this.currentModel,
      messages: messages.map((msg) => {
        // Filter message to only include fields supported by OpenRouter
        const cleanMsg: any = {
          role: msg.role,
          content: msg.content || "",
        };

        // Include tool_calls for assistant messages
        if (msg.role === "assistant" && msg.tool_calls) {
          cleanMsg.tool_calls = msg.tool_calls.map((toolCall: any) => ({
            ...toolCall,
            function: {
              ...toolCall.function,
              arguments:
                typeof toolCall.function.arguments === "string"
                  ? toolCall.function.arguments
                  : JSON.stringify(toolCall.function.arguments),
            },
          }));
        }

        // Only include tool_call_id for tool messages
        if (msg.role === "tool" && msg.tool_call_id) {
          cleanMsg.tool_call_id = msg.tool_call_id;
        }

        // Only include name for tool messages
        if (msg.role === "tool" && msg.name) {
          cleanMsg.name = msg.name;
        }

        return cleanMsg;
      }),
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 4096,
      stream: true,
    };

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "NanoCoder",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;

      // Try to get more detailed error information
      try {
        const errorData = (await response.json()) as any;
        if (errorData.error?.message) {
          errorMessage += ` - ${errorData.error.message}`;
        }
      } catch {
        // If we can't parse the error response, use the basic message
      }

      console.log(errorColor(`\n⨯ ${errorMessage}\n`));
      return; // Gracefully exit the generator without yielding any chunks
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.log(errorColor(`\n⨯ Failed to get response reader\n`));
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

              // Accumulate tool calls (OpenRouter streams them in pieces)
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
    // OpenRouter is stateless, no context to clear
  }
}
