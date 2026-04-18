import os
from dotenv import load_dotenv

# Load standard environment variables from .env file
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    # In development, we might allow it to be missing and return mock values,
    # but for production parity, we should at least log a warning or raise for specific modes.
    print("WARNING: GEMINI_API_KEY is not set in environment variables.")

def validate_config():
    """
    Ensures that essential configuration is present in production-like environments.
    """
    if not GEMINI_API_KEY:
        raise ValueError("CRITICAL: GEMINI_API_KEY missing. Cannot proceed with AI-driven analysis.")
