import { CopilotClient } from "@github/copilot-sdk";

class CopilotService {
    constructor() {
        this.client = null;
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

    async sendPrompt(prompt, model = "gpt-4.1", streaming = false) {
        await this.initialize();

        console.log(`Creating session with model: ${model}, streaming: ${streaming}`);

        try {
            const session = await this.client.createSession({
                model: model,
                streaming: streaming,
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

    async sendPromptStreaming(prompt, model = "gpt-4.1", onChunk, onComplete, onError) {
        try {
            await this.initialize();

            console.log(`Creating streaming session with model: ${model}`);

            const session = await this.client.createSession({
                model: model,
                streaming: true,
            });

            console.log("✓ Streaming session created");

            return new Promise((resolve, reject) => {
                let hasCompleted = false;
                let hasError = false;
                let hasReceivedDeltas = false; // Track if we've received streaming deltas

                // Set a timeout to handle cases where no events are received
                const timeoutId = setTimeout(() => {
                    if (!hasCompleted && !hasError) {
                        console.warn("⚠ Streaming timeout - no completion event received");
                        hasCompleted = true;
                        onComplete();
                        resolve();
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
                                const content = eventData?.deltaContent || eventData?.delta?.content || eventData?.content || eventData?.text || "";
                                console.log("Delta content:", content ? content.substring(0, 50) : "EMPTY");
                                if (content) {
                                    hasReceivedDeltas = true; // Mark that we've received deltas
                                    onChunk(content);
                                }
                            }
                        }
                        else if (eventType === "assistant.message" || eventType === "message") {
                            // Only send full message if we haven't received any deltas
                            // This prevents duplicate content when streaming
                            if (!hasCompleted && !hasError && !hasReceivedDeltas) {
                                const content = eventData?.content || eventData?.message || eventData?.text || "";
                                console.log("Full message received (no deltas, sending):", content ? content.substring(0, 100) : "EMPTY");
                                if (content) {
                                    onChunk(content);
                                }
                            } else {
                                console.log("Full message received (ignoring, already streamed deltas)");
                            }
                        }
                        else if (eventType === "session.idle" || eventType === "idle" || eventType === "done" || eventType === "complete") {
                            if (!hasCompleted && !hasError) {
                                clearTimeout(timeoutId);
                                hasCompleted = true;
                                console.log("✓ Stream completed");
                                onComplete();
                                resolve();
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
                            // Log any unhandled event types
                            console.log("Unhandled streaming event type:", event.type);
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
