# AICTE Application Validation Platform — Startup Guide
> **Smart India Hackathon 2026 · Problem Statement 26261**  
> *Synthetic Decision-Support Prototype for AICTE EoA Application Scrutiny*

---

## 🚀 Quick Launch (Fastest Method)

Run this in your terminal from the project root directory:

```bash
# 1. Sync dependencies from uv.lock (takes 2 seconds)
uv sync --locked

# 2. Launch the server
uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
```

Open your browser and navigate to:  
👉 **[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**

---

## 🐳 Docker Launch (Containerized Method)

If you prefer running inside isolated Docker containers (FastAPI + PostgreSQL + Immutable Vault):

```bash
# 1. Build the images
docker compose -f docker/compose.yml build

# 2. Start services in the background
docker compose -f docker/compose.yml up --build -d

# 3. View live output logs
docker compose -f docker/compose.yml logs -f

# 4. Stop all containers when done
docker compose -f docker/compose.yml down
```

---

## 🧭 Navigation Map & Direct URLs

The frontend uses zero-dependency client-side hash routing. You can jump directly to any operational perspective:

| Viewport / Section | Direct URL | Description |
| :--- | :--- | :--- |
| **Main Application** | `http://127.0.0.1:8000/` | Full scrutiny dashboard |
| **Triage Queue** | `http://127.0.0.1:8000/#queue` | 4-lane priority board & SLA countdowns |
| **Inspection Workspace** | `http://127.0.0.1:8000/#workspace` | Active application inspection workspace |
| ↳ *Pre-Loaded Seed Case* | `http://127.0.0.1:8000/#application/DEMO-ISSUES-001` | Sample case with seeded discrepancies |
| ↳ *Checklist Tab* | `http://127.0.0.1:8000/#application/DEMO-ISSUES-001/checklist` | 5-state rules evaluation table |
| ↳ *Evidence Viewer* | `http://127.0.0.1:8000/#application/DEMO-ISSUES-001/evidence` | Split-pane canvas with bounding boxes |
| ↳ *Verifications Tab* | `http://127.0.0.1:8000/#application/DEMO-ISSUES-001/verifications` | Issuing authority verification gateway |
| ↳ *Infrastructure Tab* | `http://127.0.0.1:8000/#application/DEMO-ISSUES-001/infra` | Computer Lab GPS & Haversine distance meters |
| ↳ *Documents Tab* | `http://127.0.0.1:8000/#application/DEMO-ISSUES-001/documents` | Uploaded vault bundle with dual hashes |
| ↳ *Officer Exports Tab*| `http://127.0.0.1:8000/#application/DEMO-ISSUES-001/exports` | Printable Deficiency Notices & Inspection Briefs |
| **Rules Explorer** | `http://127.0.0.1:8000/#rules` | Versioned YAML rules & Diff comparison |
| **Audit Console** | `http://127.0.0.1:8000/#audit` | SHA-256 hash chain & Tamper demo |
| **Realness Matrix** | `http://127.0.0.1:8000/#realness` | Air-gapped disclosure of real vs simulated |
| **API Documentation** | `http://127.0.0.1:8000/docs` | Interactive Swagger OpenAPI 3.1 schema |

---

## ⌨️ Officer Keyboard Triage Shortcuts (Guide §17.3)

You can operate the console entirely via keyboard shortcuts without touching a mouse:

| Key | Action | Description |
| :---: | :--- | :--- |
| <kbd>?</kbd> | **Toggle Cheat Sheet** | Opens / dismisses the dark pill keyboard helper modal |
| <kbd>J</kbd> | **Next Finding** | Selects next discrepancy and auto-scrolls canvas to grounded coordinates |
| <kbd>K</kbd> | **Previous Finding** | Selects previous discrepancy and centers evidence canvas |
| <kbd>Enter</kbd> | **Inspect Finding** | Expands active discrepancy details and field extractions |
| <kbd>A</kbd> | **Acknowledge** | Marks the discrepancy as reviewed by scrutiny officer |
| <kbd>D</kbd> | **Dismiss** | Prompts mandatory human rationale modal (Guide §17.4) |
| <kbd>R</kbd> | **Request Rectification**| Opens deficiency dialog to draft notice for applicant |
| <kbd>E</kbd> | **Escalate** | Flags discrepancy for Senior Officer committee review |
| <kbd>V</kbd> | **Verify Audit Chain** | Runs live Genesis-to-Head SHA-256 cryptographic integrity verification |
| <kbd>/</kbd> | **Focus Search** | Jumps cursor immediately into the active view's search filter bar |
| <kbd>1</kbd> – <kbd>5</kbd> | **Fast Navigation** | Jumps: `1` Queue, `2` Workspace, `3` Rules, `4` Audit, `5` Realness |
| <kbd>Esc</kbd> | **Clear / Close** | Deselects active card, blurs search bar, or closes active modals |

> [!NOTE]  
> Single-key shortcuts are automatically suppressed while you are typing inside an input field, search box, or justification textarea.

---

## 🧪 Automated Testing & Verification

To verify that all backend pipelines, cryptographic chains, and UI components are fully operational:

### 1. End-to-End Pipeline Walkthrough Script (Stages S1–S13)
Executes a complete synthetic ingestion, OCR ladder, rules evaluation, deficiency export, and signed audit checkpoint:
```bash
uv run python scripts/e2e_demo_walkthrough.py
```

### 2. Frontend Integration Test Suite (48 Test Suites)
Runs all 48 UI micro-step test suites (Steps 11 through 58):
```bash
node -e "const fs = require('fs'); const { execSync } = require('child_process'); fs.readdirSync('./tests').filter(f => f.startsWith('test_step') && f.endsWith('.js')).sort((a,b) => parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''))).forEach(f => { execSync('node tests/' + f); console.log('PASSED:', f); });"
```

### 3. Backend Unit Test Suite
Runs the Python test suite:
```bash
uv run python -m unittest discover tests
```

---

## 🌿 Git Branch & Push Commands

To create a new branch, commit all project files, and push to GitHub:

```bash
# 1. Create and switch to a new branch
git checkout -b feature/complete-prototype-s1-s58

# 2. Stage all files
git add .

# 3. Commit with a structured message
git commit -m "feat: complete SIH PS 26261 prototype implementation (Steps 1 to 58)"

# 4. Push to remote repository
git push -u origin feature/complete-prototype-s1-s58
```

---

## 🛠️ Troubleshooting

- **Port 8000 already in use?**
  Run on a different port:
  ```bash
  uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8080
  ```
- **Need to check API health?**
  ```bash
  curl http://127.0.0.1:8000/health
  # Returns: {"status":"ok","mode":"demo","simulated":true}
  ```
- **Reset database and vault cleanly?**
  ```bash
  docker compose -f docker/compose.yml down -v
  ```
