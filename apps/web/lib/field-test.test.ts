import { describe, expect, it } from 'vitest';
import { paceLabel, parseTime } from '../components/settings/FieldTestCard';

describe('parseTime', () => {
  it('reads mm:ss, which is how a swimmer reads a pace clock', () => {
    expect(parseTime('3:05')).toBe(185);
    expect(parseTime('1:32')).toBe(92);
    expect(parseTime('10:00')).toBe(600);
  });

  it('reads bare seconds too', () => {
    expect(parseTime('185')).toBe(185);
    expect(parseTime(' 92 ')).toBe(92);
  });

  it('refuses anything it cannot read, rather than guessing a time', () => {
    // A misread time becomes the athlete's CSS, then every swim target for weeks.
    for (const bad of ['', '   ', 'abc', '1:2:3', '-5', '0', '3:xx', '0:00']) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});

describe('paceLabel', () => {
  it('formats seconds per 100 m as mm:ss', () => {
    expect(paceLabel(92)).toBe('1:32');
    expect(paceLabel(60)).toBe('1:00');
    expect(paceLabel(125.4)).toBe('2:05');
  });

  it('pads the seconds, so 1:05 never reads as 1:5', () => {
    expect(paceLabel(65)).toBe('1:05');
  });
});
