import { Command } from "../../types/index.js";
import { commandRegistry } from "../commands.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { blueColor, primaryColor } from "../../ui/colors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8")
);

export const helpCommand: Command = {
  name: "help",
  description: "Show available commands",
  handler: async (_args: string[]) => {
    const commands = commandRegistry.getAll();

    const commandList =
      commands.length === 0
        ? "No commands available."
        : commands
            .map(
              (cmd) => `  • ${blueColor("/" + cmd.name)} - ${cmd.description}`
            )
            .join("\n");

    console.log(`
${primaryColor(
  "NanoCoder " +
    packageJson.version +
    " - AI-Powered Code Assistant with Ollama."
)}

Always review model responses, especially when running code. Models have read access to files in the current directory and can run commands and edit files with your permission.

${primaryColor("Common Tasks:")}
  • Ask questions about your codebase > How does foo.py work?
  • Edit files > Update bar.ts to...
  • Fix errors > cargo build
  • Run commands > /help

${primaryColor("Commands:")}
${commandList}
    `);
  },
};
