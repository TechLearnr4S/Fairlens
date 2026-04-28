# ✨ FairLens Studio

**FairLens Studio** is a responsible AI governance platform that helps organizations **measure, flag, explain, and mitigate** hidden bias in machine learning datasets and model predictions before those systems affect real people.

Built for the **Google Solution Challenge 2026** (Open Innovation track).

> Computer programs now make life-changing decisions about jobs, bank loans, and medical care. If those systems learn from flawed or unfair historical data, they repeat and amplify discrimination at scale. FairLens exists to surface that risk early, translate it into governance language, and show a practical mitigation path before deployment.

## Why It Matters

FairLens is built around a simple before/after story:

- **Before**: teams see a model score or approval rate, but not who is being disadvantaged or which features act as hidden proxies.
- **After**: they get a guided audit, subgroup disparity evidence, proxy-risk findings, regulatory framing, mitigation analysis, and a downloadable fairness passport.

This aligns directly with:

- **SDG 10 - Reduced Inequalities** by making demographic harms visible and measurable.
- **SDG 8 - Decent Work and Economic Growth** by supporting fairer hiring and lending decisions.
- **SDG 16 - Peace, Justice and Strong Institutions** through auditable, tamper-evident governance artifacts.

## Live Demo Flow

The fastest judge path is now a one-click live demo:

1. Open the dashboard.
2. Click `Try Live Demo`.
3. FairLens loads a bundled sample dataset, auto-configures the audit, runs the fairness scan, computes proxy risks, and opens the results view.

That demo path is designed to showcase the full story in one run: disparities, proxy bias, governance framing, impact metrics, and AI copilot output.

---

## 🚀 Core Capabilities

### 🕵️ Proxy Bias Hunter
Detects features that act as hidden "stand-ins" for protected attributes — e.g., ZIP code as a proxy for race, or job title as a proxy for gender.
- **Dual method engine:** Mutual Information for categorical features, Pearson correlation for numeric features, with Cramér's V fallback
- **Risk ranking:** Every feature scored and classified as High / Medium / Low proxy risk
- **Visual network graph:** Shows the web of proxy relationships across your dataset

### 📊 Fairness Disparity Auditor
Measures group-level outcome gaps across every protected attribute you specify.
- **Demographic Parity Difference** — the primary disparity metric
- **FPR / FNR gap analysis** — equal opportunity and equalized odds
- **Subgroup breakdown charts** — interactive bar charts per attribute

### 🧪 Model Fairness Evaluator (Statistically Rigorous)
Audit model predictions — supply your model's output column alongside ground-truth labels.
- **Bootstrap Confidence Intervals** (200 samples, seeded) — statistically valid uncertainty bounds
- **Z-test significance testing** — identifies which subgroup disparities are statistically real vs. noise
- **Expected Calibration Error (ECE)** — measures how well the model's confidence matches its accuracy
- **Pareto front sweep** — maps the fairness vs. accuracy tradeoff across all decision thresholds
- **Policy-driven decision:** Approve / Conditional / Reject with explainable reasons

### ⚙️ Bias Sandbox — Mitigation Simulator
Three debiasing strategies with live before/after comparison:
1. **Threshold Adjustment** — post-processing: shift the decision boundary to equalize group outcomes
2. **Reweighing** — pre-processing: reweight training samples using the P(Y)×P(A)/P(Y,A) formula so every group-outcome pair is fairly represented
3. **Feature Removal** — pre-processing: retrain the model without a selected proxy feature

Each method includes an **optimizer** that sweeps 17 thresholds and finds the optimal fairness/accuracy tradeoff with ≤5% accuracy loss constraint.

### 🤖 Multi-Agent Fairness Copilot (Gemini 2.0 Flash)
A 3-agent AI pipeline that produces a unified intelligence report:
- **Deterministic Auditor:** Rule-based analysis of all findings, producing structured machine-readable output
- **Repair Agent:** Ranked mitigation recommendations with tradeoff summaries
- **Gemini Explainer:** Single consolidated Gemini 2.0 Flash call translating all findings into plain-English narrative + governance summary

### 🛂 Fairness Passport
Exportable, tamper-evident audit certificate (JSON) capturing the full audit state.
- Structured v2 schema: model info, disparity summary, proxy risks, mitigation result, risk score, deployment decision
- Persisted to **Firebase Firestore** for long-term governance
- Cryptographically signed proof bundle for independent verification

### 🔒 Cryptographic Audit Integrity
Every action in the audit lifecycle is recorded in a **hash-chained, digitally signed ledger**.
- SHA-256 chain: each entry commits to the hash of the previous entry (blockchain-style, no gaps)
- **Ed25519 digital signatures** on every entry — server identity is cryptographically provable
- Full verification engine: hash integrity + chain linkage + signature validity, per entry
- Tamper-detection tool: simulate a breach, watch the chain break

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vite + React 19, TypeScript, Tailwind CSS v4, Recharts, Framer Motion |
| **Backend** | FastAPI (Python), Pandas, NumPy, Scikit-learn, SciPy |
| **AI** | Gemini 2.0 Flash (google-generativeai SDK, structured JSON output) |
| **Auth** | Firebase Authentication |
| **Database / Cloud** | Firebase Firestore (audit persistence), Firebase Storage |
| **Cryptography** | Python `cryptography` — Ed25519 signing, SHA-256 chaining |
| **State** | Zustand (frontend global audit state) |

---

## ⚙️ Setup & Installation

### 1. Backend Setup
```bash
cd Fairlens/backend
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_APPLICATION_CREDENTIALS=./firebase-key.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
CORS_ALLOW_ORIGINS=http://localhost:5173
```

Run the API:
```bash
uvicorn main:app --reload
```

### 2. Frontend Setup
```bash
cd Fairlens/frontend
npm install
```

Create `frontend/.env`:
```env
VITE_FIREBASE_API_KEY=your_apiKey
VITE_FIREBASE_AUTH_DOMAIN=your_authDomain
VITE_FIREBASE_PROJECT_ID=your_projectId
VITE_FIREBASE_STORAGE_BUCKET=your_storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_senderId
VITE_FIREBASE_APP_ID=your_appId
```

Start:
```bash
npm run dev
```

---

## 📂 Suggested Dataset

Use any CSV with a clear prediction target and protected attributes. Public datasets such as UCI Adult Income can work well for local testing.

Columns to use:
- **Target:** `income` (predict high vs. low income)
- **Protected attributes:** `sex`, `race`, `age`

---

## 🔒 Security & Governance

- **API key isolation:** Gemini and Firebase keys are strictly server-side
- **Rate limiting:** 5 AI calls per minute per audit session
- **Input validation:** Dataset size limits (10 – 200,000 rows), column count capped at 500, high-null warnings
- **Policy engine:** Guards against running simulations before completing the audit, or generating passports without meaningful results
- **Audit trail:** Dual persistence — SQLite (local, instant) + Firestore (cloud, persistent)

---

## ⚖️ License

MIT License. See `LICENSE` for details.

---

> Built with ❤️ for the **Google Solution Challenge 2026** — Open Innovation Category.
> 
> *Addressing UN SDG 10 (Reduced Inequalities) and SDG 16 (Peace, Justice and Strong Institutions) by providing accessible tools to detect and eliminate algorithmic discrimination.*