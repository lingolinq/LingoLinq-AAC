module SystemEmailTemplateSecurity
  CODE_BLOCK = /<%(?![%=])[\s\S]*?%>/m

  DANGEROUS_EXPR = /\b(system|exec|eval|`[^`]*`|%x\(|Kernel|File::|IO::|Dir::|open\s*\(|require\s*\(|load\s*\(|send\s*\(|instance_eval|class_eval|constantize)\b/i

  def self.validate!(template_string)
    return if template_string.blank?

    if template_string.match?(CODE_BLOCK)
      raise ArgumentError, 'Email templates may only use <%= ... %> output tags, not Ruby code blocks (<% ... %>)'
    end

    template_string.scan(/<%=([\s\S]*?)%>/m).each do |match|
      expr = match[0].to_s
      if expr.match?(DANGEROUS_EXPR)
        raise ArgumentError, 'Email template contains a disallowed Ruby expression'
      end
    end
  end
end
