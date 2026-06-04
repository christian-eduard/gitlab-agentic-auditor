// public/app.js — Lógica de Cliente para el Panel del Agente v2.0
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos del DOM
    const selectTaskType = document.getElementById('task-type');
    const issueGroup = document.getElementById('issue-group');
    const issueIidInput = document.getElementById('issue-iid');
    const auditForm = document.getElementById('audit-form');
    const submitBtn = document.getElementById('submit-btn');
    const terminalOutput = document.getElementById('terminal-output');
    const agentStatusIndicator = document.getElementById('agent-status-indicator');
    const reportCard = document.getElementById('report-card');
    const reportOutput = document.getElementById('report-output');
    
    // Botones de acción del reporte
    const copyReportBtn = document.getElementById('copy-report-btn');
    const printReportBtn = document.getElementById('print-report-btn');

    // Stats elements
    const agentStats = document.getElementById('agent-stats');
    const statSteps = document.getElementById('stat-steps');
    const statTools = document.getElementById('stat-tools');
    const statTime = document.getElementById('stat-time');

    let finalReportMarkdown = '';
    let stepCount = 0;
    let toolCount = 0;
    let startTime = null;
    let timerInterval = null;

    // ── MOSTRAR/OCULTAR CAMPO DE ISSUE SEGÚN SELECCIÓN ──
    selectTaskType.addEventListener('change', () => {
        if (selectTaskType.value === 'resolve-issue') {
            issueGroup.classList.remove('hidden');
            issueIidInput.setAttribute('required', 'true');
        } else {
            issueGroup.classList.add('hidden');
            issueIidInput.removeAttribute('required');
        }
    });

    // ── HELPER: AÑADIR LÍNEAS A LA TERMINAL ──
    function appendLog(message) {
        const line = document.createElement('div');
        line.classList.add('log-line');

        // Determinar estilo y prefix
        let prefix = '';
        if (message.startsWith('[SISTEMA]')) {
            line.classList.add('system');
            prefix = '[SISTEMA]';
        } else if (message.startsWith('[PENSAMIENTO]')) {
            line.classList.add('thought');
            prefix = '[PENSAMIENTO]';
            stepCount++;
            statSteps.textContent = stepCount;
        } else if (message.startsWith('[HERRAMIENTA]')) {
            line.classList.add('tool');
            prefix = '[HERRAMIENTA]';
            if (message.includes('ejecuta herramienta') || message.includes('ejecuta la herramienta')) {
                toolCount++;
                statTools.textContent = toolCount;
            }
        } else if (message.startsWith('[AGENTE]')) {
            line.classList.add('agent');
            prefix = '[AGENTE]';
        } else if (message.startsWith('[⚠️ ERROR]') || message.startsWith('[ERROR]')) {
            line.classList.add('error');
            prefix = '[ERROR]';
        } else {
            line.classList.add('agent');
        }

        // Formatear con prefix estilizado
        if (prefix && message.startsWith(prefix)) {
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'log-prefix';
            prefixSpan.textContent = prefix;
            
            const textNode = document.createTextNode(' ' + message.slice(prefix.length).trim());
            
            line.appendChild(prefixSpan);
            line.appendChild(textNode);
        } else {
            line.textContent = message;
        }

        terminalOutput.appendChild(line);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    // ── HELPER: ACTUALIZAR INDICADOR DE ESTADO ──
    function setAgentStatus(status, mode = 'idle') {
        const statusText = agentStatusIndicator.querySelector('.status-text');
        statusText.textContent = status;
        agentStatusIndicator.className = 'terminal-status';

        if (mode === 'running') {
            agentStatusIndicator.classList.add('running');
        } else if (mode === 'completed') {
            agentStatusIndicator.classList.add('completed');
        }
    }

    // ── HELPER: TIMER ──
    function startTimer() {
        startTime = Date.now();
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            statTime.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // ── SUBMIT DEL FORMULARIO: INICIAR AUDITORÍA (SSE) ──
    auditForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Obtener valores
        const token = document.getElementById('gitlab-token').value.trim();
        const projectId = document.getElementById('gitlab-project').value.trim();
        const taskType = selectTaskType.value;
        const issueIid = issueIidInput.value.trim();
        const gitRef = document.getElementById('git-ref').value.trim();

        // Validaciones
        if (!token || !projectId) {
            alert('Por favor ingresa el GitLab Token y el ID del Proyecto.');
            return;
        }

        if (taskType === 'resolve-issue' && !issueIid) {
            alert('Por favor ingresa el número correlativo del Issue (IID).');
            return;
        }

        // Reset stats
        stepCount = 0;
        toolCount = 0;
        statSteps.textContent = '0';
        statTools.textContent = '0';
        statTime.textContent = '0s';

        // Bloquear UI
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').textContent = 'Agente en Acción...';
        setAgentStatus('Ejecutando', 'running');
        reportCard.classList.add('hidden');
        reportOutput.innerHTML = '';
        finalReportMarkdown = '';
        agentStats.classList.remove('hidden');

        // Limpiar terminal
        terminalOutput.innerHTML = '';
        appendLog(`[SISTEMA] Iniciando conexión con el orquestador v2.0...`);
        appendLog(`[SISTEMA] Conectando Partner MCP Server (@structured-world/gitlab-mcp)...`);

        // Start timer
        startTimer();

        // Construir URL de Server-Sent Events
        let sseUrl = `/api/analyze-stream?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}&taskType=${taskType}`;
        if (gitRef) {
            sseUrl += `&ref=${encodeURIComponent(gitRef)}`;
        }
        if (taskType === 'resolve-issue' && issueIid) {
            sseUrl += `&issueIid=${issueIid}`;
        }

        // Crear la conexión EventSource
        const eventSource = new EventSource(sseUrl);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'status') {
                    setAgentStatus(data.message, 'running');
                } else if (data.type === 'log') {
                    appendLog(data.message);
                } else if (data.type === 'result') {
                    // Recibimos el reporte final
                    finalReportMarkdown = data.report;
                    
                    // Renderizar Markdown
                    if (window.marked) {
                        reportOutput.innerHTML = marked.parse(data.report);
                    } else {
                        reportOutput.textContent = data.report;
                    }

                    // Revelar panel de reporte
                    reportCard.classList.remove('hidden');
                    reportCard.scrollIntoView({ behavior: 'smooth' });
                } else if (data.type === 'error') {
                    appendLog(`[⚠️ ERROR] ${data.message}`);
                    setAgentStatus('Error', 'idle');
                }
            } catch (err) {
                console.error('Error parseando mensaje SSE:', err);
            }
        };

        eventSource.onerror = () => {
            // Stop timer
            stopTimer();

            appendLog(`[SISTEMA] Conexión cerrada.`);
            
            // Habilitar UI
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Lanzar Agente Autónomo';
            setAgentStatus('Finalizado', finalReportMarkdown ? 'completed' : 'idle');
            
            eventSource.close();
        };
    });

    // ── ACCIÓN: COPIAR AL PORTAPAPELES ──
    copyReportBtn.addEventListener('click', () => {
        if (!finalReportMarkdown) return;
        
        navigator.clipboard.writeText(finalReportMarkdown)
            .then(() => {
                const originalText = copyReportBtn.innerHTML;
                copyReportBtn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';
                setTimeout(() => {
                    copyReportBtn.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('Error al copiar:', err);
                alert('No se pudo copiar el reporte automáticamente.');
            });
    });

    // ── ACCIÓN: IMPRIMIR / EXPORTAR A PDF ──
    printReportBtn.addEventListener('click', () => {
        window.print();
    });
});
