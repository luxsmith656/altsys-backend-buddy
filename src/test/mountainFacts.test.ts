import { describe, expect, it } from 'vitest';
import { MOUNTAIN_FACTS } from '@/lib/mountainFacts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mountain fact source', () => {
  it('uses the owner-approved elevation and official jump-offs', () => {
    expect(MOUNTAIN_FACTS.elevationMeters).toBe(760);
    expect(MOUNTAIN_FACTS.elevationFeet).toBe(2493);
    expect(MOUNTAIN_FACTS.jumpOffs).toEqual(['Lamot 1', 'Lamot 2', 'Sto. Tomas']);
    expect(MOUNTAIN_FACTS.place).toBe('Calauan, Laguna');
  });

  it('keeps the Edge knowledge source aligned with the frontend source', () => {
    const edgeSource = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/mountain-facts.ts'), 'utf8');
    expect(edgeSource).toContain(`elevationMeters: ${MOUNTAIN_FACTS.elevationMeters}`);
    expect(edgeSource).toContain(`elevationFeet: ${MOUNTAIN_FACTS.elevationFeet}`);
    for (const jumpOff of MOUNTAIN_FACTS.jumpOffs) expect(edgeSource).toContain(`'${jumpOff}'`);
    expect(edgeSource).toContain(`place: '${MOUNTAIN_FACTS.place}'`);
  });
});
