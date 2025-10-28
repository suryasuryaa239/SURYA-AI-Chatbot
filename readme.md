🛰️ SURYA AI - Futuristic Console UI

This repository contains the front-end interface for the SURYA AI application—a high-level technical consultant specializing in Software Architecture, Cloud Technologies, and Data Science. The UI is designed with a unique, futuristic "Dark Console" theme, featuring emerald accents and frosted-glass effects to provide a striking and efficient user experience.

✨ Features

The SURYA AI Console is built for focused, technical querying, featuring:

Futuristic Dark Theme: A deep slate and grey color palette (#0F172A, #1E293B) combined with sharp Emerald Green accents (#059669) for high contrast and a sci-fi console feel.

Frosted Glass UI: AI responses and the header utilize a backdrop-blur effect over a semi-transparent background, giving them a distinct "glass" appearance.

CLI Style Input: The input bar features a command-line interface (>) prefix, encouraging precise technical queries.

Context File Attachment: Allows users to upload and send local files (.pdf, .txt, .py, etc.) to provide detailed context for the AI, enhancing the depth of the consultation.

Real-time Status: Dedicated areas for file upload status and protocol initiation (Execute) provide immediate user feedback.

Responsive Design: The layout is designed to be functional and attractive across desktop and modern mobile screen sizes.

🛠️ Technologies Used

Frontend (index.html)

HTML5: The structural foundation of the console.

Tailwind CSS: Used exclusively for utility-first styling, ensuring a fully responsive and clean design without external CSS files.

Vanilla JavaScript: Handles all application logic, including DOM manipulation, state management, and API communication.

Backend (Mandatory Dependency)

Node.js / Express: Required to handle the chat and file upload logic, specifically serving the Gemini API.

Gemini 2.5 Flash: The core Large Language Model (LLM) powering the consultation responses.

🚀 Getting Started (Setup)

To run this application, you must have both the frontend (this file) and the corresponding Node.js backend running.

1. Prerequisites

You must have a Node.js project containing a server.js file running on port 3000 to serve the /chat and /upload endpoints.

2. Running the Frontend

Since the frontend is a single index.html file, running it is straightforward:

Save the provided code as index.html.

Open index.html directly in any modern web browser (e.g., Chrome, Firefox, Edge).

3. Running the Backend

Ensure your server.js file is running in parallel on http://localhost:3000. If the backend is not running, the frontend console will display a CRITICAL ERROR when attempting to send a query.

💻 Usage

Start the Session: The console will automatically display the initial STATUS: ACTIVE (AI Expert) greeting in English.

Attach Context (Optional): Click "Attach Context File" in the sidebar to upload a document. The status will update to show [SUCCESS] when the file is ready to be used in your next prompt. (Note: The file is consumed by the AI and cleared from the buffer after the next response.)

Execute Command: Type your technical query into the input box and click the Execute button or press Enter.

New Simulation: Click + New Simulation to clear the entire chat history and reset the AI's short-term memory (session context).