"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBMODES_BY_MODE = exports.MODES = exports.REGIONS = void 0;
exports.REGIONS = ['NA', 'EU', 'Asia'];
exports.MODES = ['Erumode', 'NGMC'];
// Sub-mode options depend on the tournament's mode.
exports.SUBMODES_BY_MODE = {
    NGMC: ['Normal', 'Random'],
    Erumode: ['Normal', 'Random', 'Balanced', 'No Vocal'],
};
