import { runExperiment } from './poisson-runner';

runExperiment().then((r: any) => {
  console.log('=== PAS 4.3 — EXECUTARE EXPERIMENT COMPLET ===');
  console.log('Baza verificata:', r.dbVerified, '| current_database():', r.baseQueryResult);
  console.log('URL include test:', r.databaseUrlContainsTest, '| URL:', r.databaseUrlUsed);
  console.log('Competitie:', r.competition);
  console.log('Meciuri FINISHED gasite:', r.finishedMatchesFound);
  console.log('Evaluabile:', r.evaluableCount, '| Excluse:', r.excludedCount);
  console.log('Label cote:', r.labelOdds);
  console.log('ReadOnly confirmat:', r.readOnlyConfirmed, '| Scrieri:', r.writeOperationsPerformed);

  console.log('\n=== TABEL MECIURI EVALUATE ===');
  for (const res of r.results) {
    console.log('---');
    console.log('MeciId:', res.matchId);
    console.log('Data:', typeof res.date === 'string' ? res.date : res.date?.toISOString?.() ?? res.date);
    console.log('Echipe:', res.home, 'vs', res.away);
    console.log('Scor real:', res.realScoreHome + '-' + res.realScoreAway);
    console.log('Exclus?', res.excluded, '| Motiv:', res.reason || 'N/A');
    console.log('Istoric anterior folosit:', res.historicalMatchesUsed);
    if (!res.excluded) {
      console.log('  lambdaHome:', res.lambdaHome?.toFixed(4), '| lambdaAway:', res.lambdaAway?.toFixed(4));
      const p = res.probabilities1X2;
      console.log('  Prob 1X2: 1=', p?.one?.toFixed(6), 'X=', p?.draw?.toFixed(6), '2=', p?.two?.toFixed(6),
        '| converged:', p?.converged, '| excludedProb:', p?.excludedProb?.toExponential(2),
        '| suma1X2+excl:', p?.sumApprox1?.toFixed(10));
      const o = res.rawOdds1X2;
      console.log('  Cote brute (fara marja): 1=', o?.oneRaw?.toFixed(4), 'X=', o?.drawRaw?.toFixed(4), '2=', o?.twoRaw?.toFixed(4));
      const m = res.otherMarkets;
      if (m) {
        console.log('  Peste/Sub: over05=', m.over05?.toFixed(4), 'under05=', m.under05?.toFixed(4),
          '| over25=', m.over25?.toFixed(4), 'under25=', m.under25?.toFixed(4),
          '| BTTS:', m.bttsYes?.toFixed(4), '/', m.bttsNo?.toFixed(4),
          '| converged:', m.converged);
      } else {
        console.log('  Alte piețe: nesuportate (calculateMarketProbabilities a eșuat)');
      }
    }
  }

  console.log('\n=== EXCLUSII ===');
  for (const ex of r.excludedList) {
    console.log('MeciId:', ex.matchId, '| Motiv:', ex.reason);
  }
  console.log('Mapa motiv-excludere:', JSON.stringify(r.excludedReasonsMap));

  console.log('\n=== METRICI PREDICTIVE ===');
  console.log(JSON.stringify(r.predictionsSummary, null, 2));

  // Verificare suma probabilitati 1X2 pentru fiecare meci evaluat
  console.log('\n=== VERIFICARE SUMA 1X2 PER MECI ===');
  let sumFail = 0;
  for (const res of r.results) {
    if (res.excluded) continue;
    const p = res.probabilities1X2;
    if (!p) { console.log('  ', res.matchId, ': LIPSA probabilitati'); sumFail++; continue; }
    const sum = p.one + p.draw + p.two;
    const ok = Math.abs(sum + p.excludedProb - 1) < 1e-3;
    if (!ok) sumFail++;
    console.log('  ', res.matchId, ': 1X2 sum=', sum.toFixed(6), '+excl=', p.excludedProb?.toExponential(2), '=>', ok ? 'OK' : 'PROBLEM');
  }
  console.log('Probleme suma:', sumFail);
}).catch((e: any) => {
  console.error('EROARE:', e.message);
  console.error(e.stack);
  process.exit(1);
});