import { CopilotClient } from "@github/copilot-sdk";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');

// Ensure outputs directory exists
if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

console.log('Skills directory:', SKILLS_DIR);
console.log('Outputs directory:', OUTPUTS_DIR);

class CopilotService {
    constructor() {
        this.client = null;
        this.sessions = new Map(); // Store sessions by sessionId
    }

    async initialize() {
        if (!this.client) {
            console.log("Initializing Copilot client...");
            try {
                this.client = new CopilotClient({
                    logLevel: "debug",
                    autoStart: true,
                    autoRestart: true,
                });
                console.log("✓ Copilot client created");

                await this.client.start();
                console.log("✓ Copilot client started");

                try {
                    await this.client.ping();
                    console.log("✓ Copilot CLI server is responsive");
                } catch (pingError) {
                    console.warn("⚠ Warning: Ping test failed, but continuing:", pingError.message);
                }

                console.log("✓ Copilot client initialized successfully");
            } catch (error) {
                console.error("Error initializing Copilot client:", error);
                console.error("Error details:", error.stack);
                throw error;
            }
        }
    }

    // Create a new session and return its ID
    async createNewSession(model = "gpt-4.1") {
        await this.initialize();

        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        console.log(`Creating new session: ${sessionId} with model: ${model}`);

        const session = await this.client.createSession({
            model: model,
            streaming: true,
            skillDirectories: [SKILLS_DIR],
        });

        this.sessions.set(sessionId, {
            session,
            model,
            createdAt: new Date(),
            messageCount: 0,
        });

        console.log(`✓ Session ${sessionId} created successfully`);
        return sessionId;
    }

    // Get an existing session or create a new one
    async getOrCreateSession(sessionId, model = "gpt-4.1") {
        if (sessionId && this.sessions.has(sessionId)) {
            console.log(`Using existing session: ${sessionId}`);
            return sessionId;
        }
        return await this.createNewSession(model);
    }

    // Delete a session
    deleteSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            console.log(`Deleting session: ${sessionId}`);
            const sessionData = this.sessions.get(sessionId);
            // Destroy the actual copilot session if possible
            try {
                sessionData.session.destroy?.();
            } catch (e) {
                console.warn("Could not destroy session:", e.message);
            }
            this.sessions.delete(sessionId);
            return true;
        }
        return false;
    }

    // List all active sessions
    listSessions() {
        const sessionList = [];
        for (const [id, data] of this.sessions.entries()) {
            sessionList.push({
                id,
                model: data.model,
                createdAt: data.createdAt,
                messageCount: data.messageCount,
            });
        }
        return sessionList;
    }

    async sendPrompt(prompt, model = "gpt-4.1", streaming = false, sessionId = null) {
        await this.initialize();

        console.log(`Creating session with model: ${model}, streaming: ${streaming}`);

        try {
            const session = await this.client.createSession({
                model: model,
                streaming: streaming,
                skillDirectories: [SKILLS_DIR],
            });

            console.log("✓ Session created successfully");

            return new Promise((resolve, reject) => {
                let fullResponse = "";
                const chunks = [];

                // Use generic event handler (compatible with all SDK versions)
                session.on((event) => {
                    console.log("Event received:", event.type);
                    
                    if (event.type === "assistant.message_delta") {
                        const content = event.data?.deltaContent || "";
                        if (content) {
                            fullResponse += content;
                            chunks.push(content);
                            console.log("Delta received:", content.substring(0, 50));
                        }
                    }
                    else if (event.type === "assistant.message") {
                        // Final complete message
                        const content = event.data?.content || "";
                        if (content && !fullResponse) {
                            fullResponse = content;
                        }
                        console.log("✓ Received full message:", content.substring(0, 100));
                    }
                    else if (event.type === "session.idle") {
                        console.log("✓ Session idle, resolving with response");
                        resolve({ fullResponse, chunks });
                    }
                    else if (event.type === "session.error") {
                        console.error("Session error event:", event.data);
                        reject(new Error(event.data?.message || "Unknown error"));
                    }
                });

                console.log("Sending prompt to session...");
                session.sendAndWait({ prompt })
                    .then((result) => {
                        console.log("✓ sendAndWait completed");
                        // If no response collected via events, use the result
                        if (!fullResponse && result?.data?.content) {
                            fullResponse = result.data.content;
                        }
                    })
                    .catch((error) => {
                        console.error("Error in sendAndWait:", error);
                        reject(error);
                    });
            });
        } catch (error) {
            console.error("Error creating session or sending prompt:", error);
            throw error;
        }
    }

    async sendPromptStreaming(prompt, model = "gpt-4.1", onChunk, onComplete, onError, sessionId = null) {
        try {
            await this.initialize();

            let session;
            let currentSessionId;

            // Always create a new session for streaming to ensure streaming: true is applied
            // Session reuse can cause issues with event handlers and streaming flags
            currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            console.log(`Creating new streaming session: ${currentSessionId} with model: ${model}`);

            session = await this.client.createSession({
                model: model,
                streaming: true,
                skillDirectories: [SKILLS_DIR],
            });

            this.sessions.set(currentSessionId, {
                session,
                model,
                createdAt: new Date(),
                messageCount: 1,
            });

            console.log(`✓ Streaming session ${currentSessionId} created with streaming: true`);

            return new Promise((resolve, reject) => {
                let hasCompleted = false;
                let hasError = false;
                let hasReceivedContent = false;
                let fileWatcher = null;
                let notifiedFiles = new Set();

                // Track existing files to detect new ones
                const existingFiles = new Set();
                try {
                    fs.readdirSync(OUTPUTS_DIR).forEach(file => existingFiles.add(file));
                } catch (e) {
                    console.log("Could not read outputs dir:", e.message);
                }

                // Watch for new files in outputs directory
                try {
                    fileWatcher = fs.watch(OUTPUTS_DIR, (eventType, filename) => {
                        if (eventType === 'rename' && filename && !existingFiles.has(filename) && !notifiedFiles.has(filename)) {
                            setTimeout(() => {
                                try {
                                    const filePath = path.join(OUTPUTS_DIR, filename);
                                    const stats = fs.statSync(filePath);
                                    if (stats.size > 0 && !notifiedFiles.has(filename)) {
                                        notifiedFiles.add(filename);
                                        console.log(`✓ New file detected: ${filename} (${stats.size} bytes)`);
                                        const downloadMessage = `\n\n---\n\n✅ **Your file is ready!**\n\n📥 **[Click here to download: ${filename}](/outputs/${encodeURIComponent(filename)})**\n\n💡 *Right-click and "Save As" to save the file, or click to view in your browser.*\n\n---\n`;
                                        if (!hasCompleted && !hasError) {
                                            onChunk(downloadMessage);
                                        }
                                    }
                                } catch (e) {
                                    console.log("File not ready yet:", e.message);
                                }
                            }, 500);
                        }
                    });
                } catch (e) {
                    console.log("Could not set up file watcher:", e.message);
                }

                const cleanup = () => {
                    if (fileWatcher) {
                        fileWatcher.close();
                        fileWatcher = null;
                    }
                };

                const checkForNewFiles = () => {
                    try {
                        const currentFiles = fs.readdirSync(OUTPUTS_DIR);
                        currentFiles.forEach(file => {
                            if (!existingFiles.has(file) && !notifiedFiles.has(file)) {
                                const filePath = path.join(OUTPUTS_DIR, file);
                                const stats = fs.statSync(filePath);
                                if (stats.size > 0) {
                                    notifiedFiles.add(file);
                                    console.log(`✓ File found: ${file} (${stats.size} bytes)`);
                                    const downloadMessage = `\n\n---\n\n✅ **Your file is ready!**\n\n📥 **[Click here to download: ${file}](/outputs/${encodeURIComponent(file)})**\n\n💡 *Right-click and "Save As" to save the file, or click to view in your browser.*\n\n---\n`;
                                    onChunk(downloadMessage);
                                }
                            }
                        });
                    } catch (e) {
                        console.log("Could not check for new files:", e.message);
                    }
                };

                // Timeout for long-running requests (5 minutes)
                const timeoutId = setTimeout(() => {
                    if (!hasCompleted && !hasError) {
                        console.warn("⚠ Streaming timeout - completing request");
                        checkForNewFiles();
                        cleanup();
                        hasCompleted = true;
                        onComplete(currentSessionId);
                        resolve(currentSessionId);
                    }
                }, 300000);

                // Use generic event handler (compatible with all SDK versions)
                console.log("Registering event handler on session...");
                session.on((event) => {
                    try {
                        console.log("========================================");
                        console.log("Event received:", event.type);
                        console.log("Event data:", JSON.stringify(event.data || {}).substring(0, 200));
                        console.log("========================================");
                        
                        if (event.type === "assistant.message_delta") {
                            if (!hasCompleted && !hasError) {
                                const content = event.data?.deltaContent || "";
                                if (content) {
                                    hasReceivedContent = true;
                                    console.log("Streaming delta:", content.substring(0, 50));
                                    onChunk(content);
                                }
                            }
                        }
                        else if (event.type === "assistant.reasoning_delta") {
                            if (!hasCompleted && !hasError) {
                                const content = event.data?.deltaContent || "";
                                if (content) {
                                    hasReceivedContent = true;
                                    console.log("Reasoning delta:", content.substring(0, 50));
                                    // Send reasoning to client so they see real-time progress
                                    onChunk(content);
                                }
                            }
                        }
                        else if (event.type === "assistant.message") {
                            // Final complete message - only use if no deltas received
                            if (!hasCompleted && !hasError && !hasReceivedContent) {
                                const content = event.data?.content || "";
                                if (content) {
                                    console.log("Full message (no streaming):", content.substring(0, 100));
                                    onChunk(content);
                                }
                            }
                        }
                        else if (event.type === "tool.execution_start") {
                            if (!hasCompleted && !hasError) {
                                const toolName = event.data?.toolName || "tool";
                                console.log(`Tool execution started: ${toolName}`);
                            }
                        }
                        else if (event.type === "tool.execution_complete") {
                            if (!hasCompleted && !hasError) {
                                const toolCallId = event.data?.toolCallId || "";
                                console.log(`Tool execution complete: ${toolCallId}`);
                            }
                        }
                        else if (event.type === "session.idle") {
                            if (!hasCompleted && !hasError) {
                                console.log("✓ Session idle - stream complete");
                                clearTimeout(timeoutId);
                                
                                // Small delay to ensure files are written
                                setTimeout(() => {
                                    checkForNewFiles();
                                    cleanup();
                                    hasCompleted = true;
                                    console.log("✓ Stream completed for session:", currentSessionId);
                                    onComplete(currentSessionId);
                                    resolve(currentSessionId);
                                }, 1000);
                            }
                        }
                        else if (event.type === "session.error") {
                            if (!hasError) {
                                clearTimeout(timeoutId);
                                cleanup();
                                hasError = true;
                                console.error("Session error:", event.data);
                                const error = new Error(event.data?.message || "Session error");
                                if (onError) {
                                    onError(error);
                                }
                                reject(error);
                            }
                        }
                    } catch (err) {
                        console.error("Error in event handler:", err);
                    }
                });

                // Send the prompt using send() for streaming (not sendAndWait)
                console.log("Sending prompt to streaming session...");
                console.log("Prompt:", prompt.substring(0, 100));
                session.send({ prompt })
                    .then((messageId) => {
                        console.log(`✓ Prompt sent successfully, message ID: ${messageId}`);
                        console.log("Waiting for streaming events...");
                    })
                    .catch((error) => {
                        clearTimeout(timeoutId);
                        cleanup();
                        hasError = true;
                        console.error("Error sending prompt:", error);
                        if (onError) {
                            onError(error);
                        }
                        reject(error);
                    });
            });

        } catch (error) {
            console.error("Error in sendPromptStreaming:", error);
            console.error("Error stack:", error.stack);
            if (onError && !error.handled) {
                error.handled = true;
                onError(error);
            }
            throw error;
        }
    }

    async stop() {
        if (this.client) {
            console.log("Stopping Copilot client...");
            try {
                // Destroy all sessions first
                for (const [id, data] of this.sessions.entries()) {
                    try {
                        await data.session.destroy?.();
                    } catch (e) {
                        console.warn(`Could not destroy session ${id}:`, e.message);
                    }
                }
                this.sessions.clear();
                
                await this.client.stop();
                console.log("✓ Copilot client stopped");
            } catch (error) {
                console.error("Error stopping Copilot client:", error);
            }
            this.client = null;
        }
    }
}

export default CopilotService;
