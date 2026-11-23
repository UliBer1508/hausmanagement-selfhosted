import { describe, expect, it } from 'vitest';
import { bewerteSicherung, ersatzUebersprungen, rechnerName, sicherungKurz, type BackupRun } from '@/lib/backupStatus';

const run = (host: string, finished: string, status: BackupRun['status'] = 'erfolgreich'): BackupRun => ({
  id: `${host}-${finished}`, started_at: finished, finished_at: finished, status, host,
  backup_folder: null, db_bytes: 5_000_000, table_count: 181, storage_files: 3, storage_bytes: 1,
  storage_skipped: false, deleted_old: 0, retention_days: 30, schedule_time: '03:15', messages: [], script_version: 'v4',
});
const jetzt = new Date('2026-11-23T12:00:00+01:00').getTime();

describe('bewerteSicherung (zwei PCs)', () => {
  it('München fällt aus, Österreich springt ein → gelb, nicht rot', () => {
    const runs = [run('MINIPC-VENEDIGE', '2026-11-23T04:15:00+01:00'), run('MINIPC-WEIDMANN', '2026-11-16T02:15:00+01:00')];
    const standby = { host: 'MINIPC-VENEDIGE', result: 'gesichert', checked_at: '2026-11-23T04:15:00+01:00' };
    const r = bewerteSicherung(runs, standby, 30, jetzt);
    expect(r.rot).toBe(false);
    expect(r.gelb[0]).toContain('PC München hat seit mehr als 30 h nicht gesichert');
    expect(r.rechner.map(x => rechnerName(x.host))).toEqual(['PC München', 'PC Österreich']);
  });
  it('München sichert, Österreich überspringt → keine Warnung', () => {
    const runs = [run('MINIPC-WEIDMANN', '2026-11-23T03:15:00+01:00')];
    const standby = { host: 'MINIPC-VENEDIGE', result: 'uebersprungen', checked_at: '2026-11-23T04:15:00+01:00', main_host: 'MINIPC-WEIDMANN' };
    const r = bewerteSicherung(runs, standby, 30, jetzt);
    expect(r.rot).toBe(false);
    expect(r.gelb).toEqual([]);
    expect(ersatzUebersprungen(r.ersatz!)).toBe(true);
  });
  it('ohne Ersatz und ohne Sicherung seit 7 Tagen → rot', () => {
    const r = bewerteSicherung([run('MINIPC-WEIDMANN', '2026-11-16T02:15:00+01:00')], null, 30, jetzt);
    expect(r.rot).toBe(true);
  });
});

describe('sicherungKurz (Systemstatus)', () => {
  it('heute gesichert, Ersatz übersprungen → ok', () => {
    const s = sicherungKurz('Hausverwaltung', [run('MINIPC-WEIDMANN', '2026-11-23T03:15:00+01:00')],
      { host: 'MINIPC-VENEDIGE', result: 'uebersprungen', checked_at: '2026-11-23T04:30:00+01:00' }, 30, true, jetzt);
    expect(s.tone).toBe('ok');
    expect(s.text).toContain('PC München');
    expect(s.text).toContain('PC Österreich übersprungen');
    expect(s.problem).toBeNull();
  });
  it('7 Tage alt → rot mit Problemtext', () => {
    const s = sicherungKurz('Hausverwaltung', [run('MINIPC-WEIDMANN', '2026-11-16T02:15:00+01:00')], null, 30, true, jetzt);
    expect(s.tone).toBe('bad');
    expect(s.problem).toContain('Hausverwaltung');
  });
  it('nicht abrufbar → grau, kein Problem', () => {
    expect(sicherungKurz('Heizung', null, null, 30).tone).toBe('off');
  });
});
