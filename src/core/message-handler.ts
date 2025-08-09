import type { ToolCall, ToolResult, ToolHandler } from '../types/index.js';

// This will be set by the ChatSession
let toolRegistryGetter: (() => Record<string, ToolHandler>) | null = null;

export function setToolRegistryGetter(getter: () => Record<string, ToolHandler>) {
  toolRegistryGetter = getter;
}

export async function processToolUse(toolCall: ToolCall): Promise<ToolResult> {
  if (!toolRegistryGetter) {
    throw new Error('Tool registry not initialized');
  }
  
  const toolRegistry = toolRegistryGetter();
  const handler = toolRegistry[toolCall.function.name];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolCall.function.name}`);
  }

  const result = await handler(toolCall.function.arguments);

  return {
    tool_call_id: toolCall.id,
    role: "tool",
    name: toolCall.function.name,
    content: result,
  };
}
