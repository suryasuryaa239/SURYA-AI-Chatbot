// server.js

// 1. **FIXED: Load dotenv to read .env file**
const dotenv = require('dotenv');
dotenv.config(); 

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = 3000;
const SESSION_ID = "default-it-user"; // Simple session ID for this example
const uploadedFilesMap = {}; // Simple map to store Gemini File objects by a temporary token

// --- CONFIGURATION ---

// Load API key from environment variable (now loaded from .env)
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("FATAL ERROR: The GEMINI_API_KEY environment variable is not set. Please set it in the .env file.");
    process.exit(1);
}

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey });

// System Instruction for the model
const SYSTEM_PROMPT = "You are an experienced software developer and IT architect. Your responses must be highly professional, accurate, and technical. Use Markdown formatting heavily to structure complex information (code blocks, lists, headers).";

// Initialize a Map to store ongoing chat sessions (for conversation history)
const chatSessions = new Map();

// --- MIDDLEWARE ---
// Use CORS to allow the HTML file to connect
app.use(cors()); 
// Use express.json() to parse JSON bodies (important for Base64 file upload)
app.use(express.json({ limit: '50mb' })); 

// --- HELPER FUNCTIONS ---

/** Gets or creates a Gemini Chat session for history management. */
function getChatSession(sessionId = SESSION_ID) {
    if (!chatSessions.has(sessionId)) {
        console.log(`Creating new chat session for ${sessionId}`);
        // Create a new chat session with the professional system instruction
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: SYSTEM_PROMPT
            }
        });
        chatSessions.set(sessionId, chat);
    }
    return chatSessions.get(sessionId);
}

/** Securely deletes the file from the Gemini service. */
async function deleteGeminiFile(fileToken) {
    try {
        await ai.files.delete({ name: fileToken });
        console.log(`Cleanup success: Deleted Gemini File token: ${fileToken}`);
        delete uploadedFilesMap[fileToken]; // Remove from our local map
    } catch (e) {
        console.error(`Cleanup failure for token ${fileToken}:`, e);
    }
}

// --- API ENDPOINTS ---

/**
 * Endpoint to receive Base64 encoded file data from the frontend, 
 * upload it to Gemini, and return a file token.
 */
app.post('/upload', async (req, res) => {
    try {
        const { base64Data, mimeType, fileName } = req.body;

        if (!base64Data || !mimeType || !fileName) {
            return res.status(400).json({ error: "Missing file data (base64, mimeType, or fileName)." });
        }

        // 1. Upload Base64 data to Gemini API
        const geminiFile = await ai.files.upload({
            file: {
                data: Buffer.from(base64Data, 'base64'),
                mimeType: mimeType
            },
            displayName: fileName
        });

        // 2. Store the file object reference in a map for later use in /chat
        uploadedFilesMap[geminiFile.name] = geminiFile;
        console.log(`File uploaded to Gemini: ${geminiFile.name} (${fileName})`);
        
        // 3. Return the Gemini file name/token
        return res.json({ message: "File uploaded successfully", fileToken: geminiFile.name });

    } catch (e) {
        console.error("Gemini File Upload Error:", e);
        return res.status(500).json({ error: `Gemini API Error during upload: ${e.message}` });
    }
});


/**
 * Endpoint to handle chat prompts, including attached files.
 */
app.post('/chat', async (req, res) => {
    const { prompt, fileToken } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is missing." });
    }

    try {
        // 1. Get the conversation session
        const chatSession = getChatSession();

        // 2. Prepare the contents array
        const contents = [];
        let fileToDelete = null;

        // Add file content part if a file token is provided
        if (fileToken && uploadedFilesMap[fileToken]) {
            fileToDelete = uploadedFilesMap[fileToken];
            // The contents array will contain the file object reference and the prompt text
            contents.push(fileToDelete);
            console.log(`Using attached file in chat: ${fileToDelete.displayName}`);
        }
        
        // Add the prompt text
        contents.push(prompt);


        // 3. Send the message (this handles conversation history internally)
        const response = await chatSession.sendMessage({ message: contents });
        
        // 4. Secure Cleanup: Delete the file from Gemini service immediately after use
        if (fileToken && fileToDelete) {
            await deleteGeminiFile(fileToken);
        }

        // 5. Return the AI's response
        return res.json({ response: response.text });

    } catch (e) {
        console.error("Gemini Chat Error:", e);
        // Important: Attempt cleanup even if chat failed
        if (fileToken && uploadedFilesMap[fileToken]) {
            await deleteGeminiFile(fileToken);
        }
        return res.status(500).json({ error: `Gemini API Error during chat: ${e.message}.` });
    }
});

// --- RUN THE SERVER ---
app.listen(port, () => {
    console.log(`Node.js Backend Server running at http://localhost:${port}`);
    console.log("-------------------------------------------------------");
    console.log("READY: Now open index.html in your browser to start chatting.");
});
