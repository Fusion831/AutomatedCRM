import os
import sys
import json
import urllib.request
from pathlib import Path

def load_toml_config():
    """Attempts to read backend env vars from lemma-stack configuration."""
    home = Path.home()
    config_path = home / ".lemma" / "local" / "config.toml"
    
    if not config_path.exists():
        return {}
        
    config = {}
    in_backend_env = False
    
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line == "[backend.env]":
                    in_backend_env = True
                    continue
                elif line.startswith("[") and line.endswith("]"):
                    in_backend_env = False
                    continue
                    
                if in_backend_env and "=" in line:
                    parts = line.split("=", 1)
                    key = parts[0].strip()
                    val = parts[1].strip().strip('"').strip("'")
                    config[key] = val
    except Exception as e:
        print(f"[WARN] Failed to parse config.toml: {e}")
        
    return config

def check_environment():
    # 1. Load config values (prioritize actual env vars, fallback to config.toml)
    toml_config = load_toml_config()
    
    model_type = os.getenv("LEMMA_DEFAULT_MODEL_TYPE") or toml_config.get("LEMMA_DEFAULT_MODEL_TYPE")
    openai_key = os.getenv("LEMMA_OPENAI_API_KEY") or toml_config.get("LEMMA_OPENAI_API_KEY")
    anthropic_key = os.getenv("LEMMA_ANTHROPIC_API_KEY") or toml_config.get("LEMMA_ANTHROPIC_API_KEY")
    openai_base = os.getenv("LEMMA_OPENAI_BASE_URL") or toml_config.get("LEMMA_OPENAI_BASE_URL", "")

    missing = []
    errors = []
    
    if not model_type:
        missing.append("LEMMA_DEFAULT_MODEL_TYPE")
    else:
        if model_type == "anthropic_compat" and not anthropic_key:
            missing.append("LEMMA_ANTHROPIC_API_KEY (required for default model type 'anthropic_compat')")
        elif model_type == "openai_compat":
            if not openai_key:
                missing.append("LEMMA_OPENAI_API_KEY (required for default model type 'openai_compat')")
            if "googleapis.com" in openai_base and not openai_key:
                errors.append("LEMMA_OPENAI_API_KEY must be a valid Google Gemini API Key when pointing to googleapis.com")

    # 2. Check general platform backend health
    # lemma-stack keeps ports internal to Docker network, so we check the exposed backend API on 8711
    backend_health_url = "http://localhost:8711/health"
    backend_up = False
    try:
        with urllib.request.urlopen(backend_health_url, timeout=2.0) as response:
            if response.status == 200:
                backend_up = True
    except Exception:
        # Try sslip.io wildcard address as fallback
        try:
            with urllib.request.urlopen("http://127-0-0-1.sslip.io:8711/health", timeout=2.0) as response:
                if response.status == 200:
                    backend_up = True
        except Exception:
            pass

    if not backend_up:
        print("[WARN] Local Lemma Backend does not appear to be running or responsive on port 8711.")
        print("       Please ensure Docker is running and execute 'lemma-stack start' to boot the stack.")

    if missing or errors:
        print("[ERROR] Environment validation failed.")
        for var in missing:
            print(f"  - Missing configuration: {var}")
        for err in errors:
            print(f"  - Configuration error: {err}")
        print("\nPlease run 'lemma-stack config set <VARIABLE> <VALUE>' or configure your environment variables.")
        sys.exit(1)
        
    print("[OK] Pre-flight environment validation passed.")
    print(f"     Default model provider: {model_type}")
    if model_type == "openai_compat":
        print(f"     Base URL: {openai_base or 'https://api.openai.com/v1'}")

if __name__ == "__main__":
    check_environment()
