# Puts back, after each example of the group it is called in, the ENV keys those examples assign
# directly (ENV['X'] = ...), so the values do not leak into spec files that run later. Unlike
# env_wrap it sets nothing and leaves the examples where they are; a key that was unset before
# the example is deleted again.
def restore_env_after_each(*keys)
  around(:each) do |example|
    saved = keys.map { |k| [k, ENV.key?(k), ENV[k]] }
    begin
      example.run
    ensure
      saved.each { |k, had, v| had ? ENV[k] = v : ENV.delete(k) }
    end
  end
end
