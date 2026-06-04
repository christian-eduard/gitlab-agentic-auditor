// src/services/agent.js — Orquestador del Agente con Gemini 3.5 & Partner MCP Client
// SDK: @google/genai (nueva SDK unificada, reemplazo de @google-cloud/vertexai)
// Integra el servidor MCP oficial de GitLab (@structured-world/gitlab-mcp) como Partner Track
const { GoogleGenAI } = require('@google/genai');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

// Configuración de Google Cloud Vertex AI
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'pronexus-devassist';
const LOCATION = process.env.GCP_LOCATION || 'europe-west1';

// Inicializar el nuevo SDK unificado de Google GenAI (Vertex AI backend)
const ai = new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: LOCATION
});

/**
 * Convierte un JSON Schema de MCP a un esquema de parámetros compatible con Gemini Function Calling.
 */
function convertMcpSchemaToGemini(inputSchema) {
    if (!inputSchema || inputSchema.type !== 'object') {
        return { type: 'OBJECT', properties: {} };
    }

    const properties = {};
    for (const [key, val] of Object.entries(inputSchema.properties || {})) {
        let type = 'STRING';
        if (val.type === 'number' || val.type === 'integer') type = 'NUMBER';
        if (val.type === 'boolean') type = 'BOOLEAN';
        if (val.type === 'array') type = 'ARRAY';
        
        properties[key] = {
            type,
            description: val.description || ''
        };

        if (val.type === 'array' && val.items) {
            let itemType = 'STRING';
            if (val.items.type === 'number' || val.items.type === 'integer') itemType = 'NUMBER';
            if (val.items.type === 'boolean') itemType = 'BOOLEAN';
            properties[key].items = { type: itemType };
        }
    }

    return {
        type: 'OBJECT',
        properties,
        required: inputSchema.required || []
    };
}

/**
 * Crea y conecta un MCP Client al servidor MCP oficial del partner (GitLab).
 * Lanza el server como proceso hijo via stdio transport.
 */
async function createMcpClient(token, logCallback = () => {}) {
    logCallback('[SISTEMA] Conectando al MCP Server del Partner (GitLab)...');

    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@structured-world/gitlab-mcp'],
        env: {
            ...process.env,
            GITLAB_TOKEN: token,
            GITLAB_API_URL: process.env.GITLAB_API_URL || 'https://gitlab.com'
        }
    });

    const client = new Client({
        name: 'gitlab-agentic-auditor',
        version: '2.0.0'
    });

    await client.connect(transport);
    logCallback('[SISTEMA] ✅ Conectado al MCP Server del Partner (GitLab) via stdio.');

    return { client, transport };
}

/**
 * Descubre las herramientas disponibles del MCP Server del partner.
 */
async function discoverTools(client, logCallback = () => {}) {
    const { tools } = await client.listTools();
    logCallback(`[SISTEMA] Descubiertas ${tools.length} herramientas del Partner MCP Server.`);
    
    const toolNames = tools.map(t => t.name);
    logCallback(`[SISTEMA] Herramientas: ${toolNames.slice(0, 15).join(', ')}${toolNames.length > 15 ? ` ... (+${toolNames.length - 15} más)` : ''}`);

    return tools;
}

/**
 * Convierte las herramientas MCP a formato Gemini Function Declarations.
 */
function mcpToolsToGemini(mcpTools) {
    const declarations = mcpTools.map(tool => ({
        name: tool.name,
        description: tool.description || `Herramienta MCP: ${tool.name}`,
        parameters: convertMcpSchemaToGemini(tool.inputSchema)
    }));

    return [{ functionDeclarations: declarations }];
}

/**
 * Ejecuta una herramienta del MCP server del partner.
 */
async function callPartnerMcp(client, toolName, args, logCallback = () => {}) {
    try {
        const result = await client.callTool({ name: toolName, arguments: args });
        
        if (result.isError) {
            throw new Error(result.content?.[0]?.text || 'Error desconocido del Partner MCP');
        }

        const text = result.content
            ?.filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n') || '';

        return text;
    } catch (err) {
        console.error(`Error llamando Partner MCP para ${toolName}:`, err.message);
        throw new Error(`Partner MCP Call Failed (${toolName}): ${err.message}`);
    }
}

/**
 * Ejecuta el agente de auditoría usando Gemini 3.5 + Partner MCP Server
 * @param {Object} params - { token, projectId, taskType, issueIid, ref }
 * @param {Function} logCallback - Función para enviar logs en vivo al cliente
 */
async function runGitLabAgent({ token, projectId, taskType, issueIid, ref }, logCallback = () => {}) {
    logCallback(`[SISTEMA] Iniciando GitLab Agentic Auditor v2.0 (Partner MCP + Gemini 3.5)...`);
    logCallback(`[SISTEMA] Conectando a Vertex AI en "${PROJECT_ID}" / "${LOCATION}"...`);

    // 1. Conectar al Partner MCP Server (GitLab)
    let mcpClient, mcpTransport;
    try {
        const mcp = await createMcpClient(token, logCallback);
        mcpClient = mcp.client;
        mcpTransport = mcp.transport;
    } catch (err) {
        logCallback(`[⚠️ ERROR] No se pudo conectar al Partner MCP Server: ${err.message}`);
        throw err;
    }

    try {
        // 2. Descubrir herramientas del Partner MCP
        const mcpTools = await discoverTools(mcpClient, logCallback);
        const geminiTools = mcpToolsToGemini(mcpTools);

        // 3. System instruction para el agente
        const systemInstruction = `Eres el GitLab Agentic Auditor (GAA), un agente de desarrollo de software autónomo y experto en auditorías técnicas de calidad de código, seguridad y optimización de proyectos en GitLab.
        
    Tu objetivo es examinar de forma autónoma el repositorio provisto y generar un reporte técnico exhaustivo.
    
    IMPORTANTE: 
    - El proyecto a auditar tiene ID "${projectId}".${ref ? ` La rama/referencia es "${ref}".` : ''}
    - Tienes acceso a las herramientas MCP del Partner GitLab. Usa las herramientas disponibles para explorar el repositorio.
    - Para buscar archivos, usa herramientas como list_repository_tree, get_file_content, o similares.
    - Para issues, usa list_issues, get_issue, o similares.
    - Para merge requests, usa list_merge_requests, get_merge_request, o similares.
    - ADAPTA tus llamadas a las herramientas que están realmente disponibles. No inventes nombres de herramientas.
    
    Tus directrices de comportamiento:
    - Debes explorar primero el árbol del repositorio para comprender su estructura y lenguajes.
    - Inspecciona archivos clave: dependencias (package.json, go.mod, requirements.txt), configuraciones (Dockerfile, gitlab-ci.yml, nginx.conf), y código de lógica principal.
    - Sé muy riguroso. Identifica vulnerabilidades de seguridad, paquetes obsoletos, archivos excesivamente grandes ("god files"), y mala estructuración.
    - Si la tarea es resolver un issue específico (taskType: resolve-issue), debes leer el issue, buscar los archivos relevantes y proponer un parche (diff) de código.
    - Explica tus pensamientos al usuario en cada paso.
    
    Estructura obligatoria del reporte final de auditoría (en español y formato Markdown):
    # Reporte Técnico de Auditoría de Repositorio
    1. **Resumen Ejecutivo**: Puntuación general del repo (A-F) y conclusiones de alto nivel.
    2. **Arquitectura y Estructura**: Descripción del stack tecnológico y organización de carpetas detectada.
    3. **Análisis de Seguridad y Calidad**: Listado clasificado por severidad (ALTA, MEDIA, BAJA) detallando cada problema y su ubicación.
    4. **Auditoría de Dependencias**: Análisis de dependencias vulnerables o desactualizadas.
    5. **Estado del Repositorio (Issues & Merge Requests)**: Resumen del estado de la actividad.
    6. **Recomendaciones y Plan de Acción**: Pasos detallados a seguir y estimación de esfuerzo.`;

        // 4. Mensaje inicial según tipo de tarea
        let initialPrompt = '';
        const refText = ref ? `, específicamente en la rama/referencia "${ref}"` : '';
        if (taskType === 'audit') {
            initialPrompt = `Por favor realiza una auditoría técnica completa del repositorio de GitLab con ID "${projectId}"${refText}. Explora primero los archivos, lee los más importantes y genera el reporte final de auditoría detallado.`;
        } else if (taskType === 'security') {
            initialPrompt = `Por favor realiza una auditoría de SEGURIDAD enfocada del repositorio de GitLab con ID "${projectId}"${refText}. Busca tokens expuestos, variables de entorno desprotegidas, configuraciones de CI/CD inseguras y dependencias vulnerables.`;
        } else if (taskType === 'resolve-issue') {
            initialPrompt = `Por favor analiza el issue con IID "${issueIid}" en el proyecto "${projectId}"${refText}. Lee el contenido del issue, busca los archivos de código relevantes, analiza la causa del problema y propón un parche de código (diff).`;
        } else {
            initialPrompt = `Realiza una exploración general del proyecto "${projectId}"${refText} y haz un resumen breve de tus hallazgos.`;
        }

        // 5. Historial de chat para el bucle agéntico
        const chatHistory = [
            { role: 'user', parts: [{ text: initialPrompt }] }
        ];

        // 6. Bucle agéntico: Gemini razona → llama herramientas MCP del Partner → repite
        let loopCount = 0;
        const maxLoops = 20;

        while (loopCount < maxLoops) {
            loopCount++;
            logCallback(`[PENSAMIENTO] Generando razonamiento (Paso ${loopCount}/${maxLoops})...`);

            // Llamar a Gemini 3.5 Flash con las herramientas del Partner
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: chatHistory,
                config: {
                    tools: geminiTools,
                    systemInstruction
                }
            });

            // Extraer partes de la respuesta
            const parts = response.candidates?.[0]?.content?.parts || [];
            const functionCallPart = parts.find(p => p.functionCall);
            const textPart = parts.find(p => p.text);

            if (textPart && textPart.text.trim()) {
                const thoughts = textPart.text.trim();
                const logText = thoughts.length > 500 ? thoughts.substring(0, 500) + '...' : thoughts;
                logCallback(`[AGENTE] ${logText}`);
            }

            if (!functionCallPart) {
                logCallback(`[SISTEMA] El agente ha terminado de recopilar información y ha generado el reporte final.`);
                return textPart ? textPart.text : 'No se pudo generar el reporte.';
            }

            // El modelo solicita llamar a una herramienta del Partner MCP
            const call = functionCallPart.functionCall;
            const toolName = call.name;
            const toolArgs = call.args || {};

            logCallback(`[HERRAMIENTA] El agente ejecuta herramienta Partner MCP: "${toolName}"`);
            
            // Ocultar datos sensibles en logs
            const safeArgs = { ...toolArgs };
            if (safeArgs.token) safeArgs.token = '********';
            if (safeArgs.private_token) safeArgs.private_token = '********';
            const argsStr = JSON.stringify(safeArgs);
            logCallback(`[HERRAMIENTA] Args: ${argsStr.length > 300 ? argsStr.substring(0, 300) + '...' : argsStr}`);

            let toolOutput = '';
            try {
                toolOutput = await callPartnerMcp(mcpClient, toolName, toolArgs, logCallback);
                if (toolOutput.length > 15000) {
                    toolOutput = toolOutput.substring(0, 15000) + '\n\n[... Truncado a 15000 chars ...]';
                }
                logCallback(`[SISTEMA] ✅ Herramienta ejecutada. Tamaño: ${toolOutput.length} chars.`);
            } catch (err) {
                toolOutput = `Error ejecutando la herramienta: ${err.message}`;
                logCallback(`[⚠️ ERROR] Falló herramienta Partner MCP: ${err.message}`);
            }

            // Agregar al historial
            chatHistory.push({
                role: 'model',
                parts: [functionCallPart]
            });

            chatHistory.push({
                role: 'user',
                parts: [{
                    functionResponse: {
                        name: toolName,
                        response: { result: toolOutput }
                    }
                }]
            });
        }

        logCallback(`[SISTEMA] Se alcanzó el límite máximo de pasos (${maxLoops}). Generando reporte...`);
        chatHistory.push({
            role: 'user',
            parts: [{ text: 'Por favor, finaliza ya y redacta tu reporte Markdown final con la información que has recopilado hasta ahora.' }]
        });
        
        const finalResponse = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: chatHistory,
            config: { systemInstruction }
        });
        return finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || 'No se pudo generar el reporte.';

    } finally {
        // Limpiar: cerrar conexión MCP y matar el proceso hijo
        try {
            if (mcpClient) await mcpClient.close();
        } catch (e) {
            console.error('Error cerrando MCP client:', e.message);
        }
        try {
            if (mcpTransport) await mcpTransport.close();
        } catch (e) {
            console.error('Error cerrando MCP transport:', e.message);
        }
    }
}

module.exports = { 
    runGitLabAgent,
    // Exported for testing
    _internal: {
        convertMcpSchemaToGemini,
        mcpToolsToGemini,
        callPartnerMcp,
        discoverTools,
        createMcpClient
    }
};
