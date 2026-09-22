from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "integrations"))
from sreon import Sreon

HELPER = Path(__file__).resolve().parent / "fixtures" / "api-helper.mjs"


class IntegrationTests(unittest.TestCase):
    def client(self, **kwargs):
        engine = Sreon(os.environ["SREON_TEST_NODE"], args=[str(HELPER)], **kwargs)
        self.addCleanup(engine.close)
        return engine

    def test_unicode_and_concurrent_calls(self):
        engine = self.client()
        with ThreadPoolExecutor(max_workers=3) as workers:
            results = list(workers.map(engine.search, ["森林", "YouTube", "forest"]))
        self.assertEqual([item["results"][0]["title"] for item in results], ["森林", "YouTube", "forest"])
        result = engine.search("photos", "photos", {"source": "media", "offset": 24})
        self.assertEqual(result["category"], "photos")
        self.assertEqual(result["cursor"]["offset"], 24)

    def test_recoverable_error(self):
        engine = self.client()
        with self.assertRaisesRegex(RuntimeError, "Source unavailable"):
            engine.search("error")
        self.assertEqual(engine.search("next")["results"][0]["title"], "next")

    def test_protocol_errors_stop_the_helper(self):
        for query in ["null", "wrong-id", "wrong-version", "bad-json", "bad-result", "large-response", "exit"]:
            with self.subTest(query=query):
                engine = self.client()
                with self.assertRaises(RuntimeError):
                    engine.search(query)
                with self.assertRaises(RuntimeError):
                    engine.search("later")
                self.assertIsNotNone(engine.process.poll())

    def test_timeout(self):
        engine = self.client(timeout=0.15)
        with self.assertRaisesRegex(TimeoutError, "timed out"):
            engine.search("stall")
        self.assertIsNotNone(engine.process.poll())

    def test_request_limit_is_recoverable(self):
        engine = self.client()
        with self.assertRaisesRegex(ValueError, "16 KiB"):
            engine.search("x" * 17000)
        self.assertEqual(engine.search("ok")["results"][0]["title"], "ok")

    def test_close_is_idempotent(self):
        engine = self.client()
        engine.close()
        engine.close()
        with self.assertRaisesRegex(RuntimeError, "closed"):
            engine.search("later")

    def test_invalid_timeout(self):
        for timeout in [0, -1, float("inf"), float("nan")]:
            with self.assertRaises(ValueError):
                Sreon("unused", timeout=timeout)


if __name__ == "__main__":
    unittest.main()
