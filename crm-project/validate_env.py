import os
import sys
import urllib.request
import json

REQUIRED_ENV_VARS = [
    "LEMMA_DEFAULT_MODEL_TYPE",
]

def check_environment():
    missing = []
    errors = []
    
    # 1. Check basic provider configurations
    model_type = os.getenv("LEMMA_DEFAULT_MODEL_TYPE")
    if not model_type:
        missing.append("LEMMA_DEFAULT_MODEL_TYPE")
    else:
        if model_type == "anthropic_compat":
            if not os.getenv("LEMMA_ANTHROPIC_API_KEY"):
                missing.append("LEMMA_ANTHROPIC_API_KEY (required for default model type 'anthropic_compat')")
        elif model_type == "openai_compat":
            if not os.getenv("LEMMA_OPENAI_API_KEY"):
                missing.append("LEMMA_OPENAI_API_KEY (required for default model type 'openai_compat')")
            
            # Verify if pointing to Gemini API via OpenAI Compatible interface
            base_url = os.getenv("LEMMA_OPENAI_BASE_URL", "")
            if "googleapis.com" in base_url and not os.getenv("LEMMA_OPENAI_API_KEY"):
                errors.append("LEMMA_OPENAI_API_KEY must be a valid Google Gemini API Key when pointing to googleapis.com")

    # 2. Check general required variables
    for var in REQUIRED_ENV_VARS:
        if not os.getenv(var):
            missing.append(var)
            
    # 3. Check local database accessibility (if not in mock mode)
    if os.getenv("E2E_LLM_MODE") != "mock":
        db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/lemma")
        # Try checking if postgres is alive on port 5432
        import socket
        try:
            # Parse port from url
            port = 5432
            if "@" in db_url:
                host_port = db_url.split("@")[1].split("/")[0]
                if ":" in host_port:
                    port = int(host_port.split(":")[1])
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            s.connect(("localhost", port))
            s.close()
        except Exception:
            print("[WARN] Local PostgreSQL server does not appear to be running on port 5432.")
            print("       Ensure Docker is running and run 'make dev' in the lemma-platform folder.")

    if missing or errors:
        print("[ERROR] Environment validation failed.")
        for var in missing:
            print(f"  - Missing env var: {var}")
        for err in errors:
            print(f"  - Configuration error: {err}")
        print("\nPlease run 'lemma-stack config set <VARIABLE> <VALUE>' or configure your shell environment variables.")
        sys.exit(1)
        
    print("[OK] Pre-flight environment validation passed.")

if __name__ == "__main__":
    check_environment()
