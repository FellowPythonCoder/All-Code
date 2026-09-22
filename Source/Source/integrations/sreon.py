import json
import math
import queue
import subprocess
import threading


class Sreon:
    def __init__(self, executable, *, args=None, timeout=20):
        if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be a positive number of seconds")
        self.process = subprocess.Popen([str(executable), *(args or [])], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.lock = threading.Lock()
        self.sequence = 0
        self.timeout = timeout
        self.failure = None
        self.worker = None

    def _stop(self, error):
        if self.failure is None:
            self.failure = error
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=5)
        if self.worker is not None:
            self.worker.join(timeout=1)
        if self.worker is None or not self.worker.is_alive():
            for stream in (self.process.stdin, self.process.stdout):
                try:
                    stream.close()
                except OSError:
                    pass

    def search(self, query, category="web", cursor=None):
        with self.lock:
            if self.failure is not None:
                raise RuntimeError(str(self.failure))
            self.sequence += 1
            request = {"id": self.sequence, "method": "search", "params": {"q": query, "category": category, "cursor": cursor}}
            payload = (json.dumps(request, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
            if len(payload) > 16384:
                raise ValueError("Request exceeds 16 KiB")
            output = queue.Queue(maxsize=1)

            def exchange():
                try:
                    self.process.stdin.write(payload)
                    self.process.stdin.flush()
                    output.put(self.process.stdout.readline(4 * 1024 * 1024 + 1))
                except Exception as error:
                    output.put(error)

            self.worker = threading.Thread(target=exchange, daemon=True)
            self.worker.start()
            try:
                line = output.get(timeout=self.timeout)
                if isinstance(line, Exception):
                    raise line
                if not line:
                    raise RuntimeError("Sreon API stopped")
                if len(line) > 4 * 1024 * 1024:
                    raise RuntimeError("Sreon response exceeds 4 MiB")
                if not line.endswith(b"\n"):
                    raise RuntimeError("Incomplete Sreon response")
                response = json.loads(line)
                if not isinstance(response, dict) or type(response.get("version")) is not int or response.get("version") != 1 or type(response.get("id")) is not int or response["id"] != self.sequence:
                    raise RuntimeError("Unexpected Sreon response or protocol version")
                has_error = "error" in response
                has_result = "result" in response
                if has_error == has_result:
                    raise RuntimeError("Invalid Sreon response")
                if has_error and (not isinstance(response["error"], dict) or not isinstance(response["error"].get("message"), str)):
                    raise RuntimeError("Invalid Sreon response")
                if has_result and (not isinstance(response["result"], dict) or not isinstance(response["result"].get("results"), list)):
                    raise RuntimeError("Invalid Sreon response")
            except queue.Empty:
                error = TimeoutError("Sreon request timed out")
                self._stop(error)
                raise error from None
            except Exception as error:
                self._stop(error)
                raise RuntimeError(str(error)) from error
            if has_error:
                raise RuntimeError(response["error"]["message"])
            return response["result"]

    def close(self):
        with self.lock:
            self._stop(RuntimeError("Sreon client is closed"))

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
