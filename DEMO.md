# FairLens Studio — Judge's Demo Guide

## 5-Minute Quickstart

### Step 1: Start the backend
```bash
cd Fairlens/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Step 2: Start the frontend
```bash
cd Fairlens/frontend
npm install && npm run dev
```
Visit `http://localhost:5173`

---

## Demo Flow (Recommended for Judges)

### Scenario: Auditing a Hiring Algorithm for Gender Bias

**Use the provided sample dataset** → `demo_data/adult_income_sample.csv`

| Field | Value |
|---|---|
| Target Column | `income` |
| Protected Attributes | `sex`, `race` |
| Use Case | Hiring |

1. **Upload CSV** → Go to `/new-audit`, upload `adult_income_sample.csv`
2. **Configure** → Set `income` as target, tick `sex` and `race` as protected attributes
3. **Run Audit** → Click "Run Fairness Audit"
4. **View Results** → Dashboard shows disparity scores with 200-sample Bootstrap CIs
5. **Upload a Model** → Drag a `.pkl` model into the **Model File Auditor** panel. FairLens runs inference on your dataset and audits the model's own predictions
6. **Try Mitigation** → Bias Sandbox: switch between **Threshold Adjustment** (post-processing), **Reweighing** (pre-processing), and **Feature Removal**
7. **Run Copilot** → Click "Run AI Copilot Analysis" — Gemini 2.0 Flash orchestrates 4 agents (Auditor, Explainer, Repair, Governance)
8. **Download Passport** → Click "Download PDF" on the Fairness Passport — your AI Governance Report

---

## Key Claims to Verify

| Claim | Where to verify |
|---|---|
| Real bootstrap CIs (not hardcoded) | Check confidence intervals in audit results; they vary per dataset |
| 3 mitigation methods | Bias Sandbox dropdown: Threshold Adjustment / Reweighing / Feature Removal |
| Model file auditing | Upload any sklearn `.pkl` → predictions appear as a new column |
| Gemini 2.0 Flash | Open browser devtools Network tab → copilot endpoint uses `gemini-2.0-flash` |
| Audit integrity proof | Scroll to "Audit Integrity" → click "Verify Audit Trail" |
| AI Governance Passport | Scroll to "Fairness Passport" → Download JSON or PDF |

---

## SDG Alignment

| SDG | How FairLens helps |
|---|---|
| **SDG 10** — Reduced Inequalities | Detects and quantifies algorithmic discrimination across demographic groups |
| **SDG 8** — Decent Work | Prevents biased hiring AI from systematically excluding qualified candidates |
| **SDG 3** — Good Health | Flags discriminatory patterns in medical triage and insurance decision models |
| **SDG 16** — Justice & Institutions | Provides cryptographically-chained audit logs for accountability |
