"""Fail closed before resource-intensive local deployment work."""
import shutil, tempfile
from pathlib import Path
def require_capacity(output, minimum_gib=4):
    for path in {Path(output).resolve(),Path(tempfile.gettempdir()).resolve()}:
        if shutil.disk_usage(path).free < minimum_gib * 1024**3:
            raise RuntimeError(f"Insufficient free disk space on {path.anchor}: require {minimum_gib} GiB before this operation. No cleanup or Docker restart was attempted.")
