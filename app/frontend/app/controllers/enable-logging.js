import persistence from '../utils/persistence';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),

  opening: function() {
    this.set('research', false);
    this.set('sessionUser', this.appState.get('sessionUser'));
    this.set('model.user.preferences.allow_log_reports', false);
    this.set('publishing', false);
    this.set('research_use', null);
    this.set('research_age', null);
    this.set('research_experience', null);
    this.set('model.user.preferences.allow_log_publishing', false);
  },
  closing: function() {
    this.set('model.user.preferences.allow_log_reports', !!this.get('research'));

    this.set('model.user.preferences.allow_log_publishing', !!this.get('publishing'));
    if(this.get('research')) {
      if(this.get('research_use') || this.get('research_age') || this.get('research_experience')) {
        this.set('model.user.preferences.research_primary_use', this.get('research_use'));
        this.set('model.user.preferences.research_age', this.get('research_age'));
        this.set('model.user.preferences.research_experience_level', this.get('research_experience'));
      }  
    }
    if(this.get('model.save')) {
      this.get('model.user').save();
    }
  },
  research_ages: computed('', function() {
    return [
      {id: '', name: "[ Select ]"},
      {id: 'yo_under_4', name: "Under 4 years old"},
      {id: 'yo_4-6', name: "4-6 years old"},
      {id: 'yo_7-8', name: "7-8 years old"},
      {id: 'yo_9-10', name: "9-10 years old"},
      {id: 'yo_11-12', name: "11-12 years old"},
      {id: 'yo_13-14', name: "13-14 years old"},
      {id: 'yo_15-16', name: "15-16 years old"},
      {id: 'yo_17-18', name: "17-18 years old"},
      {id: 'yo_19-24', name: "19-24 years old"},
      {id: 'yo_25-29', name: "25-29 years old"},
      {id: 'yo_30-39', name: "30-39 years old"},
      {id: 'yo_40-49', name: "40-49 years old"},
      {id: 'yo_50-70', name: "50-70 years old"},
      {id: 'yo_over_70', name: "Over 70 years old"},
    ];
  }),
  research_experiences: computed('', function() {
    return [
      {id: 'select', name: "[ Select ]"},
      {id: 'exp_under_6_mo', name: "Less than 6 months experience"},
      {id: 'exp_6-12_mo', name: "6-12 months experience"},
      {id: 'exp_1_yr', name: "1 years experience"},
      {id: 'exp_2-3_yr', name: "2-3 years experience"},
      {id: 'exp_4-5', name: "4-5 years experience"},
      {id: 'exp_over_5_yr', name: "Pver 5 years experience"},
    ];

  }),
  research_uses: computed('', function() {
    return [
      {name: i18n.t('developmental_disability', "Developmental Disability"), header: true},
      {name: i18n.t('autism', "Autism")},
      {name: i18n.t('down_syndrome', "Down Syndrome")},
      {name: i18n.t('cerebral_palsy', "Cerebral Palsy")},
      {name: i18n.t('rett_syndrome', "Rett Syndrome")},
      {name: i18n.t('angelman_syndrome', "Angelman Syndrome")},
      {name: i18n.t('other_please_specify', "Other (Please Specify)"), other: true},
      {name: i18n.t('acquired_disorder', "Acquired Disorder"), header: true},
      {name: i18n.t('tbi', "Traumatic Brain Injury")},
      {name: i18n.t('stroke', "Stroke")},
      {name: i18n.t('multiple_sclerosis', "Multiple Sclerosis")},
      {name: i18n.t('dysarthria', "Dysarthria")},
      {name: i18n.t('throat_cancer', "Throat Cancer")},
      {name: i18n.t('other_please_specify', "Other (Please Specify)"), other: true},
      {name: i18n.t('progressive_disorder', "Progressive Disorder"), header: true},
      {name: i18n.t('parkinsons', "Parkinson's Disease")},
      {name: i18n.t('mnd', "Motor Neuron Disease")},
      {name: i18n.t('als', "Amyotrophic Lateral Sclerosis")},
      {name: i18n.t('other_please_specify', "Other (Please Specify)"), other: true},
      {name: i18n.t('cognitive_communication_disorder', "Cognitive-Communication Disorder"), header: true},
      {name: i18n.t('dementia', "Dementia")},
      {name: i18n.t('alzheimers', "Alzheimer's")},
      {name: i18n.t('aphasia', "Aphasia")},
      {name: i18n.t('other_please_specify', "Other (Please Specify)"), other: true},
    ];
  }),
  actions: {
    set_research_use: function(opt) {
      if(opt.other) {
        this.set('research_use', "")
      } else if (opt.name) {
        this.set('research_use', opt.name);
      }
    }
  }
});
