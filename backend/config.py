import os
import json
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

BASE_RESUME_DIR = PROJECT_ROOT / "base_resume"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
SETTINGS_FILE = PROJECT_ROOT / "settings.json"

BASE_RESUME_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)

DEFAULT_BANNED_WORDS = [
    "spearheaded", "synergy", "leverage", "utilize", "cutting-edge",
    "passionate", "driven", "results-oriented", "dynamic", "innovative",
]

DEFAULT_SETTINGS = {
    "gemini_api_key": "",
    "banned_words": DEFAULT_BANNED_WORDS,
    "generate_cover_letter": False,
}


def get_settings() -> dict:
    settings = DEFAULT_SETTINGS.copy()
    # API key from .env takes precedence
    env_key = os.getenv("GEMINI_API_KEY", "")
    if env_key and env_key != "your_gemini_api_key_here":
        settings["gemini_api_key"] = env_key
    # Overlay with settings.json
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE) as f:
                saved = json.load(f)
            if saved.get("gemini_api_key"):
                settings["gemini_api_key"] = saved["gemini_api_key"]
            if "banned_words" in saved:
                settings["banned_words"] = saved["banned_words"]
            if "generate_cover_letter" in saved:
                settings["generate_cover_letter"] = saved["generate_cover_letter"]
        except (json.JSONDecodeError, IOError):
            pass
    return settings


def save_settings(settings: dict) -> None:
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)
    # Also update .env if API key changed
    if settings.get("gemini_api_key"):
        env_path = PROJECT_ROOT / ".env"
        env_path.write_text(f'GEMINI_API_KEY={settings["gemini_api_key"]}\n')
