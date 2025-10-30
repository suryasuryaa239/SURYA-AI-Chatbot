// server.js

// 1. **FIXED: Load dotenv to read .env file**
const dotenv = require('dotenv');
dotenv.config(); 

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const path = require('path'); 

const app = express();
const port = process.env.PORT || 3000; 
const SESSION_ID = "default-it-user";
const uploadedFilesMap = {}; 

// --- CONFIGURATION ---

const apiKey = process.env.GEMINI_API_KEY;
let ai; // <-- **RENDER FIX: Initialize as undefined**

// **RENDER FIX: Check for API key and initialize AI client safely**
if (!apiKey) {
    console.error("FATAL ERROR: The GEMINI_API_KEY environment variable is not set.");
    console.error("The server will start, but all API calls will fail until the key is added.");
    ai = null; // Keep ai as null
} else {
    try {
        ai = new GoogleGenAI({ apiKey }); // Initialize only if key exists
        console.log("GoogleGenAI client initialized successfully.");
    } catch (e) {
        console.error("FATAL ERROR: Failed to initialize GoogleGenAI. Check if API key is valid.", e.message);
        ai = null; // Set to null if initialization fails
    }
}

// Initialize a Map to store ongoing chat sessions
const chatSessions = new Map();

// --- MIDDLEWARE ---
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));


// --- HELPER FUNCTIONS ---

/** Gets or creates a Gemini Chat session for history management. */
function getChatSession(sessionId = SESSION_ID) {
    // **RENDER FIX: Check if 'ai' client is initialized**
    if (!ai) {
        console.error("Cannot create chat session: GoogleGenAI client (ai) is not initialized.");
        return null; // Return null to be handled by the endpoint
    }

    if (!chatSessions.has(sessionId)) {
        console.log(`Creating new chat session for ${sessionId}`);
        try {
            const chat = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: SYSTEM_PROMPT
                }
            });
            chatSessions.set(sessionId, chat);
        } catch (e) {
            console.error("Failed to create new chat session in getChatSession:", e.message);
            return null;
        }
    }
    return chatSessions.get(sessionId);
}

/** Securely deletes the file from the Gemini service. */
async function deleteGeminiFile(fileToken) {
    if (!ai) {
        console.error("Cannot delete file: GoogleGenAI client (ai) is not initialized.");
        return; 
    }
    try {
        await ai.files.delete({ name: fileToken });
        console.log(`Cleanup success: Deleted Gemini File token: ${fileToken}`);
        delete uploadedFilesMap[fileToken];
    } catch (e) {
        console.error(`Cleanup failure for token ${fileToken}:`, e);
    }
}

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Endpoint to receive Base64 encoded file data.
 */
app.post('/api/upload', async (req, res) => {
    // **RENDER FIX: Check if API key/client is ready at the start of the request**
    if (!apiKey || !ai) {
         return res.status(500).json({ error: "Server is missing or failed to initialize GEMINI_API_KEY. Check Render Environment Variables." });
    }

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

        // 2. Store the file object reference
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
 * Endpoint to handle chat prompts.
 */
app.post('/api/chat', async (req, res) => {
    // **RENDER FIX: Check if API key/client is ready at the start of the request**
    if (!apiKey || !ai) {
         return res.status(500).json({ error: "Server is missing or failed to initialize GEMINI_API_KEY. Check Render Environment Variables." });
    }

    const { prompt, fileToken } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is missing." });
    }

    try {
        // 1. Get the conversation session
        const chatSession = getChatSession();

        // **RENDER FIX: Check if session creation failed**
        if (!chatSession) {
            console.error("Blocking chat request because chat session could not be created.");
            return res.status(500).json({ error: "Failed to create chat session. Check server logs. (Is API Key valid?)" });
        }

        // 2. Prepare the contents array
        const contents = [];
        let fileToDelete = null;

        if (fileToken && uploadedFilesMap[fileToken]) {
            fileToDelete = uploadedFilesMap[fileToken];
            contents.push(fileToDelete);
            console.log(`Using attached file in chat: ${fileToDelete.displayName}`);
        }
        
        contents.push(prompt);

        // 3. Send the message
        const response = await chatSession.sendMessage({ message: contents });
        
        // 4. Secure Cleanup
        if (fileToken && fileToDelete) {
            await deleteGeminiFile(fileToken);
        }

        // 5. Return the AI's response
        return res.json({ response: response.text });

    } catch (e) {
        console.error("Gemini Chat Error:", e);
        if (fileToken && uploadedFilesMap[fileToken]) {
            await deleteGeminiFile(fileToken);
        }
        return res.status(500).json({ error: `Gemini API Error during chat: ${e.message}.` });
    }
});

// System Instruction for the model
const SYSTEM_PROMPT = "You are an experienced software developer and IT architect. Your responses must be highly professional, accurate, and technical. Use Markdown formatting heavily to structure complex information (code blocks, lists, headers).";


// --- RUN THE SERVER ---
app.listen(port, '0.0.0.0', () => {
    console.log(`Node.js Backend Server running on port ${port}`);
    console.log("-------------------------------------------------------");
});
