require 'obf'

# Runs OBF::Utils.fix_color's node conversion with an explicit argv. The gem builds a shell string
# from the colour, and colours are stored board data, so no shell may be involved. The conversion
# script and its output are otherwise unchanged, except that a node which cannot start raises here
# where the gem's shell returned an empty colour. Every deployed image installs node (Dockerfile),
# so that case is a broken host and should fail the export visibly. The gem's @@colors is a class
# variable a prepended module does not share, so this keeps its own cache.
module OBFFixColorHardening
  SCRIPT = File.join(Gem.loaded_specs['obf'].full_gem_path, 'lib', 'tinycolor_convert.js')

  def fix_color(str, type = 'hex')
    lookup = str + '::' + type
    @colors ||= {}
    return @colors[lookup] if @colors[lookup]
    color = IO.popen(['node', SCRIPT, str, type], :in => File::NULL, &:read).strip
    @colors[lookup] = color
    color
  end
end

OBF::Utils.singleton_class.prepend(OBFFixColorHardening)
