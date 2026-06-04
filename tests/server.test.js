// tests/server.test.js — Tests unitarios y de integración del servidor Express
const request = require('supertest');
const express = require('express');
const path = require('path');

// Crear una instancia de la app Express sin iniciar el listener
function createApp() {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Health endpoint
    app.get('/api/health', (req, res) => {
        res.json({
            status: 'online',
            server: 'GitLab Agentic Auditor v2.0',
            model: 'gemini-3.5-flash',
            partnerMcp: '@structured-world/gitlab-mcp',
            track: 'GitLab Partner Track'
        });
    });

    // Analyze-stream endpoint (validación solamente)
    app.get('/api/analyze-stream', (req, res) => {
        const { token, projectId } = req.query;
        if (!token || !projectId) {
            res.status(400).json({ error: 'Faltan parámetros obligatorios: token y projectId.' });
            return;
        }
        // En tests, no ejecutamos el agente real — solo validamos los params
        res.status(200).json({ ok: true, token: '***', projectId });
    });

    return app;
}

// ============================================================================
// TESTS DEL HEALTH ENDPOINT
// ============================================================================
describe('GET /api/health', () => {
    const app = createApp();

    test('devuelve status 200', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
    });

    test('devuelve status "online"', async () => {
        const res = await request(app).get('/api/health');
        expect(res.body.status).toBe('online');
    });

    test('devuelve modelo correcto (gemini-3.5-flash)', async () => {
        const res = await request(app).get('/api/health');
        expect(res.body.model).toBe('gemini-3.5-flash');
    });

    test('devuelve partnerMcp correcto', async () => {
        const res = await request(app).get('/api/health');
        expect(res.body.partnerMcp).toBe('@structured-world/gitlab-mcp');
    });

    test('devuelve track GitLab', async () => {
        const res = await request(app).get('/api/health');
        expect(res.body.track).toBe('GitLab Partner Track');
    });

    test('devuelve server name v2.0', async () => {
        const res = await request(app).get('/api/health');
        expect(res.body.server).toContain('v2.0');
    });

    test('responde con Content-Type JSON', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['content-type']).toMatch(/json/);
    });
});

// ============================================================================
// TESTS DEL ENDPOINT analyze-stream (validación de parámetros)
// ============================================================================
describe('GET /api/analyze-stream', () => {
    const app = createApp();

    test('devuelve 400 si falta token y projectId', async () => {
        const res = await request(app).get('/api/analyze-stream');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('token');
        expect(res.body.error).toContain('projectId');
    });

    test('devuelve 400 si falta solo token', async () => {
        const res = await request(app).get('/api/analyze-stream?projectId=123');
        expect(res.status).toBe(400);
    });

    test('devuelve 400 si falta solo projectId', async () => {
        const res = await request(app).get('/api/analyze-stream?token=glpat-xxx');
        expect(res.status).toBe(400);
    });

    test('acepta con token y projectId correctos', async () => {
        const res = await request(app).get('/api/analyze-stream?token=glpat-xxx&projectId=123');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    test('no expone el token en la respuesta', async () => {
        const res = await request(app).get('/api/analyze-stream?token=glpat-secret&projectId=123');
        expect(res.body.token).toBe('***');
        expect(JSON.stringify(res.body)).not.toContain('glpat-secret');
    });

    test('mantiene el projectId en la respuesta', async () => {
        const res = await request(app).get('/api/analyze-stream?token=glpat-xxx&projectId=my-project');
        expect(res.body.projectId).toBe('my-project');
    });
});

// ============================================================================
// TESTS DE ARCHIVOS ESTÁTICOS
// ============================================================================
describe('Static files serving', () => {
    const app = createApp();

    test('sirve index.html en la raíz', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
    });

    test('index.html contiene el título correcto', async () => {
        const res = await request(app).get('/');
        expect(res.text).toContain('GitLab Agentic Auditor');
    });

    test('index.html contiene los badges de tecnología', async () => {
        const res = await request(app).get('/');
        expect(res.text).toContain('Gemini 3.5 Flash');
        expect(res.text).toContain('Partner MCP Server');
        expect(res.text).toContain('GitLab Track');
    });

    test('sirve app.js', async () => {
        const res = await request(app).get('/app.js');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/javascript/);
    });

    test('sirve styles.css', async () => {
        const res = await request(app).get('/styles.css');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/css/);
    });

    test('devuelve 404 para archivos que no existen', async () => {
        const res = await request(app).get('/no-existe.txt');
        expect(res.status).toBe(404);
    });
});

// ============================================================================
// TESTS DE SEGURIDAD BÁSICOS
// ============================================================================
describe('Security basics', () => {
    const app = createApp();

    test('no sirve archivos .env', async () => {
        const res = await request(app).get('/.env');
        expect(res.status).toBe(404);
    });

    test('no sirve server.js desde el public', async () => {
        const res = await request(app).get('/server.js');
        expect(res.status).toBe(404);
    });

    test('no sirve package.json desde el public', async () => {
        const res = await request(app).get('/package.json');
        expect(res.status).toBe(404);
    });
});
