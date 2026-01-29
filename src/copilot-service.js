import { CopilotClient } from "@github/copilot-sdk";
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

console.log('Skills directory:', SKILLS_DIR);

class CopilotService {
    constructor() {
        this.client = null;
        this.sessions = new Map(); // Store sessions by sessionId
    }

    async initialize() {
        if (!this.client) {
            console.log("Initializing Copilot client...");
            try {
                // Initialize with debug logging enabled
                this.client = new CopilotClient({
                    logLevel: "debug",
                    useStdio: true,
                    autoStart: true,
                    autoRestart: true,
                });
                console.log("✓ Copilot client created");

                // Start the client explicitly
                await this.client.start();
                console.log("✓ Copilot client started");

                // Verify connectivity with ping
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

        // For non-streaming, we still create a new session each time for simplicity
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
                let receivedIdle = false;

                session.on((event) => {
                    console.log("Session event:", event.type);

                    if (event.type === "assistant.message_delta") {
                        fullResponse += event.data.deltaContent;
                        chunks.push(event.data.deltaContent);
                    }
                    if (event.type === "assistant.message") {
                        // Full message event (non-streaming)
                        fullResponse = event.data.content || "";
                        console.log("✓ Received full message:", fullResponse.substring(0, 100));
                    }
                    if (event.type === "session.idle") {
                        receivedIdle = true;
                        console.log("✓ Session idle, resolving with response");
                        resolve({ fullResponse, chunks });
                    }
                    if (event.type === "error") {
                        console.error("Session error event:", event.data);
                        reject(new Error(event.data.message || "Unknown error"));
                    }
                });

                console.log("Sending prompt to session...");
                session.sendAndWait({ prompt })
                    .then(() => {
                        console.log("✓ sendAndWait completed");
                        // If we didn't receive idle event, wait a bit
                        if (!receivedIdle) {
                            setTimeout(() => {
                                if (!receivedIdle) {
                                    console.log("No idle event received, resolving anyway");
                                    resolve({ fullResponse, chunks });
                                }
                            }, 1000);
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
            let currentSessionId = sessionId;
            let isNewSession = false;

            // Check if we have an existing session
            if (sessionId && this.sessions.has(sessionId)) {
                console.log(`Using existing session: ${sessionId}`);
                const sessionData = this.sessions.get(sessionId);
                session = sessionData.session;
                sessionData.messageCount++;
            } else {
                // Create a new session
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

                isNewSession = true;
                console.log(`✓ Streaming session ${currentSessionId} created`);
            }

            return new Promise((resolve, reject) => {
                let hasCompleted = false;
                let hasError = false;
                let hasReceivedDeltas = false; // Track if we've received streaming deltas
                let accumulatedContent = ''; // Track accumulated content to strip prompt
                let promptStripped = false; // Track if we've already stripped the prompt

                // Set a timeout to handle cases where no events are received
                const timeoutId = setTimeout(() => {
                    if (!hasCompleted && !hasError) {
                        console.warn("⚠ Streaming timeout - no completion event received");
                        hasCompleted = true;
                        onComplete(currentSessionId);
                        resolve(currentSessionId);
                    }
                }, 120000); // 2 minute timeout

                session.on((event) => {
                    try {
                        // Log full event for debugging
                        console.log("Streaming event received:", JSON.stringify(event, null, 2).substring(0, 500));

                        const eventType = event.type || event.event || event.kind;
                        const eventData = event.data || event.payload || event;

                        console.log("Parsed event type:", eventType);

                        if (eventType === "assistant.message_delta" || eventType === "message_delta" || eventType === "delta") {
                            if (!hasCompleted && !hasError) {
                                let content = eventData?.deltaContent || eventData?.delta?.content || eventData?.content || eventData?.text || "";
                                console.log("Delta content:", content ? content.substring(0, 50) : "EMPTY");
                                if (content) {
                                    hasReceivedDeltas = true; // Mark that we've received deltas

                                    // Accumulate content and strip prompt if it appears at the start
                                    accumulatedContent += content;

                                    if (!promptStripped) {
                                        // Check if accumulated content starts with the user's prompt
                                        const normalizedAccumulated = accumulatedContent.trim().toLowerCase();
                                        const normalizedPrompt = prompt.trim().toLowerCase();

                                        if (normalizedAccumulated.startsWith(normalizedPrompt)) {
                                            console.log('Detected prompt echo at start, stripping it');
                                            // Strip the prompt from accumulated content
                                            accumulatedContent = accumulatedContent.trim().substring(prompt.trim().length).trimStart();
                                            promptStripped = true;
                                            // Send the stripped content
                                            if (accumulatedContent) {
                                                onChunk(accumulatedContent);
                                            }
                                            // Reset accumulated content since we already sent it
                                            accumulatedContent = '';
                                            return; // Don't send the original content
                                        } else if (accumulatedContent.length > prompt.length * 2) {
                                            // We've accumulated enough content to know the prompt isn't at the start
                                            promptStripped = true;
                                        }
                                    }

                                    // Send the content as-is if prompt already stripped or not detected
                                    onChunk(content);
                                }
                            }
                        }
                        else if (eventType === "assistant.message" || eventType === "message") {
                            // Only send full message if we haven't received any deltas
                            // This prevents duplicate content when streaming
                            if (!hasCompleted && !hasError && !hasReceivedDeltas) {
                                let content = eventData?.content || eventData?.message || eventData?.text || "";
                                console.log("Full message received (no deltas, sending):", content ? content.substring(0, 100) : "EMPTY");
                                if (content) {
                                    // Strip prompt from full message if it starts with it
                                    const normalizedContent = content.trim().toLowerCase();
                                    const normalizedPrompt = prompt.trim().toLowerCase();

                                    if (normalizedContent.startsWith(normalizedPrompt)) {
                                        console.log('Detected prompt echo in full message, stripping it');
                                        content = content.trim().substring(prompt.trim().length).trimStart();
                                    }

                                    if (content) {
                                        onChunk(content);
                                    }
                                }
                            } else {
                                console.log("Full message received (ignoring, already streamed deltas)");
                            }
                        }
                        else if (eventType === "session.idle" || eventType === "idle" || eventType === "done" || eventType === "complete") {
                            if (!hasCompleted && !hasError) {
                                clearTimeout(timeoutId);
                                hasCompleted = true;
                                console.log("✓ Stream completed for session:", currentSessionId);
                                onComplete(currentSessionId); // Pass sessionId to completion callback
                                resolve(currentSessionId);
                            }
                        }
                        else if (eventType === "tool.output" || eventType === "tool_output" || eventType === "tool.result") {
                            // Handle skill/tool execution outputs
                            if (!hasCompleted && !hasError) {
                                const content = eventData?.output || eventData?.result || eventData?.content || eventData?.text || "";
                                console.log("Tool output:", content ? content.substring(0, 100) : "EMPTY");
                                if (content) {
                                    onChunk(content);
                                }
                            }
                        }
                        else if (eventType === "assistant.status" || eventType === "status" || eventType === "progress") {
                            // Handle status/progress updates (like validation steps)
                            if (!hasCompleted && !hasError) {
                                const content = eventData?.message || eventData?.status || eventData?.content || eventData?.text || "";
                                console.log("Status update:", content ? content.substring(0, 100) : "EMPTY");
                                if (content) {
                                    onChunk(content + '\n');
                                }
                            }
                        }
                        else if (eventType === "error") {
                            if (!hasError) {
                                clearTimeout(timeoutId);
                                hasError = true;
                                console.error("Stream error event:", eventData);
                                const error = new Error(eventData?.message || eventData?.error || "Unknown error");
                                if (onError) {
                                    onError(error);
                                }
                                reject(error);
                            }
                        }
                        else {
                            // Try to extract text content from unhandled events
                            // This captures skill execution outputs, validation messages, etc.
                            const content = eventData?.content || eventData?.text || eventData?.message || eventData?.output || "";
                            if (content && typeof content === 'string' && !hasCompleted && !hasError) {
                                console.log("Unhandled event has content, sending:", content.substring(0, 100));
                                onChunk(content);
                            } else {
                                console.log("Unhandled streaming event type (no content):", eventType, JSON.stringify(event).substring(0, 200));
                            }
                        }
                    } catch (error) {
                        console.error("Error in session event handler:", error);
                        if (!hasCompleted && !hasError) {
                            clearTimeout(timeoutId);
                            hasError = true;
                            if (onError) {
                                onError(error);
                            }
                            reject(error);
                        }
                    }
                });

                console.log("Sending prompt to streaming session...");
                // Use send() for streaming - sendAndWait() blocks and doesn't emit delta events
                try {
                    session.send({ prompt });
                    console.log("✓ Prompt sent to streaming session (awaiting events...)");
                } catch (sendError) {
                    clearTimeout(timeoutId);
                    hasError = true;
                    console.error("Error sending prompt:", sendError);
                    if (onError) {
                        onError(sendError);
                    }
                    reject(sendError);
                }
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
