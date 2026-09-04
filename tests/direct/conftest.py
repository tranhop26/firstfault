"""Shared helpers for FirstFault direct-mode contract tests."""

import sys
import os
from pathlib import Path

import pytest
from gltest.direct.loader import deploy_contract


def _inject_message_with_pipe(vm):
    """Supply direct-mode message data without Windows' locked temp files."""
    from genlayer.py import calldata
    from genlayer.py.types import Address

    sender = Address(vm.sender) if isinstance(vm.sender, bytes) else vm.sender
    contract_address = vm._contract_address
    if isinstance(contract_address, bytes):
        contract_address = Address(contract_address)
    origin = vm.origin
    if isinstance(origin, bytes):
        origin = Address(origin)
    encoded = calldata.encode(
        {
            "contract_address": contract_address,
            "sender_address": sender,
            "origin_address": origin,
            "stack": [],
            "value": vm._value,
            "datetime": vm._datetime,
            "is_init": False,
            "chain_id": vm._chain_id,
            "entry_kind": 0,
            "entry_data": b"",
            "entry_stage_data": None,
        }
    )
    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, encoded)
    finally:
        os.close(write_fd)
    vm._original_stdin_fd = os.dup(0)
    try:
        os.dup2(read_fd, 0)
    finally:
        os.close(read_fd)


@pytest.fixture
def direct_deploy(direct_vm):
    """Deploy with the contract SDK, not the host's placeholder package."""
    def deploy(contract_path):
        from gltest.direct import loader

        for module_name in list(sys.modules):
            if module_name == "genlayer" or module_name.startswith("genlayer."):
                sys.modules.pop(module_name)
        original_inject = loader._inject_message_to_fd0
        loader._inject_message_to_fd0 = _inject_message_with_pipe
        try:
            return deploy_contract(Path(contract_path).resolve(), direct_vm)
        finally:
            loader._inject_message_to_fd0 = original_inject

    return deploy


def to_hex(addr_bytes):
    """Convert address bytes to checksummed hex matching contract output.

    FirstFault views serialize addresses with Address.as_hex. Call after
    direct_deploy so the contract SDK is on sys.path.
    """
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex


def to_address(addr_bytes):
    """Convert a direct-runner address to the contract SDK Address type."""
    from genlayer.py.types import Address

    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes
    return Address(addr_bytes)


def workflow_terms():
    """Return hand-checked, valid terms for a three-step workflow."""
    return {
        "research_brief": "Find verifiable primary sources.",
        "writer_brief": "Write only claims supported by research.",
        "publisher_brief": "Publish the approved draft without changes.",
        "research_amount": 11,
        "writer_amount": 17,
        "publisher_amount": 23,
        "research_deadline": 100,
        "writer_deadline": 200,
        "publisher_deadline": 300,
    }
