// netlify/functions/api.js - Node.js Backend for Gemini Chat
// This file converts the Express app into a Netlify Serverless Function.

// REQUIRED PACKAGES: express, cors, @google/genai, dotenv, serverless-http

const dotenv = require('dotenv');
dotenv.config(); 

const express = require('express');
const cors = require('cors');
// Import serverless-http to wrap the Express application
const serverless = require('serverless-http'); 
const { GoogleGenAI } = require('@google/genai');

const app = express();
// Port is removed as it's not applicable in serverless environments.

const SESSION_ID = "default-it-user"; 
const uploadedFilesMap = {};

// --- CONFIGURATION ---

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    // This message is important for debugging in Netlify logs
    console.error("FATAL ERROR: The GEMINI_API_KEY environment variable is not set. Please set it in Netlify Environment Variables.");
}

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey });

const SYSTEM_PROMPT = "You are an experienced software developer and IT architect. Your responses must be highly professional, accurate, and technical. Use Markdown formatting heavily to structure complex information (code blocks, lists, headers).";

const chatSessions = new Map();

// Helper function to get or create a chat session (Uses model history management)
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

// Helper function to delete a file from the Gemini service
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
// Set higher limit for file uploads
app.use(express.json({ limit: '15mb' })); 

// --- API ROUTES ---

/**
 * Endpoint for uploading a file (base64)
 */
app.post('/upload', async (req, res) => {
    try {
        const { base64Data, mimeType, fileName } = req.body;
        
        if (!base64Data || !mimeType || !fileName) {
            return res.status(400).json({ error: "Missing file data (base64Data, mimeType, or fileName)." });
        }
        
        // 1. Upload the file to the Gemini File Service
        const uploadedFile = await ai.files.upload({
            file: {
                data: Buffer.from(base64Data, 'base64'),
                mimeType: mimeType
            },
            displayName: fileName
        });

        // 2. Store the file object in the map with a token (its Gemini name)
        const fileToken = uploadedFile.name;
        uploadedFilesMap[fileToken] = uploadedFile;
        console.log(`File uploaded to Gemini: ${fileToken} (${fileName})`);

        // 3. Return the token to the client
        return res.json({ fileToken: fileToken });

    } catch (e) {
        console.error("File Upload Error:", e);
        return res.status(500).json({ error: `Gemini API Error during file upload: ${e.message}.` });
    }
});


/**
 * Endpoint for sending chat prompts
 */
app.post('/chat', async (req, res) => {
    const { prompt, fileToken } = req.body;
    const chatSession = getChatSession(SESSION_ID);
    
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required." });
    }

    let fileToDelete = null;

    try {
        // 1. Prepare contents array (handling file reference)
        const contents = [];
        
        // Check if a file token was passed and if the file object exists
        if (fileToken && uploadedFilesMap[fileToken]) {
            fileToDelete = uploadedFilesMap[fileToken];
            // The contents array will contain the file object reference (the Gemini File object)
            contents.push(fileToDelete);
            console.log(`Using attached file in chat: ${fileToDelete.displayName}`);
        }
        
        // Add the prompt text
        contents.push(prompt);

        // 2. Send the message (this handles conversation history internally)
        const response = await chatSession.sendMessage({ message: contents });
        
        // 3. Secure Cleanup: Delete the file from Gemini service immediately after use
        if (fileToken && fileToDelete) {
            await deleteGeminiFile(fileToken);
        }

        // 4. Return the AI's response
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


// --- NETLIFY FUNCTIONS EXPORT ---
// 1. Wrap the Express app to create a serverless handler.
// 2. Set the basePath to '/api' so Netlify knows to route requests like 
//    '/api/upload' and '/api/chat' to this function.
const handler = serverless(app, { basePath: '/api' });

// 3. Export the handler function, which is the required format for Netlify Functions.
module.exports.handler = async (event, context) => {
    // Pass the event and context to the serverless-http wrapper
    return handler(event, context);
};
