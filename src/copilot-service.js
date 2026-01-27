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

            let hasCompleted = false;
            let hasError = false;

            session.on((event) => {
                try {
                    console.log("Streaming event:", event.type);

                    if (event.type === "assistant.message_delta") {
                        if (!hasCompleted && !hasError) {
                            console.log("Delta content:", event.data.deltaContent ? event.data.deltaContent.substring(0, 50) : "EMPTY");
                            onChunk(event.data.deltaContent);
                        }
                    }
                    if (event.type === "session.idle") {
                        if (!hasCompleted && !hasError) {
                            hasCompleted = true;
                            console.log("✓ Stream completed");
                            onComplete();
                        }
                    }
                    if (event.type === "error") {
                        if (!hasError) {
                            hasError = true;
                            console.error("Stream error event:", event.data);
                            if (onError) {
                                onError(new Error(event.data.message || "Unknown error"));
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error in session event handler:", error);
                    if (!hasCompleted && !hasError && onError) {
                        hasError = true;
                        onError(error);
                    }
                }
            });

            console.log("Sending prompt to streaming session...");
            await session.sendAndWait({ prompt });
            console.log("✓ Streaming sendAndWait completed");

        } catch (error) {
            console.error("Error in sendPromptStreaming:", error);
            console.error("Error stack:", error.stack);
            if (onError && !error.handled) {
                error.handled = true;
                onError(error);
            } else if (!error.handled) {
                throw error;
            }
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
