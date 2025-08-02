#!/usr/bin/env node
import { ChatSession } from "./core/chat.js";
import { displayWelcome, initializeTerminal } from "./ui/output.js";

// Initialize terminal with bottom margin first
initializeTerminal();

displayWelcome();

const chat = new ChatSession();
chat.start().catch(console.error);
