# 🦊 GitLab Agentic Auditor (GAA)

> **Autonomous AI Agent for Code Auditing, Security Analysis & Issue Resolution** — powered by Gemini 3.5 Flash & GitLab Partner MCP Server.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Partner Track](https://img.shields.io/badge/Partner-GitLab-orange.svg)](https://about.gitlab.com/)
[![Gemini 3.5](https://img.shields.io/badge/Model-Gemini%203.5%20Flash-blue.svg)](https://cloud.google.com/vertex-ai)
[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen.svg)](https://gitlab-agentic-auditor-774708549531.us-central1.run.app)

> **🌐 Live Demo:** https://gitlab-agentic-auditor-774708549531.us-central1.run.app

---

## 🏆 Hackathon Submission — "Building Agents for Real-World Challenges"

**Track:** GitLab Partner Track  
**Model:** Gemini 3.5 Flash (Vertex AI)  
**MCP Server:** `@structured-world/gitlab-mcp` (44 tools, 18 entity types)  

---

## 🚀 What It Does

GitLab Agentic Auditor (GAA) is an **autonomous AI agent** that performs comprehensive technical audits on any GitLab repository. It doesn't just answer questions — it **takes action**:

1. 🔍 **Explores** the repository structure autonomously
2. 📖 **Reads** key files (dependencies, configs, source code)
3. 🐛 **Analyzes** issues and merge requests
4. 📊 **Generates** a detailed Markdown report with severity-ranked findings
5. 🔧 **Proposes** concrete code patches for issue resolution

### Three Modes of Operation

| Mode | Description |
|------|-------------|
| **Full Technical Audit** | Complete code quality, architecture, and dependency analysis |
| **Security Analysis** | Focused scan for exposed secrets, vulnerable deps, insecure CI/CD |
| **Issue Resolution** | Reads a specific issue, finds relevant code, and proposes a fix |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (HTML/CSS/JS)             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Config   │  │ Live Agent   │  │ Markdown     │   │
│  │ Panel    │  │ Terminal     │  │ Report       │   │
│  └──────────┘  └──────┬───────┘  └──────────────┘   │
│                       │ SSE                          │
└───────────────────────┼──────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────┐
│               Express Server (Node.js)               │
│                       │                              │
│  ┌────────────────────▼─────────────────────────┐    │
│  │         Agent Orchestrator                    │    │
│  │  ┌──────────┐    ┌──────────────────────┐    │    │
│  │  │ Gemini   │◄──►│ Partner MCP Client    │    │    │
│  │  │ 3.5 Flash│    │ (stdio transport)     │    │    │
│  │  └──────────┘    └──────────┬───────────┘    │    │
│  └─────────────────────────────┼────────────────┘    │
│                                │                     │
└────────────────────────────────┼─────────────────────┘
                                 │ stdio
┌────────────────────────────────┼─────────────────────┐
│      @structured-world/gitlab-mcp (Partner MCP)      │
│                                │                     │
│  44 Tools across 18 entity types                     │
│  Projects, Files, Issues, MRs, Pipelines, etc.       │
│                                │                     │
│                     ┌──────────▼───────────┐         │
│                     │   GitLab REST API    │         │
│                     │  (gitlab.com/api/v4) │         │
│                     └──────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

### Key Components

| File | Purpose |
|------|---------|
| `server.js` | Express server with SSE streaming endpoint |
| `src/services/agent.js` | Agent orchestrator — MCP Client + Gemini 3.5 loop |
| `src/mcp/gitlabMcp.js` | Legacy custom MCP server (replaced by partner's) |
| `public/index.html` | Frontend UI with glassmorphism dark theme |
| `public/app.js` | Client-side SSE handler and report renderer |
| `public/styles.css` | Premium dark theme with terminal aesthetics |

---

## 🛠️ Setup & Run

### Prerequisites

- Node.js ≥ 20.0.0
- Google Cloud project with Vertex AI API enabled
- `gcloud` CLI authenticated (`gcloud auth application-default login`)
- GitLab Personal Access Token (PAT) with `read_api` scope

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/gitlab-agentic-auditor.git
cd gitlab-agentic-auditor
npm install
```

### Configuration

Create a `.env` file:

```env
PORT=3095
NODE_ENV=development
GITLAB_API_URL=https://gitlab.com
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
```

### Run

```bash
npm run dev
```

Open `http://localhost:3095` in your browser.

---

## 📦 Deployment (Cloud Run)

```bash
# Build and deploy
gcloud run deploy gitlab-agentic-auditor \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=your-project,GCP_LOCATION=us-central1"
```

---

## 🎯 How It Works (Agent Loop)

1. **User** enters GitLab token, project ID, and selects task type
2. **Express** opens an SSE stream and starts the agent
3. **Agent** spawns the Partner MCP Server (`@structured-world/gitlab-mcp`) as a child process
4. **Agent** discovers 44 available tools via `tools/list` (MCP protocol)
5. **Agent** maps MCP tools to Gemini Function Declarations
6. **Gemini 3.5 Flash** reasons about which tools to call
7. **Agent** executes the selected tool via `tools/call` (MCP protocol)
8. **Loop** continues for up to 20 steps until Gemini produces the final report
9. **Report** is streamed to the frontend and rendered as beautiful Markdown

---

## 📄 License

[MIT](./LICENSE)

---

## 🙏 Acknowledgements

- [Gemini 3.5 Flash](https://cloud.google.com/vertex-ai) — Google Cloud Vertex AI
- [@structured-world/gitlab-mcp](https://www.npmjs.com/package/@structured-world/gitlab-mcp) — Partner MCP Server
- [Model Context Protocol](https://modelcontextprotocol.io/) — Anthropic
- Built for the **"Building Agents for Real-World Challenges" Hackathon 2026**
