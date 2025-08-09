import { readFileSync } from "fs";
import type { CustomCommandMetadata, ParsedCommand } from "./types.js";

/**
 * Enhanced YAML frontmatter parser with support for multi-line strings and nested objects
 */
function parseEnhancedFrontmatter(frontmatter: string): CustomCommandMetadata {
  const metadata: CustomCommandMetadata = {};
  const lines = frontmatter.split("\n");
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let isMultiline = false;
  let indentLevel = 0;
  
  const processKeyValue = (key: string, value: string) => {
    const trimmedValue = value.trim();
    
    if (key === "description") {
      metadata.description = trimmedValue.replace(/^["']|["']$/g, "");
    } else if (key === "aliases") {
      // Support both array syntax and YAML dash syntax
      if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
        // JSON-style array: [alias1, alias2]
        const content = trimmedValue.slice(1, -1);
        metadata.aliases = content
          .split(",")
          .map(s => s.trim().replace(/^["']|["']$/g, ""))
          .filter(s => s.length > 0);
      } else {
        // Single value or will be handled by dash parsing below
        metadata.aliases = [trimmedValue.replace(/^["']|["']$/g, "")];
      }
    } else if (key === "parameters") {
      // Support both array syntax and YAML dash syntax
      if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
        // JSON-style array: [param1, param2]
        const content = trimmedValue.slice(1, -1);
        metadata.parameters = content
          .split(",")
          .map(s => s.trim().replace(/^["']|["']$/g, ""))
          .filter(s => s.length > 0);
      } else {
        // Single value or will be handled by dash parsing below
        metadata.parameters = [trimmedValue.replace(/^["']|["']$/g, "")];
      }
    }
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip if line is undefined
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }
    
    // Check for YAML dash syntax (array items)
    if (trimmedLine.startsWith("- ") && currentKey) {
      const arrayItem = trimmedLine.slice(2).trim().replace(/^["']|["']$/g, "");
      if (currentKey === "aliases") {
        if (!metadata.aliases) metadata.aliases = [];
        metadata.aliases.push(arrayItem);
      } else if (currentKey === "parameters") {
        if (!metadata.parameters) metadata.parameters = [];
        metadata.parameters.push(arrayItem);
      }
      continue;
    }
    
    // Check for multi-line string indicators
    if (trimmedLine.endsWith("|") || trimmedLine.endsWith(">")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        currentKey = line.slice(0, colonIndex).trim();
        isMultiline = true;
        currentValue = [];
        indentLevel = 0;
        continue;
      }
    }
    
    // Handle multi-line content
    if (isMultiline && currentKey) {
      const lineIndent = line.length - line.trimStart().length;
      
      if (trimmedLine && indentLevel === 0) {
        indentLevel = lineIndent;
      }
      
      if (trimmedLine && lineIndent >= indentLevel) {
        currentValue.push(line.slice(indentLevel));
      } else if (trimmedLine && lineIndent < indentLevel) {
        // End of multi-line block
        const multilineContent = currentValue.join("\n").trim();
        processKeyValue(currentKey, multilineContent);
        isMultiline = false;
        currentKey = null;
        currentValue = [];
        indentLevel = 0;
        // Re-process this line as a regular key-value pair
        i--; // Reprocess current line
        continue;
      } else if (!trimmedLine) {
        currentValue.push("");
      }
      
      // If this is the last line, process the accumulated multi-line value
      if (i === lines.length - 1 && currentValue.length > 0) {
        const multilineContent = currentValue.join("\n").trim();
        processKeyValue(currentKey, multilineContent);
      }
      
      continue;
    }
    
    // Handle regular key-value pairs
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    
    if (value) {
      processKeyValue(key, value);
      currentKey = key; // For potential array items following
    } else {
      currentKey = key; // Key with no immediate value, might have array items below
    }
  }
  
  return metadata;
}

/**
 * Parse a markdown file with optional YAML frontmatter
 */
export function parseCommandFile(filePath: string): ParsedCommand {
  const fileContent = readFileSync(filePath, "utf-8");
  
  // Check for frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);
  
  if (match && match[1] && match[2]) {
    // Parse YAML frontmatter
    const frontmatter = match[1];
    const content = match[2];
    let metadata: CustomCommandMetadata = {};
    
    try {
      metadata = parseEnhancedFrontmatter(frontmatter);
    } catch (error) {
      // If parsing fails, treat entire file as content
      console.warn(`Failed to parse frontmatter in ${filePath}:`, error);
      return {
        metadata: {},
        content: fileContent,
      };
    }
    
    return {
      metadata,
      content: content.trim(),
    };
  }
  
  // No frontmatter, entire file is content
  return {
    metadata: {},
    content: fileContent.trim(),
  };
}

/**
 * Replace template variables in command content
 */
export function substituteTemplateVariables(
  content: string,
  variables: Record<string, string>
): string {
  let result = content;
  
  // Replace {{variable}} patterns
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    result = result.replace(pattern, value);
  }
  
  return result;
}