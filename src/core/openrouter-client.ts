import type { Message, Tool, LLMClient } from "../types/index.js";

export class OpenRouterClient implements LLMClient {
  private apiKey: string;
  private currentModel: string;
  private availableModels: string[];

  constructor(apiKey: string, models: string[]) {
    this.apiKey = apiKey;
    this.availableModels = models;
    this.currentModel = models[0]!;
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
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
              arguments: typeof toolCall.function.arguments === 'string' 
                ? toolCall.function.arguments 
                : JSON.stringify(toolCall.function.arguments)
            }
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
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}`
      );
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
              arguments: typeof toolCall.function.arguments === 'string' 
                ? toolCall.function.arguments 
                : JSON.stringify(toolCall.function.arguments)
            }
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
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
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
                const processedToolCalls = accumulatedToolCalls.map(tool => ({
                  ...tool,
                  function: {
                    ...tool.function,
                    arguments: tool.function.arguments ? JSON.parse(tool.function.arguments) : {}
                  }
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
                        function: { name: "", arguments: "" }
                      });
                    }
                    
                    const currentTool = accumulatedToolCalls[deltaTool.index];
                    
                    // Accumulate the tool call data
                    if (deltaTool.id) currentTool.id = deltaTool.id;
                    if (deltaTool.type) currentTool.type = deltaTool.type;
                    if (deltaTool.function?.name) currentTool.function.name = deltaTool.function.name;
                    if (deltaTool.function?.arguments) {
                      currentTool.function.arguments += deltaTool.function.arguments;
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
