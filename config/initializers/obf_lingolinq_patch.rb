# OBF spec compliance: use ext_lingolinq_ prefix for custom attributes.
# Load after OBF gem (obf_footer loads it first).
require Rails.root.join('lib', 'obf_lingolinq_patch')
