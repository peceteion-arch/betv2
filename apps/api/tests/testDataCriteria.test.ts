import { describe, it, expect } from 'vitest';
import { isTestUserEmail, isTestMatch } from '../scripts/testDataCriteria';

const base = { 
  homeTeam: { name: 'H' }, 
  awayTeam: { name: 'A' }, 
  competition: { name: 'L' }, 
  externalId: 't-1700000000-0.5' 
};

describe('isTestUserEmail', () => {
  it('matches only the @t.com test domain', () => {
    expect(isTestUserEmail('concurrent-1-0.2@t.com')).toBe(true);
    expect(isTestUserEmail('Maria@T.COM')).toBe(true);
    expect(isTestUserEmail('maria@gmail.com')).toBe(false);
    expect(isTestUserEmail('maria@t.com.ro')).toBe(false);
    expect(isTestUserEmail('maria@mt.com')).toBe(false);
  });
});

describe('isTestMatch', () => {
  it('matches the three fixture families', () => {
    expect(isTestMatch(base)).toBe(true);
    expect(isTestMatch({ ...base, externalId: 'f-1-0.1' })).toBe(true);
    expect(isTestMatch({ ...base, externalId: 'r-1-a' })).toBe(true);
    expect(isTestMatch({ ...base, homeTeam: { name: 'H2' }, awayTeam: { name: 'A2' }, externalId: 'r-1-b' })).toBe(true);
  });

  it('never matches real-looking matches', () => {
    expect(isTestMatch({ ...base, competition: { name: 'Minifotbal' } })).toBe(false);
    expect(isTestMatch({ ...base, externalId: 'manual-123' })).toBe(false);
    expect(isTestMatch({ ...base, externalId: '12345678' })).toBe(false);
    expect(isTestMatch({ ...base, homeTeam: { name: 'FC Nando' }, awayTeam: { name: 'A' } })).toBe(false);
    expect(isTestMatch({ ...base, homeTeam: { name: 'H' }, awayTeam: { name: 'A2' } })).toBe(false);
  });
});