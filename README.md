# FairLens Studio

**Responsible AI governance for high-stakes decisions — built for the Google Solution Challenge.**

---

## 1 · The problem

Automated systems already decide who gets hired, approved for credit, or flagged in risk models. **Bias in training data and opaque “black box” scoring** can reproduce discrimination at scale — while teams often only see aggregate accuracy, **not** who loses out or which features act as **hidden proxies** for protected traits.

**FairLens tackles both:** measurable unfairness **and** lack of **transparency** for reviewers, compliance, and leadership.

---

## 2 · What FairLens does

| Capability | What judges get |
|:---|:---|
| **Bias detection** | Subgroup disparity analysis across every protected attribute you define — not just a single score. |
| **Proxy detection** | Surfaces features that *correlate* with sensitive attributes (e.g. geography, tenure) so “indirect discrimination” is visible. |
| **Regulatory mapping** | Translates metrics into **plain-language statutory context** (e.g. hiring, credit, healthcare use cases) via a structured **Fairness Passport**. |
| **AI explanations** | Gemini-powered narratives that summarize findings for **non-technical stakeholders** — governance-ready, not jargon-only. |

*Plus:* mitigation sandbox, audit trail integrity (hash-chained ledger), and exportable evidence for demos and review.

---

## 3 · Live demo (one click)

**No dataset prep required.**

1. Open the app and go to the **Dashboard**.  
2. Click **Try Live Demo**.  
3. FairLens loads a bundled sample CSV, configures the audit (target + protected attributes), **runs the full pipeline**, and lands you on **results**: disparities, proxy risks, passport-style compliance view, impact metrics, and copilot output.

**Judges see the end-to-end story in under a minute:** upload → audit → explain → govern.

---

## 4 · Before vs after

| | **Before FairLens** | **After FairLens** |
|:---|:---|:---|
| **Visibility** | “The model looks fine on accuracy.” | Who is affected, on which attributes, and how large is the gap? |
| **Hidden bias** | Proxies and indirect effects stay invisible. | Ranked proxy-risk analysis + correlation context. |
| **Accountability** | Hard to justify to legal or the public. | Regulatory framing + downloadable **Fairness Passport** (JSON) + AI summary. |
| **Action** | Guesswork or manual spreadsheets. | Guided audit, optional mitigation simulation, auditable trail. |

---

## 5 · UN Sustainable Development Goals

FairLens aligns with global targets for **equity** and **institutional trust**:

| SDG | How FairLens contributes |
|:---|:---|
| **10 — Reduced Inequalities** | Makes **algorithmic harm to groups** measurable and actionable before deployment. |
| **16 — Peace, Justice & Strong Institutions** | **Transparency** (explainability, structured reports) + **tamper-evident audit logs** that support accountability and review. |

---

## Tech at a glance

**Frontend:** Vite · React · TypeScript · Tailwind · Recharts  
**Backend:** FastAPI · Pandas · fairness & correlation engines  
**AI:** Google Gemini (structured explanations)  
**Cloud (optional):** Firebase Auth · Firestore · Storage  

---

## Run locally (developers & judges who want the repo)

**Backend** — from `backend/`:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend** — from `frontend/`:

```bash
npm install && npm run dev
```

Configure `.env` files for Gemini / Firebase as needed (see project `requirements.txt` and `frontend` env patterns). API defaults to `http://localhost:8000` with CORS for the Vite dev server.

---

## License

MIT License. See `LICENSE`.

---

*Google Solution Challenge · Open Innovation — **FairLens**: bias you can measure, governance you can show.*
