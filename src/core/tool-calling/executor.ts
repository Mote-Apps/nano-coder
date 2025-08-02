import { processToolUse } from "../message-handler.js";
import { displayToolCall } from "../../ui/output.js";
import { promptToolApproval } from "../../ui/input.js";
import type { ToolCall, ToolResult } from "../../types/index.js";
import { errorColor } from "../../ui/colors.js";

export interface ToolExecutionResult {
  executed: boolean;
  results: ToolResult[];
}


export async function executeToolCall(
  toolCall: ToolCall
): Promise<ToolResult | null> {
  const shouldExecute = await promptToolApproval(toolCall);

  if (shouldExecute) {
    const toolResult = await processToolUse(toolCall);
    displayToolCall(toolCall, toolResult);
    return toolResult;
  } else {
    console.log(
      errorColor("Tool execution cancelled. Returning to user input...")
    );
    console.log();
    return null;
  }
}

export async function executeToolCalls(
  toolCalls: ToolCall[]
): Promise<ToolExecutionResult> {
  const results: ToolResult[] = [];
  let allToolsExecuted = true;

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(toolCall);

    if (result) {
      results.push(result);
    } else {
      allToolsExecuted = false;
      break;
    }
  }

  return {
    executed: allToolsExecuted,
    results,
  };
}
