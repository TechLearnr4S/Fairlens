# FairLens Studio

> **AI-powered fairness auditing for high-stakes automated decisions.**  
> Built for the Google Solution Challenge 2026 · SDG 10 (Reduced Inequalities) · SDG 16 (Justice & Institutions)

---

## The Problem

Automated systems now decide who gets hired, who receives credit, and who qualifies for healthcare. When these systems encode historical bias, the harm scales to millions of people — invisibly.

**The core issue isn't just bias. It's that teams can't measure it, can't explain it to leadership, and can't prove compliance to regulators.**

---

## What FairLens Does

FairLens is a full-stack bias audit platform that turns a CSV into a legally-framed, cryptographically signed governance document in under 60 seconds.

```
Upload CSV → Fairness Engine → Proxy Detection → Regulatory Mapping → Fairness Passport
                                                                     ↓
                                                        Gemini AI Explanation + Copilot
```

### Core Capabilities

| Feature | What it does | Why it matters |
|---|---|---|
| **Subgroup Disparity Analysis** | Measures selection rate, TPR, FPR, and FNR gaps across every protected attribute | Identifies *who* is being disadvantaged, not just that bias exists |
| **Proxy Bias Hunter** | Detects features correlated with protected attributes using Mutual Information + Cramér's V | Surfaces indirect discrimination — geography encoding race, tenure encoding gender |
| **Regulatory Compliance Mapping** | Maps findings to EEOC 4/5ths Rule (Hiring), ECOA (Credit), ACA §1557 (Healthcare), Equal Protection (Criminal Justice) | Gives legal teams actionable findings, not just statistics |
| **Mitigation Sandbox** | Simulates threshold adjustment, feature removal, and reweighing with before/after impact curves | Tests fixes before deployment |
| **Fairness Passport** | Generates a structured, Ed25519-signed compliance document with risk score, regulatory verdict, and audit trace | Provides evidence for compliance, legal review, and governance |
| **Gemini AI Copilot** | Multi-agent Gemini pipeline that generates plain-language explanations for non-technical stakeholders | Bridges technical findings to executive and legal audiences |
| **Tamper-Evident Audit Ledger** | Hash-chained, Ed25519-signed log of every step — independently verifiable | Supports regulatory accountability and forensic review |

---

## Live Demo (One Click)

**No setup required.** Open the app → Click **"Try Live Demo"** → See results in under 60 seconds.

The demo loads the UCI Adult Income dataset (32,561 records), audits income predictions for bias across gender and race, detects proxy features, maps findings to EEOC guidelines, and generates a signed Fairness Passport.

**What judges see:**
- A disparity detected: ~10,000 Female applicants disadvantaged by a 19.4% selection rate gap
- Proxy features: `education-num` and `hours-per-week` identified as race/gender proxies
- Regulatory verdict: Potential EEOC 4/5ths Rule violation
- Signed, downloadable Fairness Passport (JSON)
- Gemini AI narrative explaining findings in plain language

---

## Real-World Impact

> *"Approximately 10,771 Female applicants are being disadvantaged by a 19.4% disparity gap — potentially in violation of the EEOC 80% Rule."*

FairLens doesn't just show numbers. It translates statistical findings into human impact counts, legal framing, and actionable remediation steps.

---

## Technical Depth

### Backend — Why It's Different

- **Bootstrap Confidence Intervals**: 200-sample bootstrap with deterministic seed to quantify uncertainty around every disparity metric (95% CIs)
- **Statistical Significance Testing**: Z-test for proportions (p-values) comparing each subgroup to the reference group
- **Multi-method Proxy Detection**: Mutual Information for categorical features, Pearson correlation for numerical features, Cramér's V as chi-square fallback
- **Use-case-specific Regulatory Evaluation**: Per-metric severity tiers (LOW/MEDIUM/HIGH/CRITICAL) calibrated separately for EEOC, ECOA, ACA §1557, and Equal Protection standards
- **Reweighing Mitigation**: Correct statistical implementation (P(T)×P(G)/P(T,G) sample weights) — not simulated fake numbers
- **Ed25519 Hash-Chained Ledger**: Every audit step produces a signed log entry. Chain integrity is independently verifiable via the public key endpoint

### Frontend

- **4-step guided audit wizard** with smart column auto-detection
- **Regulatory Risk Summary** card showing legal exposure at a glance
- **Human impact headline** — affected population count from real subgroup data
- **Radar chart + per-attribute bar charts** for disparity visualization
- **Proxy Network Graph** (force-directed) for feature correlation visualization

### AI Integration

- **Structured Gemini output** with typed JSON schema (no regex/parse hacks)
- **Multi-agent orchestration**: Explainer, Governance, and Repair agents
- **Graceful degradation**: All deterministic features (disparity scores, regulatory compliance, proxy detection, ledger) work without AI; Gemini adds narrative, not correctness

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite · React 19 · TypeScript · Tailwind CSS v4 · Recharts |
| Backend | FastAPI · Pandas · NumPy · SciPy · scikit-learn |
| AI | Google Gemini 2.0 Flash (structured output) |
| Auth | Firebase Authentication |
| Signing | Ed25519 (PyNaCl) |
| Storage | SQLite (local) · Firestore (cloud, optional) |

---

## UN Sustainable Development Goals

### SDG 10 — Reduced Inequalities
FairLens makes algorithmic harm to specific demographic groups **measurable and actionable before deployment**. In the live demo alone, it detects a disparity affecting ~10,000 people in a single dataset.

### SDG 16 — Peace, Justice & Strong Institutions
FairLens provides the **transparency infrastructure** that accountability requires:
- Tamper-evident audit logs (hash-chained, cryptographically signed)
- Regulatory compliance documentation suitable for legal review
- Exportable Fairness Passports as evidence for governance, litigation, or regulatory submission

---

## Before vs. After FairLens

| | Before | After |
|---|---|---|
| **Visibility** | "The model looks fine on accuracy." | Who is affected, on which attributes, and by how much — with statistical confidence intervals |
| **Hidden bias** | Proxies and indirect effects invisible | Ranked proxy-risk analysis with correlation method and score |
| **Accountability** | Hard to justify to legal or the public | Regulatory framing (EEOC/ECOA/ACA) + downloadable signed Fairness Passport |
| **Action** | Guesswork or manual spreadsheets | Guided sandbox with threshold optimization (accuracy-constrained sweep) |

---

## Run Locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# API running at http://localhost:8000
```

**Optional:** Add `GEMINI_API_KEY` to `backend/.env` for AI features. All deterministic features work without it.

### Frontend

```bash
cd frontend
npm install
npm run dev
# App running at http://localhost:5173
```

### Environment

Copy `backend/.env` and set:
```
GEMINI_API_KEY=your_key_here
# GOOGLE_APPLICATION_CREDENTIALS=./firebase-key.json  # optional, for Firestore persistence
```

---

## Independent Audit Verification

The `GET /audit-proof/{job_id}` endpoint returns the full audit ledger with Ed25519 public key and step-by-step verification instructions. Anyone can independently verify the chain integrity without access to the FairLens system.

```bash
curl http://localhost:8000/governance/public-key
# Returns Ed25519 public key for independent verification
```

---

## License

MIT · © 2026 FairLens Team

---

*Google Solution Challenge 2026 — Open Innovation Category*  
*FairLens: bias you can measure, governance you can show.*
