import Database from 'better-sqlite3';
import { MinifotbalTeam, MinifotbalPlayer, MinifotbalEvent } from './minifotbal-data.types';

export class MinifotbalDataProvider {
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.MINIFOTBAL_DB_PATH?.trim() || '';
    if (!this.dbPath) {
      throw new Error('MINIFOTBAL_DB_PATH is not set.');
    }
  }

  private getDb() {
    return new Database(this.dbPath, { readonly: true, fileMustExist: true });
  }

  getTeamById(teamId: number): MinifotbalTeam | null {
    const db = this.getDb();
    try {
      const row = db.prepare('SELECT id, nume_echipa, liga_id FROM echipe WHERE id = ?').get(teamId) as any;
      if (!row) return null;
      return {
        id: row.id,
        name: row.nume_echipa,
        leagueId: row.liga_id,
      };
    } finally {
      db.close();
    }
  }

  getPlayersByTeamId(teamId: number): MinifotbalPlayer[] {
    const db = this.getDb();
    try {
      const rows = db.prepare('SELECT id, nume, prenume, echipa_id, status FROM jucatori WHERE echipa_id = ?').all(teamId) as any[];
      return rows.map((row) => ({
        id: row.id,
        firstName: row.prenume,
        lastName: row.nume,
        teamId: row.echipa_id,
        status: row.status,
      }));
    } finally {
      db.close();
    }
  }

  getPlayerById(playerId: number): MinifotbalPlayer | null {
    const db = this.getDb();
    try {
      const row = db.prepare('SELECT id, nume, prenume, echipa_id, status FROM jucatori WHERE id = ?').get(playerId) as any;
      if (!row) return null;
      return {
        id: row.id,
        firstName: row.prenume,
        lastName: row.nume,
        teamId: row.echipa_id,
        status: row.status,
      };
    } finally {
      db.close();
    }
  }

  getPlayerEvents(playerId: number): MinifotbalEvent[] {
    const db = this.getDb();
    try {
      const rows = db.prepare('SELECT id, jucator_id, echipa_id, etapa, tip_eveniment, note FROM evenimente_meci WHERE jucator_id = ?').all(playerId) as any[];
      return rows.map((row) => ({
        id: row.id,
        playerId: row.jucator_id,
        teamId: row.echipa_id,
        stage: row.etapa,
        type: row.tip_eveniment,
        note: row.note,
      }));
    } finally {
      db.close();
    }
  }

  getTeamEvents(teamId: number): MinifotbalEvent[] {
    const db = this.getDb();
    try {
      const rows = db.prepare('SELECT id, jucator_id, echipa_id, etapa, tip_eveniment, note FROM evenimente_meci WHERE echipa_id = ?').all(teamId) as any[];
      return rows.map((row) => ({
        id: row.id,
        playerId: row.jucator_id,
        teamId: row.echipa_id,
        stage: row.etapa,
        type: row.tip_eveniment,
        note: row.note,
      }));
    } finally {
      db.close();
    }
  }

  getPlayerEventsByType(playerId: number, eventType: string): MinifotbalEvent[] {
    const db = this.getDb();
    try {
      const rows = db.prepare('SELECT id, jucator_id, echipa_id, etapa, tip_eveniment, note FROM evenimente_meci WHERE jucator_id = ? AND tip_eveniment = ?').all(playerId, eventType) as any[];
      return rows.map((row) => ({
        id: row.id,
        playerId: row.jucator_id,
        teamId: row.echipa_id,
        stage: row.etapa,
        type: row.tip_eveniment,
        note: row.note,
      }));
    } finally {
      db.close();
    }
  }
}
