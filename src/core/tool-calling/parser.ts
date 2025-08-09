import type { ToolCall } from "../../types/index.js";
import * as p from "@clack/prompts";

/**
 * Validates if a tool name and inner content are valid for tool call processing
 */
function isValidToolCall(toolName?: string, innerContent?: string): boolean {
  return !!(toolName && innerContent);
}

/**
 * Validates if parameter name and value are valid for processing
 */
function isValidParameter(paramName?: string, paramValue?: string): boolean {
  return !!(paramName && paramValue !== undefined);
}

export function parseToolCallsFromContent(content: string): ToolCall[] {
  const extractedCalls: ToolCall[] = [];
  let trimmedContent = content.trim();

  // Handle markdown code blocks
  const codeBlockMatch = trimmedContent.match(
    /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/
  );
  if (codeBlockMatch && codeBlockMatch[1]) {
    trimmedContent = codeBlockMatch[1].trim();
  }

  // Try to parse entire content as single JSON tool call
  if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
    // Skip empty or nearly empty JSON objects
    if (trimmedContent === "{}" || trimmedContent.replace(/\s/g, "") === "{}") {
      return extractedCalls;
    }
    
    try {
      const parsed = JSON.parse(trimmedContent);
      
      if (parsed.name && parsed.arguments !== undefined) {
        extractedCalls.push({
          id: `call_${Date.now()}`,
          function: {
            name: parsed.name || "",
            arguments: parsed.arguments || {},
          },
        });
        return extractedCalls;
      }
    } catch (e) {
      p.log.warn("Tool call failed to parse from JSON code block.");
    }
  }

  // Look for standalone JSON blocks in the content (multiline without code blocks)
  const jsonBlockRegex =
    /\{\s*\n\s*"name":\s*"([^"]+)",\s*\n\s*"arguments":\s*\{[\s\S]*?\}\s*\n\s*\}/g;
  let jsonMatch;
  while ((jsonMatch = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.name && parsed.arguments !== undefined) {
        extractedCalls.push({
          id: `call_${Date.now()}_${extractedCalls.length}`,
          function: {
            name: parsed.name || "",
            arguments: parsed.arguments || {},
          },
        });
      }
    } catch (e) {
      p.log.warn("Tool call failed to parse from JSON block.");
    }
  }

  // Look for direct MCP tool calls like <create_memory_project>...<project_name>...</project_name>...</create_memory_project>
  // This handles MCP tools that are called directly with nested parameter tags
  const directMcpToolCallRegex = /<([a-zA-Z_][a-zA-Z0-9_]*)\s*>([\s\S]*?)<\/\1>/g;
  let directMatch;
  while ((directMatch = directMcpToolCallRegex.exec(content)) !== null) {
    const [fullMatch, toolName, innerContent] = directMatch;
    
    // Skip if toolName or innerContent is undefined
    if (!isValidToolCall(toolName, innerContent)) {
      continue;
    }
    
    // Skip if this is a known non-tool tag or if it contains other tool calls
    if (toolName === 'use_mcp_tool' || toolName === 'execute_bash' || 
        toolName === 'bash' || toolName === 'read_file' || toolName === 'write_file' ||
        fullMatch.includes('<use_mcp_tool>') || fullMatch.includes('<execute_bash>')) {
      continue;
    }
    
    // Check if this looks like an MCP tool call with nested parameter tags
    if (innerContent && innerContent.includes('<') && innerContent.includes('>')) {
      try {
        // Parse nested XML tags as parameters
        const paramRegex = /<([^>]+)>([^<]*)<\/\1>/g;
        let paramMatch;
        const args: Record<string, any> = {};
        
        while ((paramMatch = paramRegex.exec(innerContent)) !== null) {
          const [, paramName, paramValue] = paramMatch;
          // Skip if paramName or paramValue is undefined
          if (!isValidParameter(paramName, paramValue)) {
            continue;
          }
          
          // paramValue is guaranteed to be defined here due to validation
          const trimmedValue = paramValue!.trim();
          // Try to parse as JSON if it looks like JSON, otherwise use as string
          if (trimmedValue.startsWith('{') || trimmedValue.startsWith('[')) {
            try {
              args[paramName!] = JSON.parse(trimmedValue);
            } catch {
              args[paramName!] = trimmedValue;
            }
          } else if (trimmedValue === 'true' || trimmedValue === 'false') {
            args[paramName!] = trimmedValue === 'true';
          } else if (!isNaN(Number(trimmedValue))) {
            args[paramName!] = Number(trimmedValue);
          } else {
            args[paramName!] = trimmedValue;
          }
        }
        
        // Only add if we found parameters
        if (Object.keys(args).length > 0) {
          extractedCalls.push({
            id: `call_${Date.now()}_${extractedCalls.length}`,
            function: {
              name: toolName!,
              arguments: args,
            },
          });
        }
      } catch (e) {
        p.log.warn(`Failed to parse direct MCP tool call: ${toolName}`);
      }
    }
  }

  // Look for MCP tool calls in the format: <use_mcp_tool>...<tool_name>...</tool_name>...<arguments>...</arguments></use_mcp_tool>
  const mcpToolCallRegex = /<use_mcp_tool>\s*<server_name>([^<]+)<\/server_name>\s*<tool_name>([^<]+)<\/tool_name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/use_mcp_tool>/g;
  let mcpMatch;
  while ((mcpMatch = mcpToolCallRegex.exec(content)) !== null) {
    const [, serverName, toolName, argsStr] = mcpMatch;
    try {
      if (toolName && argsStr) {
        // Parse the arguments JSON
        const args = JSON.parse(argsStr.trim());
        extractedCalls.push({
          id: `call_${Date.now()}_${extractedCalls.length}`,
          function: {
            name: toolName, // Use the tool name directly, the tool manager will handle routing
            arguments: args,
          },
        });
      }
    } catch (e) {
      p.log.warn("MCP tool call failed to parse from XML.");
    }
  }

  // Look for XML-style tool calls like <execute_bash>
  const xmlToolCallRegex =
    /<([a-zA-Z_][a-zA-Z0-9_]*)\s*>\s*\{\s*"?([^"]*)"?\s*:\s*"([^"]*)"\s*\}\s*<\/\1>/g;
  let xmlMatch;
  while ((xmlMatch = xmlToolCallRegex.exec(content)) !== null) {
    const [, toolName, argKey, argValue] = xmlMatch;
    try {
      if (toolName && argKey && argValue !== undefined) {
        const args: { [key: string]: string } = {};
        args[argKey] = argValue;
        extractedCalls.push({
          id: `call_${Date.now()}_${extractedCalls.length}`,
          function: {
            name: toolName,
            arguments: args,
          },
        });
      }
    } catch (e) {
      p.log.warn("Tool call failed to parse from XML.");
    }
  }

  // Look for embedded tool calls using regex patterns
  const toolCallPatterns = [
    /\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]*\})\}/g,
    /\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\}/g,
    /\{"name":\s*"([^"]+)",\s*"arguments":\s*"([^"]+)"\}/g,
  ];

  for (const pattern of toolCallPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const [, name, argsStr] = match;
      try {
        let args;
        if (argsStr && argsStr.startsWith("{")) {
          args = JSON.parse(argsStr || "{}");
        } else {
          args = argsStr || "";
        }
        extractedCalls.push({
          id: `call_${Date.now()}_${extractedCalls.length}`,
          function: {
            name: name || "",
            arguments: args as { [key: string]: any },
          },
        });
      } catch (e) {
        p.log.warn("Tool call failed to parse from content.");
      }
    }
  }

  // Deduplicate identical tool calls
  const uniqueCalls = deduplicateToolCalls(extractedCalls);

  return uniqueCalls;
}

function deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  const unique: ToolCall[] = [];

  for (const call of toolCalls) {
    // Create a hash of the function name and arguments for comparison
    const hash = `${call.function.name}:${JSON.stringify(
      call.function.arguments
    )}`;

    if (!seen.has(hash)) {
      seen.add(hash);
      unique.push(call);
    } else {
    }
  }

  return unique;
}

/**
 * Cleans content by removing tool call JSON blocks
 */
export function cleanContentFromToolCalls(
  content: string,
  toolCalls: ToolCall[]
): string {
  if (toolCalls.length === 0) return content;

  let cleanedContent = content;

  // Remove direct MCP tool calls that were successfully parsed
  // We need to be careful to only remove the ones that were actually parsed as tool calls
  for (const call of toolCalls) {
    const toolName = call.function.name;
    // Create a regex to match this specific tool call with its parameters
    const directToolRegex = new RegExp(
      `<${toolName}\\s*>[\\s\\S]*?<\\/${toolName}>`,
      'g'
    );
    cleanedContent = cleanedContent.replace(directToolRegex, "").trim();
  }

  // Remove MCP tool calls
  const mcpToolCallRegex = /<use_mcp_tool>\s*<server_name>[^<]+<\/server_name>\s*<tool_name>[^<]+<\/tool_name>\s*<arguments>[\s\S]*?<\/arguments>\s*<\/use_mcp_tool>/g;
  cleanedContent = cleanedContent.replace(mcpToolCallRegex, "").trim();

  // Handle markdown code blocks that contain only tool calls
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  cleanedContent = cleanedContent.replace(codeBlockRegex, (match, blockContent) => {
    const trimmedBlock = blockContent.trim();
    
    // Check if this block contains a tool call that we parsed
    try {
      const parsed = JSON.parse(trimmedBlock);
      if (parsed.name && parsed.arguments !== undefined) {
        // This code block contains only a tool call, remove the entire block
        return "";
      }
    } catch (e) {
      // Not valid JSON, keep the code block
    }
    
    // Keep the code block as-is if it doesn't contain a tool call
    return match;
  });

  // Remove XML-style tool calls
  const xmlToolCallRegex =
    /<([a-zA-Z_][a-zA-Z0-9_]*)\s*>\s*\{\s*"?([^"]*)"?\s*:\s*"([^"]*)"\s*\}\s*<\/\1>/g;
  cleanedContent = cleanedContent.replace(xmlToolCallRegex, "").trim();

  // Remove JSON blocks that were parsed as tool calls (for non-code-block cases)
  const toolCallPatterns = [
    /\{\s*\n\s*"name":\s*"([^"]+)",\s*\n\s*"arguments":\s*\{[\s\S]*?\}\s*\n\s*\}/g, // Multiline JSON blocks
    /\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]*\})\}/g,
    /\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\}/g,
    /\{"name":\s*"([^"]+)",\s*"arguments":\s*"([^"]+)"\}/g,
  ];

  for (const pattern of toolCallPatterns) {
    cleanedContent = cleanedContent.replace(pattern, "").trim();
  }

  // Clean up extra whitespace and newlines
  cleanedContent = cleanedContent
    .replace(/\n\s*\n\s*\n/g, "\n\n") // Reduce multiple newlines to double
    .replace(/^\s*\n+|\n+\s*$/g, "") // Remove leading/trailing newlines
    .trim();

  return cleanedContent;
}
