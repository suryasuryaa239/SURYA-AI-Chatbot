// api.js - Netlify Function for handling chat and file uploads
// Netlify Functions use a handler exported by module.exports

const { GoogleGenAI } = require('@google/genai');

// IMPORTANT: Netlify automatically makes environment variables (like GEMINI_API_KEY)
// available via process.env. We don't need a separate dotenv file here.

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("FATAL ERROR: The GEMINI_API_KEY environment variable is not set.");
    // Return a 500 status if the key is missing
    module.exports.handler = async () => ({
        statusCode: 500,
        body: JSON.stringify({ error: "Gemini API Key missing in Netlify Environment Variables." })
    });
    return;
}

const ai = new GoogleGenAI({ apiKey });
const SYSTEM_PROMPT = "You are an experienced software developer and IT architect. Your responses must be highly professional, accurate, and technical. Use Markdown formatting heavily to structure complex information (code blocks, lists, headers).";

const chatSessions = new Map();
const uploadedFilesMap = {};

function getChatSession(sessionId = "default-it-user") {
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

// --- Netlify Function Handler ---
// This single function handles both chat and upload logic based on the path
module.exports.handler = async (event, context) => {
    // Netlify functions receive the path as event.path (e.g., /api/chat or /api/upload)
    const path = event.path;
    const body = JSON.parse(event.body || '{}');

    // --- UPLOAD Logic (/api/upload) ---
    if (path.endsWith('/upload')) {
        try {
            const { base64Data, mimeType, fileName } = body;

            if (!base64Data || !mimeType || !fileName) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "Missing file data." })
                };
            }
            
            // Upload the file to the Gemini File Service
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

            return {
                statusCode: 200,
                body: JSON.stringify({ fileToken: fileToken })
            };

        } catch (e) {
            console.error("File Upload Error:", e);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `Gemini API Error during file upload: ${e.message}` })
            };
        }
    }

    // --- CHAT Logic (/api/chat) ---
    if (path.endsWith('/chat')) {
        const { prompt, fileToken } = body;
        const chatSession = getChatSession(); // Use default session ID
        
        if (!prompt) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Prompt is required." })
            };
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

            // Send the message
            const response = await chatSession.sendMessage({ message: contents });
            
            // Cleanup: Delete the file from Gemini service
            if (fileToken && fileToDelete) {
                await deleteGeminiFile(fileToken);
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ response: response.text })
            };

        } catch (e) {
            console.error("Gemini Chat Error:", e);
            // Attempt cleanup even if chat failed
            if (fileToken && uploadedFilesMap[fileToken]) {
                await deleteGeminiFile(fileToken);
            }
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `Gemini API Error during chat: ${e.message}` })
            };
        }
    }

    // Default response for unhandled paths
    return {
        statusCode: 404,
        body: JSON.stringify({ error: "API Function Not Found." })
    };
};
