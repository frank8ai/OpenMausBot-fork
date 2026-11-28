"""AER Verify Acceptance Test for Phase C Cognitive Bridge and Cross-Family Guardrails."""

from pathlib import Path


def test_phase_c_cognitive_bridge_contract():
    repo_root = Path(__file__).resolve().parent.parent

    # Core schemas, services, runtime, and acceptance tests
    assert (repo_root / "server" / "micro-loop" / "contracts" / "friction-event.schema.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "contracts" / "compiled-rule.schema.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "contracts" / "ports.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "config" / "micro-loop.config.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "repo" / "friction-ledger.repo.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "service" / "friction-sniffer.service.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "service" / "neuro-symbolic-compiler.service.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "runtime" / "harness-cli.adapter.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "runtime" / "lkg-hot-reload.runtime.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "service" / "micro-loop-bridge.service.ts").is_file()
    assert (repo_root / "server" / "micro-loop" / "phase-c-acceptance.test.ts").is_file()
    assert (repo_root / "docs" / "SPEC_PHASE_C_COGNITIVE_BRIDGE.md").is_file()
    assert (repo_root / "scripts" / "reproduce_phase_c_cognitive_bridge.py").is_file()


def test_aer_acceptance_contract_points_to_phase_c():
    repo_root = Path(__file__).resolve().parent.parent
    default_yml = repo_root / ".aer" / "acceptance" / "default.yml"
    assert default_yml.is_file(), ".aer/acceptance/default.yml must exist"

    content = default_yml.read_text(encoding="utf-8")
    assert "reproduce_phase_c_cognitive_bridge.py" in content
    assert "DEFECT_OBSERVED" in content
    assert "DEFECT_ABSENT" in content
