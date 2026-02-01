"""Shared test fixtures."""

from pathlib import Path

import pytest


@pytest.fixture
def spec_dir() -> Path:
    """Path to the shared spec/conformance directory."""
    return Path(__file__).resolve().parent.parent.parent / "spec" / "conformance"
