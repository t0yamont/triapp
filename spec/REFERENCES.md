# References

Every constant and rule in `03-ALGORITHM.md` traces to an entry here. Before changing a
constant, read its source. Entries are grouped by the section that uses them.

Verify currency before relying on any of these — the intensity-distribution and
durability literatures in particular are moving quickly, and a 2027 reader should
re-check rather than assume.

---

## Intensity prescription and anchoring (§0.1, §2, §3)

- Meyler S, Swinton PA, Bottoms L, et al. **Changes in cardiorespiratory fitness following
  exercise training prescribed relative to traditional intensity anchors and physiological
  thresholds: a systematic review with meta-analysis of individual participant data.**
  *Sports Medicine* 2025;55(2):301–23. — IPD meta-analysis, 42 studies, 1544 individuals.
  The primary justification for threshold anchoring.
- Meyler S, Bottoms L, Wellsted D, Muniz-Pumares D. **Variability in exercise tolerance
  and physiological responses to exercise prescribed relative to physiological thresholds
  and to maximum oxygen uptake.** *Experimental Physiology* 2023;108(4):581–94.
- Meyler S, Bottoms L, Muniz-Pumares D. **Biological and methodological factors affecting
  VO₂max response variability to endurance training and the influence of exercise
  intensity prescription.** *Experimental Physiology* 2021;106(7):1410–24.
- Jamnick NA, Pettitt RW, Granata C, Pyne DB, Bishop DJ. **An examination and critique of
  current methods to determine exercise intensity.** *Sports Medicine* 2020;50:1729–56.
- Nes BM, Janszky I, Wisløff U, Støylen A, Karlsen T. **Age-predicted maximal heart rate
  in healthy subjects: the HUNT Fitness Study.** *Scandinavian Journal of Medicine &
  Science in Sports* 2013;23(6):697–704. — source of `211 − 0.64 × age`.
- Tanaka H, Monahan KD, Seals DR. **Age-predicted maximal heart rate revisited.**
  *JACC* 2001;37(1):153–6. — `208 − 0.7 × age`, retained for comparison only.
- Karvonen MJ, Kentala E, Mustala O. **The effects of training on heart rate: a
  longitudinal study.** *Annales Medicinae Experimentalis et Biologiae Fenniae* 1957.
  — the HRR method.
- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. **Energy cost of walking and running
  at extreme uphill and downhill slopes.** *Journal of Applied Physiology* 2002;93:1039–46.
  — grade-adjusted pace.

## Threshold detection from HRV (§6.1)

- Rogers B, Giles D, Draper N, Hoos O, Gronwald T. **A new detection method defining the
  aerobic threshold for endurance exercise and training prescription based on fractal
  correlation properties of heart rate variability.** *Frontiers in Physiology* 2021.
  — DFA-a1 = 0.75 at the aerobic threshold.
- Rogers B, Giles D, Draper N, Mourot L, Gronwald T. **Detection of the anaerobic
  threshold in endurance sports: validation of a new method using correlation properties
  of heart rate variability.** *Journal of Functional Morphology and Kinesiology* 2021.
  — DFA-a1 = 0.5 at the anaerobic threshold.
- Rogers B, Berk S, Gronwald T. **An index of non-linear HRV as a proxy of the aerobic
  threshold based on blood lactate concentration in elite triathletes.** *Sports*
  2022;10(2):25.
- Gronwald T, Berk S, Altini M, Mourot L, Hoos O, Rogers B. **Real-time estimation of
  aerobic threshold and exercise intensity distribution using fractal correlation
  properties of heart rate variability.** *Frontiers in Sports and Active Living* 2021;3.
- Gronwald T, Hoos O. **Correlation properties of heart rate variability during endurance
  exercise: a systematic review.** *Annals of Noninvasive Electrocardiology* 2020;25(1).
- Systematic review of HRV-derived thresholds vs ventilatory and lactate thresholds
  (27 studies, 461 participants), *Sports Medicine* 2023. — source of the limits-of-
  agreement caution in §6.1: good mean agreement, individual limits spanning roughly
  ±11–13 bpm.

## Critical power / critical speed (§6.3)

- Poole DC, Burnley M, Vanhatalo A, Rossiter HB, Jones AM. **Critical power: an important
  fatigue threshold in exercise physiology.** *MSSE* 2016;48(11):2320–34.
- Muniz-Pumares D. **Critical power: an important tool for exercise prescription and the
  assessment of physiological function.** *Experimental Physiology* 2025.
- Muniz-Pumares D, Karsten B, Triska C, Glaister M. **Methodological approaches and
  related challenges associated with the determination of critical power and curvature
  constant.** *JSCR* 2019;33(2):584–96.
- Skiba PF, Clarke D, Vanhatalo A, Jones AM. **Validation of a novel intermittent W′
  model for cycling using field data.** *IJSPP* 2014;9(6):900–4.
- Vanhatalo A, Doust JH, Burnley M. **Determination of critical power using a 3-min
  all-out cycling test.** *MSSE* 2007;39(3):548–55.
- Wakayoshi K, Ikuta K, Yoshida T, et al. **Determination and validity of critical
  velocity as an index of swimming performance in the competitive swimmer.**
  *European Journal of Applied Physiology* 1992;64:153–7. — CSS.

## Intensity distribution (§4)

- Filipas L, Bonato M, Gallo G, Codella R. **Effects of 16 weeks of pyramidal and
  polarized training intensity distributions in well-trained endurance runners.**
  *Scandinavian Journal of Medicine & Science in Sports* 2022;32(3):498–511.
  — PYR → POL sequencing produced the largest gains. Basis of the phase-dependent policy.
- Rosenblat MA, et al. **Systematic review with meta-analysis of training intensity
  distribution** 2025. — polarised marginally favoured in elite, pyramidal in
  recreational athletes.
- Rivera-Köfler T, Varela-Sanz A, Padrón-Cabo A, Giráldez-García MA, Muñoz-Pérez I.
  **Effects of polarized training vs. other training intensity distribution models on
  endurance performance.** 2025. — POL and PYR both outperform threshold-dominant and
  block training in trained-to-elite athletes.
- Silva Oliveira P, Boppre G, Fonseca H. **Comparison of polarized versus other types of
  endurance training intensity distribution on athletes' endurance performance: a
  systematic review with meta-analysis.** *Sports Medicine* 2024.
- Casado A. **Polarised vs pyramidal training: what the science says in 2026.**
  Discussion including Seiler's point that distribution results depend heavily on whether
  sessions are classified by goal or by time in zone. Basis of §3.4.
- Seiler S. **What is best practice for training intensity and duration distribution in
  endurance athletes?** *IJSPP* 2010;5(3):276–91.
- Stöggl T, Sperlich B. **Polarized training has greater impact on key endurance
  variables than threshold, high intensity, or high volume training.**
  *Frontiers in Physiology* 2014;5:33.

## Interval design (§7.2)

- Rønnestad BR, Hansen J. **Optimizing interval training at power output associated with
  peak oxygen uptake in well-trained cyclists.** *JSCR* 2016;30(4):999–1006.
- Rønnestad BR, Hansen J, Nygaard H, Lundby C. **Superior performance improvements in
  elite cyclists following short-interval vs effort-matched long-interval training.**
  *SJMSS* 2020;30(5):849–57.
- Almquist NW, Nygaard H, Vegge G, Hammarström D, Ellefsen S, Rønnestad BR. **Systemic
  and muscular responses to effort-matched short intervals and long intervals in elite
  cyclists.** *SJMSS* 2020;30(7):1140–50.
- Fleckenstein D, et al. **Faster intervals, faster recoveries — intensified short VO₂max
  running intervals are inferior to traditional long intervals in terms of time spent
  above 90% VO₂max.** *Frontiers in Sports and Active Living* 2025;6:1507957.
  — the reason running and cycling get different templates.
- Buchheit M, Laursen PB. **High-intensity interval training, solutions to the programming
  puzzle.** *Sports Medicine* 2013;43:313–38 (part I), 927–54 (part II).

## Training load and monitoring (§5)

- Foster C, Florhaug JA, Franklin J, et al. **A new approach to monitoring exercise
  training.** *JSCR* 2001;15(1):109–15. — sRPE.
- Foster C. **Monitoring training in athletes with reference to overtraining syndrome.**
  *MSSE* 1998;30(7):1164–8. — monotony and strain.
- Lucia A, Hoyos J, Santalla A, Earnest C, Chicharro JL. **Tour de France versus Vuelta a
  España: which is harder?** *MSSE* 2003;35(5):872–8. — zone-weighted TRIMP.
- Banister EW, Calvert TW. **Planning for future performance: implications for long-term
  training.** *Canadian Journal of Applied Sport Sciences* 1980;5(3):170–6.
  — the impulse-response model behind CTL/ATL.
- Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ. **Acute:chronic workload
  ratio: conceptual issues and fundamental pitfalls.** *IJSPP* 2020;15(6):907–13.
- Impellizzeri FM, Woodcock S, Coutts AJ, Fanchini M, McCall A, Vigotsky AD. **What role
  do chronic workloads play in the acute to chronic workload ratio? Time to dismiss ACWR
  and its underlying theory.** *Sports Medicine* 2021;51:581–92.
- Impellizzeri FM, McCall A, Ward P, Bornn L, Coutts AJ. **Training load and its role in
  injury prevention, part 2: conceptual and methodologic pitfalls.**
  *Journal of Athletic Training* 2020;55(9):893–901.
- Kalkhoven JT, Watsford ML, Coutts AJ, Edwards WB, Impellizzeri FM. **Training load and
  injury: causal pathways and future directions.** *Sports Medicine* 2021;51:1137–50.

## Tapering (§8.3)

- Bosquet L, Montpetit J, Arvisais D, Mujika I. **Effects of tapering on performance: a
  meta-analysis.** *MSSE* 2007;39(8):1358–65. — 2-week taper, volume reduced 41–60%,
  intensity and frequency unchanged.
- Wang Z, Wang YT, Gao W, Zhong Y. **Effects of tapering on performance in endurance
  athletes: a systematic review and meta-analysis.** *PLOS ONE* 2023;18(5):e0282838.
  — ≤21 days effective; largest effects 8–14 days; pre-taper overload improves outcomes;
  maintaining frequency matters.
- Mujika I, Padilla S. **Scientific bases for precompetition tapering strategies.**
  *MSSE* 2003;35(7):1182–7.

## HRV-guided training (§10)

- Manresa-Rocamora A, Sarabia JM, Javaloyes A, Flatt AA, Moya-Ramón M. **Heart rate
  variability-guided training for enhancing cardiac-vagal modulation, aerobic fitness,
  and endurance performance: a methodological systematic review with meta-analysis.**
  *IJERPH* 2021;18(19):10299. — small effects; methodology matters; basis of the
  conservative implementation.
- Javaloyes A, Sarabia JM, Lamberts RP, Moya-Ramón M. **Training prescription guided by
  heart rate variability in cycling.** *IJSPP* 2019;14(1):23–32.
- Javaloyes A, Sarabia JM, Lamberts RP, Plews D, Moya-Ramón M. **Training prescription
  guided by heart rate variability vs. block periodization in well-trained cyclists.**
  *JSCR* 2020;34(6):1511–8.
- Vesterinen V, Nummela A, Heikura I, et al. **Individual endurance training prescription
  with heart rate variability.** *MSSE* 2016;48(7):1347–54.
- Nuuttila OP, Nikander A, Polomoshnov D, Laukkanen JA, Häkkinen K. **Effects of
  HRV-guided vs. predetermined block training on performance, HRV and serum hormones.**
  *IJSM* 2017;38(12):909–20.
- Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. **Training adaptation and
  heart rate variability in elite endurance athletes: opening the door to effective
  monitoring.** *Sports Medicine* 2013;43:773–81. — rolling averages, not single days.

## Durability (§11)

- Maunder E, Seiler S, Mildenhall MJ, Kilding AE, Plews DJ. **The importance of
  "durability" in the physiological profiling of endurance athletes.**
  *Sports Medicine* 2021;51(8):1619–28.
- Jones AM. **The fourth dimension: physiological resilience as an independent determinant
  of endurance exercise performance.** *Journal of Physiology* 2023.
- Hunter B, Maunder E, Jones AM, Gallo G, Muniz-Pumares D. **Durability as an index of
  endurance exercise performance: methodological considerations.**
  *Experimental Physiology* 2025. — protocols are not standardised; track trends, not
  absolute values.
- Spragg J, Leo P, Swart J. **The relationship between physiological characteristics and
  durability in male professional cyclists.** *European Journal of Sport Science* 2022.
- Stevenson JD, Kilding AE, Plews DJ, Maunder E. **Prolonged cycling reduces power output
  at the moderate-to-heavy intensity transition.** *EJAP* 2022;122(12):2673–82.
- Smyth B, Maunder E, Meyler S, Hunter B, Muniz-Pumares D. **Decoupling of internal and
  external workload during a marathon.** *MSSE* 2022.

## Strength training (§7.3)

- Eihara Y, Takao K, Sugiyama T, et al. **Heavy resistance training versus plyometric
  training for improving running economy and running time trial performance: a systematic
  review and meta-analysis.** *Sports Medicine – Open* 2022;8:138.
- Llanos-Lagos C, Ramirez-Campillo R, Moran J, Sáez de Villarreal E. **The effect of
  strength training methods on middle- and long-distance runners' athletic performance:
  a systematic review with meta-analysis.** *Sports Medicine* 2024.
- Llanos-Lagos C, Ramirez-Campillo R, Sáez de Villarreal E. **Heavy strength training
  effects on physiological determinants of endurance cyclist performance: a systematic
  review with meta-analysis.** *EJAP* 2025.
- Zanini M, Folland JP, Wu H, Blagrove RC. **Strength training improves running economy
  durability: a randomized controlled trial.** *MSSE* 2025.
- Rønnestad BR, Mujika I. **Optimizing strength training for running and cycling
  endurance performance: a review.** *SJMSS* 2014;24(4):603–12.

## Heat (§7.4)

- Bayesian meta-regression of heat acclimation protocol characteristics (211 papers),
  2025. — mean protocol ≈8 exposures, ≈90 min, ≈39 °C; quantifies HR, core temperature
  and plasma volume adaptations.
- Tyler CJ, Reeve T, Hodges GJ, Cheung SS. **The effects of heat adaptation on physiology,
  perception and exercise performance in the heat: a meta-analysis.**
  *Sports Medicine* 2016;46:1699–724. — ≥14-day protocols more effective than shorter.
- Benjamin CL, et al. **Performance changes following heat acclimation and the factors
  that influence these changes: meta-analysis and meta-regression.**
  *Frontiers in Physiology* 2019;10:1448.
- Périard JD, Racinais S, Sawka MN. **Adaptations and mechanisms of human heat acclimation:
  applications for competitive athletes and sports.** *SJMSS* 2015;25(S1):20–38.
- Systematic review and meta-analysis of post-exercise passive heat exposure,
  *BMC Sports Science, Medicine and Rehabilitation* 2025.

## Female athletes (§13)

- McNulty KL, Elliott-Sale KJ, Dolan E, et al. **The effects of menstrual cycle phase on
  exercise performance in eumenorrheic women: a systematic review and meta-analysis.**
  *Sports Medicine* 2020;50:1813–27. — trivial pooled effects, low-quality evidence.
  Basis for not prescribing cycle-phase periodisation.
- Elliott-Sale KJ, Minahan CL, de Jonge XAKJ, et al. **Methodological considerations for
  studies in sport and exercise science with women as participants.**
  *Sports Medicine* 2021;51:843–61.

---

## r2 revision — added and corrected citations (July 2026)

Added by the evidence-review pass. Every entry here is load-bearing for a rule the engine now
implements; see `03-ALGORITHM.md` §17 for the register of what each one changed.

### §0.1 — what threshold anchoring actually buys

- Meyler S, et al. **Fitness responses to exercise prescribed relative to physiological
  thresholds vs. maxima: an individual participant data meta-analysis.** *Sports Medicine*
  2025;55:301–23. — 42 studies, 1544 individuals. Larger mean VO₂max gain (4.1 vs
  1.8 mL·kg⁻¹·min⁻¹) and a higher responder rate (64% vs 16% above a 1-MET MID). **Found no
  reduction in the variability of adaptation** (SD 1.5 vs 1.7, BF = 0.55) — r1 claimed otherwise.
- Meyler S, et al. *Experimental Physiology* 2023;108:581–94. — reduced *acute* response
  heterogeneity in the heavy/severe domain anchored to critical power.
- Pacitti L, et al. 2025; Shikaze K, et al. 2025. — no variance advantage at moderate intensity.

### §6.1 — DFA-a1 reliability and the power/pace storage rule

- Sempere-Ruiz N, et al. **Reliability of heart rate variability threshold determination.**
  *Frontiers in Physiology* 2024;15:1329360. — ICC 0.87 (HRVT1) / 0.97 (HRVT2) in **power**
  against typical errors of 8.8 / 4.1 bpm in HR. Basis for `DFA_A1_CANONICAL_UNIT`.
- Sheoran S, et al. *Journal of Sports Sciences* 2024;42:2012–20. — ICC 0.76–0.86; typical error
  ≈6 bpm (T1) and ≈8 bpm (T2). Basis for `DFA_A1_TYPICAL_ERROR_BPM`. Sex and cardiorespiratory
  fitness moderate agreement, so no single population accuracy figure may be shown.
- Kaufmann S, et al. 2023. — systematic review, 27 studies; ±11–13 bpm individual LoA.
- Cassirame J, et al. *European Journal of Applied Physiology* 2025;125:523–33, **with the
  Gronwald et al. rebuttal**. — the method is actively disputed. Basis for the immovable
  `DFA_A1_CONFIDENCE_CEILING`.

### §6.3 — passive critical speed/power determination

- Smyth B, Muniz-Pumares D. **Calculation of critical speed from raw training data.**
  *Medicine & Science in Sports & Exercise* 2020;52:2637–45.
- Hunter B, et al. *International Journal of Sports Physiology and Performance*
  2023;18:1449–56. — remote, unsupervised determination agrees acceptably with the laboratory.
- Nixon RJ, et al. *European Journal of Applied Physiology* 2021;121:3133–44; Jones AM, et al.
  2019. — CP/CS vs MLSS: close, and **which sits higher is unsettled**. Do not assert a direction.

### §7.2 — interval design, and why the sports diverge

- Almquist NW, et al. *Scandinavian Journal of Medicine & Science in Sports* 2020;30:1140–50. —
  effort-matched 30/15 produced 14% higher mean power (421 vs 371 W) and ≈844 vs ≈589 s ≥90%
  VO₂max in elite cyclists, at no higher RPE.
- Fleckenstein D, et al. *Frontiers in Sports and Active Living* 2024;6:1507957. — the opposite
  result in runners (≈201 vs ≈328 s). Same outcome measure, opposite conclusion: the
  justification for a per-sport table.

### §7.2b — sub-threshold volume and session splitting (new section)

- Casado A, Foster C, Bakken M, Tjelta LI. **Does lactate-guided threshold interval training
  within a high-volume low-intensity approach represent the "next step"?** *IJERPH*
  2023;20:3782.
- Kelemen B, et al. 2023. — systematic review of 13 elite Norwegian runners.
- Talsnes RK, Torvik PØ, Skovereng K, Sandbakk Ø. *Frontiers in Physiology* 2024;15:1428536. —
  **the one controlled comparison.** The single long session gave the larger stimulus (sRPE 7.0
  vs 6.0; load 929 vs 743); the split day the lower next-morning cost. Basis for every
  `SUBTHRESHOLD_SPLIT_*` constant, and for requiring a volume increase alongside a split.

### §7.3 — strength, by speed band

- Llanos-Lagos C, et al. **Effect of strength training programs in middle- and long-distance
  runners' economy at different running speeds.** *Sports Medicine* 2024;54:895–932. — heavy
  (>80% 1RM) best at higher speeds, plyometric below ≈12 km/h, combined ≈10–14.5 km/h;
  **40–79% 1RM and isometric work showed no economy effect.** Basis for
  `STRENGTH_SPEED_BANDS_KMH` and `STRENGTH_MIN_HEAVY_LOAD_1RM`.
- Llanos-Lagos C, et al. *Sports Medicine* 2024;54:1801–33. — **no** strength method improved
  VO₂max, vVO₂max, MMSS or sprint capacity. The UI must not imply otherwise.

### §7.4 — heat dose, decay and re-induction

- McDonald T, et al. **Heat acclimation: a Bayesian meta-regression.** *Comprehensive
  Physiology* 2025;15(3):1–49. — 211 papers. 8 ± 4 exposures, 90 ± 36 min, 39.1 ± 4.8 °C;
  end-exercise HR −17 bpm, core temperature −0.43 °C, plasma volume +5.6%, sweat rate
  +163 mL·h⁻¹, time trial **+3.1%**. Names the source r1 cited anonymously.
- Daanen HAM, Racinais S, Périard JD. **Heat acclimation decay and re-induction.** *Sports
  Medicine* 2018;48:409–30. — ≈2.3%/day (HR) and ≈2.6%/day (core temp) decay; re-induction
  8–12× faster. Basis for `HEAT_DECAY_PCT_PER_DAY` and the top-up rule.
- Périard JD, et al. 2015. — exercise-based acclimation preferred on specificity grounds.

### §13 — menstrual cycle, re-confirmed

- *Journal of Applied Physiology* 2025;139:650–67. — high-methodological-standard review:
  direction and magnitude of phase effects varied between studies; maximal and explosive
  strength largely unaffected.
- Colenso-Semple LM, D'Souza AC, Elliott-Sale KJ, Phillips SM. — no influence of cycle phase on
  acute strength performance or resistance-training adaptation.
- *Journal of Science and Medicine in Sport* 2025. — meta-aggregation of 17 studies: cycle
  **symptoms** consistently affect training. The signal is symptoms, not phase.
