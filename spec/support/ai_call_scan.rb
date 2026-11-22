# frozen_string_literal: true

# Finds method CALLS in Ruby source by walking Ruby's own syntax tree, so a name that
# appears only in a comment or a string is never counted. Used by
# spec/controllers/ai_consent_gate_coverage_spec.rb.
module AiCallScan
  CALL_TYPES = %i[CALL QCALL FCALL VCALL OPCALL].freeze

  # [{name:, calls: [{receiver:, name:, pos: [line, column]}]}] for every method defined in +source+.
  def self.methods_in_source(source)
    found = []
    walk = lambda do |node|
      next unless node.is_a?(RubyVM::AbstractSyntaxTree::Node)
      case node.type
      when :DEFN then found << { name: node.children.first, calls: calls_in(node) }
      when :DEFS then found << { name: node.children[1], calls: calls_in(node) }
      end
      node.children.each { |child| walk.call(child) }
    end
    walk.call(RubyVM::AbstractSyntaxTree.parse(source))
    found
  end

  def self.calls_in(node)
    calls = []
    walk = lambda do |n|
      next unless n.is_a?(RubyVM::AbstractSyntaxTree::Node)
      if CALL_TYPES.include?(n.type)
        receiver, name =
          case n.type
          when :CALL, :QCALL, :OPCALL then [n.children[0], n.children[1]]
          else [nil, n.children[0]]
          end
        const = receiver.is_a?(RubyVM::AbstractSyntaxTree::Node) && receiver.type == :CONST ? receiver.children.first : nil
        calls << { receiver: const, name: name, pos: [n.first_lineno, n.first_column] }
      end
      n.children.each { |child| walk.call(child) }
    end
    walk.call(node)
    calls.sort_by { |c| c[:pos] }
  end

  # The position of the first call matching the block, or nil.
  def self.first_pos(calls)
    hit = calls.find { |c| yield(c) }
    hit && hit[:pos]
  end

  # True when a guard call exists and comes before the first sink call.
  def self.guard_precedes_sink?(calls, guard:, sink:)
    g = first_pos(calls, &guard)
    s = first_pos(calls, &sink)
    return true if s.nil?
    !g.nil? && (g <=> s) == -1
  end
end
