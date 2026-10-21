#!/usr/bin/env python3
"""The codex hardening arguments really take effect in the pinned codex release.

.github/codex/codex-exec-args.txt turns off every tool the reviewer model could use to act on the
runner (commands, browser, images, web search, plugins, hooks). codex accepts an unknown `-c` key
without complaint, so a misspelt or renamed feature would leave that tool ON with nothing failing.
This test runs the real binary at the version codex-review.yml installs and checks the effective
state. It needs no API key and makes no model call.

Run by the codex-review-tests job in ci.yml after it installs the pinned version. It fails, rather
than skipping, when `codex` is missing or is a different version.
"""
import http.server
import importlib.util
import json
import os
import pathlib
import re
import socketserver
import subprocess
import tempfile
import threading
import time
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/codex-review.yml"
ARGS_FILE = REPO_ROOT / ".github/codex/codex-exec-args.txt"


def hardening_args():
    return [line for line in ARGS_FILE.read_text().splitlines() if line and not line.startswith("#")]


def config_overrides():
    args = hardening_args()
    return [args[i + 1] for i, arg in enumerate(args) if arg == "-c"]


def pinned_version():
    match = re.search(r"@openai/codex@(\d+\.\d+\.\d+)", WORKFLOW.read_text())
    if not match:
        raise AssertionError("codex-review.yml does not install an exact @openai/codex version")
    return match.group(1)


def codex(*args):
    with tempfile.TemporaryDirectory() as home:
        env = dict(os.environ, CODEX_HOME=home)
        env.pop("CODEX_API_KEY", None)
        env.pop("OPENAI_API_KEY", None)
        return subprocess.run(["codex", *args], capture_output=True, text=True, env=env, timeout=120)


def feature_states(*overrides):
    flags = [part for override in overrides for part in ("-c", override)]
    result = codex(*flags, "features", "list")
    if result.returncode != 0:
        raise AssertionError(f"`codex features list` failed: {result.stderr.strip()[:300]}")
    states = {}
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[-1] in ("true", "false"):
            states[parts[0]] = parts[-1] == "true"
    return states


class PinnedCodexHardeningTest(unittest.TestCase):
    def test_the_installed_codex_is_the_pinned_version(self):
        result = codex("--version")
        self.assertEqual(result.returncode, 0, "codex is not installed; ci.yml installs the pinned version first")
        self.assertIn(pinned_version(), result.stdout, "installed codex differs from the version codex-review.yml pins")

    def test_every_feature_override_names_a_real_feature_and_turns_it_off(self):
        features = {o.split("=", 1)[0][len("features."):]: o.split("=", 1)[1]
                    for o in config_overrides() if o.startswith("features.")}
        self.assertIn("shell_tool", features)
        defaults = feature_states()
        effective = feature_states(*config_overrides())
        for name, value in features.items():
            with self.subTest(feature=name):
                self.assertEqual(value, "false", "the hardening file should only turn features off")
                self.assertIn(name, defaults, "not a feature in the pinned codex: a typo here is silently ignored")
                self.assertFalse(effective[name], "the override did not take effect")

    def test_every_other_config_override_is_accepted(self):
        others = [o for o in config_overrides() if not o.startswith("features.")]
        self.assertIn('web_search="disabled"', others)
        for override in others:
            with self.subTest(override=override):
                result = codex("-c", override, "features", "list")
                self.assertEqual(result.returncode, 0, "codex rejected the override")
        # The check above can fail: an invalid value is rejected rather than ignored.
        self.assertNotEqual(codex("-c", 'web_search="not-a-mode"', "features", "list").returncode, 0)

    def test_exec_accepts_every_hardening_flag(self):
        result = codex("exec", *hardening_args(), "--help")
        self.assertEqual(result.returncode, 0, f"`codex exec` rejected a flag: {result.stderr.strip()[:300]}")


# The tools the reviewer model may be offered. `request_user_input` stays because no setting in the
# pinned codex removes it, and in `codex exec` there is nobody to answer it.
ALLOWED_TOOLS = {"request_user_input"}


def load_catalog_module():
    path = REPO_ROOT / "scripts/codex-review-model-catalog.py"
    spec = importlib.util.spec_from_file_location("codex_review_model_catalog", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _CapturingResponses(http.server.BaseHTTPRequestHandler):
    """Stands in for the Responses API: records each request and refuses it, so no model runs."""

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        self.server.captured.append((self.path, body))
        self.send_response(400)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":{"message":"test stop","type":"invalid_request_error"}}')

    def do_GET(self):
        self.server.captured.append((self.path, b""))
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        pass


def offered_tool_names(request):
    names = [tool.get("name") or tool.get("type") for tool in request.get("tools", [])]
    for item in request.get("input", []):
        if item.get("type") == "additional_tools":
            for namespace in item.get("tools", []):
                names.extend(tool["name"] for tool in namespace.get("tools", [namespace]))
    return set(names)


class ReviewerToolsTest(unittest.TestCase):
    """The tools codex actually sends with a review request, not the flags that should remove them.

    Feature flags alone left exec, apply_patch, the goal tools and spawn_agent with the other
    collaboration tools in the request (2026-10-03): the bundled catalog entry for the model adds
    them. This runs the real binary with the exact arguments the review uses, pointed at a local
    stand-in for the API, and checks the request body. Every other address goes to a closed port,
    so a run that ignored the override fails here instead of reaching the network.
    """

    def test_the_reviewer_model_is_offered_only_the_allowed_tools(self):
        catalog = load_catalog_module()
        server = http.server.HTTPServer(("127.0.0.1", 0), _CapturingResponses)
        server.captured = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env = dict(os.environ)
                overrides = catalog.exec_overrides(catalog.write_catalog(pathlib.Path(tmp) / catalog.CATALOG_NAME))
                home = pathlib.Path(tmp) / "home"
                workdir = pathlib.Path(tmp) / "workdir"
                home.mkdir()
                workdir.mkdir()
                provider = f"model_providers.{catalog.PROVIDER_ID}"
                local = [
                    "-c", f'{provider}.base_url="http://127.0.0.1:{server.server_port}/v1"',
                    "-c", f"{provider}.request_max_retries=0",
                    "-c", f"{provider}.stream_max_retries=0",
                ]
                closed = "http://127.0.0.1:9"
                env.update(CODEX_HOME=str(home), CODEX_API_KEY="test-not-a-key", HTTPS_PROXY=closed,
                           HTTP_PROXY=closed, ALL_PROXY=closed, NO_PROXY="127.0.0.1,localhost")
                env.pop("OPENAI_API_KEY", None)
                try:
                    subprocess.run(
                        ["codex", "exec", *hardening_args(), *overrides, *local, "-C", str(workdir),
                         "-m", catalog.APPROVED_MODELS[0]],
                        input="review this", capture_output=True, text=True, env=env, timeout=60,
                    )
                except subprocess.TimeoutExpired:
                    # A call that left the local provider keeps retrying the closed port; the
                    # assertion below then reports that nothing was checked.
                    pass
        finally:
            server.shutdown()
        # The only request is the review itself. A model-list refresh (a GET such as /v1/models)
        # could merge a live catalog over the locked one in production; codex 0.160.0 makes none
        # through this provider, with or without the locked catalog (checked 2026-10-09), so this
        # cannot fail at the current pin. It is the tripwire for a pin bump that adds one.
        self.assertEqual({(path, "POST" if body else "GET") for path, body in server.captured},
                         {("/v1/responses", "POST")}, "codex sent a request other than the review")
        posts = [body for path, body in server.captured if body]
        self.assertTrue(posts, "codex sent no request to the local stand-in, so nothing was checked")
        request = json.loads(posts[0])
        self.assertEqual(request.get("model"), catalog.APPROVED_MODELS[0])
        self.assertEqual(offered_tool_names(request), ALLOWED_TOOLS)


class _RecordingProxy(socketserver.StreamRequestHandler):
    """An HTTP proxy that records each request line (a CONNECT names the host) and refuses it."""

    def handle(self):
        self.server.seen.append(self.rfile.readline().decode(errors="replace").strip())
        try:
            self.wfile.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
        except OSError:
            pass


class _ThreadingTCP(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True


class _CompletingResponses(http.server.BaseHTTPRequestHandler):
    """Stands in for the Responses API and completes the turn: codex reports usage only after one."""

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length", 0)))
        events = [
            {"type": "response.created", "response": {"id": "r"}},
            {"type": "response.output_item.done", "output_index": 0,
             "item": {"type": "message", "role": "assistant", "id": "m",
                      "content": [{"type": "output_text", "text": "{}", "annotations": []}]}},
            {"type": "response.completed", "response": {"id": "r", "usage": {
                "input_tokens": 1, "input_tokens_details": {"cached_tokens": 0}, "output_tokens": 1,
                "output_tokens_details": {"reasoning_tokens": 0}, "total_tokens": 2}}},
        ]
        data = b"".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n".encode() for e in events)
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        pass


class NoOutboundTelemetryTest(unittest.TestCase):
    """codex reports usage to its own analytics host after each completed turn (seen 2026-10-20 at
    0.160.0: CONNECT ab.chatgpt.com:443). The review sends nothing but the review itself, so the
    arguments turn analytics off. Every non-local address goes through a proxy that records what was
    asked for and refuses it; nothing leaves the machine."""

    ANALYTICS = ["-c", "analytics.enabled=false"]

    def outbound(self, args):
        catalog = load_catalog_module()
        proxy = _ThreadingTCP(("127.0.0.1", 0), _RecordingProxy)
        proxy.seen = []
        api = http.server.HTTPServer(("127.0.0.1", 0), _CompletingResponses)
        for server in (proxy, api):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                overrides = catalog.exec_overrides(catalog.write_catalog(pathlib.Path(tmp) / catalog.CATALOG_NAME))
                home = pathlib.Path(tmp) / "home"
                workdir = pathlib.Path(tmp) / "workdir"
                home.mkdir()
                workdir.mkdir()
                provider = f"model_providers.{catalog.PROVIDER_ID}"
                local = ["-c", f'{provider}.base_url="http://127.0.0.1:{api.server_port}/v1"',
                         "-c", f"{provider}.request_max_retries=0", "-c", f"{provider}.stream_max_retries=0"]
                via = f"http://127.0.0.1:{proxy.server_address[1]}"
                env = {k: v for k, v in os.environ.items() if k.lower() not in ("https_proxy", "http_proxy", "all_proxy", "no_proxy")}
                env.update(CODEX_HOME=str(home), CODEX_API_KEY="test-not-a-key", HTTPS_PROXY=via,
                           HTTP_PROXY=via, ALL_PROXY=via, NO_PROXY="127.0.0.1,localhost")
                env.pop("OPENAI_API_KEY", None)
                subprocess.run(["codex", "exec", *args, *overrides, *local, "-C", str(workdir),
                                "-m", catalog.APPROVED_MODELS[0]],
                               input="review this", capture_output=True, text=True, env=env, timeout=120)
                time.sleep(2)  # a report sent as the process exits
        finally:
            proxy.shutdown()
            api.shutdown()
        return list(proxy.seen)

    def test_the_review_arguments_send_nothing_to_another_host(self):
        args = hardening_args()
        without = [arg for i, arg in enumerate(args)
                   if args[i:i + 2] != self.ANALYTICS and args[i - 1:i + 1] != self.ANALYTICS]
        # Control: without the analytics override the same run must be seen reaching out, or the probe
        # is blind (no completed turn, no proxy use) and the assertion below proves nothing.
        self.assertTrue(self.outbound(without), "probe blind: no outbound request seen even with analytics on")
        self.assertEqual(self.outbound(args), [], "codex sent a request to a host other than the review API")


if __name__ == "__main__":
    unittest.main()
