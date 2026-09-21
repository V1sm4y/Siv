import { describe, expect, it } from 'vitest';
import { defineGameModule, MANUAL_ADAPTERS, validateGameModule, type GameModule } from './index';

const valid: GameModule = defineGameModule({
  id: 'apex',
  name: 'Apex',
  shortName: 'APX',
  theme: { accent: '#fff', accentFg: '#000', accentText: '#fff', accentTextLight: '#000', gradient: ['#1', '#2', '#3'], icon: 'zap' },
  roles: [{ id: 'assault', label: 'Assault', short: 'AST' }],
  arenas: [{ id: 'kings', label: 'Kings Canyon' }],
  teamSize: 3,
  metrics: [],
  adapters: [...MANUAL_ADAPTERS],
  liveGuidance: { allowed: 'ruleset-dependent', warning: 'Check the ruleset.' },
  depth: 'foundation',
});

describe('validateGameModule', () => {
  it('accepts a minimal valid module', () => expect(validateGameModule(valid)).toEqual([]));
  it('rejects bad ids', () => {
    expect(validateGameModule({ ...valid, id: 'Apex-Legends' })).toContainEqual(expect.stringContaining('must be snake/lowercase'));
  });
  it('requires manual and CSV adapters (the app must work with zero API access)', () => {
    const errs = validateGameModule({ ...valid, adapters: [] });
    expect(errs).toContain('adapters must include "manual"');
    expect(errs).toContain('adapters must include "csv"');
  });
  it('rejects duplicate role and arena ids', () => {
    const r = valid.roles[0]!;
    expect(validateGameModule({ ...valid, roles: [r, r] })).toContain('duplicate role ids');
    const a = valid.arenas[0]!;
    expect(validateGameModule({ ...valid, arenas: [a, a] })).toContain('duplicate arena ids');
  });
  it('requires exactly one current edition when editions are declared', () => {
    const ed = (current: boolean, id: string) => ({ id, label: id, current });
    expect(validateGameModule({ ...valid, editions: [ed(false, 'a'), ed(false, 'b')] })).toContain('exactly one edition must be current');
    expect(validateGameModule({ ...valid, editions: [ed(true, 'a'), ed(true, 'b')] })).toContain('exactly one edition must be current');
    expect(validateGameModule({ ...valid, editions: [ed(false, 'a'), ed(true, 'b')] })).toEqual([]);
  });
  it('requires at least one role and a positive team size', () => {
    expect(validateGameModule({ ...valid, roles: [] })).toContain('roles must not be empty');
    expect(validateGameModule({ ...valid, teamSize: 0 })).toContain('teamSize must be >= 1');
  });
});
