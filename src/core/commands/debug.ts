import type { Command } from "../../types/index.js";
import * as p from "@clack/prompts";
import { primaryColor, secondaryColor } from "../../ui/colors.js";
import { getLogLevel, setLogLevel, type LogLevel } from "../../config/logging.js";

export const debugCommand: Command = {
  name: "debug",
  description: "Toggle debug/verbose logging output",
  handler: async (args: string[]): Promise<void> => {
    const currentLevel = getLogLevel();
    
    // If no argument provided, cycle through levels
    if (args.length === 0) {
      let newLevel: LogLevel;
      switch (currentLevel) {
        case "silent":
          newLevel = "normal";
          break;
        case "normal":
          newLevel = "verbose";
          break;
        case "verbose":
          newLevel = "silent";
          break;
        default:
          newLevel = "normal";
      }
      
      setLogLevel(newLevel);
      p.log.message(`Logging level changed from ${primaryColor(currentLevel)} to ${primaryColor(newLevel)}\n${getLogLevelDescription(newLevel)}`);
      return;
    }
    
    // If argument provided, set specific level
    const requestedLevel = args[0]?.toLowerCase();
    if (requestedLevel === "silent" || requestedLevel === "normal" || requestedLevel === "verbose") {
      setLogLevel(requestedLevel as LogLevel);
      p.log.message(`Logging level set to ${primaryColor(requestedLevel)}\n${getLogLevelDescription(requestedLevel as LogLevel)}`);
      return;
    }
    
    // Show current level and available options
    p.log.message(`Current logging level: ${primaryColor(currentLevel)}\n${getLogLevelDescription(currentLevel)}\n\n` +
           `Available levels:\n` +
           `  ${secondaryColor("silent")}  - Minimal output (errors only)\n` +
           `  ${secondaryColor("normal")}  - Standard output (default)\n` +
           `  ${secondaryColor("verbose")} - Debug output (all logs)\n\n` +
           `Usage: /debug [silent|normal|verbose]`);
  },
};

function getLogLevelDescription(level: LogLevel): string {
  switch (level) {
    case "silent":
      return secondaryColor("Silent mode: Only showing errors and essential messages");
    case "normal":
      return secondaryColor("Normal mode: Showing standard output without debug info");
    case "verbose":
      return secondaryColor("Verbose mode: Showing all debug and diagnostic information");
    default:
      return "";
  }
}