# Cache token fallback warning

GitHub #423. `RedisInit.resolved_cache_token` (`config/initializers/resque.rb`) is read by `RedisInit.init` when it sets `cache_token`.

Shapes: a non-blank `CACHE_TOKEN`, else a non-blank `K_REVISION`, else the literal `abc`. Blank strings are skipped via `.presence`.

The method still returns `abc` when nothing is set, including in production. Raising there could stop a process that is missing the env var. This change only logs a warning on that path. The warning does not include a secret, and the method text does not contain `RENDER` because the source pin in `resque_redis_options_spec` rejects that word.

The fallback example expected the warning and failed before the log line existed. Removing the log line made that example fail again. The file was restored from a copy.
