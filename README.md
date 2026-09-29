# RECALL OPS
### *An Adaptive Incident Response Agent with Operational Memory*

> **Built for HackwithHyderabad 3.0** · Harnessing **Hindsight Operational Memory** for Autonomous & SRE-Assisted Incident Resolution.

---

## 🎯 Executive Summary & Vision

Current AI SRE solutions suffer from **stateless amnesia**: each outage is diagnosed from scratch, ignoring past postmortems, recurring failure modes, and previously validated remediations.

**RECALL OPS** bridges this gap by pairing a deterministic, safety-gated SRE agent with **Hindsight's three memory primitives**:
1. **`retain`**: Automatically stores incident timelines, diagnostic findings, and approved postmortem lessons directly into persistent memory.
2. **`recall`**: During active triage, retrieves semantically relevant historical incidents, previous mitigations, and blast-radius patterns.
3. **`reflect`**: Synthesizes mental models across distributed logs and multi-incident histories to generate proactive reliability insights.

---

## 🏗️ Architecture & Safety Guardrails

```
                                  ┌────────────────────────────────┐
                                  │      SRE / Commander UI        │
                                  │   (Vite + React + SSE Stream)  │
                                  └───────────────▲────────────────┘
                                                  │ REST / SSE
                                  ┌───────────────▼────────────────┐
                                  │      RECALL OPS Backend        │
                                  │      (Express + TS Monolith)   │
                                  └───────┬──────────────┬─────────┘
                                          │              │
                   ┌──────────────────────┴──┐        ┌──┴─────────────────────────┐
                   │ Deterministic Policy    │        │  Hindsight Memory Service  │
                   │ Safety Engine           │        │  (retain, recall, reflect) │
                   └──────────────┬──────────┘        └────────────┬───────────────┘
                                  │                                │
                   ┌──────────────▼──────────┐        ┌────────────▼───────────────┐
                   │ Production Simulator    │        │  Persistent SQLite / ORM   │
                   │ & Microservices Cluster │        │  Audit Logs & State Ledger │
                   └─────────────────────────┘        └────────────────────────────┘
```

### Deterministic Safety Engine
- **Non-Bypassable Policy Enforcement**: The LLM *cannot* directly mutate infrastructure. Destructive and high-risk actions (`scaleService`, `executeRollback`, `restartService`) require deterministic policy evaluation.
- **Role-Based Approvals**: P1/P2 remediations trigger an explicit approval request for the Incident Commander before execution.
- **Fail-Safe & Graceful Degradation**: If Hindsight or LLM providers experience outages, RECALL OPS drops into safe local diagnostic mode without crashing.

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Node.js v20+ / v22+
- npm v10+

### Option A: Running with Node / NPM (Recommended)

1. **Install Backend Dependencies & Initialize SQLite Database**:
   ```bash
   cd backend
   npm install
   npx prisma generate
   npx prisma db push
   npx tsx src/db/seed.ts
   ```

2. **Start the Backend Server** (Port 3001):
   ```bash
   npm run dev
   # or: npx tsx src/index.ts
   ```

3. **Install Frontend Dependencies & Launch UI** (Port 5173):
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

4. **Access the Console**:
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

### Option B: Running via Docker Compose

```bash
docker-compose up --build
```
This starts:
- Hindsight Memory Server: `http://localhost:8888`
- RECALL OPS Backend: `http://localhost:3001`
- RECALL OPS Frontend UI: `http://localhost:5173`

---

## 🧪 Golden Demo Scenarios & Replays

The system comes pre-configured with two production failure scenarios in the **Incident Simulator**:

### Scenario 1: P1 — PostgreSQL Connection Pool Exhaustion
- **Cascade**: Database connections spike to 97/100 $\rightarrow$ `checkout-service` timeouts $\rightarrow$ `payment-service` 504 errors $\rightarrow$ Revenue impact.
- **Memory Recall**: RECALL OPS recalls the *Black Friday 2024* incident from Hindsight memory, identifies identical connection saturation, and recommends dynamic connection pool scaling (`scaleService`).

### Scenario 2: P2 — Deployment Regression & Memory Leak
- **Cascade**: `checkout-service v4.6.0` deployment introduces memory leak and regex backtracking $\rightarrow$ P99 latency spikes to 4,800ms.
- **Memory Recall**: RECALL OPS correlates deployment timestamps, recalls historical bad migrations, and formulates a safe `executeRollback` plan.

---

## 📊 Automated Verification & Test Suite

Run the full integration test suite verifying the end-to-end incident lifecycle:
```bash
cd backend
npx tsx tests/integration.test.ts
```

All 8 validation stages pass deterministically:
1. Health & Hindsight connection telemetry
2. Simulator state reset
3. Scenario injection & monitoring trigger
4. Real-time hypothesis ledger progression
5. Policy safety evaluation & approval gate
6. Remediation execution
7. Postmortem generation & memory retention
8. Immutable security audit logging

---

## 📁 Repository Directory Structure

```
recall-ops/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema (16 models)
│   ├── src/
│   │   ├── agent/                 # SRE Agent State Machine & Orchestrator
│   │   ├── db/                    # Prisma client & 15+ incident seed data
│   │   ├── policy/                # Deterministic risk & safety engine
│   │   ├── routes/                # REST & SSE streaming endpoints
│   │   ├── services/              # Hindsight SDK & LLM provider abstractions
│   │   ├── simulator/             # 7-microservice fault injection simulator
│   │   ├── tools/                 # Validated agent diagnostic & remediation tools
│   │   ├── config.ts              # Configuration loader
│   │   └── index.ts               # Express entrypoint
│   └── tests/                     # Automated integration tests
├── frontend/
│   ├── src/
│   │   ├── api/                   # Typed API client & SSE consumer
│   │   ├── pages/                 # Overview, Incidents, Simulator, Topology,
│   │   │                          # Runbooks, Memory Console, Postmortems, Audit
│   │   ├── App.tsx                # Sidebar & Routing
│   │   └── index.css              # Dark theme & telemetry styling
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```
