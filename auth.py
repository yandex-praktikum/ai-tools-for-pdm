
import os
import secrets

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def is_authorized_manager(provided_key):
    expected_key = os.getenv("MANAGER_API_KEY")

    if not expected_key:
        return False

    if not isinstance(provided_key, str):
        return False

    return secrets.compare_digest(
        provided_key,
        expected_key,
    )

