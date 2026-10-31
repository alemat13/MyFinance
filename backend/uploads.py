"""Bounded reads of uploaded files."""
from fastapi import HTTPException, UploadFile


def read_upload(file: UploadFile, max_bytes: int) -> bytes:
    """Read an upload from a sync route, refusing (413) anything over max_bytes.

    Reads at most max_bytes + 1 bytes, so an oversized upload is never held in
    memory whole."""
    contents = file.file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        raise HTTPException(413, f"File is larger than the {max_bytes // (1024 * 1024)} MB limit")
    return contents
