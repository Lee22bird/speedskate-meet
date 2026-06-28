'use strict';

const savedTrainingRoster = require('../data/trainingRoster115.json');

const TRAINING_ROSTER_SOURCE = 'developer_training_115';

function buildTrainingRoster115() {
  return savedTrainingRoster.map(row => ({
    ...row,
    options: { ...(row.options || {}) },
  }));
}

module.exports = {
  TRAINING_ROSTER_SOURCE,
  buildTrainingRoster115,
};
