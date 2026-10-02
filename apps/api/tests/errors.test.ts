import { describe, it, expect } from 'vitest';
import { BetCancelConflictError } from '../src/services/bet.service';

// bet.routes.ts discriminates the 409 case with `instanceof
// BetCancelConflictError`. A bare `class X extends Error {}` breaks that check
// under an ES5 target: the downlevel emits a plain Error call, the prototype
// chain never reaches X.prototype, and every rejection silently degrades to
// the generic 400. apps/api builds at ES2020 so this passes today, which is
// exactly what makes it worth pinning — the failure only appears if the target
// changes, and it fails quietly, as a wrong status code rather than a crash.
describe('BetCancelConflictError', () => {
  it('is an instance of itself and of Error', () => {
    const err = new BetCancelConflictError('x');
    expect(err).toBeInstanceOf(BetCancelConflictError);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries the message through to the caller', () => {
    const message = 'Não é possível anular: um dos jogos já começou ou terminou';
    expect(new BetCancelConflictError(message).message).toBe(message);
  });

  it('has a name, so logs and error bodies identify it', () => {
    expect(new BetCancelConflictError('x').name).toBe('BetCancelConflictError');
  });

  // The route's catch reads the name of the class off the thrown value, so a
  // plain Error must NOT satisfy it — otherwise every unrelated cancel failure
  // would start answering 409.
  it('does not capture plain errors', () => {
    expect(new Error('x')).not.toBeInstanceOf(BetCancelConflictError);
  });

  it('routes to 409 the way bet.routes.ts discriminates it', () => {
    // Mirrors the route's catch: the discriminator has to hold for a value that
    // was actually thrown, which is the only way the 409 is ever reached.
    const routeStatus = (error: unknown) =>
      error instanceof BetCancelConflictError ? 409 : 400;

    const thrower = () => {
      throw new BetCancelConflictError('Não é possível anular: um dos jogos já começou ou terminou');
    };

    let caught: unknown;
    try {
      thrower();
    } catch (error) {
      caught = error;
    }

    expect(routeStatus(caught)).toBe(409);
    expect(routeStatus(new Error('Bet not found'))).toBe(400);
    expect(routeStatus(new Error('Not your bet'))).toBe(400);
    expect(routeStatus(new Error('Can only cancel pending bets'))).toBe(400);
  });
});