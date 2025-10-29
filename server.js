// netlify/functions/api.js - Node.js Backend for Gemini Chat
// This requires: express, cors, @google/genai, dotenv, serverless-http

const dotenv = require('dotenv');
dotenv.config(); 

const express = require('express');
const cors = require('cors');
// 1. Include serverless-http to convert Express app into a serverless function
const serverless = require('serverless-http'); 
const { GoogleGenAI } = require('@google/genai');

const app = express();
// Note: The port is removed as it's not needed in serverless environments.
const SESSION_ID = "default-it-user"; 
const uploadedFilesMap = {};

// --- CONFIGURATION ---

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("FATAL ERROR: The GEMINI_API_KEY environment variable is not set. Please set it in Netlify Environment Variables.");
    // Changed: Removed process.exit(1) as it can crash the serverless environment.
}

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_PROMPT = "You are an experienced software developer and IT architect. Your responses must be highly professional, accurate, and technical. Use Markdown formatting heavily to structure complex information (code blocks, lists, headers).";

const chatSessions = new Map();

// Helper function to get or create a chat session (NO CHANGE)
function getChatSession(sessionId = SESSION_ID) {
    if (!chatSessions.has(sessionId)) {
        console.log(`Creating new chat session for ID: ${sessionId}`);
        const newChat = ai.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: SYSTEM_PROMPT
            }
        });
        chatSessions.set(sessionId, newChat);
        return newChat;
    }
    return chatSessions.get(sessionId);
}

// Helper function to delete a file from the Gemini service (NO CHANGE)
async function deleteGeminiFile(fileToken) {
    try {
        const fileToDelete = uploadedFilesMap[fileToken];
        if (fileToDelete && fileToDelete.name) {
            await ai.files.delete({ name: fileToDelete.name });
            console.log(`Successfully deleted Gemini File: ${fileToDelete.name}`);
            delete uploadedFilesMap[fileToken];
        }
    } catch (e) {
        console.error(`Error deleting Gemini file (${fileToken}):`, e.message);
    }
}

// --- MIDDLEWARE ---
app.use(cors()); 
app.use(express.json({ limit: '15mb' }));

// --- ROUTES ---
// The /upload and /chat routes remain exactly the same as in your original server.js

app.post('/upload', async (req, res) => {
    try {
        const { base64Data, mimeType, fileName } = req.body;
        // ... (rest of the /upload logic) ...
        if (!base64Data || !mimeType || !fileName) {
            return res.status(400).json({ error: "Missing file data (base64Data, mimeType, or fileName)." });
        }
        
        const uploadedFile = await ai.files.upload({
            file: {
                data: Buffer.from(base64Data, 'base64'),
                mimeType: mimeType
            },
            displayName: fileName
        });

        const fileToken = uploadedFile.name;
        uploadedFilesMap[fileToken] = uploadedFile;
        console.log(`File uploaded to Gemini: ${fileToken} (${fileName})`);

        return res.json({ fileToken: fileToken });

    } catch (e) {
        console.error("File Upload Error:", e);
        return res.status(500).json({ error: `Gemini API Error during file upload: ${e.message}.` });
    }
});


app.post('/chat', async (req, res) => {
    const { prompt, fileToken } = req.body;
    const chatSession = getChatSession(SESSION_ID);
    
    // ... (rest of the /chat logic) ...
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required." });
    }

    let fileToDelete = null;

    try {
        const contents = [];
        
        if (fileToken && uploadedFilesMap[fileToken]) {
            fileToDelete = uploadedFilesMap[fileToken];
            contents.push(fileToDelete);
            console.log(`Using attached file in chat: ${fileToDelete.displayName}`);
        }
        
        contents.push(prompt);

        const response = await chatSession.sendMessage({ message: contents });
        
        if (fileToken && fileToDelete) {
            await deleteGeminiFile(fileToken);
        }

        return res.json({ response: response.text });

    } catch (e) {
        console.error("Gemini Chat Error:", e);
        if (fileToken && uploadedFilesMap[fileToken]) {
            await deleteGeminiFile(fileToken);
        }
        return res.status(500).json({ error: `Gemini API Error during chat: ${e.message}.` });
    }
});


// --- NETLIFY FUNCTIONS EXPORT ---
// 2. Wrap the Express app with serverless-http and set the base path.
const handler = serverless(app, { basePath: '/api' });

// 3. Export the handler function.
module.exports.handler = async (event, context) => {
    // Note: Due to the stateless nature of functions, the chatSessions map 
    // might reset between requests (cold-start). For a robust app, use a database
    // to store conversation history. For a simple demo, this may work most of the time.
    console.log("Function received request:", event.path);

    return handler(event, context);
};