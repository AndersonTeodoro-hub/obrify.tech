import { describe, it, expect } from 'vitest';
import { requiresOrgWideConfirmation } from './invite-scope';

describe('requiresOrgWideConfirmation', () => {
  it('exige confirmação quando não há obra escolhida', () => {
    expect(requiresOrgWideConfirmation({ role: 'manager', selectedSites: [] })).toBe(true);
  });

  it('não exige com obra escolhida', () => {
    expect(requiresOrgWideConfirmation({ role: 'manager', selectedSites: ['site-1'] })).toBe(false);
  });

  it('não exige quando o convite está preso a uma obra', () => {
    expect(
      requiresOrgWideConfirmation({ role: 'viewer', lockedSiteId: 'site-1', selectedSites: [] }),
    ).toBe(false);
  });

  it('não exige para admin (org-wide por definição)', () => {
    expect(requiresOrgWideConfirmation({ role: 'admin', selectedSites: [] })).toBe(false);
  });

  it('o caso real: manager numa org sem obras fica bloqueado até confirmar', () => {
    expect(requiresOrgWideConfirmation({ role: 'manager', selectedSites: [] })).toBe(true);
  });
});
