# ✨ FairLens Studio

**FairLens Studio** is a professional-gradeResponsible AI (RAI) platform designed to audit, decode, and mitigate bias in machine learning datasets. Built for the Google Solution Challenge, it empowers data scientists and compliance officers to build fairer algorithms with confidence.

---

## 🚀 Key Features

### 🕵️‍♂️ Proxy Bias Hunter
Identify hidden risks where non-sensitive features act as "surrogates" for protected attributes (e.g., using Zip Code as a proxy for Race).
- **Statistical Engine**: Uses Mutual Information and Pearson Correlation to detect redundant encoding.
- **Risk Scoring**: Automatically ranks features as High, Medium, or Low proxy risk.

### 🧠 AI Insights (Gemini 2.0 Powered)
Stop squinting at correlation matrices. Get plain-English explanations of *why* your model is biased.
- **Narrative Analysis**: Human-readable breakdowns of proxy relationships.
- **Regulatory Context**: Understand the real-world implications of indirect discrimination.
- **Mitigation Strategies**: Receive actionable AI recommendations for feature removal or debiasing.

### 📊 Fairness Auditing
Comprehensive analysis of group fairness metrics across protected attributes like Gender, Race, and Age.
- **Disparity Metrics**: Statistical Parity, Disparate Impact, and Equal Opportunity scores.
- **Interactive Visualizations**: Dynamic charts and heatmaps built with Recharts.

### 🛂 Fairness Passport
Generate tamper-evident, exportable audit reports (JSON/PDF) that capture the full state of your dataset's fairness profile for regulatory compliance.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Recharts.
- **Backend**: FastAPI (Python), Pandas, Scikit-learn, Scipy.
- **AI**: Gemini 2.0 Flash (google-generativeai SDK).
- **Database/Cloud**: Firebase Firestore, Firebase Storage, Firebase Auth.
- **Environment**: Dotenv for secure configuration.

---

## ⚙️ Setup & Installation

### 1. Backend Setup
1. Navigate to `backend/`
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the `backend/` root:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   GOOGLE_APPLICATION_CREDENTIALS=path/to/your/firebase-adminsdk.json
   FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   ```
4. Run the API:
   ```bash
   uvicorn main:app --reload
   ```

### 2. Frontend Setup
1. Navigate to `frontend/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `frontend/` root:
   ```env
   VITE_FIREBASE_API_KEY=your_apiKey
   VITE_FIREBASE_AUTH_DOMAIN=your_authDomain
   VITE_FIREBASE_PROJECT_ID=your_projectId
   VITE_FIREBASE_STORAGE_BUCKET=your_storageBucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_senderId
   VITE_FIREBASE_APP_ID=your_appId
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🔒 Security & Governance

FairLens Studio is built with a focus on data privacy and structural integrity:
- **Zero API Exposure**: Sensitive keys (Gemini, Firebase) are handled strictly server-side.
- **Hardened AI Layer**: Includes rate limiting, input truncation to prevent token overflow, and automatic fallbacks for high availability.
- **Audit Trails**: All analysis results and AI narratives are persisted in Firestore for long-term governance.

---

## ⚖️ License
Distributed under the MIT License. See `LICENSE` for more information.

---

> Built with ❤️ for the **Google Solution Challenge 2024**.