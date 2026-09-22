import json
from pathlib import Path
import subprocess
import sys

invalid_query = json.dumps({"id": 1, "method": "search", "params": {"q": ""}})
unknown = json.dumps({"id": 2, "method": "unknown", "params": {"q": "test"}})
requests = "\n".join(["invalid json", invalid_query, unknown, "x" * 17000, invalid_query]) + "\n"
result = subprocess.run([str(Path(sys.argv[1]).resolve())], input=requests, text=True, encoding="utf-8", capture_output=True, timeout=10, check=True)
responses = [json.loads(line) for line in result.stdout.splitlines()]
assert [response["error"]["code"] for response in responses] == ["INVALID_REQUEST", "INVALID_QUERY", "UNKNOWN_METHOD", "REQUEST_TOO_LARGE", "INVALID_QUERY"]
assert responses[-1]["id"] == 1
print("Packaged API protocol passed")
