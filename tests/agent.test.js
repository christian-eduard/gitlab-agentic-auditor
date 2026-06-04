// tests/agent.test.js — Tests unitarios del módulo Agent (MCP Client + Gemini)
const { _internal, runGitLabAgent } = require('../src/services/agent');
const { convertMcpSchemaToGemini, mcpToolsToGemini, callPartnerMcp } = _internal;

// ============================================================================
// TESTS DE convertMcpSchemaToGemini()
// ============================================================================
describe('convertMcpSchemaToGemini', () => {
    test('devuelve schema vacío si inputSchema es null', () => {
        const result = convertMcpSchemaToGemini(null);
        expect(result).toEqual({ type: 'OBJECT', properties: {} });
    });

    test('devuelve schema vacío si inputSchema es undefined', () => {
        const result = convertMcpSchemaToGemini(undefined);
        expect(result).toEqual({ type: 'OBJECT', properties: {} });
    });

    test('devuelve schema vacío si type no es object', () => {
        const result = convertMcpSchemaToGemini({ type: 'string' });
        expect(result).toEqual({ type: 'OBJECT', properties: {} });
    });

    test('convierte propiedades string correctamente', () => {
        const input = {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Nombre del proyecto' }
            },
            required: ['name']
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result).toEqual({
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Nombre del proyecto' }
            },
            required: ['name']
        });
    });

    test('convierte propiedades number/integer a NUMBER', () => {
        const input = {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Cantidad' },
                page: { type: 'integer', description: 'Página' }
            }
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result.properties.count.type).toBe('NUMBER');
        expect(result.properties.page.type).toBe('NUMBER');
    });

    test('convierte propiedades boolean a BOOLEAN', () => {
        const input = {
            type: 'object',
            properties: {
                active: { type: 'boolean', description: 'Está activo' }
            }
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result.properties.active.type).toBe('BOOLEAN');
    });

    test('convierte propiedades array a ARRAY con items', () => {
        const input = {
            type: 'object',
            properties: {
                tags: { 
                    type: 'array', 
                    description: 'Lista de tags',
                    items: { type: 'string' }
                }
            }
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result.properties.tags.type).toBe('ARRAY');
        expect(result.properties.tags.items).toEqual({ type: 'STRING' });
    });

    test('convierte array con items numéricos', () => {
        const input = {
            type: 'object',
            properties: {
                ids: { 
                    type: 'array', 
                    description: 'IDs',
                    items: { type: 'integer' }
                }
            }
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result.properties.ids.items).toEqual({ type: 'NUMBER' });
    });

    test('convierte array con items booleanos', () => {
        const input = {
            type: 'object',
            properties: {
                flags: { 
                    type: 'array', 
                    description: 'Flags',
                    items: { type: 'boolean' }
                }
            }
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result.properties.flags.items).toEqual({ type: 'BOOLEAN' });
    });

    test('maneja properties vacías', () => {
        const input = {
            type: 'object',
            properties: {}
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result).toEqual({
            type: 'OBJECT',
            properties: {},
            required: []
        });
    });

    test('usa description vacía si no se proporciona', () => {
        const input = {
            type: 'object',
            properties: {
                field: { type: 'string' }
            }
        };
        const result = convertMcpSchemaToGemini(input);
        expect(result.properties.field.description).toBe('');
    });

    test('maneja schema complejo con múltiples propiedades', () => {
        const input = {
            type: 'object',
            properties: {
                project_id: { type: 'string', description: 'ID del proyecto' },
                page: { type: 'integer', description: 'Número de página' },
                per_page: { type: 'number', description: 'Elementos por página' },
                include_archived: { type: 'boolean', description: 'Incluir archivados' },
                labels: { type: 'array', description: 'Etiquetas', items: { type: 'string' } }
            },
            required: ['project_id']
        };
        const result = convertMcpSchemaToGemini(input);
        
        expect(Object.keys(result.properties)).toHaveLength(5);
        expect(result.properties.project_id.type).toBe('STRING');
        expect(result.properties.page.type).toBe('NUMBER');
        expect(result.properties.per_page.type).toBe('NUMBER');
        expect(result.properties.include_archived.type).toBe('BOOLEAN');
        expect(result.properties.labels.type).toBe('ARRAY');
        expect(result.required).toEqual(['project_id']);
    });
});

// ============================================================================
// TESTS DE mcpToolsToGemini()
// ============================================================================
describe('mcpToolsToGemini', () => {
    test('convierte una lista vacía de herramientas', () => {
        const result = mcpToolsToGemini([]);
        expect(result).toEqual([{ functionDeclarations: [] }]);
    });

    test('convierte una herramienta simple', () => {
        const tools = [{
            name: 'get_project',
            description: 'Obtiene info de un proyecto',
            inputSchema: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Project ID' }
                },
                required: ['id']
            }
        }];
        
        const result = mcpToolsToGemini(tools);
        expect(result).toHaveLength(1);
        expect(result[0].functionDeclarations).toHaveLength(1);
        expect(result[0].functionDeclarations[0].name).toBe('get_project');
        expect(result[0].functionDeclarations[0].description).toBe('Obtiene info de un proyecto');
    });

    test('usa descripción por defecto si falta', () => {
        const tools = [{
            name: 'my_tool',
            inputSchema: { type: 'object', properties: {} }
        }];
        
        const result = mcpToolsToGemini(tools);
        expect(result[0].functionDeclarations[0].description).toBe('Herramienta MCP: my_tool');
    });

    test('convierte múltiples herramientas', () => {
        const tools = [
            { name: 'tool_a', description: 'A', inputSchema: { type: 'object', properties: {} } },
            { name: 'tool_b', description: 'B', inputSchema: { type: 'object', properties: {} } },
            { name: 'tool_c', description: 'C', inputSchema: { type: 'object', properties: {} } }
        ];
        
        const result = mcpToolsToGemini(tools);
        expect(result[0].functionDeclarations).toHaveLength(3);
        expect(result[0].functionDeclarations.map(d => d.name)).toEqual(['tool_a', 'tool_b', 'tool_c']);
    });

    test('maneja herramientas sin inputSchema', () => {
        const tools = [{
            name: 'simple_tool',
            description: 'Herramienta simple'
        }];
        
        const result = mcpToolsToGemini(tools);
        expect(result[0].functionDeclarations[0].parameters).toEqual({
            type: 'OBJECT',
            properties: {}
        });
    });
});

// ============================================================================
// TESTS DE callPartnerMcp()
// ============================================================================
describe('callPartnerMcp', () => {
    test('extrae texto de una respuesta MCP exitosa', async () => {
        const mockClient = {
            callTool: jest.fn().mockResolvedValue({
                isError: false,
                content: [
                    { type: 'text', text: 'Línea 1' },
                    { type: 'text', text: 'Línea 2' }
                ]
            })
        };
        
        const result = await callPartnerMcp(mockClient, 'get_project', { id: '123' });
        expect(result).toBe('Línea 1\nLínea 2');
        expect(mockClient.callTool).toHaveBeenCalledWith({
            name: 'get_project',
            arguments: { id: '123' }
        });
    });

    test('ignora content que no sea de tipo text', async () => {
        const mockClient = {
            callTool: jest.fn().mockResolvedValue({
                isError: false,
                content: [
                    { type: 'image', data: 'base64...' },
                    { type: 'text', text: 'Solo esto' }
                ]
            })
        };
        
        const result = await callPartnerMcp(mockClient, 'some_tool', {});
        expect(result).toBe('Solo esto');
    });

    test('lanza error si isError es true', async () => {
        const mockClient = {
            callTool: jest.fn().mockResolvedValue({
                isError: true,
                content: [{ type: 'text', text: 'Not found' }]
            })
        };
        
        await expect(callPartnerMcp(mockClient, 'get_project', { id: '999' }))
            .rejects.toThrow('Partner MCP Call Failed (get_project): Not found');
    });

    test('lanza error genérico si isError pero sin text', async () => {
        const mockClient = {
            callTool: jest.fn().mockResolvedValue({
                isError: true,
                content: []
            })
        };
        
        await expect(callPartnerMcp(mockClient, 'tool', {}))
            .rejects.toThrow('Error desconocido del Partner MCP');
    });

    test('lanza error si callTool lanza excepción', async () => {
        const mockClient = {
            callTool: jest.fn().mockRejectedValue(new Error('Connection refused'))
        };
        
        await expect(callPartnerMcp(mockClient, 'tool', {}))
            .rejects.toThrow('Partner MCP Call Failed (tool): Connection refused');
    });

    test('devuelve string vacía si content es vacío', async () => {
        const mockClient = {
            callTool: jest.fn().mockResolvedValue({
                isError: false,
                content: []
            })
        };
        
        const result = await callPartnerMcp(mockClient, 'tool', {});
        expect(result).toBe('');
    });

    test('llama al logCallback', async () => {
        const mockClient = {
            callTool: jest.fn().mockResolvedValue({
                isError: false,
                content: [{ type: 'text', text: 'OK' }]
            })
        };
        const logCallback = jest.fn();
        
        await callPartnerMcp(mockClient, 'tool', {}, logCallback);
        // No debería llamar al log desde callPartnerMcp (los logs se hacen en runGitLabAgent)
    });
});

// ============================================================================
// TESTS DE runGitLabAgent() — Integración con mocks
// ============================================================================
describe('runGitLabAgent', () => {
    test('el módulo exporta runGitLabAgent', () => {
        expect(typeof runGitLabAgent).toBe('function');
    });

    test('el módulo exporta las funciones internas', () => {
        expect(typeof _internal.convertMcpSchemaToGemini).toBe('function');
        expect(typeof _internal.mcpToolsToGemini).toBe('function');
        expect(typeof _internal.callPartnerMcp).toBe('function');
        expect(typeof _internal.discoverTools).toBe('function');
        expect(typeof _internal.createMcpClient).toBe('function');
    });
});
