// server.js — Servidor Express Principal (GitLab Agentic Auditor)
// Integración: Gemini 3.5 Flash + Partner MCP Server (GitLab) via ADK-style architecture
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { runGitLabAgent } = require('./src/services/agent');

const app = express();
const PORT = process.env.PORT || 3095;

// Middleware globales
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint general de salud del backend
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        server: 'GitLab Agentic Auditor v2.0',
        model: 'gemini-3.5-flash',
        partnerMcp: '@structured-world/gitlab-mcp',
        track: 'GitLab Partner Track'
    });
});

/**
 * Endpoint de Server-Sent Events (SSE) para ejecutar el agente
 * y transmitir los logs de pensamientos y uso de herramientas MCP en vivo.
 * 
 * El agente actúa como MCP Client: lanza el Partner MCP Server (@structured-world/gitlab-mcp)
 * como proceso hijo via stdio, descubre herramientas, y usa Gemini 3.5 para orquestar
 * la auditoría completa del repositorio.
 */
app.get('/api/analyze-stream', async (req, res) => {
    const { token, projectId, taskType, issueIid, ref } = req.query;

    if (!token || !projectId) {
        res.status(400).json({ error: 'Faltan parámetros obligatorios: token y projectId.' });
        return;
    }

    // Configurar cabeceras de Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none' // Evita que gzip almacene en búfer los datos de transmisión
    });

    // Enviar primer latido / conexión exitosa
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Conexión establecida con el Agente v2.0 (Partner MCP + Gemini 3.5).' })}\n\n`);

    // Callback para enviar logs al frontend
    const sendLog = (message) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'log', message })}\n\n`);
        }
    };

    try {
        // Ejecutamos el agente de manera asíncrona pasando el callback de logs
        const report = await runGitLabAgent({
            token,
            projectId,
            taskType: taskType || 'audit',
            issueIid: issueIid ? parseInt(issueIid, 10) : undefined,
            ref
        }, sendLog);

        // Al finalizar, enviamos el reporte final en Markdown
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'result', report })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'status', message: 'Análisis completado.' })}\n\n`);
        }
    } catch (err) {
        console.error('Error durante la ejecución del agente:', err);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: `Error crítico del agente: ${err.message}` })}\n\n`);
        }
    } finally {
        res.end();
    }
});

// Levantar el servidor
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 GitLab Agentic Auditor v2.0`);
    console.log(`   Modelo: Gemini 3.5 Flash (Vertex AI)`);
    console.log(`   Partner MCP: @structured-world/gitlab-mcp`);
    console.log(`   Track: GitLab Partner Track`);
    console.log(`====================================================`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`❤️  Health:   http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
});
