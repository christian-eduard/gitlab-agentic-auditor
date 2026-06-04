// src/mcp/gitlabMcp.js — Servidor MCP para la API de GitLab
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const axios = require('axios');

// Base URL de la API de GitLab
const GITLAB_API_BASE = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';

/**
 * Helper para hacer peticiones HTTP autenticadas a GitLab
 */
async function gitlabRequest(token, endpoint, params = {}) {
    try {
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'GitLab-MCP-Client/1.0'
        };
        if (token && token.trim() && token !== 'public' && token !== 'none') {
            headers['PRIVATE-TOKEN'] = token;
        }
        const response = await axios.get(`${GITLAB_API_BASE}${endpoint}`, {
            headers,
            params
        });
        return response.data;
    } catch (err) {
        const status = err.response?.status || 500;
        const msg = err.response?.data?.message || err.message;
        throw new Error(`GitLab API Error (${status}): ${JSON.stringify(msg)}`);
    }
}

/**
 * Crea la instancia del servidor MCP con sus herramientas
 */
function createGitLabMcpServer() {
    const server = new McpServer({
        name: 'gitlab-partner-mcp',
        version: '1.0.0'
    });

    // ── HERRAMIENTA 1: Obtener detalles del proyecto ──
    server.tool(
        'gitlab_get_project',
        'Obtiene metadatos y estadísticas básicas de un proyecto de GitLab.',
        {
            token: z.string().describe('Token de Acceso Personal (PAT) de GitLab'),
            projectId: z.string().describe('ID numérico del proyecto o ruta URL-encoded (ej: grupo/proyecto)')
        },
        async ({ token, projectId }) => {
            try {
                const data = await gitlabRequest(token, `/projects/${encodeURIComponent(projectId)}`);
                const formatted = {
                    id: data.id,
                    name: data.name,
                    description: data.description,
                    default_branch: data.default_branch,
                    web_url: data.web_url,
                    star_count: data.star_count,
                    forks_count: data.forks_count,
                    last_activity_at: data.last_activity_at
                };
                return {
                    content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }]
                };
            } catch (err) {
                return {
                    content: [{ type: 'text', text: `Error: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    // ── HERRAMIENTA 2: Listar árbol de archivos del repositorio ──
    server.tool(
        'gitlab_list_files',
        'Lista de manera recursiva los archivos y directorios del repositorio de GitLab.',
        {
            token: z.string().describe('Token de Acceso Personal (PAT) de GitLab'),
            projectId: z.string().describe('ID numérico del proyecto o ruta URL-encoded'),
            path: z.string().optional().describe('Subdirectorio específico para listar. Vacío para la raíz.'),
            ref: z.string().optional().describe('Rama o commit de Git (ej: main, dev). Por defecto la rama principal.'),
            recursive: z.boolean().default(true).describe('Si es true, lista de forma recursiva todos los subdirectorios')
        },
        async ({ token, projectId, path, ref, recursive }) => {
            try {
                const params = {
                    recursive,
                    per_page: 100
                };
                if (path) params.path = path;
                if (ref) params.ref = ref;

                const files = await gitlabRequest(token, `/projects/${encodeURIComponent(projectId)}/repository/tree`, params);
                const formatted = files.map(f => ({
                    path: f.path,
                    name: f.name,
                    type: f.type, // 'blob' (archivo) o 'tree' (directorio)
                    mode: f.mode
                }));
                return {
                    content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }]
                };
            } catch (err) {
                return {
                    content: [{ type: 'text', text: `Error: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    // ── HERRAMIENTA 3: Leer el contenido de un archivo ──
    server.tool(
        'gitlab_read_file',
        'Obtiene el contenido en texto plano de un archivo específico del repositorio.',
        {
            token: z.string().describe('Token de Acceso Personal (PAT) de GitLab'),
            projectId: z.string().describe('ID numérico del proyecto o ruta URL-encoded'),
            filePath: z.string().describe('Ruta completa del archivo en el repositorio (ej: src/index.js)'),
            ref: z.string().optional().describe('Rama o commit del que leer el archivo')
        },
        async ({ token, projectId, filePath, ref }) => {
            try {
                const params = {};
                if (ref) params.ref = ref;

                // Obtenemos el archivo en crudo (raw) para leer su texto plano directamente
                const data = await gitlabRequest(
                    token, 
                    `/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}/raw`,
                    params
                );
                
                // Si data es un objeto (JSON), lo convertimos en string
                const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
                return {
                    content: [{ type: 'text', text }]
                };
            } catch (err) {
                return {
                    content: [{ type: 'text', text: `Error leyendo archivo: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    // ── HERRAMIENTA 4: Listar incidencias (Issues) ──
    server.tool(
        'gitlab_list_issues',
        'Obtiene una lista de incidencias (issues) del proyecto, filtradas opcionalmente por estado.',
        {
            token: z.string().describe('Token de Acceso Personal (PAT) de GitLab'),
            projectId: z.string().describe('ID numérico del proyecto o ruta URL-encoded'),
            state: z.enum(['opened', 'closed', 'all']).default('opened').describe('Filtrar por estado del issue')
        },
        async ({ token, projectId, state }) => {
            try {
                const issues = await gitlabRequest(
                    token,
                    `/projects/${encodeURIComponent(projectId)}/issues`,
                    { state, per_page: 50 }
                );
                const formatted = issues.map(i => ({
                    iid: i.iid,
                    title: i.title,
                    description: i.description,
                    state: i.state,
                    labels: i.labels,
                    web_url: i.web_url,
                    created_at: i.created_at,
                    author: i.author?.username
                }));
                return {
                    content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }]
                };
            } catch (err) {
                return {
                    content: [{ type: 'text', text: `Error obteniendo issues: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    // ── HERRAMIENTA 5: Listar solicitudes de fusión (Merge Requests) ──
    server.tool(
        'gitlab_list_merge_requests',
        'Obtiene una lista de solicitudes de fusión (Merge Requests) del proyecto.',
        {
            token: z.string().describe('Token de Acceso Personal (PAT) de GitLab'),
            projectId: z.string().describe('ID numérico del proyecto o ruta URL-encoded'),
            state: z.enum(['opened', 'merged', 'closed', 'all']).default('opened').describe('Estado del merge request')
        },
        async ({ token, projectId, state }) => {
            try {
                const mrs = await gitlabRequest(
                    token,
                    `/projects/${encodeURIComponent(projectId)}/merge_requests`,
                    { state, per_page: 50 }
                );
                const formatted = mrs.map(m => ({
                    iid: m.iid,
                    title: m.title,
                    description: m.description,
                    state: m.state,
                    source_branch: m.source_branch,
                    target_branch: m.target_branch,
                    web_url: m.web_url,
                    created_at: m.created_at,
                    author: m.author?.username
                }));
                return {
                    content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }]
                };
            } catch (err) {
                return {
                    content: [{ type: 'text', text: `Error obteniendo merge requests: ${err.message}` }],
                    isError: true
                };
            }
        }
    );

    return server;
}

/**
 * Monta el servidor MCP de GitLab en una aplicación Express utilizando Streamable HTTP.
 */
function mountGitLabMcp(app, endpointPath = '/mcp/gitlab') {
    const server = createGitLabMcpServer();

    // Las solicitudes MCP de herramientas usan POST
    app.post(endpointPath, async (req, res) => {
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined // modo sin estado
            });
            res.on('close', () => transport.close());
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            console.error('MCP request error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal MCP Error' });
            }
        }
    });

    // Endpoint de verificación del servidor MCP
    app.get(`${endpointPath}/health`, (req, res) => {
        res.json({
            ok: true,
            server: 'gitlab-partner-mcp',
            version: '1.0.0',
            tools: [
                'gitlab_get_project',
                'gitlab_list_files',
                'gitlab_read_file',
                'gitlab_list_issues',
                'gitlab_list_merge_requests'
            ]
        });
    });

    console.log(`🔌 Servidor MCP de GitLab montado en ${endpointPath}`);
}

module.exports = { createGitLabMcpServer, mountGitLabMcp };
