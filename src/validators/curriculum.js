'use strict';

const { HttpError } = require('../errors');

const ID_RE = /^[1-9]\d{0,17}$/;

/** { "curriculum_group_id": 1 } */
function parseCurriculumBody(body) {
  const raw = body && typeof body === 'object' ? body.curriculum_group_id : undefined;
  const id = typeof raw === 'number' ? String(raw) : raw;
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Payload tidak valid', ['curriculum_group_id tidak valid']);
  }
  return { curriculumGroupId: id };
}

module.exports = { parseCurriculumBody };
