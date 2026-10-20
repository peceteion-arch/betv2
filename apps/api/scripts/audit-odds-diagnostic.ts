/**
 * AUDIT / DIAGNOSTIC — NU SCRIBE IN BAZA DE DATE.
 * Ruleaza pipeline-ul statistic REAL (celasi cod ca match.service.generateOdds)
 * pentru o lista de meciuri si afiseaza:
 *   - lambdaA / lambdaB, ratingurile celor 2 echipe, meciurile din istoric folosite
 *   - probabilitatile de piata si cotele generate (pentru comasie cu cele stocate)
 *   - motivul fallback-ului, daca s-a intamplat
 * History = matchHistoryProvider.getGlobalMatches(asOf), exact ca in production.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { matchHistoryProvider } from '../src/odds-engine/providers/match-history.provider';
import {
  computeTeamRatings,
  expectedGoalsFromRatings,
} from '../src/odds-engine/features/team-ratings.features';
import { calculateMarketProbabilities } from '../src/odds-engine/features/poisson-market.engine';
import { buildOddsFromProbabilities } from '../src/odds-engine/features/odds-from-probabilities';

const prisma = new PrismaClient();

// Cele 7 meciuri de auditat (echivalentul CSV-ului PROGRAMAT + SCHEDULED).
// Folosim external_id ca si cheie.
const TARGETS = [
  'pl1-e1-ajax-dulcisimo-squadra-azzurra', // SCHEDULED in DB
  'pl1-e4-damen-rapid-phoenix',            // SCHEDULED in DB
  'pl1-e6-phoenix-amicis-aventin-braila', // acum FINISHED (a fost PROGRAMAT)
  'pl1-e6-armata-b300-partizan',
  'pl1-e6-damen-rapid-squadra-azzurra',
  'pl1-e6-micasa-fiorentina',
  'pl1-e6-snpp-galati-lupii-dacici',
];

function r2(x: number) {
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : x;
}
function r4(x: number) {
  return Number.isFinite(x) ? Math.round(x * 10000) / 10000 : x;
}

function main() {
  return prisma.$transaction(async (tx) => {
    const matches = await tx.match.findMany({
      where: { externalId: { in: TARGETS } },
      include: { homeTeam: true, awayTeam: true },
    });
    matches.sort((a, b) => a.externalId.localeCompare(b.externalId));

    for (const m of matches) {
      const asOf = m.matchDate;
      const home = m.homeTeam.name;
      const away = m.awayTeam.name;
      console.log('\n' + '='.repeat(88));
      console.log(
        `MECI  ${m.externalId}   [${m.status}]  etapa ${m.matchday}  ${home} vs ${away}  (asOf=${asOf.toISOString()})`
      );

      // ---- 1. history (identic cu production: global + isMatchEligible) ----
      const history = await matchHistoryProvider.getGlobalMatches(asOf);
      const globalCount = history.length;

      // cate meciuri eligibile per echipa implicata
      const countFor = (teamId: string) =>
        history.filter(
          (h) =>
            (h.homeTeamId === teamId || h.awayTeamId === teamId) &&
            !h.isForfeit
        ).length;
      const homeCount = countFor(m.homeTeamId);
      const awayCount = countFor(m.awayTeamId);

      // ---- 2. ratings + lambdas ----
      const ratings = computeTeamRatings(history, asOf, {
        competitionId: m.competitionId ?? undefined,
      });
      const exp = expectedGoalsFromRatings(ratings, m.homeTeamId, m.awayTeamId);
      const hr = ratings.ratings.get(m.homeTeamId);
      const ar = ratings.ratings.get(m.awayTeamId);

      console.log(
        `  istoric global eligibil: ${globalCount} meciuri  (home ${homeCount} | away ${awayCount})`
      );
      console.log(
        `  baselineGoals=${r4(ratings.baselineGoals)} competitionGoals=${r4(ratings.competitionGoals)} ` +
          `iter=${ratings.iterations} converged=${ratings.converged}`
      );
      console.log(
        `  rating HOME(${home}): ${hr ? `atac=${r4(hr.attack)} aparare=${r4(hr.defense)} meciuri=${hr.matchesUsed}` : 'LIPSĂ (nu a intrat in model)'}`
      );
      console.log(
        `  rating AWAY(${away}): ${ar ? `atac=${r4(ar.attack)} aparare=${r4(ar.defense)} meciuri=${ar.matchesUsed}` : 'LIPSĂ (nu a intrat in model)'}`
      );
      console.log(
        `  lambdaA=${exp.lambdaA ? r4(exp.lambdaA) : null} lambdaB=${exp.lambdaB ? r4(exp.lambdaB) : null}  (sursa baza=${exp.baselineSource})`
      );

      // ---- 3. fallback vs stats? ----
      if (!exp.lambdaA || !exp.lambdaB) {
        console.log('  => FALLBACK (rating lipsa pentru o echipa / baza 0)');
        continue;
      }
      const probs = calculateMarketProbabilities(exp.lambdaA, exp.lambdaB);
      if (!probs.valid || !probs.converged) {
        console.log(`  => FALLBACK (model neconvergent, valid=${probs.valid})`);
        continue;
      }
      const lines = buildOddsFromProbabilities(probs, {
        margin: 0.07,
        correctScoreMargin: 0.15,
      });
      if (!lines) {
        console.log('  => FALLBACK (buildOddsFromProbabilities a returnat null)');
        continue;
      }
      console.log(`  => STATS (convergent, masa exclusa=${r4(probs.excludedProb)})`);

      // 1X2 + overround
      const p1 = probs.one, pX = probs.draw, p2 = probs.two;
      const sumInv = 1 / p1 + 1 / pX + 1 / p2;
      const normDen = p1 + pX + p2;
      console.log(
        `  1X2: p1=${r4(p1)} pX=${r4(pX)} p2=${r4(p2)}  normalizate=[${r4(p1 / normDen)},${r4(pX / normDen)},${r4(p2 / normDen)}]  sum(1/p)=${r4(sumInv)}`
      );

      // marcati cu cote generate + comasie cu DB
      const gen = new Map<string, number>();
      for (const l of lines) gen.set(`${l.market}|${l.selection}`, l.value);

      const keys = [
        '1X2|1', '1X2|X', '1X2|2',
        'MARCAS_2_5|Mais 2.5', 'MARCAS_2_5|Menos 2.5',
        'MARCAS_1_5|Mais 1.5', 'MARCAS_1_5|Menos 1.5',
        'MARCAS_0_5|Mais 0.5', 'MARCAS_0_5|Menos 0.5',
        'AMBAS_MARCAM|Sim', 'AMBAS_MARCAM|Não',
        'DUPLA_HIPOTESE|1X', 'DUPLA_HIPOTESE|X2', 'DUPLA_HIPOTESE|12',
        'RESULTADO_CORRETO|1-0', 'RESULTADO_CORRETO|1-1', 'RESULTADO_CORRETO|2-1',
      ];
      const dbOdds = await tx.odds.findMany({ where: { matchId: m.id } });
      const dbMap = new Map<string, number>();
      for (const o of dbOdds) dbMap.set(`${o.market}|${o.selection}`, Number(o.value));
      const dbSource = dbOdds[0]?.source;

      console.log(
        `  cote generate (marja 7%, cap [1.01,50]) vs DB (source=${dbSource ?? 'NOO'}):`
      );
      console.log(`    ${'marcat'.padEnd(10)} | ${'gen'.padStart(6)} | ${'db'.padStart(6)} | ${'Δ'.padStart(6)} | p(model)`);
      const pMap: Record<string, number> = {
        '1X2|1': p1, '1X2|X': pX, '1X2|2': p2,
        'MARCAS_2_5|Mais 2.5': probs.over25, 'MARCAS_2_5|Menos 2.5': probs.under25,
        'MARCAS_1_5|Mais 1.5': probs.over15, 'MARCAS_1_5|Menos 1.5': probs.under15,
        'MARCAS_0_5|Mais 0.5': probs.over05, 'MARCAS_0_5|Menos 0.5': probs.under05,
        'AMBAS_MARCAM|Sim': probs.bttsYes, 'AMBAS_MARCAM|Não': probs.bttsNo,
        'DUPLA_HIPOTESE|1X': probs.oneX, 'DUPLA_HIPOTESE|X2': probs.x2, 'DUPLA_HIPOTESE|12': probs.twelve,
        'RESULTADO_CORRETO|1-0': probs.exactScores['1-0'] ?? 0,
        'RESULTADO_CORRETO|1-1': probs.exactScores['1-1'] ?? 0,
        'RESULTADO_CORRETO|2-1': probs.exactScores['2-1'] ?? 0,
      };
      for (const k of keys) {
        const g = gen.get(k);
        const d = dbMap.get(k);
        const p = pMap[k];
        const dstr = d === undefined ? '(lipse)' : String(d);
        const del = g && d !== undefined ? r2(g - d) : '-';
        console.log(
          `    ${k.split('|')[0].padEnd(10)}|${k.split('|')[1]} ${String(g).padStart(6)} ${dstr.padStart(6)} ${String(del).padStart(6)} ${r4(p)}`
        );
      }
    }
    console.log('\n' + '='.repeat(88));
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
