import { EventEmitter } from 'events';

class OddsEventEmitter extends EventEmitter {
  constructor() {
    super();
  }
}

export const oddsEvents = new OddsEventEmitter();
