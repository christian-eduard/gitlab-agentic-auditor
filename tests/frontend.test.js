/**
 * @jest-environment jsdom
 */
// tests/frontend.test.js — Tests unitarios del frontend (app.js logic)

// ============================================================================
// HELPERS: Funciones que simulan la lógica del frontend para testing
// (Extraídas de app.js como funciones puras)
// ============================================================================

/**
 * Clasifica un mensaje de log según su prefijo.
 * @param {string} message - Mensaje a clasificar
 * @returns {{ cssClass: string, prefix: string }}
 */
function classifyLogMessage(message) {
    if (message.startsWith('[SISTEMA]')) return { cssClass: 'system', prefix: '[SISTEMA]' };
    if (message.startsWith('[PENSAMIENTO]')) return { cssClass: 'thought', prefix: '[PENSAMIENTO]' };
    if (message.startsWith('[HERRAMIENTA]')) return { cssClass: 'tool', prefix: '[HERRAMIENTA]' };
    if (message.startsWith('[AGENTE]')) return { cssClass: 'agent', prefix: '[AGENTE]' };
    if (message.startsWith('[⚠️ ERROR]') || message.startsWith('[ERROR]')) return { cssClass: 'error', prefix: '[ERROR]' };
    return { cssClass: 'agent', prefix: '' };
}

/**
 * Determina si un mensaje de herramienta indica uso de una nueva herramienta.
 */
function isNewToolCall(message) {
    return message.startsWith('[HERRAMIENTA]') && 
        (message.includes('ejecuta herramienta') || message.includes('ejecuta la herramienta'));
}

/**
 * Construye la URL de SSE para el endpoint analyze-stream.
 */
function buildSseUrl(params) {
    const { token, projectId, taskType, issueIid, gitRef } = params;
    let url = `/api/analyze-stream?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}&taskType=${taskType}`;
    if (gitRef) url += `&ref=${encodeURIComponent(gitRef)}`;
    if (taskType === 'resolve-issue' && issueIid) url += `&issueIid=${issueIid}`;
    return url;
}

/**
 * Formatea el tiempo transcurrido como string humano.
 */
function formatElapsedTime(elapsedSeconds) {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ============================================================================
// TESTS DE classifyLogMessage
// ============================================================================
describe('classifyLogMessage', () => {
    test('clasifica mensajes de SISTEMA', () => {
        const result = classifyLogMessage('[SISTEMA] Conectando al MCP...');
        expect(result.cssClass).toBe('system');
        expect(result.prefix).toBe('[SISTEMA]');
    });

    test('clasifica mensajes de PENSAMIENTO', () => {
        const result = classifyLogMessage('[PENSAMIENTO] Generando razonamiento...');
        expect(result.cssClass).toBe('thought');
        expect(result.prefix).toBe('[PENSAMIENTO]');
    });

    test('clasifica mensajes de HERRAMIENTA', () => {
        const result = classifyLogMessage('[HERRAMIENTA] Ejecutando get_project...');
        expect(result.cssClass).toBe('tool');
        expect(result.prefix).toBe('[HERRAMIENTA]');
    });

    test('clasifica mensajes de AGENTE', () => {
        const result = classifyLogMessage('[AGENTE] Voy a explorar el repositorio...');
        expect(result.cssClass).toBe('agent');
        expect(result.prefix).toBe('[AGENTE]');
    });

    test('clasifica mensajes de ERROR con emoji', () => {
        const result = classifyLogMessage('[⚠️ ERROR] Falló la conexión');
        expect(result.cssClass).toBe('error');
    });

    test('clasifica mensajes de ERROR sin emoji', () => {
        const result = classifyLogMessage('[ERROR] Error genérico');
        expect(result.cssClass).toBe('error');
    });

    test('clasifica mensajes sin prefijo conocido como agent', () => {
        const result = classifyLogMessage('Mensaje sin prefijo especial');
        expect(result.cssClass).toBe('agent');
        expect(result.prefix).toBe('');
    });

    test('clasifica mensajes vacíos como agent', () => {
        const result = classifyLogMessage('');
        expect(result.cssClass).toBe('agent');
        expect(result.prefix).toBe('');
    });
});

// ============================================================================
// TESTS DE isNewToolCall
// ============================================================================
describe('isNewToolCall', () => {
    test('detecta nueva llamada a herramienta (ejecuta herramienta)', () => {
        expect(isNewToolCall('[HERRAMIENTA] El agente ejecuta herramienta Partner MCP: "get_project"')).toBe(true);
    });

    test('detecta nueva llamada a herramienta (ejecuta la herramienta)', () => {
        expect(isNewToolCall('[HERRAMIENTA] El agente ejecuta la herramienta del Partner MCP: "get_project"')).toBe(true);
    });

    test('no cuenta mensajes de Args como nueva herramienta', () => {
        expect(isNewToolCall('[HERRAMIENTA] Args: {"id":"123"}')).toBe(false);
    });

    test('no cuenta mensajes de otro tipo', () => {
        expect(isNewToolCall('[SISTEMA] Herramienta ejecutada.')).toBe(false);
    });

    test('no cuenta mensajes vacíos', () => {
        expect(isNewToolCall('')).toBe(false);
    });
});

// ============================================================================
// TESTS DE buildSseUrl
// ============================================================================
describe('buildSseUrl', () => {
    test('construye URL básica con token y projectId', () => {
        const url = buildSseUrl({
            token: 'glpat-xxx',
            projectId: '12345',
            taskType: 'audit'
        });
        expect(url).toBe('/api/analyze-stream?token=glpat-xxx&projectId=12345&taskType=audit');
    });

    test('añade ref si se proporciona', () => {
        const url = buildSseUrl({
            token: 'tok',
            projectId: '1',
            taskType: 'audit',
            gitRef: 'develop'
        });
        expect(url).toContain('&ref=develop');
    });

    test('añade issueIid si taskType es resolve-issue', () => {
        const url = buildSseUrl({
            token: 'tok',
            projectId: '1',
            taskType: 'resolve-issue',
            issueIid: '42'
        });
        expect(url).toContain('&issueIid=42');
    });

    test('no añade issueIid si taskType no es resolve-issue', () => {
        const url = buildSseUrl({
            token: 'tok',
            projectId: '1',
            taskType: 'audit',
            issueIid: '42'
        });
        expect(url).not.toContain('issueIid');
    });

    test('codifica caracteres especiales en token', () => {
        const url = buildSseUrl({
            token: 'tok+en/special',
            projectId: '1',
            taskType: 'audit'
        });
        expect(url).toContain('token=tok%2Ben%2Fspecial');
    });

    test('codifica caracteres especiales en projectId', () => {
        const url = buildSseUrl({
            token: 'tok',
            projectId: 'group/project',
            taskType: 'audit'
        });
        expect(url).toContain('projectId=group%2Fproject');
    });

    test('no añade ref si no se proporciona', () => {
        const url = buildSseUrl({
            token: 'tok',
            projectId: '1',
            taskType: 'audit'
        });
        expect(url).not.toContain('&ref=');
    });
});

// ============================================================================
// TESTS DE formatElapsedTime
// ============================================================================
describe('formatElapsedTime', () => {
    test('muestra solo segundos cuando es < 60', () => {
        expect(formatElapsedTime(0)).toBe('0s');
        expect(formatElapsedTime(5)).toBe('5s');
        expect(formatElapsedTime(59)).toBe('59s');
    });

    test('muestra minutos y segundos cuando >= 60', () => {
        expect(formatElapsedTime(60)).toBe('1m 0s');
        expect(formatElapsedTime(90)).toBe('1m 30s');
        expect(formatElapsedTime(125)).toBe('2m 5s');
    });

    test('maneja valores grandes', () => {
        expect(formatElapsedTime(3661)).toBe('61m 1s');
    });
});

// ============================================================================
// TESTS DE INTEGRACIÓN HTML (DOM)
// ============================================================================
describe('HTML DOM structure', () => {
    beforeEach(() => {
        // Cargar el HTML desde el archivo real
        const fs = require('fs');
        const html = fs.readFileSync(
            require('path').join(__dirname, '..', 'public', 'index.html'),
            'utf-8'
        );
        document.documentElement.innerHTML = html;
    });

    test('existe el formulario de auditoría', () => {
        expect(document.getElementById('audit-form')).not.toBeNull();
    });

    test('existe el campo de token', () => {
        const tokenInput = document.getElementById('gitlab-token');
        expect(tokenInput).not.toBeNull();
        expect(tokenInput.type).toBe('password');
    });

    test('existe el campo de projectId', () => {
        expect(document.getElementById('gitlab-project')).not.toBeNull();
    });

    test('existe el selector de tipo de tarea', () => {
        const select = document.getElementById('task-type');
        expect(select).not.toBeNull();
        expect(select.tagName).toBe('SELECT');
    });

    test('el selector tiene 3 opciones', () => {
        const select = document.getElementById('task-type');
        expect(select.options.length).toBe(3);
    });

    test('los tipos de tarea son correctos', () => {
        const select = document.getElementById('task-type');
        const values = Array.from(select.options).map(o => o.value);
        expect(values).toEqual(['audit', 'security', 'resolve-issue']);
    });

    test('existe la terminal de logs', () => {
        expect(document.getElementById('terminal-output')).not.toBeNull();
    });

    test('existe el botón de submit', () => {
        const btn = document.getElementById('submit-btn');
        expect(btn).not.toBeNull();
        expect(btn.type).toBe('submit');
    });

    test('existe el indicador de estado del agente', () => {
        expect(document.getElementById('agent-status-indicator')).not.toBeNull();
    });

    test('existe el panel de reporte (oculto)', () => {
        const reportCard = document.getElementById('report-card');
        expect(reportCard).not.toBeNull();
        expect(reportCard.classList.contains('hidden')).toBe(true);
    });

    test('existen los contadores de stats', () => {
        expect(document.getElementById('stat-steps')).not.toBeNull();
        expect(document.getElementById('stat-tools')).not.toBeNull();
        expect(document.getElementById('stat-time')).not.toBeNull();
    });

    test('existen los botones de reporte', () => {
        expect(document.getElementById('copy-report-btn')).not.toBeNull();
        expect(document.getElementById('print-report-btn')).not.toBeNull();
    });

    test('el campo de issue está oculto por defecto', () => {
        const issueGroup = document.getElementById('issue-group');
        expect(issueGroup).not.toBeNull();
        expect(issueGroup.classList.contains('hidden')).toBe(true);
    });

    test('los badges de tecnología están presentes', () => {
        const html = document.body.innerHTML;
        expect(html).toContain('Gemini 3.5 Flash');
        expect(html).toContain('Partner MCP Server');
        expect(html).toContain('GitLab Track');
    });

    test('el footer tiene la mención de hackathon', () => {
        const footer = document.querySelector('footer');
        expect(footer).not.toBeNull();
        expect(footer.textContent).toContain('Hackathon');
    });
});
