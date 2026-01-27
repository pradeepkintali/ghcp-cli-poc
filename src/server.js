import express from "express";
import cors from "cors";
import { exec } from "child_process";
import { promisify } from "util";
import CopilotService from "./copilot-service.js";

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

const copilotService = new CopilotService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Send prompt endpoint (non-streaming)
app.post("/api/chat", async (req, res) => {
    try {
        const { prompt, model } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // Check if this is a CLI command (starts with /)
        if (prompt.trim().startsWith('/')) {
            try {
                console.log(`Executing CLI command: ${prompt}`);

                // Execute the command using echo to pipe it to copilot CLI
                const { stdout, stderr } = await execAsync(
                    `echo "${prompt.replace(/"/g, '\\"')}" | copilot`,
                    {
                        env: {
                            ...process.env,
                            GITHUB_TOKEN: process.env.GITHUB_TOKEN,
                            GH_TOKEN: process.env.GITHUB_TOKEN
                        },
                        timeout: 30000
                    }
                );

                const output = stdout || stderr || 'Command executed successfully';
                console.log(`CLI output: ${output.substring(0, 200)}`);

                res.json({ response: output });
                return;
            } catch (cliError) {
                console.error("CLI command error:", cliError);
                res.json({
                    response: `Error executing command: ${cliError.message}\n\nNote: The Copilot CLI is running in SDK mode. Some interactive commands may not work.\n\nTry asking as a question instead, like: "What agents are available?"`
                });
                return;
            }
        }

        // Regular SDK prompt
        const result = await copilotService.sendPrompt(
            prompt,
            model || "gpt-4.1",
            false
        );

        res.json({ response: result.fullResponse });
    } catch (error) {
        console.error("Error processing chat request:", error);
        res.status(500).json({ error: error.message });
    }
});

// Send prompt endpoint (streaming)
app.post("/api/chat/stream", async (req, res) => {
    let streamEnded = false;
    let keepaliveInterval = null;
    let hasReceivedChunks = false;

    const endStream = (reason) => {
        if (!streamEnded) {
            console.log(`Stream ending: ${reason}`);
            streamEnded = true;
            if (keepaliveInterval) {
                clearInterval(keepaliveInterval);
                keepaliveInterval = null;
            }
        }
    };

    try {
        const { prompt, model } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // Set headers for SSE (Server-Sent Events)
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // Disable buffering in nginx

        // Flush headers to establish connection
        res.flushHeaders();

        // Send initial comment to establish connection
        res.write(": connected\n\n");

        // Send an immediate "processing" message to keep browser engaged
        res.write("data: " + JSON.stringify({ processing: true }) + "\n\n");

        // Send keepalive comments every 500ms to prevent timeout (aggressive)
        keepaliveInterval = setInterval(() => {
            if (!streamEnded && !res.destroyed) {
                try {
                    res.write(": keepalive\n\n");
                } catch (err) {
                    console.error("Keepalive write error:", err);
                    endStream("keepalive error");
                }
            } else {
                clearInterval(keepaliveInterval);
            }
        }, 500);

        // Handle client disconnect - only log, don't set streamEnded
        // The close event fires when request body is done, not when client disconnects for SSE
        req.on("close", () => {
            console.log("Request close event received (this is normal for POST + SSE)");
        });

        // Only end stream when response is actually closed/errored
        res.on("close", () => {
            console.log("Response close event - client disconnected");
            endStream("response closed");
        });

        res.on("error", (err) => {
            console.error("Response error:", err);
            endStream("response error");
        });

        await copilotService.sendPromptStreaming(
            prompt,
            model || "gpt-4.1",
            (chunk) => {
                hasReceivedChunks = true;
                // Send chunk to client if stream is still open
                console.log("onChunk callback called, chunk:", chunk ? chunk.substring(0, 50) : "EMPTY", "streamEnded:", streamEnded, "destroyed:", res.destroyed);
                if (!streamEnded && !res.destroyed && res.writable) {
                    try {
                        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                        console.log("✓ Chunk written to response");
                    } catch (err) {
                        console.error("Error writing chunk:", err);
                        endStream("write error");
                    }
                }
            },
            () => {
                // Send completion signal if stream is still open
                console.log("onComplete called, streamEnded:", streamEnded, "destroyed:", res.destroyed);
                if (!streamEnded && !res.destroyed && res.writable) {
                    try {
                        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                        res.end();
                        console.log("✓ Stream completed and ended");
                    } catch (err) {
                        console.error("Error writing completion:", err);
                    }
                }
                endStream("completed");
            },
            (error) => {
                // Handle error if stream is still open
                console.log("onError called:", error.message, "streamEnded:", streamEnded);
                if (!streamEnded && !res.destroyed && res.writable) {
                    try {
                        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                        res.end();
                    } catch (err) {
                        console.error("Error writing error message:", err);
                    }
                }
                endStream("error");
            }
        );
    } catch (error) {
        console.error("Error processing streaming chat request:", error);
        if (!streamEnded && !res.destroyed) {
            try {
                res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                res.end();
            } catch (err) {
                console.error("Error writing final error:", err);
            }
        }
    }
});

// Global error handlers to prevent crashes
process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    // Don't exit - keep the server running
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Don't exit - keep the server running
});

// Graceful shutdown
process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully...");
    await copilotService.stop();
    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down gracefully...");
    await copilotService.stop();
    process.exit(0);
});

app.listen(PORT, async () => {
    console.log(`Copilot wrapper service running on port ${PORT}`);
    console.log("Initializing Copilot client on startup...");
    try {
        await copilotService.initialize();
        console.log("✓ Copilot client ready");
    } catch (error) {
        console.error("Failed to initialize Copilot client:", error);
        console.error("The service will attempt to initialize on first request");
    }
});
